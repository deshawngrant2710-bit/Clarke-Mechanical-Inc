const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const settings = require('../lib/settings');
const { sendMail, render, resetTransport } = require('../lib/email');
const { buildAttachment } = require('../lib/attachDoc');
const { runReminders } = require('../lib/scheduler');

const router = express.Router();
router.use(authMiddleware, adminOnly);

router.get('/', async (req, res) => {
  const s = await settings.getAll();
  res.json({
    business_name: s.business_name, business_email: s.business_email, business_phone: s.business_phone,
    business_address: s.business_address, business_website: s.business_website,
    business_hours: s.business_hours, business_tagline: s.business_tagline, default_tax_rate: s.default_tax_rate,
    booking_slot_capacity: s.booking_slot_capacity,
    email_from: s.email_from, email_reply_to: s.email_reply_to, smtp_host: s.smtp_host, smtp_port: s.smtp_port, smtp_user: s.smtp_user,
    smtp_pass_set: !!s.smtp_pass,
    reminders_job_enabled: s.reminders_job_enabled === '1',
    reminders_overdue_enabled: s.reminders_overdue_enabled === '1',
    receipts_autosend_enabled: s.receipts_autosend_enabled !== '0',
    configured: !!(s.smtp_host && s.smtp_user),
  });
});

router.put('/', async (req, res) => {
  const textKeys = ['business_name', 'business_email', 'business_phone', 'business_address', 'business_hours', 'business_website', 'business_tagline', 'default_tax_rate', 'email_from', 'email_reply_to', 'smtp_host', 'smtp_port', 'smtp_user', 'booking_slot_capacity'];
  const patch = {};
  for (const k of textKeys) if (k in req.body) patch[k] = req.body[k];
  if ('reminders_job_enabled' in req.body) patch.reminders_job_enabled = req.body.reminders_job_enabled ? '1' : '0';
  if ('reminders_overdue_enabled' in req.body) patch.reminders_overdue_enabled = req.body.reminders_overdue_enabled ? '1' : '0';
  if ('receipts_autosend_enabled' in req.body) patch.receipts_autosend_enabled = req.body.receipts_autosend_enabled ? '1' : '0';
  if (req.body.smtp_pass) patch.smtp_pass = req.body.smtp_pass;
  await settings.setMany(patch);
  resetTransport();
  res.json({ success: true });
});

router.post('/test-email', async (req, res) => {
  const to = (req.body.to || (await settings.get('business_email')) || '').trim();
  if (!to) return res.status(400).json({ error: 'No recipient address' });
  const { subject, html } = await render('test', {});
  const result = await sendMail({ type: 'test', to, toName: 'Test', subject, html, sentBy: req.user.name });
  if (result.status === 'failed') return res.status(502).json({ error: result.error || 'Send failed' });
  res.json({ ...result, to });
});

// POST /settings/test-document — sends a realistic sample invoice / estimate /
// receipt to yourself, including the PDF attachment, so you can check exactly
// what a customer receives before sending them anything.
const SAMPLE_ITEMS = [
  { description: 'Central A/C diagnostic & inspection', note: 'Includes refrigerant pressure test', quantity: 1, unit_price: 150, total: 150 },
  { description: 'Compressor capacitor (45/5 MFD)', quantity: 2, unit_price: 65, total: 130 },
  { description: 'Labor - condenser fan motor replacement', quantity: 3, unit_price: 110, total: 330 },
];
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

router.post('/test-document', async (req, res) => {
  const type = String(req.body.type || 'invoice');
  if (!['invoice', 'quote', 'receipt'].includes(type)) return res.status(400).json({ error: 'Unknown document type' });
  const to = (req.body.to || (await settings.get('business_email')) || '').trim();
  if (!to) return res.status(400).json({ error: 'No recipient address' });

  const base = {
    customer_id: null,
    customer_name: 'Sample Customer (TEST)',
    issue_date: today(),
    items: SAMPLE_ITEMS,
    subtotal: 610,
    tax_rate: Number(await settings.get('default_tax_rate')) || 0.08875,
    notes: 'This is a TEST document generated from Settings. No customer has been contacted.',
  };
  base.tax_amount = Math.round(base.subtotal * base.tax_rate * 100) / 100;
  base.total = Math.round((base.subtotal + base.tax_amount) * 100) / 100;

  let entity, extra = {}, templateType = type;
  if (type === 'invoice') {
    entity = { ...base, invoice_number: 'CL-TEST', due_date: addDays(15), amountPaid: 0, payments: [] };
  } else if (type === 'quote') {
    entity = { ...base, quote_number: 'EST-TEST', expiry_date: addDays(30) };
  } else {
    const amount = Math.round(base.total / 2 * 100) / 100;
    entity = { ...base, invoice_number: 'CL-TEST', amountPaid: amount, lastPayment: amount, payments: [{ amount }] };
    extra.receipt = {
      receipt_number: 'REC-TEST', invoice_number: 'CL-TEST', amount,
      method: 'check', reference: '1042', paid_at: new Date().toISOString(),
      balance_after: Math.round((base.total - amount) * 100) / 100,
    };
    // fields the receipt email template reads
    entity.receipt_number = extra.receipt.receipt_number;
    entity.balance_after = extra.receipt.balance_after;
    entity.payment_method = extra.receipt.method;
    entity.paid_at = extra.receipt.paid_at;
  }

  const { subject, html } = await render(templateType, entity);
  const attachments = await buildAttachment(type, entity, extra);
  const result = await sendMail({
    type: templateType, to, toName: 'Test', subject: `[TEST] ${subject}`, html,
    sentBy: req.user.name, attachments,
  });
  if (result.status === 'failed') return res.status(502).json({ error: result.error || 'Send failed' });
  res.json({ ...result, to, attached: attachments.length > 0, filename: attachments[0]?.filename || null });
});

router.post('/run-reminders', async (req, res) => {
  try {
    res.json(await runReminders());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
