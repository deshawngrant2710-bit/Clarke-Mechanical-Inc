const { db } = require('./db');

// Settings live in a single Firestore doc: settings/app. Defaults come from env.
const DEFAULTS = {
  business_name: 'Clarke Mechanical Inc.',
  business_email: process.env.BUSINESS_EMAIL || 'service@clarkemechanical.com',
  business_phone: process.env.BUSINESS_PHONE || '(555) 555-0100',
  email_from: process.env.EMAIL_FROM || 'Clarke Mechanical Inc. <no-reply@clarkemechanical.com>',
  business_hours: 'Mon–Fri · 8:00 AM – 6:00 PM',
  default_tax_rate: '0.0875',
  smtp_host: process.env.SMTP_HOST || '',
  smtp_port: process.env.SMTP_PORT || '587',
  smtp_user: process.env.SMTP_USER || '',
  smtp_pass: process.env.SMTP_PASS || '',
  reminders_job_enabled: '1',
  reminders_overdue_enabled: '1',
  booking_slot_capacity: '2', // max jobs bookable per online arrival window
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
  // Provider priority: Brevo HTTP API (works on Render) → SMTP → simulated.
  const brevo = !!process.env.BREVO_API_KEY;
  const smtp = !!(s.smtp_host && s.smtp_user);
  const provider = brevo ? 'brevo' : smtp ? 'smtp' : 'none';
  return {
    from: s.email_from,
    business: { name: s.business_name, email: s.business_email, phone: s.business_phone, hours: s.business_hours },
    smtp: { host: s.smtp_host, port: Number(s.smtp_port) || 587, user: s.smtp_user, pass: s.smtp_pass },
    provider,
    configured: provider !== 'none',
    reminders: { job: s.reminders_job_enabled === '1', overdue: s.reminders_overdue_enabled === '1' },
  };
}

module.exports = { getAll, get, setMany, emailConfig, DEFAULTS };
