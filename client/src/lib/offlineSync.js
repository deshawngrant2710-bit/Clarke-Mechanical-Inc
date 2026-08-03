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
import { idbGet, idbAll, idbDel, idbSet } from './idb';

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

// --- observable state for the UI ---
const listeners = new Set();
let state = { online: navigator.onLine !== false, pending: 0, failed: 0, syncing: false, lastSync: null, items: [] };
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
const CACHE_GET = [/^\/jobs(\?|$)/, /^\/jobs\/[^/]+$/, /^\/customers(\?|$)/, /^\/employees(\?|$)/, /^\/inspections(\?|$)/, /^\/auth\/me$/];
const isCacheableGet = (url) => CACHE_GET.some(r => r.test((url || '').split('#')[0]));

function isQueueable(cfg) {
  const m = (cfg.method || 'get').toLowerCase();
  const url = cfg.url || '';
  if (m === 'put' && /^\/jobs\/[^/]+$/.test(url)) {
    // only field edits offline — never scheduling / customer / assignment changes
    const allowed = ['status', 'notes', 'description', 'work_started_at', 'work_ended_at'];
    const keys = Object.keys(cfg.data || {});
    return keys.length > 0 && keys.every(k => allowed.includes(k));
  }
  if (m === 'post' && /^\/jobs\/[^/]+\/(parts|photos|signoff|en-route)$/.test(url)) return url.indexOf('en-route') === -1; // en-route emails; keep online
  if (m === 'delete' && /^\/jobs\/[^/]+\/(parts|photos)\/[^/]+$/.test(url)) return true;
  if ((m === 'post' || m === 'put') && /^\/inspections(\/[^/]+)?$/.test(url)) return true;
  if (m === 'post' && /^\/time\//.test(url)) return true;
  return false;
}

// --- optimistic cache patch so offline reads reflect the change ---
async function patchCachedJob(id, patch) {
  const single = await idbGet('cache', `/jobs/${id}`);
  if (single?.data) { single.data = { ...single.data, ...patch }; await idbSet('cache', `/jobs/${id}`, single); }
  const list = await idbGet('cache', '/jobs');
  if (list && Array.isArray(list.data)) { list.data = list.data.map(j => (j.id === id ? { ...j, ...patch } : j)); await idbSet('cache', '/jobs', list); }
}
async function addToCachedJobArray(id, key, entry) {
  const single = await idbGet('cache', `/jobs/${id}`);
  if (single?.data) {
    single.data = { ...single.data, [key]: [...(single.data[key] || []), entry] };
    await idbSet('cache', `/jobs/${id}`, single);
  }
}
async function applyOptimistic(item) {
  try {
    const m = item.method.toLowerCase();
    const url = item.url;
    if (m === 'put') {
      const j = url.match(/^\/jobs\/([^/]+)$/);
      if (j) await patchCachedJob(j[1], item.data || {});
      return;
    }
    if (m === 'post') {
      const p = url.match(/^\/jobs\/([^/]+)\/parts$/);
      if (p) { await addToCachedJobArray(p[1], 'parts', { id: 'tmp-' + item.opId, ...(item.data || {}), _pending: true }); return; }
      const ph = url.match(/^\/jobs\/([^/]+)\/photos$/);
      if (ph) { await addToCachedJobArray(ph[1], 'photos', { id: 'tmp-' + item.opId, proof_type: (item.data || {}).proof_type || 'photo', _pending: true }); return; }
    }
  } catch { /* ignore */ }
}

async function enqueue(cfg) {
  const item = {
    opId: cfg.__opId || opId(), method: cfg.method || 'post', url: cfg.url, data: cfg.data ?? null,
    status: 'pending', attempts: 0, error: null, force: false,
    createdAt: new Date().toISOString(), deviceId: deviceId(), technician: currentTech(),
  };
  await idbSet('queue', null, item);
  await applyOptimistic(item);
  await refreshCounts();
  return item;
}

// --- connectivity ---
function setOnline(v) {
  if (state.online !== v) { state.online = v; emit(); if (v) processQueue(); }
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => setOnline(true));
  window.addEventListener('offline', () => setOnline(false));
}

// --- background upload ---
let _api = null;
let processing = false;
export async function processQueue() {
  if (processing || state.online === false || !_api) return;
  processing = true;
  try {
    const q = (await idbAll('queue'))
      .filter(x => x.status === 'pending' || x.status === 'failed')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (q.length) { state.syncing = true; emit(); }
    for (const item of q) {
      item.status = 'syncing'; await idbSet('queue', null, item); await refreshCounts();
      try {
        await _api.request({
          method: item.method, url: item.url, data: item.data, _skipQueue: true,
          __opId: item.opId, __force: !!item.force,
        });
        await idbDel('queue', item.opId);        // confirmed by server → drop it
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
  } finally {
    processing = false; state.syncing = false; state.lastSync = new Date().toISOString();
    await refreshCounts();
  }
}

export async function retryFailed() {
  const q = await idbAll('queue');
  for (const it of q) if (it.status === 'failed') { it.status = 'pending'; it.error = null; await idbSet('queue', null, it); }
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
    if (isQueueable(cfg)) {
      cfg.__opId = cfg.__opId || opId();
      cfg.headers = { ...(cfg.headers || {}), 'X-Op-Id': cfg.__opId, 'X-Device-Id': deviceId() };
      if (cfg.__force) cfg.headers['X-Force'] = 'true';
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
      if ((cfg.method || 'get').toLowerCase() === 'get' && isCacheableGet(cfg.url)) {
        try { await idbSet('cache', cfg.url, { data: resp.data, at: Date.now() }); } catch { /* ignore */ }
      }
      setOnline(true);
      return resp;
    },
    async (error) => {
      const cfg = error?.config || {};
      if (cfg._skipQueue) return Promise.reject(error);   // background retry — don't re-queue
      const isNetwork = !error?.response;                 // no response → offline / network
      if (isNetwork) {
        setOnline(false);
        const m = (cfg.method || 'get').toLowerCase();
        if (m === 'get' && isCacheableGet(cfg.url)) {
          const c = await idbGet('cache', cfg.url);
          if (c) return { data: c.data, status: 200, statusText: 'OK (cache)', headers: {}, config: cfg, fromCache: true };
        }
        if (isQueueable(cfg)) {
          const item = await enqueue(cfg);
          return { data: { queued: true, opId: item.opId }, status: 202, statusText: 'Queued', headers: {}, config: cfg, queued: true };
        }
      }
      return Promise.reject(error);
    }
  );
  refreshCounts();
  processQueue();
}
