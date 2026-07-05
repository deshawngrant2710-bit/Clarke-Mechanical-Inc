const express = require('express');
const { db, getById, findWhere } = require('../lib/db');
const { authMiddleware } = require('../middleware/auth');
const { sendMail, render, isTemplate } = require('../lib/email');
const settings = require('../lib/settings');

const router = express.Router();
router.use(authMiddleware);

router.get('/status', async (req, res) => {
  const cfg = await settings.emailConfig();
  res.json({ configured: cfg.configured, from: cfg.from, business: cfg.business });
});

router.get('/log', async (req, res) => {
  const { customer_id } = req.query;
  let rows;
  if (customer_id) rows = await findWhere('email_log', 'customer_id', customer_id);
  else rows = (await db.collection('email_log').get()).docs.map(d => ({ id: d.id, ...d.data() }));
  rows.sort((a, b) => (b.sent_at || '').localeCompare(a.sent_at || ''));
  res.json(rows.slice(0, 100));
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
    return { entity: inv, email: customer?.email, name: customer?.name, customerId: inv.customer_id };
  }
  if (type === 'quote') {
    const q = await getById('quotes', id);
    if (!q) return null;
    const customer = q.customer_id ? await getById('customers', q.customer_id) : null;
    q.customer_name = customer?.name;
    return { entity: q, email: customer?.email, name: customer?.name, customerId: q.customer_id };
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

router.post('/send', async (req, res) => {
  const { type, id } = req.body;
  if (!isTemplate(type)) return res.status(400).json({ error: 'Unknown email type' });
  const ctx = await loadContext(type, id);
  if (!ctx) return res.status(404).json({ error: 'Record not found' });
  if (!ctx.email) return res.status(422).json({ error: 'This customer has no email address on file' });

  const { subject, html } = await render(type, ctx.entity);
  const result = await sendMail({ type, to: ctx.email, toName: ctx.name, subject, html, relatedId: id, customerId: ctx.customerId, sentBy: req.user?.name });
  if (result.status === 'failed') return res.status(502).json({ error: result.error || 'Email failed to send' });

  if (type === 'invoice') {
    const inv = await getById('invoices', id);
    if (inv?.status === 'draft') await db.collection('invoices').doc(id).set({ status: 'sent' }, { merge: true });
  }
  if (type === 'quote') {
    const q = await getById('quotes', id);
    if (q?.status === 'draft') await db.collection('quotes').doc(id).set({ status: 'sent' }, { merge: true });
  }
  res.json({ ...result, to: ctx.email, subject });
});

module.exports = router;
