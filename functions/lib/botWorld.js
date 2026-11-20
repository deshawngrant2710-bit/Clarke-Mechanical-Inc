// Clarke Mechanical Bot — its own private "world", and the walkthrough it runs in it.
//
// Every run the bot creates five bot logins (admin, office, technician, leads agent,
// customer) plus a test customer, then uses the REAL app API — same routes,
// same permission checks, same database — exactly like your staff and customers:
//   office books a job → technician sees it, clocks in, starts work, uploads a
//   photo, marks it done, clocks out with a proof photo → office closes the job →
//   customer sees it in their portal … and every portal's pages are opened.
// It moves deliberately (a short pause between steps) and records how long every
// call takes. Then it deletes everything it made and proves nothing is left.
//
// Safety (see diagContext.js): bot records are hidden from real users, bot activity
// never emails / texts / pushes anyone, bot jobs never create invoices or points,
// and bot logins can only change the bot's own data and die at cleanup.
const jwt = require('jsonwebtoken');
const { list, getById, findWhere, create, remove } = require('./db');
const { JWT_SECRET } = require('../middleware/auth');
const { isBotRecord, BOT_PREFIX } = require('./diagContext');

const ROLES = ['admin', 'office', 'technician', 'leads', 'customer'];
const BOT = Object.fromEntries(ROLES.map(r => [r, `${BOT_PREFIX}-${r}`]));
const BOT_CUSTOMER = `${BOT_PREFIX}-customer-record`;
const PACE_MS = Number(process.env.BOT_PACE_MS || 400);           // "go through it slowly"
const SLOW_WARN_MS = 4000, SLOW_FAIL_MS = 12000;
const PORT = process.env.PORT || 8080;
const BASE = `http://127.0.0.1:${PORT}`;
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);
const ID = (s) => `${BOT_PREFIX}-${s}`;

// While the browser checks are using the world, the server walkthrough waits its turn.
let busyUntil = 0;
const worldBusy = () => Date.now() < busyUntil;
const holdWorld = (ms) => { busyUntil = Date.now() + ms; };
const releaseWorld = () => { busyUntil = 0; };

function tokenFor(role, ttl = '10m') {
  return jwt.sign({ id: BOT[role], role, name: `Clarke Bot (${role})`, email: null, ...(role === 'customer' ? { customer_id: BOT_CUSTOMER } : {}) }, JWT_SECRET, { expiresIn: ttl });
}

// ---- world setup / teardown -------------------------------------------------
const WORLD_COLLECTIONS = ['time_entries', 'job_photos', 'inspection_photos', 'inspections', 'payments', 'invoices', 'quotes', 'jobs', 'portal_links', 'customers', 'users', 'diagnostics_scratch'];

async function teardownWorld() {
  let removed = 0;
  const botJobIds = new Set((await list('jobs', { includeBot: true })).filter(isBotRecord).map(j => j.id));
  for (const coll of WORLD_COLLECTIONS) {
    let rows = [];
    try { rows = await list(coll, { includeBot: true }); } catch { continue; }
    for (const r of rows) {
      const mine = isBotRecord(r) || (r.job_id && botJobIds.has(r.job_id)) || (coll === 'invoices' && r.job_id && botJobIds.has(r.job_id));
      if (mine) { try { await remove(coll, r.id); removed++; } catch { /* keep going */ } }
    }
  }
  return removed;
}

async function leftoversCount() {
  let n = 0;
  for (const coll of WORLD_COLLECTIONS) {
    try { n += (await list(coll, { includeBot: true })).filter(isBotRecord).length; } catch { /* ignore */ }
  }
  return n;
}

async function setupWorld({ seedDocs = false } = {}) {
  await teardownWorld();
  const now = new Date().toISOString();
  for (const role of ROLES) {
    await create('users', BOT[role], {
      __diagnostic: true, name: `⚙︎ Clarke Bot (${role})`, email: null, password: null, phone: null, role,
      customer_id: role === 'customer' ? BOT_CUSTOMER : null, created_at: now,
    });
  }
  await create('customers', BOT_CUSTOMER, {
    __diagnostic: true, name: '⚙︎ Clarke Bot Test Customer', email: null, phone: null, sms_opt_in: false,
    address: '1 Health Check Lane', city: 'Queens', state: 'NY', zip: '11691', created_at: now,
  });
  if (seedDocs) {
    const note = 'Inspected unit and tested controls<div>Replaced worn igniter</div><div>Verified safe operation</div>';
    const items = (amt) => [{ description: 'HEALTH CHECK SERVICE CALL', note, quantity: 1, unit_price: amt, total: amt }];
    await create('invoices', ID('inv-sent'), { __diagnostic: true, customer_id: BOT_CUSTOMER, invoice_number: 'BOT-SENT', status: 'sent', issue_date: today(), items: items(115), subtotal: 115, tax_amount: 10, total: 125, created_at: now });
    await create('invoices', ID('inv-paid'), { __diagnostic: true, customer_id: BOT_CUSTOMER, invoice_number: 'BOT-PAID', status: 'paid', issue_date: today(), items: items(250), subtotal: 250, tax_amount: 0, total: 250, created_at: now });
    await create('payments', ID('pay-1'), { __diagnostic: true, invoice_id: ID('inv-paid'), amount: 250, method: 'check', paid_at: now, created_at: now });
    await create('invoices', ID('inv-draft'), { __diagnostic: true, customer_id: BOT_CUSTOMER, invoice_number: 'BOT-DRAFT', status: 'draft', issue_date: today(), items: items(90), subtotal: 90, tax_amount: 0, total: 90, created_at: now });
    await create('quotes', ID('quote'), { __diagnostic: true, customer_id: BOT_CUSTOMER, quote_number: 'BOT-EST', status: 'sent', issue_date: today(), expiry_date: today(), items: items(300), subtotal: 300, tax_amount: 0, total: 300, created_at: now });
    await create('jobs', ID('job-today'), { __diagnostic: true, customer_id: BOT_CUSTOMER, technician_id: BOT.technician, title: '⚙︎ Bot Test Job (today)', status: 'scheduled', scheduled_date: today(), scheduled_time: '10:00', address: '1 Health Check Lane, Queens, NY', created_at: now });
    await create('jobs', ID('job-done'), { __diagnostic: true, customer_id: BOT_CUSTOMER, technician_id: BOT.technician, title: '⚙︎ Bot Test Job (completed)', status: 'completed', scheduled_date: today(), description: 'Line one\nLine two', created_at: now });
    await create('job_photos', ID('photo-1'), { __diagnostic: true, job_id: ID('job-done'), proof: TINY_PNG, proof_type: 'image', created_at: now });
  }
  return { users: BOT, customer: BOT_CUSTOMER };
}

// ---- HTTP as a role ---------------------------------------------------------
async function call(role, method, path, body, { token } = {}) {
  const t = Date.now();
  let status = 0, data = null;
  try {
    const r = await fetch(BASE + path, {
      method, headers: { Authorization: 'Bearer ' + (token || tokenFor(role)), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    status = r.status;
    try { data = await r.json(); } catch { data = null; }
  } catch (e) { data = { error: e.message }; }
  const ms = Date.now() - t;
  await sleep(PACE_MS);
  return { status, data, ms };
}
const speed = (ms) => (ms > SLOW_FAIL_MS ? 'fail' : ms > SLOW_WARN_MS ? 'warn' : null);
const row = (group, name, status, detail, ms) => ({ group, name, status, detail: detail || '', ms: ms || 0 });

// ---- the job lifecycle walkthrough -----------------------------------------
async function journey() {
  const G = 'Job walkthrough';
  const out = [];
  const step = async (name, fn) => {
    const t = Date.now();
    try {
      const r = await fn();
      const ms = r.ms ?? (Date.now() - t);
      const slow = r.status === 'pass' && speed(ms);
      out.push(row(G, name, slow || r.status, slow ? `${r.detail} — slow (${(ms / 1000).toFixed(1)}s)` : r.detail, ms));
      return r;
    } catch (e) { out.push(row(G, name, 'fail', e.message, Date.now() - t)); return { status: 'fail' }; }
  };
  let jobId = null, photoId = null, entryId = null;
  const stopped = () => !jobId;

  await step('Office books a job for a customer', async () => {
    const r = await call('office', 'POST', '/api/jobs', { title: '⚙︎ Bot Walkthrough Job', customer_id: BOT_CUSTOMER, technician_id: BOT.technician, status: 'scheduled', scheduled_date: today(), scheduled_time: '09:00', description: 'Health-check job' });
    if (r.status !== 201 || !r.data?.id) return { status: 'fail', detail: `could not create job (HTTP ${r.status}) ${r.data?.error || ''}`, ms: r.ms };
    jobId = r.data.id; return { status: 'pass', detail: 'job created', ms: r.ms };
  });
  if (stopped()) return out;
  await step('Technician sees the job on their list', async () => {
    const r = await call('technician', 'GET', '/api/jobs');
    const found = Array.isArray(r.data) && r.data.some(j => j.id === jobId);
    return { status: found ? 'pass' : 'fail', detail: found ? 'job is on the technician\'s list' : `job missing from list (HTTP ${r.status})`, ms: r.ms };
  });
  await step('Technician opens the job', async () => {
    const r = await call('technician', 'GET', `/api/jobs/${jobId}`);
    return { status: r.status === 200 ? 'pass' : 'fail', detail: r.status === 200 ? 'job details load' : `HTTP ${r.status}`, ms: r.ms };
  });
  await step('Technician starts work (status → in progress)', async () => {
    const r = await call('technician', 'PUT', `/api/jobs/${jobId}`, { status: 'in-progress', work_started_at: new Date().toISOString() });
    return { status: r.status === 200 && r.data?.status === 'in-progress' ? 'pass' : 'fail', detail: r.status === 200 ? `status saved as "${r.data?.status}"` : `HTTP ${r.status}`, ms: r.ms };
  });
  await step('Starting the job clocked the technician in automatically', async () => {
    const r = await call('technician', 'GET', '/api/time/active');
    entryId = r.data?.job_id === jobId ? r.data.id : null;
    return { status: entryId ? 'pass' : 'fail', detail: entryId ? 'on the clock for this job — no manual clock-in needed' : `not clocked in after starting the job (HTTP ${r.status})`, ms: r.ms };
  });
  await step('Technician takes the finished-work photo', async () => {
    const r = await call('technician', 'POST', `/api/jobs/${jobId}/photos`, { proof: TINY_PNG, proof_type: 'image', caption: 'Completed work' });
    photoId = r.data?.id || null;
    return { status: r.status === 201 && photoId ? 'pass' : 'fail', detail: photoId ? 'photo accepted' : `HTTP ${r.status} ${r.data?.error || ''}`, ms: r.ms };
  });
  await step('Photo stays on the job', async () => {
    const r = await call('office', 'GET', `/api/jobs/${jobId}`);
    const ok = (r.data?.photos || []).some(p => p.id === photoId);
    return { status: ok ? 'pass' : 'fail', detail: ok ? 'photo is listed on the job' : 'photo uploaded but NOT on the job', ms: r.ms };
  });
  await step('Photo image is intact', async () => {
    const r = await call('office', 'GET', `/api/jobs/${jobId}/photos/${photoId}`);
    const ok = r.data?.proof === TINY_PNG;
    return { status: ok ? 'pass' : 'fail', detail: ok ? 'image data unchanged' : 'image missing or changed after save', ms: r.ms };
  });
  await step('Technician marks the work done', async () => {
    const r = await call('technician', 'PUT', `/api/jobs/${jobId}`, { status: 'awaiting-signoff', work_ended_at: new Date().toISOString() });
    return { status: r.data?.status === 'awaiting-signoff' ? 'pass' : 'fail', detail: r.status === 200 ? `status "${r.data?.status}"` : `HTTP ${r.status}`, ms: r.ms };
  });
  await step('Still on the clock until the job is closed', async () => {
    const e = entryId ? await getById('time_entries', entryId) : null;
    return { status: e && !e.clock_out ? 'pass' : 'fail', detail: e && !e.clock_out ? 'clock keeps running while awaiting sign-off' : 'clocked out too early' };
  });
  await step('Office closes the job', async () => {
    const r = await call('office', 'POST', `/api/jobs/${jobId}/signoff`, { signoff_type: 'management' });
    return { status: r.data?.status === 'completed' ? 'pass' : 'fail', detail: r.status === 200 ? `status "${r.data?.status}"` : `HTTP ${r.status} ${r.data?.error || ''}`, ms: r.ms };
  });
  await step('Closing the job clocked the technician out automatically', async () => {
    const e = entryId ? await getById('time_entries', entryId) : null;
    const ok = !!(e && e.clock_out && typeof e.hours === 'number' && e.proof_photo_id === photoId);
    if (!ok) return { status: 'fail', detail: !e ? 'no timesheet entry' : !e.clock_out ? 'still clocked in after the job was closed' : 'clocked out, but the finished-work photo is not attached' };
    const p = await call('technician', 'GET', `/api/time/${entryId}/proof`);
    return { status: p.data?.proof === TINY_PNG ? 'pass' : 'fail', detail: p.data?.proof === TINY_PNG ? `clocked out (${e.hours}h) with the finished-work photo as proof` : 'proof photo could not be opened from the timesheet', ms: p.ms };
  });
  await step('Closing the bot job created no real invoice', async () => {
    await sleep(800); // auto-invoicing runs just after the response
    const inv = await findWhere('invoices', 'job_id', jobId);
    return { status: inv.length ? 'fail' : 'pass', detail: inv.length ? 'an invoice was created for the test job — safety rule broken' : 'no invoice, no points, no customer notices' };
  });
  await step('Customer sees the finished job in their portal', async () => {
    const r = await call('customer', 'GET', '/api/portal/jobs');
    const j = Array.isArray(r.data) && r.data.find(x => x.id === jobId);
    return { status: j && j.status === 'completed' ? 'pass' : 'fail', detail: j ? `shown as "${j.status}"` : `job not in portal (HTTP ${r.status})`, ms: r.ms };
  });
  await step('Photo still there after the job is closed', async () => {
    const p = await getById('job_photos', photoId);
    return { status: p?.proof === TINY_PNG ? 'pass' : 'fail', detail: p ? 'photo kept' : 'photo disappeared' };
  });
  await step('Test job is invisible to real staff', async () => {
    const humanView = await list('jobs'); // no bot context = what staff see
    const leaked = humanView.some(j => j.id === jobId);
    return { status: leaked ? 'fail' : 'pass', detail: leaked ? 'bot job visible in staff lists' : 'hidden from staff lists, dashboards and reports' };
  });
  return out;
}

// ---- every portal ------------------------------------------------------------
// [label, role, path, expect] expect: number (HTTP) | 'blocked' | fn(data)->[ok, detail]
const PORTAL_CHECKS = [
  // Customer portal
  ['Customer: account loads', 'customer', '/api/portal/me', (d) => [d?.linked === true, d?.linked ? 'account linked to its customer record' : 'account not linked']],
  ['Customer: balance counts only payable invoices', 'customer', '/api/portal/me', (d) => [Number(d?.stats?.balanceDue) === 125, `balance due $${d?.stats?.balanceDue}`]],
  ['Customer: invoices + payment rules', 'customer', '/api/portal/invoices', (d) => {
    const by = (n) => (d || []).find(i => i.invoice_number === n);
    const ok = by('BOT-SENT')?.payable === true && by('BOT-PAID')?.payable === false && !by('BOT-DRAFT');
    return [ok, ok ? 'sent invoice payable, paid invoice not, draft hidden' : 'payment eligibility wrong'];
  }],
  ['Customer: estimates load', 'customer', '/api/portal/quotes', (d) => [(d || []).some(q => q.quote_number === 'BOT-EST'), 'estimate visible']],
  ['Customer: appointments load', 'customer', '/api/portal/jobs', (d) => [Array.isArray(d), `${(d || []).length} visit(s)`]],
  ['Customer: blocked from staff jobs', 'customer', '/api/jobs', 'blocked'],
  ['Customer: blocked from settings', 'customer', '/api/settings', 'blocked'],
  // Technician portal
  ['Technician: jobs list', 'technician', '/api/jobs', 200],
  ['Technician: customers', 'technician', '/api/customers', 200],
  ['Technician: time clock', 'technician', '/api/time/active', 200],
  ['Technician: inspections', 'technician', '/api/inspections', 200],
  ['Technician: dashboard', 'technician', '/api/dashboard', 200],
  ['Technician: blocked from billing', 'technician', '/api/billing/quotes', 'blocked'],
  ['Technician: blocked from payroll', 'technician', '/api/payroll/summary', 'blocked'],
  // Leads agent portal
  ['Leads agent: pipeline', 'leads', '/api/leads', 200],
  ['Leads agent: points', 'leads', '/api/points/summary', 200],
  ['Leads agent: customers', 'leads', '/api/customers', 200],
  ['Leads agent: blocked from jobs', 'leads', '/api/jobs', 'blocked'],
  ['Leads agent: blocked from settings', 'leads', '/api/settings', 'blocked'],
  // Office portal
  ['Office: dashboard', 'office', '/api/dashboard', 200],
  ['Office: invoices', 'office', '/api/billing/invoices', 200],
  ['Office: estimates', 'office', '/api/billing/quotes', 200],
  ['Office: receipts', 'office', '/api/billing/receipts', 200],
  ['Office: to-do list', 'office', '/api/tasks', 200],
  ['Office: reports', 'office', '/api/reports', 200],
  ['Office: blocked from payroll', 'office', '/api/payroll/summary', 'blocked'],
  // Admin portal
  ['Admin: settings', 'admin', '/api/settings', 200],
  ['Admin: payroll', 'admin', '/api/payroll/summary', 200],
  ['Admin: team', 'admin', '/api/employees', 200],
  ['Admin: profit & loss', 'admin', '/api/reports/pnl', 200],
  ['Admin: bot history', 'admin', '/api/diagnostics/history', 200],
  // Every portal can sign in
  ...ROLES.map(r => [`${r[0].toUpperCase() + r.slice(1)}: signs in`, r, '/api/auth/me', (d) => [d?.role === r, `signed in as ${d?.role || '?'}`]]),
];

async function portals() {
  const out = [];
  for (const [label, role, path, expect] of PORTAL_CHECKS) {
    const r = await call(role, 'GET', path);
    let status, detail;
    if (r.status === 0) { status = 'fail'; detail = 'API unreachable'; }
    else if (expect === 'blocked') { status = (r.status === 401 || r.status === 403) ? 'pass' : 'fail'; detail = status === 'pass' ? `correctly blocked (${r.status})` : `should be blocked but got ${r.status}`; }
    else if (typeof expect === 'number') { status = r.status === expect ? 'pass' : 'fail'; detail = r.status === expect ? 'loads' : `HTTP ${r.status} ${r.data?.error || ''}`; }
    else if (r.status !== 200) { status = 'fail'; detail = `HTTP ${r.status} ${r.data?.error || ''}`; }
    else { const [ok, d] = expect(r.data); status = ok ? 'pass' : 'fail'; detail = d; }
    const slow = status === 'pass' && speed(r.ms);
    out.push(row('Portals', label, slow || status, slow ? `${detail} — slow (${(r.ms / 1000).toFixed(1)}s)` : detail, r.ms));
  }
  // Payment guard on an unissued invoice (never reaches Stripe).
  const g = await call('customer', 'POST', `/api/portal/invoices/${ID('inv-draft')}/payment-intent`, {});
  out.push(row('Portals', 'Customer: cannot pay a draft invoice', g.status === 400 ? 'pass' : 'fail', g.status === 400 ? 'checkout refused' : `checkout allowed (HTTP ${g.status})`, g.ms));
  // Safety: while its logins are live, the bot must not be able to change real data
  // or see a real customer's job.
  const w = await call('admin', 'POST', '/api/customers', { name: 'should be blocked' });
  out.push(row('Security', 'Bot login can\'t change real data (live test)', w.status === 403 ? 'pass' : 'fail', w.status === 403 ? 'write refused while the bot was signed in' : `write NOT refused (HTTP ${w.status})`, w.ms));
  const real = (await list('jobs')).find(j => !isBotRecord(j));
  if (real) {
    const v = await call('admin', 'GET', `/api/jobs/${encodeURIComponent(real.id)}`);
    out.push(row('Security', 'Bot login can\'t read real customer data', v.status === 404 || v.status === 403 ? 'pass' : 'fail', v.status === 404 || v.status === 403 ? 'real job hidden from the bot' : `real job visible to the bot (HTTP ${v.status})`, v.ms));
  }
  return out;
}

module.exports = { ROLES, BOT, BOT_CUSTOMER, ID, TINY_PNG, setupWorld, teardownWorld, leftoversCount, tokenFor, call, journey, portals, worldBusy, holdWorld, releaseWorld };
