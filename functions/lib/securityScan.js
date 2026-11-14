// Clarke Mechanical Bot — security scan (runs with every sweep).
//
// Active tests (the bot tries to break in the way an attacker would):
//   • every protected area refuses requests with no login
//   • forged / expired / tampered login tokens are rejected
//   • the bot's own login can't touch real data (write-guard works)
// Watch-list (reads the security_events log since the last sweep):
//   • failed logins & lockouts (brute force / password guessing)
//   • failed two-step codes
//   • hacker probes (/.env, /wp-admin, SQL injection …) and request bursts
//   • server crashes (any 500 error) — with the failing page/route
//   • new admin/office accounts or role changes since the last sweep
// Hygiene: secret strength, scheduler keys, and the website's security headers.
const jwt = require('jsonwebtoken');
const { list } = require('./db');
const { JWT_SECRET } = require('../middleware/auth');
const { call, tokenFor } = require('./botWorld');

const PORT = process.env.PORT || 8080;
const BASE = `http://127.0.0.1:${PORT}`;
const SITE = (process.env.APP_URL || 'https://clarkemechanicalinc.org').replace(/\/+$/, '');
const row = (name, status, detail) => ({ group: 'Security', name, status, detail: detail || '', ms: 0 });
const top = (arr, key, n = 3) => Object.entries(arr.reduce((m, e) => { const k = e[key] || '?'; m[k] = (m[k] || 0) + 1; return m; }, {}))
  .sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => `${k} ×${c}`).join(', ');

async function rawStatus(path, headers = {}) {
  try { const r = await fetch(BASE + path, { headers }); return r.status; } catch { return 0; }
}

async function scan({ since, previous } = {}) {
  const out = [];
  const sinceIso = since || new Date(Date.now() - 2 * 3600 * 1000).toISOString();

  // ---- 1. Doors locked without a login -------------------------------------
  const locked = ['/api/customers', '/api/jobs', '/api/billing/invoices', '/api/settings', '/api/employees',
    '/api/payroll/summary', '/api/portal/me', '/api/time', '/api/diagnostics/latest', '/api/comms/threads'];
  const open = [];
  for (const p of locked) { const s = await rawStatus(p); if (s !== 401 && s !== 403) open.push(`${p} → ${s}`); }
  out.push(row('Protected areas require a login', open.length ? 'fail' : 'pass',
    open.length ? `OPEN without login: ${open.join('; ')}` : `${locked.length} areas all refuse anonymous requests`));

  // ---- 2. Fake logins rejected ----------------------------------------------
  const forged = jwt.sign({ id: 'attacker', role: 'admin', name: 'x' }, 'not-the-real-secret-0123456789abcdef');
  const expired = jwt.sign({ id: 'attacker', role: 'admin', name: 'x' }, JWT_SECRET, { expiresIn: -60 });
  const [real] = tokenFor('customer').split('.');
  const tamperedPayload = Buffer.from(JSON.stringify({ id: 'attacker', role: 'admin' })).toString('base64url');
  const tampered = `${real}.${tamperedPayload}.${tokenFor('customer').split('.')[2]}`;
  const results = await Promise.all([forged, expired, tampered].map(t => rawStatus('/api/settings', { Authorization: 'Bearer ' + t })));
  const accepted = results.map((s, i) => (s === 401 ? null : ['forged', 'expired', 'tampered'][i] + ` → ${s}`)).filter(Boolean);
  out.push(row('Forged, expired & tampered logins rejected', accepted.length ? 'fail' : 'pass',
    accepted.length ? `ACCEPTED: ${accepted.join(', ')}` : 'all three fake tokens refused'));

  // ---- 3. Bot can't touch real data ------------------------------------------
  const g = await call('office', 'POST', '/api/customers', { name: 'should be blocked' });
  const blocked = g.status === 403 || g.status === 401; // 401 = bot logins already retired after cleanup
  out.push(row('Health bot is locked to its own test data', blocked ? 'pass' : 'fail',
    blocked ? (g.status === 403 ? 'bot write to real data refused' : 'bot logins are retired after cleanup — nothing can use them') : `bot write allowed (HTTP ${g.status})`));

  // ---- 4. Watch-list since the last sweep ------------------------------------
  let events = [];
  try { events = (await list('security_events')).filter(e => (e.at || '') >= sinceIso); } catch { /* none yet */ }
  const of = (t) => events.filter(e => e.type === t);

  const fails = of('login_failed');
  const maxPerIp = Math.max(0, ...Object.values(fails.reduce((m, e) => { m[e.ip] = (m[e.ip] || 0) + 1; return m; }, {})));
  out.push(row('Failed sign-ins (password guessing)',
    fails.length >= 25 || maxPerIp >= 15 ? 'fail' : fails.length >= 8 ? 'warn' : 'pass',
    fails.length ? `${fails.length} failed sign-in(s) — IPs: ${top(fails, 'ip')} · accounts: ${top(fails, 'email')}` : 'no failed sign-ins'));

  const locks = of('login_locked');
  out.push(row('Accounts locked out', locks.length >= 5 ? 'fail' : locks.length ? 'warn' : 'pass',
    locks.length ? `${locks.length} lockout(s) — ${top(locks, 'email')}` : 'no lockouts'));

  const tf = of('twofa_failed');
  out.push(row('Failed two-step codes', tf.length >= 10 ? 'fail' : tf.length >= 4 ? 'warn' : 'pass',
    tf.length ? `${tf.length} wrong code(s) — IPs: ${top(tf, 'ip')}` : 'none'));

  const probes = of('probe');
  out.push(row('Hacker probes (/.env, wp-admin, SQL injection…)', probes.length >= 100 ? 'fail' : probes.length ? 'warn' : 'pass',
    probes.length ? `${probes.length} probe(s) blocked — IPs: ${top(probes, 'ip')} · e.g. ${top(probes, 'path', 2)}` : 'no probes'));

  const bursts = of('auth_burst');
  out.push(row('Request bursts against protected areas', bursts.length ? 'warn' : 'pass',
    bursts.length ? `${bursts.length} burst(s) from ${top(bursts, 'ip')}` : 'none'));

  const crashes = of('server_error');
  const details = of('crash_detail');
  out.push(row('Server crashes (500 errors)', crashes.length ? 'fail' : 'pass',
    crashes.length ? `${crashes.length} crash(es) — ${top(crashes, 'path')}${details[0] ? ` · last error: "${details[details.length - 1].message}"` : ''}` : 'no crashes since the last check'));

  // ---- 5. Privileged accounts ------------------------------------------------
  const users = await list('users');
  const staff = users.filter(u => ['admin', 'office'].includes(u.role)).map(u => ({ id: u.id, role: u.role, name: u.name || u.email || u.id }));
  const prev = previous?.security_snapshot?.staff;
  if (Array.isArray(prev)) {
    const prevMap = Object.fromEntries(prev.map(s => [s.id, s.role]));
    const added = staff.filter(s => !prevMap[s.id]);
    const changed = staff.filter(s => prevMap[s.id] && prevMap[s.id] !== s.role);
    const msg = [added.length && `new: ${added.map(s => `${s.name} (${s.role})`).join(', ')}`, changed.length && `role changed: ${changed.map(s => `${s.name} → ${s.role}`).join(', ')}`].filter(Boolean).join(' · ');
    out.push(row('New admin / office accounts', msg ? 'warn' : 'pass', msg ? `${msg} — confirm these were you` : `${staff.length} admin/office accounts, unchanged`));
  } else {
    out.push(row('New admin / office accounts', 'pass', `baseline recorded: ${staff.length} admin/office accounts`));
  }

  // ---- 6. Hygiene ------------------------------------------------------------
  const sec = process.env.JWT_SECRET || '';
  out.push(row('Login signing secret strength', sec.length >= 32 ? 'pass' : 'warn', sec.length >= 32 ? 'strong' : `only ${sec.length} characters — use 32+ random characters`));
  out.push(row('Bot / scheduler keys set', process.env.CRON_KEY ? 'pass' : 'warn', process.env.CRON_KEY ? `CRON_KEY set${process.env.BOT_KEY ? ', BOT_KEY set' : ''}` : 'CRON_KEY missing — 2-hour checks cannot be triggered'));
  try {
    const r = await fetch(SITE, { method: 'GET', redirect: 'manual' });
    const h = (k) => r.headers.get(k);
    const missing = [!h('strict-transport-security') && 'HSTS', !h('x-content-type-options') && 'nosniff'].filter(Boolean);
    out.push(row('Website security headers', missing.length ? 'warn' : 'pass', missing.length ? `missing: ${missing.join(', ')}` : 'HTTPS enforced, content sniffing blocked'));
  } catch { out.push(row('Website security headers', 'warn', `could not reach ${SITE}`)); }

  return { checks: out, snapshot: { staff } };
}

module.exports = { scan };
