// Clarke Mechanical Bot — request context + safety rules.
//
// Every request made with a bot token (user id "__diagnostic-<role>") runs inside an
// AsyncLocalStorage "diagnostic" context. That lets the rest of the app:
//   • hide the bot's test records from real people (db.list filters them out
//     unless the caller is the bot) — staff never see "Bot Test Job" in lists;
//   • never send real emails / texts / pushes / bell alerts for bot activity;
//   • skip business side-effects (auto-invoices, lead points) for bot jobs.
// Bot tokens are also locked down: they stop working the moment the bot cleans up
// (the bot user no longer exists), and they may only WRITE to the bot's own data.
const { AsyncLocalStorage } = require('async_hooks');
const jwt = require('jsonwebtoken');

const als = new AsyncLocalStorage();
const BOT_PREFIX = '__diagnostic';
const isBotId = (v) => typeof v === 'string' && v.startsWith(BOT_PREFIX);

// A record belongs to the bot if it's tagged, or its id / owner ids are bot ids.
function isBotRecord(r) {
  if (!r || typeof r !== 'object') return false;
  return r.__diagnostic === true || isBotId(r.id) || isBotId(r.customer_id)
    || isBotId(r.technician_id) || isBotId(r.user_id);
}
const isDiagnostic = () => !!als.getStore()?.diagnostic;

// Privacy wall: while the bot is running, collections that hold people, money or
// messages only show the bot's OWN records. The bot never reads a real customer,
// job, invoice, employee, text message or log — even with its admin login. Shared
// app config (price books, templates, settings) stays visible so screens render.
const PRIVATE = new Set(['customers', 'users', 'jobs', 'invoices', 'payments', 'vendor_bills', 'proposals',
  'time_entries', 'quotes', 'installations', 'support_chats', 'support_messages', 'boiler_contracts', 'job_photos',
  'purchase_orders', 'inspections', 'inspection_photos', 'leads', 'comm_messages', 'comm_calls', 'bank_connection',
  'receipts', 'portal_links', 'payment_methods', 'office_tasks', 'tasks', 'twofa_challenges', 'expenses',
  'device_tokens', 'payroll_payments', 'notifications', 'helcim_sessions', 'reviews', 'gmail_connection',
  'gmail_oauth', 'payment_requests', 'password_resets', 'pay_tokens', 'referrals', 'job_parts', 'email_log',
  'audit_log', 'point_events', 'security_events', 'diagnostic_reports', 'diagnostic_ui_reports', 'vendors',
  'subscriptions', 'diagnostics_scratch']);
const botCanSee = (collection, r) => !PRIVATE.has(collection) || isBotRecord(r);
const runAsBot = (fn) => als.run({ diagnostic: true }, fn);

// Paths a bot token may WRITE to (everything else is read-only for the bot).
const WRITE_RULES = [
  { re: /^\/api\/jobs\/?$/, check: async (req) => isBotId(req.body?.customer_id) },
  { re: /^\/api\/jobs\/([^/]+)(\/.*)?$/, check: async (req, m, getById) => isBotRecord(await getById('jobs', m[1])) },
  { re: /^\/api\/time\/(clock-in|clock-out|break\/start|break\/end)$/, check: async () => true },
  { re: /^\/api\/portal\/invoices\/([^/]+)\/[^/]+$/, check: async (req, m, getById) => isBotRecord(await getById('invoices', m[1])) },
];

function middleware(JWT_SECRET) {
  return async (req, res, next) => {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return next();
    let payload = null;
    try { payload = jwt.verify(h.slice(7), JWT_SECRET); } catch { return next(); }
    if (!isBotId(payload?.id)) return next();
    try {
      const { getById } = require('./db');
      // Bot tokens die with the bot user (removed at the end of every run).
      if (!(await getById('users', payload.id))) return res.status(401).json({ error: 'Bot session ended' });
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
        const path = req.path.replace(/\/+$/, '') || '/';
        // The app refreshes its login on every page load; bot logins just keep theirs.
        if (path === '/api/auth/refresh') return res.json({});
        let allowed = false;
        for (const r of WRITE_RULES) {
          const m = path.match(r.re);
          if (m && await r.check(req, m, getById)) { allowed = true; break; }
        }
        if (!allowed) return res.status(403).json({ error: 'The health bot is read-only outside its own test data' });
      }
    } catch (e) { return res.status(500).json({ error: 'Bot guard failed' }); }
    runAsBot(() => next());
  };
}

module.exports = { als, BOT_PREFIX, PRIVATE, isBotId, isBotRecord, isDiagnostic, botCanSee, runAsBot, middleware };
