const { db } = require('./db');

// Settings live in a single Firestore doc: settings/app. Defaults come from env.
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

const REF = () => db.collection('settings').doc('app');

async function getAll() {
  const doc = await REF().get();
  return { ...DEFAULTS, ...(doc.exists ? doc.data() : {}) };
}

async function get(key) {
  return (await getAll())[key];
}

async function setMany(obj) {
  await REF().set(obj, { merge: true });
}

async function emailConfig() {
  const s = await getAll();
  return {
    from: s.email_from,
    business: { name: s.business_name, email: s.business_email, phone: s.business_phone },
    smtp: { host: s.smtp_host, port: Number(s.smtp_port) || 587, user: s.smtp_user, pass: s.smtp_pass },
    configured: !!(s.smtp_host && s.smtp_user),
    reminders: { job: s.reminders_job_enabled === '1', overdue: s.reminders_overdue_enabled === '1' },
  };
}

module.exports = { getAll, get, setMany, emailConfig, DEFAULTS };
