// Clarke Mechanical Bot — security watch.
//
// Records what attackers leave behind, in a persistent `security_events` log
// (Render's free tier restarts the server, so nothing important lives in memory):
//   • login_failed / login_locked / twofa_failed — brute-force & credential stuffing
//   • probe       — requests for things like /.env, /wp-admin, ../, SQL injection
//   • server_error— any 500 the API returns (a crash or unhandled bug)
//   • auth_burst  — one IP racking up many 401/403s (scanning protected routes)
// Writes are rate-capped so an attack can't flood the database.
const { v4: uuid } = require('uuid');

const PROBE_RE = /(\.env|\.git\/|wp-admin|wp-login|xmlrpc|phpmyadmin|\.php(\?|$)|cgi-bin|\/etc\/passwd|\.\.\/|%2e%2e|<script|union(\s|%20|\+)+select|select(\s|%20|\+).+from|sleep\(\d|\/actuator|\/\.aws|\/server-status|\/vendor\/phpunit)/i;
const MAX_WRITES_PER_MIN = 60;
let windowStart = Date.now(), writes = 0;
const authFails = new Map(); // ip -> { n, since, flagged }

function clientIp(req) {
  return (req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim();
}

async function record(type, data = {}) {
  const now = Date.now();
  if (now - windowStart > 60000) { windowStart = now; writes = 0; }
  if (++writes > MAX_WRITES_PER_MIN) return; // flood protection
  try {
    const { create } = require('./db');
    await create('security_events', uuid(), { type, ...data, at: new Date().toISOString() });
  } catch (e) { console.error('[security] record failed:', e.message); }
}

// Express middleware: watches every request/response.
function monitor() {
  return (req, res, next) => {
    const url = req.originalUrl || req.url || '';
    if (PROBE_RE.test(decodeURIComponent(url).slice(0, 500))) {
      record('probe', { ip: clientIp(req), method: req.method, path: url.slice(0, 200), ua: String(req.headers['user-agent'] || '').slice(0, 120) });
    }
    res.on('finish', () => {
      const s = res.statusCode;
      if (s >= 500) record('server_error', { status: s, method: req.method, path: (req.baseUrl || '') + (req.path || url).slice(0, 160) });
      if (s === 401 || s === 403) {
        const ip = clientIp(req), now = Date.now();
        const e = authFails.get(ip) || { n: 0, since: now, flagged: false };
        if (now - e.since > 10 * 60000) { e.n = 0; e.since = now; e.flagged = false; }
        e.n++;
        if (e.n >= 40 && !e.flagged) { e.flagged = true; record('auth_burst', { ip, count: e.n, last_path: url.slice(0, 160) }); }
        authFails.set(ip, e);
        if (authFails.size > 5000) authFails.clear();
      }
    });
    next();
  };
}

// Crash details from the Express error handler.
function recordCrash(err, req) {
  record('crash_detail', { method: req?.method, path: (req?.originalUrl || '').slice(0, 160), message: String(err?.message || err).slice(0, 200) });
}

module.exports = { record, monitor, recordCrash, clientIp, PROBE_RE };
