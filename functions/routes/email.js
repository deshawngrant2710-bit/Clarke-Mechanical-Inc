const express = require('express');
const { db, getById, findWhere } = require('../lib/db');
const { authMiddleware, requireStaff } = require('../middleware/auth');
const { sendMail, render, isTemplate } = require('../lib/email');
const { notifyCustomerBySms } = require('../lib/sms');
const settings = require('../lib/settings');

const router = express.Router();
router.use(authMiddleware, requireStaff);

router.get('/status', async (req, res) => {
  const cfg = await settings.emailConfig();
  res.json({ configured: cfg.configured, from: cfg.from, business: cfg.business });
});

router.get('/log', async (req, res) => {
  const { customer_id, limit } = req.query;
  let rows;
  if (customer_id) rows = await findWhere('email_log', 'customer_id', customer_id);
  else rows = (await db.collection('email_log').get()).docs.map(d => ({ id: d.id, ...d.data() }));
  rows.sort((a, b) => (b.sent_at || '').localeCompare(a.sent_at || ''));
  res.json(rows.slice(0, Math.min(Number(limit) || 100, 500)));
});

// POST /email/log/:id/resend — send the same document again to the same recipient.
router.post('/log/:id/resend', async (req, res) => {
  const entry = await getById('email_log', req.params.id);
  if (!entry) return res.status(404).json({ error: 'Log entry not found' });
  if (!isTemplate(entry.type)) return res.status(400).json({ error: 'That message type cannot be resent' });
  const ctx = await loadContext(entry.type, entry.related_id);
  if (!ctx) return res.status(404).json({ error: 'The original record no longer exists' });
  const to = req.body?.to || entry.to_email || ctx.email;
  if (!to) return res.status(422).json({ error: 'No email address to send to' });
  const { subject, html } = await render(entry.type, ctx.entity);
  const result = await sendMail({
    type: entry.type, to, toName: ctx.name, subject, html,
    relatedId: entry.related_id, customerId: entry.customer_id, sentBy: req.user?.name,
  });
  if (result.status === 'failed') return res.status(502).json({ error: result.error || 'Email failed to send' });
  res.json({ ...result, to });
});

// Build the template context for a given type + record id.
async function loadContext(type, id) {
  if (type === 'invoice' || type === 'receipt') {
    const inv = await getById('invoices', id);
    if (!inv) return null;
    const customer = inv.customer_id ? await getById('customers', inv.customer_id) : null;
    const payments = await findWhere('payments', 'invoice_id', id);
    inv.customer_name = customer?.name;
    inv.amountPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
    inv.lastPayment = payments.sort((a, b) => (b.paid_at || '').localeCompare(a.paid_at || ''))[0]?.amount;
    return { entity: inv, email: customer?.email, name: customer?.name, customerId: inv.customer_id, customer };
  }
  if (type === 'quote') {
    const q = await getById('quotes', id);
    if (!q) return null;
    const customer = q.customer_id ? await getById('customers', q.customer_id) : null;
    q.customer_name = customer?.name;
    return { entity: q, email: customer?.email, name: customer?.name, customerId: q.customer_id, customer };
  }
  if (type === 'job_confirmation' || type === 'job_reminder') {
    const job = await getById('jobs', id);
    if (!job) return null;
    const customer = job.customer_id ? await getById('customers', job.customer_id) : null;
    const tech = job.technician_id ? await getById('users', job.technician_id) : null;
    job.customer_name = customer?.name;
    job.technician_name = tech?.name;
    return { entity: job, email: customer?.email, name: customer?.name, customerId: job.customer_id };
  }
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
router.post('/send', async (req, res) => {
  const { type, id } = req.body;
  if (!isTemplate(type)) return res.status(400).json({ error: 'Unknown email type' });
  const ctx = await loadContext(type, id);
  if (!ctx) return res.status(404).json({ error: 'Record not found' });
  if (!ctx.email) return res.status(422).json({ error: 'This customer has no email address on file' });

  // Extra recipients (CC) — validate, dedupe, exclude the primary, cap at 10.
  const rawCc = Array.isArray(req.body.cc) ? req.body.cc : [];
  const primary = String(ctx.email).toLowerCase();
  const cc = [...new Set(rawCc.map(e => String(e).trim().toLowerCase()).filter(e => EMAIL_RE.test(e) && e !== primary))].slice(0, 10);

  const { subject, html } = await render(type, ctx.entity);
  const result = await sendMail({ type, to: ctx.email, toName: ctx.name, subject, html, relatedId: id, customerId: ctx.customerId, sentBy: req.user?.name, cc });
  if (result.status === 'failed') return res.status(502).json({ error: result.error || 'Email failed to send' });

  // Also text the customer. Email can be silently filtered (iCloud/Outlook are the
  // worst offenders); a text has no spam folder, so this is the safety net that
  // makes sure they actually know the document is waiting for them.
  let sms = null;
  try {
    const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const biz = (await settings.get('business_name')) || 'Clarke Mechanical';
    if (type === 'invoice') {
      const due = (Number(ctx.entity.total) || 0) - (Number(ctx.entity.amountPaid) || 0);
      sms = await notifyCustomerBySms(ctx.customer,
        `${biz}: invoice ${ctx.entity.invoice_number || ''} for ${money(due)} has been emailed to you. You can also view and pay it in your account. Reply STOP to opt out.`);
    } else if (type === 'quote') {
      sms = await notifyCustomerBySms(ctx.customer,
        `${biz}: your estimate ${ctx.entity.quote_number || ''} for ${money(ctx.entity.total)} has been emailed to you. View and approve it in your account. Reply STOP to opt out.`);
    }
  } catch (e) { console.error('[email] SMS notice failed:', e.message); }

  if (type === 'invoice') {
    const inv = await getById('invoices', id);
    if (inv?.status === 'draft') await db.collection('invoices').doc(id).set({ status: 'sent' }, { merge: true });
  }
  if (type === 'quote') {
    const q = await getById('quotes', id);
    if (q?.status === 'draft') await db.collection('quotes').doc(id).set({ status: 'sent' }, { merge: true });
  }
  res.json({ ...result, to: ctx.email, cc, subject, sms });
});

module.exports = router;
