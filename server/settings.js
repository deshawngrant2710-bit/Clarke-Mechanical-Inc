const db = require('./db');

// Defaults come from .env; in-app Settings override them by writing to the `settings` table.
const DEFAULTS = {
  business_name: 'Clarke Mechanical Inc.',
  business_email: process.env.BUSINESS_EMAIL || 'service@clarkemechanical.com',
  business_phone: process.env.BUSINESS_PHONE || '(555) 555-0100',
  email_from: process.env.EMAIL_FROM || 'Clarke Mechanical Inc. <no-reply@clarkemechanical.com>',
  smtp_host: process.env.SMTP_HOST || '',
  smtp_port: process.env.SMTP_PORT || '587',
  smtp_user: process.env.SMTP_USER || '',
  smtp_pass: process.env.SMTP_PASS || '',
  reminders_job_enabled: '1',
  reminders_overdue_enabled: '1',
};

function getAll() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const stored = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return { ...DEFAULTS, ...stored };
}

function get(key) {
  return getAll()[key];
}

function set(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value == null ? '' : String(value));
}

function setMany(obj) {
  const tx = db.transaction((entries) => { for (const [k, v] of entries) set(k, v); });
  tx(Object.entries(obj));
}

// Resolved email configuration used by the mailer, scheduler, and Settings API.
function emailConfig() {
  const s = getAll();
  return {
    from: s.email_from,
    business: { name: s.business_name, email: s.business_email, phone: s.business_phone },
    smtp: { host: s.smtp_host, port: Number(s.smtp_port) || 587, user: s.smtp_user, pass: s.smtp_pass },
    configured: !!(s.smtp_host && s.smtp_user),
    reminders: {
      job: s.reminders_job_enabled === '1',
      overdue: s.reminders_overdue_enabled === '1',
    },
  };
}

module.exports = { getAll, get, set, setMany, emailConfig, DEFAULTS };
