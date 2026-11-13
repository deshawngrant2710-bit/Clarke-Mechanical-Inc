// ---------------------------------------------------------------------------
//  Claude Mechanical Bot — in-app health sweep.
//
//  Runs a battery of self-tests against the live system and returns a single
//  structured report (overall pass/fail + a row per check). It exercises the
//  REAL storage and read paths the app uses, so it catches problems like
//  "the photo uploads but doesn't stay" — not just surface checks.
//
//  Groups of checks:
//    • System        — database reachable, write→read→delete roundtrip
//    • Persistence    — create a tagged test customer → job → job photo →
//                       inspection → inspection photo, RE-READ each to prove it
//                       saved and stayed, then delete everything (end-to-end)
//    • Portals        — mint a token for each role (admin / office / technician /
//                       leads / customer) and confirm every portal both lets the
//                       right people in and keeps the wrong people out
//    • Integrations   — are SMS, push, webhook and cron keys configured (info)
//    • Integrity      — orphaned photos / jobs pointing at missing records (warn)
//
//  Every record the bot creates is tagged `__diagnostic: true` and auto-deleted.
//  A leftover-cleanup runs first, so an interrupted sweep never leaves junk.
// ---------------------------------------------------------------------------
const { v4: uuid } = require('uuid');
const jwt = require('jsonwebtoken');
const { db, list, getById, findWhere, create, remove } = require('./db');
const { JWT_SECRET } = require('../middleware/auth');

let smsConfigured = () => false;
let pushConfigured = () => false;
try { ({ smsConfigured } = require('./sms')); } catch { /* optional */ }
try { ({ pushConfigured } = require('./push')); } catch { /* optional */ }

const TAG = '__diagnostic';
const PORT = process.env.PORT || 8080;
const BASE = `http://127.0.0.1:${PORT}`;
// A 1×1 transparent PNG as a data URL — a real (tiny) image payload to prove
// that base64 picture data survives a save-and-read-back.
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const TAGGED_COLLECTIONS = ['job_photos', 'inspection_photos', 'inspections', 'jobs', 'customers', 'diagnostics_scratch'];

// --- helpers ---------------------------------------------------------------
function row(group, name, status, detail, ms) {
  return { group, name, status, detail: detail || '', ms: ms || 0 };
}
async function timed(fn) {
  const t = Date.now();
  try { const r = await fn(); return { ...r, ms: Date.now() - t }; }
  catch (e) { return { status: 'fail', detail: e.message || String(e), ms: Date.now() - t }; }
}
function mkToken(role) {
  return jwt.sign({ id: `${TAG}-${role}`, role, name: `Bot ${role}` }, JWT_SECRET, { expiresIn: '5m' });
}
// Call the app's own HTTP API from inside the server with a role's token.
// Returns the HTTP status, or 0 if the local API couldn't be reached.
async function apiStatus(path, role) {
  try {
    const r = await fetch(BASE + path, { headers: { Authorization: 'Bearer ' + mkToken(role) } });
    return r.status;
  } catch { return 0; }
}

// Remove any tagged test records left behind by an earlier interrupted run.
async function cleanupLeftovers() {
  let removed = 0;
  for (const coll of TAGGED_COLLECTIONS) {
    try {
      const docs = await list(coll);
      for (const d of docs) {
        if (d && d[TAG] === true) { try { await remove(coll, d.id); removed++; } catch { /* ignore */ } }
      }
    } catch { /* collection may not exist yet */ }
  }
  return removed;
}

// --- check groups ----------------------------------------------------------

async function systemChecks() {
  const out = [];
  {
    const r = await timed(async () => {
      const users = await list('users');
      return { status: 'pass', detail: `${users.length} user record(s) read` };
    });
    out.push(row('System', 'Database reachable (read)', r.status, r.detail, r.ms));
  }
  {
    const r = await timed(async () => {
      const id = uuid();
      await create('diagnostics_scratch', id, { [TAG]: true, ping: 'pong', at: Date.now() });
      const back = await getById('diagnostics_scratch', id);
      const ok = back && back.ping === 'pong';
      await remove('diagnostics_scratch', id);
      const gone = await getById('diagnostics_scratch', id);
      if (!ok) return { status: 'fail', detail: 'Wrote a record but could not read it back' };
      if (gone) return { status: 'warn', detail: 'Record did not delete cleanly' };
      return { status: 'pass', detail: 'Write → read → delete all succeeded' };
    });
    out.push(row('System', 'Database write/read/delete', r.status, r.detail, r.ms));
  }
  return out;
}

// End-to-end: build a real (tagged) customer → job → photo → inspection →
// inspection photo, proving each one SAVES and STAYS, then tear it all down.
async function persistenceChecks() {
  const out = [];
  const made = { customers: [], jobs: [], job_photos: [], inspections: [], inspection_photos: [] };
  try {
    // 1) Customer saves
    let customerId = null;
    {
      const r = await timed(async () => {
        const id = uuid();
        await create('customers', id, { [TAG]: true, name: '⚙︎ Claude Bot Test Customer', created_at: new Date().toISOString() });
        made.customers.push(id); customerId = id;
        const back = await getById('customers', id);
        if (!back || back.name !== '⚙︎ Claude Bot Test Customer') return { status: 'fail', detail: 'Customer did not save' };
        return { status: 'pass', detail: 'Customer created and read back' };
      });
      out.push(row('Persistence', 'Customer saves & stays', r.status, r.detail, r.ms));
    }
    // 2) Job saves with its customer link
    let jobId = null;
    {
      const r = await timed(async () => {
        const id = uuid();
        await create('jobs', id, { [TAG]: true, title: '⚙︎ Claude Bot Test Job', customer_id: customerId, status: 'pending', created_at: new Date().toISOString() });
        made.jobs.push(id); jobId = id;
        const back = await getById('jobs', id);
        if (!back) return { status: 'fail', detail: 'Job did not save' };
        if (back.customer_id !== customerId) return { status: 'fail', detail: 'Job saved but lost its customer link' };
        return { status: 'pass', detail: 'Job created, customer link intact' };
      });
      out.push(row('Persistence', 'Job saves & stays', r.status, r.detail, r.ms));
    }
    // 3) THE headline check — a photo attached to a job uploads AND stays
    {
      const r = await timed(async () => {
        if (!jobId) return { status: 'skip', detail: 'No test job to attach to' };
        const id = uuid();
        await create('job_photos', id, { [TAG]: true, job_id: jobId, proof: TINY_PNG, proof_type: 'image', caption: 'bot-test', created_at: new Date().toISOString() });
        made.job_photos.push(id);
        // Read it back the SAME way the Job screen does — list photos for the job…
        const listed = await findWhere('job_photos', 'job_id', jobId);
        const found = listed.find(p => p.id === id);
        if (!found) return { status: 'fail', detail: 'Photo uploaded but did NOT stay on the job (not in the job\'s photo list)' };
        // …then pull the image blob the way the viewer does, and confirm it\'s whole.
        const full = await getById('job_photos', id);
        if (!full || !full.proof) return { status: 'fail', detail: 'Photo record is there but the image data is missing' };
        if (full.proof !== TINY_PNG) return { status: 'fail', detail: `Image data changed on save (stored ${full.proof.length} chars, expected ${TINY_PNG.length})` };
        return { status: 'pass', detail: 'Photo uploaded, stayed on the job, and the image is intact' };
      });
      out.push(row('Persistence', 'Job photo uploads & stays', r.status, r.detail, r.ms));
    }
    // 4) Inspection saves
    let inspId = null;
    {
      const r = await timed(async () => {
        const id = uuid();
        await create('inspections', id, { [TAG]: true, property_type: 'residential', equipment_type: 'boiler', job_id: jobId, customer_id: customerId, status: 'draft', created_at: new Date().toISOString() });
        made.inspections.push(id); inspId = id;
        const back = await getById('inspections', id);
        if (!back) return { status: 'fail', detail: 'Inspection did not save' };
        return { status: 'pass', detail: 'Inspection created and read back' };
      });
      out.push(row('Persistence', 'Inspection saves & stays', r.status, r.detail, r.ms));
    }
    // 5) Inspection photo stays
    {
      const r = await timed(async () => {
        if (!inspId) return { status: 'skip', detail: 'No test inspection to attach to' };
        const id = uuid();
        await create('inspection_photos', id, { [TAG]: true, inspection_id: inspId, proof: TINY_PNG, proof_type: 'image', created_at: new Date().toISOString() });
        made.inspection_photos.push(id);
        const listed = await findWhere('inspection_photos', 'inspection_id', inspId);
        const found = listed.find(p => p.id === id);
        if (!found) return { status: 'fail', detail: 'Inspection photo uploaded but did NOT stay' };
        const full = await getById('inspection_photos', id);
        if (!full || full.proof !== TINY_PNG) return { status: 'fail', detail: 'Inspection photo record is there but the image data is missing/changed' };
        return { status: 'pass', detail: 'Inspection photo uploaded and stayed' };
      });
      out.push(row('Persistence', 'Inspection photo uploads & stays', r.status, r.detail, r.ms));
    }
    // 6) Deletes actually remove the data
    {
      const r = await timed(async () => {
        const all = [
          ['inspection_photos', made.inspection_photos], ['job_photos', made.job_photos],
          ['inspections', made.inspections], ['jobs', made.jobs], ['customers', made.customers],
        ];
        for (const [coll, ids] of all) for (const id of ids) { await remove(coll, id); }
        // confirm the test customer is actually gone
        const stillThere = made.customers.length ? await getById('customers', made.customers[0]) : null;
        // mark as consumed so finally doesn't double-delete
        made.inspection_photos = []; made.job_photos = []; made.inspections = []; made.jobs = []; made.customers = [];
        if (stillThere) return { status: 'warn', detail: 'Delete reported success but a record was still found' };
        return { status: 'pass', detail: 'All test records deleted cleanly' };
      });
      out.push(row('Persistence', 'Records delete cleanly', r.status, r.detail, r.ms));
    }
  } finally {
    // Safety net: remove anything still tracked (e.g. if a check threw mid-way).
    for (const coll of Object.keys(made)) {
      for (const id of made[coll]) { try { await remove(coll, id); } catch { /* ignore */ } }
    }
  }
  return out;
}

// Mint a token per role and confirm the portals let the right roles in and keep
// the wrong roles out. Uses only safe GET endpoints.
async function portalChecks() {
  const out = [];
  // First make sure the local API is reachable at all.
  const probe = await apiStatus('/api/auth/me', 'admin');
  if (probe === 0) {
    out.push(row('Portals', 'Local API reachable', 'warn', 'Could not reach the API from inside the server to test role access — skipping portal checks', 0));
    return out;
  }
  // Every role can authenticate (their portal loads).
  for (const role of ['admin', 'office', 'technician', 'leads', 'customer']) {
    const r = await timed(async () => {
      // The bot's test logins are synthetic (no user record), so /auth/me answers
      // 404 "user not found" AFTER the token is accepted. 401 = login rejected.
      const s = await apiStatus('/api/auth/me', role);
      return (s === 200 || s === 404) ? { status: 'pass', detail: `${role} sign-in token accepted` }
        : { status: 'fail', detail: `${role} sign-in rejected (got ${s})` };
    });
    out.push(row('Portals', `${role[0].toUpperCase() + role.slice(1)} portal signs in`, r.status, r.detail, r.ms));
  }
  // Access matrix: [label, path, role, expectation] where expectation is 'allow'(200) or 'deny'(401/403).
  const matrix = [
    ['Admin can open Settings', '/api/settings', 'admin', 'allow'],
    ['Office can open Jobs', '/api/jobs', 'office', 'allow'],
    ['Technician can open Jobs', '/api/jobs', 'technician', 'allow'],
    ['Technician blocked from Settings', '/api/settings', 'technician', 'deny'],
    ['Technician blocked from Billing', '/api/billing/quotes', 'technician', 'deny'],
    ['Leads agent can open Customers', '/api/customers', 'leads', 'allow'],
    ['Leads agent blocked from Jobs', '/api/jobs', 'leads', 'deny'],
    ['Customer blocked from Jobs', '/api/jobs', 'customer', 'deny'],
    ['Customer blocked from Customers', '/api/customers', 'customer', 'deny'],
    ['Customer blocked from Settings', '/api/settings', 'customer', 'deny'],
  ];
  for (const [label, path, role, expect] of matrix) {
    const r = await timed(async () => {
      const s = await apiStatus(path, role);
      if (s === 0) return { status: 'warn', detail: 'API unreachable' };
      if (expect === 'allow') {
        return s === 200 ? { status: 'pass', detail: `allowed (200)` }
          : { status: 'fail', detail: `should be allowed but got ${s}` };
      }
      // deny
      return (s === 401 || s === 403) ? { status: 'pass', detail: `correctly blocked (${s})` }
        : { status: 'fail', detail: `should be blocked but got ${s}` };
    });
    out.push(row('Portals', label, r.status, r.detail, r.ms));
  }
  return out;
}

function integrationChecks() {
  const out = [];
  const mark = (name, ok, okText, missText) =>
    out.push(row('Integrations', name, ok ? 'pass' : 'warn', ok ? okText : missText, 0));
  let sms = false, push = false;
  try { sms = !!smsConfigured(); } catch { /* ignore */ }
  try { push = !!pushConfigured(); } catch { /* ignore */ }
  mark('Text messaging (Quo)', sms, 'Quo API key + number set', 'Not configured — texts will not send');
  mark('Push notifications (APNs)', push, 'APNs push configured', 'Not configured — app push will not send');
  mark('Messaging webhook key', !!process.env.QUO_WEBHOOK_KEY, 'Webhook key set', 'QUO_WEBHOOK_KEY not set — incoming texts/calls won\'t record');
  mark('Scheduler key (CRON_KEY)', !!process.env.CRON_KEY, 'Cron key set', 'CRON_KEY not set — scheduled sweeps/reminders need it');
  mark('Login signing secret', !!(process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16), 'JWT secret present', 'JWT secret missing/short');
  return out;
}

async function integrityChecks() {
  const out = [];
  {
    const r = await timed(async () => {
      const [jobs, photos] = await Promise.all([list('jobs'), list('job_photos')]);
      const jobIds = new Set(jobs.map(j => j.id));
      const orphans = photos.filter(p => !p[TAG] && p.job_id && !jobIds.has(p.job_id));
      return orphans.length
        ? { status: 'warn', detail: `${orphans.length} job photo(s) point to a job that no longer exists` }
        : { status: 'pass', detail: 'No orphaned job photos' };
    });
    out.push(row('Integrity', 'Job photos reference real jobs', r.status, r.detail, r.ms));
  }
  {
    const r = await timed(async () => {
      const [jobs, customers] = await Promise.all([list('jobs'), list('customers')]);
      const custIds = new Set(customers.map(c => c.id));
      const dangling = jobs.filter(j => !j[TAG] && j.customer_id && !custIds.has(j.customer_id));
      return dangling.length
        ? { status: 'warn', detail: `${dangling.length} job(s) point to a customer that no longer exists` }
        : { status: 'pass', detail: 'Every job\'s customer exists' };
    });
    out.push(row('Integrity', 'Jobs reference real customers', r.status, r.detail, r.ms));
  }
  return out;
}

// --- orchestration ---------------------------------------------------------

async function runSweep({ trigger = 'manual' } = {}) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const leftovers = await cleanupLeftovers();

  // Run sequentially so the checks don't contend on the database.
  const checks = [];
  checks.push(...(await systemChecks()));
  checks.push(...(await persistenceChecks()));
  checks.push(...(await portalChecks()));
  checks.push(...integrationChecks());
  checks.push(...(await integrityChecks()));

  const summary = {
    total: checks.length,
    passed: checks.filter(c => c.status === 'pass').length,
    failed: checks.filter(c => c.status === 'fail').length,
    warned: checks.filter(c => c.status === 'warn').length,
    skipped: checks.filter(c => c.status === 'skip').length,
  };
  const report = {
    id: uuid(),
    at: startedAt,
    trigger,                      // 'manual' | 'scheduled'
    durationMs: Date.now() - t0,
    ok: summary.failed === 0,     // warnings don't fail the sweep; a fail does
    status: summary.failed > 0 ? 'fail' : (summary.warned > 0 ? 'warn' : 'pass'),
    summary,
    leftoversCleaned: leftovers,
    checks,
  };
  return report;
}

const MAX_REPORTS = 40;
async function saveReport(report) {
  try {
    await create('diagnostic_reports', report.id, report);
    // Prune old reports so this collection can\'t grow forever.
    const all = (await list('diagnostic_reports')).sort((a, b) => (b.at || '').localeCompare(a.at || ''));
    for (const r of all.slice(MAX_REPORTS)) { try { await remove('diagnostic_reports', r.id); } catch { /* ignore */ } }
  } catch (e) { console.error('[diagnostics] saveReport:', e.message); }
}
async function latestReport() {
  const all = (await list('diagnostic_reports')).sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  return all[0] || null;
}
async function history(limit = 20) {
  const all = (await list('diagnostic_reports')).sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  // Return lightweight rows (no full check detail) for the history list.
  return all.slice(0, limit).map(r => ({ id: r.id, at: r.at, trigger: r.trigger, status: r.status, ok: r.ok, summary: r.summary, durationMs: r.durationMs }));
}

async function runAndStore({ trigger = 'manual' } = {}) {
  const report = await runSweep({ trigger });
  await saveReport(report);
  return report;
}

// --- scheduled run + alert-on-failure --------------------------------------

const SWEEP_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000;   // every 2 days
const GATE_MS = SWEEP_INTERVAL_MS - 3 * 60 * 60 * 1000; // 47h, so a daily/2-day scheduler never double-fires

// Email + notify the admins when a scheduled sweep finds a failure.
async function alertFailure(report) {
  const failed = report.checks.filter(c => c.status === 'fail');
  const title = `Claude Mechanical Bot found ${failed.length} problem${failed.length === 1 ? '' : 's'}`;
  const body = failed.slice(0, 6).map(c => `${c.name} — ${c.detail}`).join(' · ');

  // In-app bell for admins.
  try {
    const { notify } = require('./notify');
    await notify({ type: 'alert', title, body: body.slice(0, 280), link: '/system-check', roles: ['admin'] });
  } catch (e) { console.error('[diagnostics] notify failed:', e.message); }

  // Email the admins.
  try {
    const { sendMail } = require('./email');
    const admins = (await list('users')).filter(u => u.role === 'admin' && u.email);
    if (admins.length) {
      const rows = failed.map(c => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee"><strong>${c.group}</strong></td><td style="padding:6px 10px;border-bottom:1px solid #eee">${c.name}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;color:#b91c1c">${c.detail || ''}</td></tr>`).join('');
      const html = `
        <div style="font-family:system-ui,Arial,sans-serif;max-width:620px;margin:0 auto">
          <h2 style="color:#b91c1c;margin:0 0 4px">⚠︎ ${title}</h2>
          <p style="color:#475569;margin:0 0 16px">The automatic system sweep on ${new Date(report.at).toLocaleString('en-US')} completed with failures. Passed ${report.summary.passed}/${report.summary.total}; ${report.summary.failed} failed, ${report.summary.warned} warning(s).</p>
          <table style="border-collapse:collapse;width:100%;font-size:14px"><thead><tr style="background:#f8fafc"><th style="text-align:left;padding:6px 10px">Area</th><th style="text-align:left;padding:6px 10px">Check</th><th style="text-align:left;padding:6px 10px">Detail</th></tr></thead><tbody>${rows}</tbody></table>
          <p style="color:#64748b;margin:16px 0 0;font-size:13px">Open the app → Claude Mechanical Bot to run a fresh sweep and see everything.</p>
        </div>`;
      for (const a of admins) {
        try { await sendMail({ type: 'diagnostic_alert', to: a.email, toName: a.name, subject: `⚠︎ ${title} — Clarke Mechanical`, html, sentBy: 'Claude Mechanical Bot' }); }
        catch (e) { console.error('[diagnostics] email to', a.email, 'failed:', e.message); }
      }
    }
  } catch (e) { console.error('[diagnostics] alert email failed:', e.message); }
}

// Run a scheduled sweep, but only if one hasn't run in the last ~2 days (unless
// forced). Alerts admins on failure. Safe to call hourly — it self-gates.
async function runScheduledSweep({ force = false } = {}) {
  try {
    if (!force) {
      const recent = (await list('diagnostic_reports'))
        .filter(r => r.trigger === 'scheduled')
        .sort((a, b) => (b.at || '').localeCompare(a.at || ''))[0];
      if (recent && (Date.now() - new Date(recent.at).getTime()) < GATE_MS) {
        return { skipped: 'ran recently', last: recent.at };
      }
    }
    const report = await runAndStore({ trigger: 'scheduled' });
    if (!report.ok) await alertFailure(report);
    return { ran: true, ok: report.ok, status: report.status, summary: report.summary };
  } catch (e) {
    console.error('[diagnostics] scheduled sweep failed:', e.message);
    return { error: e.message };
  }
}

module.exports = { runSweep, runAndStore, saveReport, latestReport, history, runScheduledSweep, alertFailure, SWEEP_INTERVAL_MS, MAX_REPORTS };
