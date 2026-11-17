// ---------------------------------------------------------------------------
//  Offline sync engine (Phase 1).
//
//  Installed onto the axios instance. It:
//   - caches whitelisted GET responses so the tech can read their day offline
//   - queues whitelisted MUTATIONS (status, notes, parts, photos, signoff,
//     inspections, time) when offline / on network failure, then uploads them
//     in the background when the connection returns
//   - exposes a small store (subscribe/getState) for the offline banner
//
//  Deliberately EXCLUDED from offline (high-risk): payments, invoice
//  finalization, customer/job deletion, scheduling changes, and any office
//  billing action. Those still require a live connection.
//
//  Each queued action carries a unique opId (idempotency key), the device id,
//  technician id, and original creation time. Successful items are removed from
//  the queue after the server confirms (2xx). Server errors mark the item
//  'failed' (tap to retry); a 409 marks it 'conflict' for admin review.
// ---------------------------------------------------------------------------
import { idbGet, idbAll, idbDel, idbSet, idbPutStrict } from './idb';

const DEVICE_KEY = 'cm_device_id';
function deviceId() {
  let d = localStorage.getItem(DEVICE_KEY);
  if (!d) { d = 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(DEVICE_KEY, d); }
  return d;
}
function currentTech() {
  try { return JSON.parse(localStorage.getItem('user') || 'null')?.id || null; } catch { return null; }
}
const opId = () => 'op-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);

// temp-id → real-id map, built as offline-created records sync. Persisted so it
// survives app restarts while dependents are still queued.
let idMap = {};
async function loadIdMap() { try { const c = await idbGet('cache', '__idmap'); if (c?.data) idMap = c.data; } catch { /* ignore */ } }
async function persistIdMap() { try { await idbSet('cache', '__idmap', { data: idMap, at: Date.now() }); } catch { /* ignore */ } }
const remapUrl = (url) => { let u = url || ''; for (const t in idMap) if (u.includes(t)) u = u.split(t).join(idMap[t]); return u; };
function remapDeep(v) {
  if (v == null) return v;
  if (typeof v === 'string') return idMap[v] || v;
  if (Array.isArray(v)) return v.map(remapDeep);
  if (typeof v === 'object') { const o = {}; for (const k in v) o[k] = remapDeep(v[k]); return o; }
  return v;
}
function hasTmp(v) {
  if (v == null) return false;
  if (typeof v === 'string') return v.startsWith('tmp-');
  if (Array.isArray(v)) return v.some(hasTmp);
  if (typeof v === 'object') return Object.values(v).some(hasTmp);
  return false;
}

// By the time a request FAILS, axios has already turned its body into a JSON
// string. Queueing that string (and later re-sending it) made the server receive
// an empty form instead of the photo/status — so queued work never saved. Always
// turn the body back into the original object before queueing or re-sending.
function bodyOf(data) {
  if (typeof data !== 'string') return data ?? null;
  const t = data.trim();
  if (!t) return null;
  if (t[0] === '{' || t[0] === '[') { try { return JSON.parse(t); } catch { return data; } }
  return data;
}
const QUEUE_V = 2;            // queue item format; older items are repaired on launch
const MAX_AUTO_RETRIES = 6;   // server-rejected items stop auto-retrying after this (manual Retry still works)

// Timeouts — without these a weak signal leaves every screen spinning forever.
const T_READ_CACHED = 12000;  // a saved copy exists → fall back to it quickly
const T_READ = 45000;         // nothing saved → give a sleeping server time to wake
const T_WRITE_QUEUEABLE = 45000;
const T_WRITE = 60000;
const T_SLOW = 120000;        // AI + background re-uploads on a slow link
const T_PROBE = 6000;

// --- observable state for the UI ---
const listeners = new Set();
let state = { online: navigator.onLine !== false, pending: 0, failed: 0, syncing: false, lastSync: null, lastWarm: null, warming: false, items: [] };
function emit() { state = { ...state }; listeners.forEach(l => l(state)); }
export function subscribe(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); }
export function getState() { return state; }

async function refreshCounts() {
  const q = (await idbAll('queue')).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  state.pending = q.filter(x => x.status === 'pending' || x.status === 'syncing').length;
  state.failed = q.filter(x => x.status === 'failed' || x.status === 'conflict').length;
  state.items = q;
  emit();
}

// --- what may be cached / queued ---
const CACHE_GET = [
  /^\/jobs(\?|$)/, /^\/jobs\/[^/]+$/,
  /^\/customers(\?|$)/, /^\/customers\/[^/]+$/,
  /^\/employees(\?|$)/,
  /^\/inspections(\?|$)/, /^\/inspections\/[^/]+$/,
  /^\/billing\/quotes(\?|$)/, /^\/billing\/invoices(\?|$)/, /^\/billing\/invoices\/[^/]+$/,
  /^\/pricebook(\?|$)/, /^\/settings(\?|$)/, /^\/dashboard(\?|$)/,
  /^\/auth\/me$/, /^\/auth\/public-info$/,
  /^\/time(\?|$)/, /^\/time\/active$/,
];
const isCacheableGet = (url) => CACHE_GET.some(r => r.test((url || '').split('#')[0]));

// Bump this whenever an API response shape changes. Cached entries stamped with
// an older version are ignored (and overwritten), so a payload saved by a previous
// release can never be replayed into a newer page that expects more fields.
const CACHE_SCHEMA = 2;

// Only cache real payloads. An error body, an empty object, or an HTML error page
// must never be stored — otherwise it gets replayed later as a "successful"
// response and crashes whichever page expects the real shape.
function isCacheableBody(data, url) {
  if (data === null && url === '/time/active') return true;   // "not clocked in" is a real answer
  if (data == null) return false;
  if (typeof data === 'string') return false;          // HTML/text error pages
  if (Array.isArray(data)) return true;                // list endpoints (empty list is valid)
  if (typeof data !== 'object') return false;
  if (data.error || data.message === 'Quota exceeded') return false;
  return Object.keys(data).length > 0;                 // reject {}
}

// New-record creates that may happen offline (Phase 2). Each maps to the list
// cache to optimistically insert into.
const CREATE_LISTS = { '/customers': true, '/jobs': true, '/billing/quotes': true };
const isCreate = (cfg) => (cfg.method || '').toLowerCase() === 'post' && CREATE_LISTS[cfg.url] === true;

function isQueueable(cfg) {
  const m = (cfg.method || 'get').toLowerCase();
  const url = cfg.url || '';
  if (isCreate(cfg)) return true;
  if (m === 'put' && /^\/jobs\/[^/]+$/.test(url)) {
    // only field edits offline — never scheduling / customer / assignment changes
    const allowed = ['status', 'notes', 'description', 'work_started_at', 'work_ended_at'];
    const body = bodyOf(cfg.data);
    const keys = body && typeof body === 'object' ? Object.keys(body) : [];
    return keys.length > 0 && keys.every(k => allowed.includes(k));
  }
  if (m === 'put' && /^\/customers\/[^/]+$/.test(url)) return true; // edit customer contact offline
  if (m === 'post' && /^\/jobs\/[^/]+\/(parts|photos|signoff|en-route)$/.test(url)) return url.indexOf('en-route') === -1; // en-route emails; keep online
  if (m === 'delete' && /^\/jobs\/[^/]+\/(parts|photos)\/[^/]+$/.test(url)) return true;
  if ((m === 'post' || m === 'put') && /^\/inspections(\/[^/]+)?$/.test(url)) return true;
  if (m === 'post' && /^\/time\//.test(url)) return true;
  return false;
}

// --- optimistic cache patch so offline reads reflect the change ---
async function patchCachedRecord(listKey, id, patch) {
  const single = await idbGet('cache', `${listKey}/${id}`);
  if (single?.data) { single.data = { ...single.data, ...patch, _pending: true }; await idbSet('cache', `${listKey}/${id}`, single); }
  const list = await idbGet('cache', listKey);
  if (list && Array.isArray(list.data)) { list.data = list.data.map(r => (r.id === id ? { ...r, ...patch, _pending: true } : r)); await idbSet('cache', listKey, list); }
}
async function applyOptimistic(item) {
  try {
    const m = item.method.toLowerCase();
    const url = item.url;
    if (m === 'put') {
      const j = url.match(/^\/jobs\/([^/]+)$/);
      if (j) { await patchCachedRecord('/jobs', j[1], item.data || {}); return; }
      const c = url.match(/^\/customers\/([^/]+)$/);
      if (c) { await patchCachedRecord('/customers', c[1], item.data || {}); return; }
      return;
    }
  } catch { /* ignore */ }
}

async function addToListCache(url, entity) {
  const c = await idbGet('cache', url);
  if (c && Array.isArray(c.data)) { c.data = [entity, ...c.data]; await idbSet('cache', url, c); }
}

async function enqueue(cfg) {
  const create = isCreate(cfg);
  const data = bodyOf(cfg.data);
  const item = {
    v: QUEUE_V,
    opId: cfg.__opId || opId(), method: cfg.method || 'post', url: cfg.url, data,
    status: 'pending', attempts: 0, error: null, force: false, tmpId: null, createListKey: null,
    createdAt: new Date().toISOString(), deviceId: deviceId(), technician: currentTech(),
  };
  if (create) {
    item.tmpId = 'tmp-' + item.opId;
    item.createListKey = cfg.url;
    item.optimistic = { id: item.tmpId, ...(data && typeof data === 'object' ? data : {}), _pending: true };
  } else {
    item.optimistic = { queued: true, opId: item.opId, id: 'tmp-' + item.opId, _pending: true };
  }
  // Save to the device FIRST and make sure it really landed. If the phone's storage
  // is full we must say so — never report "saved" for work that isn't.
  try { await idbPutStrict('queue', item); }
  catch (e) {
    const err = new Error('Could not save this on the device (storage may be full). Free up space or reconnect, then try again.');
    err.offlineSaveFailed = true; err.cause = e;
    throw err;
  }
  try { if (create) await addToListCache(cfg.url, item.optimistic); else await applyOptimistic(item); } catch { /* display only */ }
  await refreshCounts();
  return item;
}

// --- show queued work on screen until it reaches the server -------------------
// Photos, parts and time-clock actions waiting in the queue are laid over whatever
// the server (or the saved copy) returns, so the tech always sees their own work.
const queuedFor = (re, method = 'post') => state.items.filter(it =>
  it.status !== 'conflict' && (it.method || '').toLowerCase() === method && re.test(it.url || ''));
function overlayPending(url, data) {
  try {
    const u = (url || '').split('?')[0];
    const jm = u.match(/^\/jobs\/([^/]+)$/);
    if (jm && data && typeof data === 'object' && !Array.isArray(data)) {
      const live = new Set(state.items.map(it => 'tmp-' + it.opId));
      const keep = (arr) => (arr || []).filter(x => !(typeof x?.id === 'string' && x.id.startsWith('tmp-')));  // rebuilt below
      const photos = keep(data.photos), parts = keep(data.parts);
      for (const it of queuedFor(new RegExp(`^/jobs/${jm[1]}/photos$`))) {
        const d = bodyOf(it.data) || {};
        if (live.has('tmp-' + it.opId)) photos.push({ id: 'tmp-' + it.opId, proof: d.proof || null, proof_type: d.proof_type || 'image', caption: d.caption || null, created_at: it.createdAt, _pending: true, _failed: it.status === 'failed' });
      }
      for (const it of queuedFor(new RegExp(`^/jobs/${jm[1]}/parts$`))) {
        const d = bodyOf(it.data) || {};
        parts.push({ id: 'tmp-' + it.opId, ...d, created_at: it.createdAt, _pending: true, _failed: it.status === 'failed' });
      }
      return { ...data, photos, parts };
    }
    if (u === '/time/active') {
      let active = data && typeof data === 'object' ? data : null;
      for (const it of queuedFor(/^\/time\/(clock-in|clock-out|break\/start|break\/end)$/)) {
        const d = bodyOf(it.data) || {};
        const at = it.createdAt;
        if (it.url === '/time/clock-in') { if (!active) active = { id: 'tmp-' + it.opId, technician_id: it.technician, job_id: d.job_id || null, clock_in: at, clock_out: null, breaks: [], _pending: true }; }
        else if (!active) continue;
        else if (it.url === '/time/clock-out') active = null;
        else if (it.url === '/time/break/start') active = { ...active, breaks: [...(active.breaks || []), { start: at, end: null }], _pending: true };
        else if (it.url === '/time/break/end') active = { ...active, breaks: (active.breaks || []).map((b, i, a) => (i === a.length - 1 && !b.end ? { ...b, end: at } : b)), _pending: true };
      }
      return active;
    }
  } catch { /* never break a read over this */ }
  return data;
}

// --- connectivity ---
function setOnline(v) {
  if (state.online !== v) { state.online = v; emit(); if (v) processQueue(); }
}
// While offline, quietly check for the server every few seconds. The phone's own
// "online" signal can't be trusted on weak service, so this is what brings the app
// back and starts the uploads — no need to close and reopen it.
let probing = false;
async function probe() {
  if (probing || !_api) return;
  probing = true;
  try { await _api.get('/health', { _probe: true, timeout: T_PROBE, params: { t: Date.now() } }); setOnline(true); }
  catch (e) { if (e?.response) setOnline(true); /* server answered → we're connected */ }
  finally { probing = false; }
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { probe(); });
  window.addEventListener('offline', () => setOnline(false));
  setInterval(() => {
    if (state.online === false) probe();
    else if (state.pending > 0 || state.items.some(it => it.status === 'failed' && (it.attempts || 0) < MAX_AUTO_RETRIES)) processQueue();
  }, 8000);
  // Coming back to the app (unlocking the phone) is the most common moment signal returns.
  document.addEventListener?.('visibilitychange', () => { if (document.visibilityState === 'visible') { if (state.online === false) probe(); else processQueue(); } });
}

// --- background upload ---
let _api = null;
let ready = Promise.resolve();   // resolves once the saved queue has been loaded
let processing = false;
export async function processQueue() {
  if (processing || state.online === false || !_api) return;
  processing = true;
  try {
    // 'syncing' is included: an upload interrupted by the app closing must be retried,
    // not left stuck forever. (Only one pass runs at a time, so nothing double-sends,
    // and the server ignores a repeat of an op it already completed.)
    const q = (await idbAll('queue'))
      .filter(x => x.status === 'pending' || x.status === 'syncing' || (x.status === 'failed' && (x.attempts || 0) < MAX_AUTO_RETRIES))
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    if (q.length) { state.syncing = true; emit(); }
    let done = 0;
    for (const item of q) {
      const url = remapUrl(item.url);
      const data = remapDeep(bodyOf(item.data));
      // A dependency (e.g. an offline-created customer) hasn't synced yet — hold
      // this item and try again on a later pass so we never send a temp id.
      if (url.includes('tmp-') || hasTmp(data)) { item.status = 'pending'; await idbSet('queue', null, item); continue; }
      item.status = 'syncing'; await idbSet('queue', null, item); await refreshCounts();
      try {
        const resp = await _api.request({
          method: item.method, url, data, _skipQueue: true, timeout: T_SLOW,
          __opId: item.opId, __force: !!item.force, __queuedAt: item.createdAt,
        });
        // A create just got its real id — record it and fix the cached list entry.
        if (item.tmpId && resp?.data?.id) {
          idMap[item.tmpId] = resp.data.id; await persistIdMap();
          if (item.createListKey) {
            const c = await idbGet('cache', item.createListKey);
            if (c && Array.isArray(c.data)) {
              c.data = c.data.map(e => (e.id === item.tmpId ? { ...e, id: resp.data.id, _pending: false } : e));
              await idbSet('cache', item.createListKey, c);
            }
          }
        }
        await idbDel('queue', item.opId);        // confirmed by server → drop it
        done++;
      } catch (err) {
        if (err && err.response) {                // server answered → real error
          item.status = err.response.status === 409 ? 'conflict' : 'failed';
          item.error = err.response.data?.error || `HTTP ${err.response.status}`;
          item.attempts += 1; await idbSet('queue', null, item);
        } else {                                  // still offline → stop, keep pending
          item.status = 'pending'; await idbSet('queue', null, item); break;
        }
      }
    }
    if (done && typeof window !== 'undefined') { try { window.dispatchEvent(new CustomEvent('cm-synced', { detail: { count: done } })); } catch { /* ignore */ } }
  } finally {
    processing = false; state.syncing = false; state.lastSync = new Date().toISOString();
    await refreshCounts();
  }
}

// One-time repair on launch: items saved by the old (broken) format get their body
// restored and a fresh set of retries, and anything stuck mid-upload is released.
// This is what rescues photos that were taken offline before this fix.
async function repairQueue() {
  try {
    for (const it of await idbAll('queue')) {
      let changed = false;
      if (it.v !== QUEUE_V) {
        it.data = bodyOf(it.data); it.v = QUEUE_V; changed = true;
        if (it.status === 'failed') { it.status = 'pending'; it.attempts = 0; it.error = null; }
      }
      if (it.status === 'syncing') { it.status = 'pending'; changed = true; }
      if (changed) await idbSet('queue', null, it);
    }
  } catch { /* ignore */ }
  try { navigator.storage?.persist?.(); } catch { /* ignore */ }   // ask the phone not to evict offline work
}

// Proactively pull down the datasets a technician needs, so they can go offline
// having loaded everything (not just the screens they happened to open). Reads
// go through the GET interceptor, which caches them.
export async function warmCache() {
  if (!_api || !localStorage.getItem('token')) return { ok: 0, failed: 0 };
  state.warming = true; emit();
  // Everyone-who-can-go-offline needs these. Quotes + settings are office/admin
  // only (they 403 for a technician), so only warm them for those roles —
  // otherwise every technician session spams the console with 403s on launch.
  const role = (() => { try { return JSON.parse(localStorage.getItem('user') || 'null')?.role || null; } catch { return null; } })();
  const core = ['/jobs', '/customers', '/employees', '/inspections', '/pricebook'];
  if (role === 'admin' || role === 'office') core.push('/billing/quotes', '/settings');
  let ok = 0, failed = 0;
  for (const u of core) { try { await _api.get(u); ok++; } catch { failed++; } }
  try {
    const me = currentTech();
    const list = (await idbGet('cache', '/jobs'))?.data || [];
    const today = new Date().toISOString().slice(0, 10);
    const mine = list.filter(j => (j.technician_id === me || (j.additional_technician_ids || []).includes(me)) && j.scheduled_date === today);
    for (const j of mine) { try { await _api.get(`/jobs/${j.id}`); ok++; } catch { failed++; } }
  } catch { /* ignore */ }
  state.warming = false; state.lastWarm = new Date().toISOString(); emit();
  return { ok, failed };
}

export async function retryFailed() {
  const q = await idbAll('queue');
  for (const it of q) if (it.status === 'failed') { it.status = 'pending'; it.attempts = 0; it.error = null; await idbSet('queue', null, it); }
  await refreshCounts();
  processQueue();
}

// Sync-review actions.
export async function discardItem(id) { await idbDel('queue', id); await refreshCounts(); }
export async function forceItem(id) {   // "keep mine" — resend, overriding a conflict
  const q = await idbAll('queue');
  const it = q.find(x => x.opId === id);
  if (it) { it.status = 'pending'; it.force = true; it.error = null; await idbSet('queue', null, it); }
  await refreshCounts();
  processQueue();
}

// --- install onto axios ---
export function installOffline(api) {
  _api = api;

  // Attach an idempotency key (reused across the first send + any retry), the
  // device id, and — for job edits — the base version for conflict detection.
  api.interceptors.request.use(async (cfg) => {
    const method = (cfg.method || 'get').toLowerCase();
    const queueable = isQueueable(cfg);
    const cacheable = method === 'get' && isCacheableGet(cfg.url);
    let hasCopy = false;
    if (cacheable) { try { const c = await idbGet('cache', cfg.url); hasCopy = !!c && c.v === CACHE_SCHEMA && isCacheableBody(c.data, cfg.url); } catch { /* ignore */ } }

    // Never wait forever on a weak signal.
    if (!cfg.timeout) {
      const slow = /^\/(assistant|ai)\b/.test(cfg.url || '');
      cfg.timeout = slow ? T_SLOW : cacheable ? (hasCopy ? T_READ_CACHED : T_READ) : queueable ? T_WRITE_QUEUEABLE : method === 'get' ? T_READ : T_WRITE;
    }
    // Already known to be offline → don't even try the network for things we can
    // answer from the device (saved copy / save-for-later). Instant, no spinner.
    const knownOffline = state.online === false || (typeof navigator !== 'undefined' && navigator.onLine === false);
    if (knownOffline && !cfg._skipQueue && !cfg._probe && ((cacheable && hasCopy) || queueable)) {
      cfg.adapter = () => Promise.reject(Object.assign(new Error('Offline'), { config: cfg, code: 'ERR_NETWORK', isOfflineShortcut: true }));
    }

    if (queueable) {
      cfg.__opId = cfg.__opId || opId();
      cfg.headers = { ...(cfg.headers || {}), 'X-Op-Id': cfg.__opId, 'X-Device-Id': deviceId() };
      if (cfg.__force) cfg.headers['X-Force'] = 'true';
      if (cfg.__queuedAt) cfg.headers['X-Queued-At'] = cfg.__queuedAt;   // when it really happened (offline)
      const jm = (cfg.method || '').toLowerCase() === 'put' && (cfg.url || '').match(/^\/jobs\/([^/]+)$/);
      if (jm) {
        try { const c = await idbGet('cache', `/jobs/${jm[1]}`); if (c?.data?.updated_at) cfg.headers['X-Base-Updated-At'] = c.data.updated_at; } catch { /* ignore */ }
      }
    }
    return cfg;
  });

  api.interceptors.response.use(
    async (resp) => {
      const cfg = resp.config || {};
      if ((cfg.method || 'get').toLowerCase() === 'get' && isCacheableGet(cfg.url) && isCacheableBody(resp.data, cfg.url)) {
        try { await idbSet('cache', cfg.url, { data: resp.data, at: Date.now(), v: CACHE_SCHEMA }); } catch { /* ignore */ }
        await ready;
        resp.data = overlayPending(cfg.url, resp.data);
      }
      setOnline(true);
      return resp;
    },
    async (error) => {
      const cfg = error?.config || {};
      if (cfg._skipQueue || cfg._probe) return Promise.reject(error);   // background retry / probe — don't re-queue
      if (error?.response) setOnline(true);               // the server answered (even with an error) → connected
      const isNetwork = !error?.response;                 // no response → offline / timeout / network
      if (isNetwork) {
        setOnline(false);
        const m = (cfg.method || 'get').toLowerCase();
        if (m === 'get' && isCacheableGet(cfg.url)) {
          const c = await idbGet('cache', cfg.url);
          // Serve the cache only if it holds a real payload — a previously stored
          // error/partial body must not be replayed as a success.
          if (c && c.v === CACHE_SCHEMA && isCacheableBody(c.data, cfg.url)) {
            await ready;
            return { data: overlayPending(cfg.url, c.data), status: 200, statusText: 'OK (cache)', headers: {}, config: cfg, fromCache: true };
          }
        }
        if (isQueueable(cfg)) {
          const item = await enqueue(cfg);                // throws (clearly) if the device couldn't save it
          return { data: item.optimistic, status: 202, statusText: 'Queued', headers: {}, config: cfg, queued: true };
        }
        if (!error.message || /Network Error|timeout/i.test(error.message)) {
          error.message = m === 'get' ? 'No connection — this screen has not been saved for offline use yet.' : 'No connection — this action needs the internet.';
        }
        error.offline = true;
      }
      return Promise.reject(error);
    }
  );
  ready = loadIdMap().then(repairQueue).then(refreshCounts).catch(() => {});
  ready.finally(() => {
    processQueue();
    // Warm the cache shortly after load (best-effort) so an unplanned signal
    // drop still leaves the tech with a usable copy of their day.
    if (state.online !== false) setTimeout(() => { warmCache(); }, 4000);
  });
}
