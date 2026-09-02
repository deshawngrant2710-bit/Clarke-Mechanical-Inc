const express = require('express');
const { v4: uuid } = require('uuid');
const { db, list, getById, create, update, remove, findWhere, nameMap } = require('../lib/db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { render, sendMail } = require('../lib/email');
const { notifyCustomerBySms } = require('../lib/sms');
const settings = require('../lib/settings');

const router = express.Router();
router.use(authMiddleware, requireRole('admin', 'office'));

const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function calcTotals(items, taxRate, discount = 0) {
  const subtotal = items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0), 0);
  const discount_amount = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const taxable = subtotal - discount_amount;
  const tax_amount = taxable * taxRate;
  return { subtotal, discount_amount, tax_amount, total: taxable + tax_amount };
}
const withItemTotals = (items = []) => items.map(i => ({
  id: i.id || uuid(), description: i.description, note: i.note ? String(i.note).trim() || null : null,
  quantity: Number(i.quantity) || 0,
  unit_price: Number(i.unit_price) || 0, total: (Number(i.quantity) || 0) * (Number(i.unit_price) || 0),
}));

// Document numbers start at START_NUMBER and only ever count up (the next number
// is one more than the highest existing one, but never below START_NUMBER).
//  - useYear=false → running sequence like CL-4200, CL-4201 …
//  - useYear=true  → year-scoped like QUO-2026-4200
const START_NUMBER = 4200;
async function nextNumber(collection, prefix, useYear = false) {
  const all = await list(collection);
  const field = collection === 'invoices' ? 'invoice_number' : 'quote_number';
  const year = new Date().getFullYear();
  const re = useYear ? new RegExp(`^${prefix}-${year}-(\\d+)$`) : new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;
  for (const x of all) {
    const m = (x[field] || '').match(re);
    if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
  }
  const next = Math.max(max, START_NUMBER - 1) + 1;
  const num = String(next).padStart(4, '0');
  return useYear ? `${prefix}-${year}-${num}` : `${prefix}-${num}`;
}

/* ---------------- INVOICES ---------------- */
router.get('/invoices', async (req, res) => {
  const [invoices, customers] = await Promise.all([list('invoices'), nameMap('customers')]);
  const rows = invoices
    .map(i => ({ ...i, customer_name: customers[i.customer_id] || null }))
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  res.json(rows);
});

router.get('/invoices/:id', async (req, res) => {
  const invoice = await getById('invoices', req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  const customer = invoice.customer_id ? await getById('customers', invoice.customer_id) : null;
  const payments = (await findWhere('payments', 'invoice_id', req.params.id))
    .sort((a, b) => (b.paid_at || '').localeCompare(a.paid_at || ''));
  res.json({
    ...invoice,
    items: invoice.items || [],
    payments,
    customer_name: customer?.name || null,
    customer_email: customer?.email || null,
    customer_phone: customer?.phone || null,
    customer_address: customer?.address || null,
  });
});

router.post('/invoices', async (req, res) => {
  const { customer_id, job_id, status, issue_date, due_date, items = [], tax_rate, notes, discount, deposit } = req.body;
  const rate = tax_rate != null ? Number(tax_rate) : (Number(await settings.get('default_tax_rate')) || 0.0875);
  const lineItems = withItemTotals(items);
  const { subtotal, discount_amount, tax_amount, total } = calcTotals(lineItems, rate, discount);
  const invoice_number = await nextNumber('invoices', 'CL');
  const saved = await create('invoices', uuid(), {
    invoice_number, customer_id: customer_id || null, job_id: job_id || null, status: status || 'draft',
    issue_date: issue_date || null, due_date: due_date || null, subtotal, discount: discount_amount, tax_rate: rate, tax_amount, total,
    deposit: Number(deposit) || 0, notes: notes || null, items: lineItems,
  });
  res.status(201).json(saved);
});

router.put('/invoices/:id', async (req, res) => {
  const existing = await getById('invoices', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Invoice not found' });
  const { customer_id, job_id, status, issue_date, due_date, items = [], tax_rate = 0.0875, notes, discount, deposit } = req.body;
  const lineItems = withItemTotals(items);
  const { subtotal, discount_amount, tax_amount, total } = calcTotals(lineItems, tax_rate, discount);
  const saved = await update('invoices', req.params.id, {
    customer_id: customer_id || null, job_id: job_id || null, status, issue_date: issue_date || null,
    due_date: due_date || null, subtotal, discount: discount_amount, tax_rate, tax_amount, total,
    deposit: Number(deposit) || 0, notes: notes || null, items: lineItems,
  });
  res.json(saved);
});

router.delete('/invoices/:id', async (req, res) => {
  await remove('invoices', req.params.id);
  res.json({ success: true });
});

/* ---------------- QUOTES ---------------- */
router.get('/quotes', async (req, res) => {
  const [quotes, customers] = await Promise.all([list('quotes'), nameMap('customers')]);
  const rows = quotes
    .map(q => ({ ...q, customer_name: customers[q.customer_id] || null }))
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  res.json(rows);
});

router.get('/quotes/:id', async (req, res) => {
  const quote = await getById('quotes', req.params.id);
  if (!quote) return res.status(404).json({ error: 'Quote not found' });
  const customer = quote.customer_id ? await getById('customers', quote.customer_id) : null;
  res.json({
    ...quote, items: quote.items || [],
    customer_name: customer?.name || null, customer_email: customer?.email || null, customer_phone: customer?.phone || null,
  });
});

// Email the customer their estimate when it's marked "sent".
async function emailEstimateSent(quote, prevStatus) {
  if (quote.status !== 'sent' || quote.status === prevStatus || !quote.customer_id) return;
  try {
    const customer = await getById('customers', quote.customer_id);
    if (customer?.email) {
      const { subject, html } = await render('quote', { ...quote, customer_name: customer.name });
      await sendMail({ type: 'quote', to: customer.email, toName: customer.name, subject, html, relatedId: quote.id, customerId: quote.customer_id, sentBy: 'Automated' });
    }
    const biz = (await settings.get('business_name')) || 'Clarke Mechanical';
    await notifyCustomerBySms(customer, `${biz}: your estimate ${quote.quote_number || ''} for ${money(quote.total)} is ready. View and approve it in your account. Reply STOP to opt out.`);
  } catch (e) { console.error('[billing] estimate email failed:', e.message); }
}

// POST /billing/quotes/preview — render the estimate exactly as the customer will
// receive it (the branded email), without saving or sending. Used for "preview".
router.post('/quotes/preview', async (req, res) => {
  const { customer_id, items = [], tax_rate, expiry_date, notes, quote_number, discount, deposit } = req.body;
  const rate = tax_rate != null ? Number(tax_rate) : (Number(await settings.get('default_tax_rate')) || 0.0875);
  const lineItems = withItemTotals(items);
  const { subtotal, discount_amount, tax_amount, total } = calcTotals(lineItems, rate, discount);
  const customer = customer_id ? await getById('customers', customer_id) : null;
  const entity = {
    quote_number: quote_number || 'DRAFT', customer_name: customer?.name || 'Customer',
    items: lineItems, subtotal, discount: discount_amount, tax_amount, total, deposit: Number(deposit) || 0, expiry_date: expiry_date || null, notes: notes || null,
  };
  const { subject, html } = await render('quote', entity);
  res.json({ subject, html });
});

router.post('/quotes', async (req, res) => {
  const { customer_id, status, issue_date, expiry_date, items = [], tax_rate, notes, discount, deposit } = req.body;
  const rate = tax_rate != null ? Number(tax_rate) : (Number(await settings.get('default_tax_rate')) || 0.0875);
  const lineItems = withItemTotals(items);
  const { subtotal, discount_amount, tax_amount, total } = calcTotals(lineItems, rate, discount);
  const quote_number = await nextNumber('quotes', 'QUO', true);
  const saved = await create('quotes', uuid(), {
    quote_number, customer_id: customer_id || null, status: status || 'draft', issue_date: issue_date || null,
    expiry_date: expiry_date || null, subtotal, discount: discount_amount, tax_rate: rate, tax_amount, total,
    deposit: Number(deposit) || 0, notes: notes || null, items: lineItems,
  });
  res.status(201).json(saved);
  emailEstimateSent(saved, null);
});

router.put('/quotes/:id', async (req, res) => {
  const existing = await getById('quotes', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Quote not found' });
  const { customer_id, status, issue_date, expiry_date, items = [], tax_rate = 0.0875, notes, discount, deposit } = req.body;
  const lineItems = withItemTotals(items);
  const { subtotal, discount_amount, tax_amount, total } = calcTotals(lineItems, tax_rate, discount);
  const saved = await update('quotes', req.params.id, {
    customer_id: customer_id || null, status, issue_date: issue_date || null, expiry_date: expiry_date || null,
    subtotal, discount: discount_amount, tax_rate, tax_amount, total, deposit: Number(deposit) || 0, notes: notes || null, items: lineItems,
  });
  res.json(saved);
  // Editing never auto-emails the customer — the office sends/re-sends explicitly
  // with the "Email estimate" button. (New estimates created as "sent" still notify.)
});

router.delete('/quotes/:id', async (req, res) => {
  await remove('quotes', req.params.id);
  res.json({ success: true });
});

// POST /billing/quotes/:id/convert-to-job — turn an (approved) estimate into a job
// without re-entering anything. Links the job back to the quote so the workflow
// stays connected: Quote → approval → Job → dispatch → … → invoice.
router.post('/quotes/:id/convert-to-job', async (req, res) => {
  const quote = await getById('quotes', req.params.id);
  if (!quote) return res.status(404).json({ error: 'Quote not found' });
  if (quote.converted_job_id) {
    return res.json({ job_id: quote.converted_job_id, already: true });
  }
  const customer = quote.customer_id ? await getById('customers', quote.customer_id) : null;
  const address = customer ? [customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(', ') : '';
  const title = (quote.title && quote.title.trim())
    || quote.items?.[0]?.description
    || `Job from estimate ${quote.quote_number}`;
  const job = await create('jobs', uuid(), {
    title,
    description: quote.notes || null,
    customer_id: quote.customer_id || null,
    technician_id: null,
    additional_technician_ids: [],
    status: 'pending',
    priority: 'normal',
    job_type: quote.job_type || null,
    scheduled_date: null,
    scheduled_time: null,
    completed_date: null,
    address: address || null,
    notes: null,
    // links back to the estimate
    quote_id: quote.id,
    quote_number: quote.quote_number,
    quote_total: quote.total || 0,
  });
  await update('quotes', req.params.id, { converted_job_id: job.id });
  res.status(201).json(job);
});

/* ---------------- PAYMENTS ---------------- */
router.post('/invoices/:id/payments', async (req, res) => {
  const invoice = await getById('invoices', req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  const { amount, method, reference, notes } = req.body;
  const id = uuid();
  await create('payments', id, {
    invoice_id: req.params.id, amount: Number(amount) || 0, method: method || 'cash',
    reference: reference || null, notes: notes || null, paid_at: new Date().toISOString(),
  });
  const payments = await findWhere('payments', 'invoice_id', req.params.id);
  const paid = payments.reduce((s, p) => s + (p.amount || 0), 0);
  if (paid >= invoice.total) await update('invoices', req.params.id, { status: 'paid' });
  // Clear any pending "customer wants to pay cash" alert for this invoice.
  try {
    const reqs = await findWhere('payment_requests', 'invoice_id', req.params.id);
    for (const r of reqs.filter(r => r.status === 'pending')) {
      await update('payment_requests', r.id, { status: 'resolved', resolved_at: new Date().toISOString() });
    }
  } catch (e) { console.error('[billing] clear cash request:', e.message); }
  res.status(201).json(await getById('payments', id));
});

// DELETE /billing/payments/:id — remove a recorded payment; re-open the invoice if
// it was marked paid and is no longer fully covered.
router.delete('/payments/:id', async (req, res) => {
  const payment = await getById('payments', req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  await remove('payments', req.params.id);
  if (payment.invoice_id) {
    const invoice = await getById('invoices', payment.invoice_id);
    if (invoice && invoice.status === 'paid') {
      const remaining = (await findWhere('payments', 'invoice_id', payment.invoice_id)).reduce((s, p) => s + (p.amount || 0), 0);
      if (remaining < (invoice.total || 0)) await update('invoices', payment.invoice_id, { status: 'sent' });
    }
  }
  res.json({ success: true });
});

// GET /billing/payments — all recorded payments (for reconciliation), newest first.
router.get('/payments', async (req, res) => {
  const [payments, invoices, customers] = await Promise.all([list('payments'), list('invoices'), list('customers')]);
  const invById = Object.fromEntries(invoices.map(i => [i.id, i]));
  const custName = Object.fromEntries(customers.map(c => [c.id, c.name]));
  const rows = payments.map(p => {
    const inv = invById[p.invoice_id] || {};
    return {
      id: p.id, amount: p.amount, method: p.method || 'cash', reference: p.reference || null, paid_at: p.paid_at,
      invoice_id: p.invoice_id, invoice_number: inv.invoice_number || null, customer_name: custName[inv.customer_id] || null,
    };
  }).sort((a, b) => (b.paid_at || '').localeCompare(a.paid_at || ''));
  res.json(rows);
});

// GET /billing/config — office-accessible billing defaults (e.g. tax rate for new docs).
router.get('/config', async (req, res) => {
  const rate = await settings.get('default_tax_rate');
  res.json({ default_tax_rate: Number(rate) || 0.0875 });
});

// POST /billing/invoices/remind-overdue — email every overdue customer at once.
router.post('/invoices/remind-overdue', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const invoices = await list('invoices');
  const overdue = invoices.filter(i => !['paid', 'cancelled'].includes(i.status) && i.due_date && i.due_date < today);
  let sent = 0;
  for (const invoice of overdue) {
    const customer = invoice.customer_id ? await getById('customers', invoice.customer_id) : null;
    if (!customer?.email) continue;
    try {
      const payments = await findWhere('payments', 'invoice_id', invoice.id);
      const amountPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
      const { subject, html } = await render('invoice_reminder', { ...invoice, customer_name: customer.name, amountPaid });
      await sendMail({ type: 'invoice_reminder', to: customer.email, toName: customer.name, subject, html, relatedId: invoice.id, customerId: invoice.customer_id, sentBy: req.user.name });
      const biz = (await settings.get('business_name')) || 'Clarke Mechanical';
      const due = Math.max(0, (invoice.total || 0) - amountPaid);
      await notifyCustomerBySms(customer, `${biz}: invoice ${invoice.invoice_number || ''} of ${money(due)} is past due. Please pay in your account. Reply STOP to opt out.`);
      sent++;
    } catch (e) { console.error('[billing] bulk remind:', e.message); }
  }
  res.json({ ok: true, sent, total: overdue.length });
});

// POST /billing/invoices/:id/remind — email the customer a payment reminder.
router.post('/invoices/:id/remind', async (req, res) => {
  const invoice = await getById('invoices', req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  const customer = invoice.customer_id ? await getById('customers', invoice.customer_id) : null;
  if (!customer?.email) return res.status(400).json({ error: 'This customer has no email on file.' });
  const payments = await findWhere('payments', 'invoice_id', invoice.id);
  const amountPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
  try {
    const entity = { ...invoice, customer_name: customer.name, amountPaid };
    const { subject, html } = await render('invoice_reminder', entity);
    await sendMail({ type: 'invoice_reminder', to: customer.email, toName: customer.name, subject, html, relatedId: invoice.id, customerId: invoice.customer_id, sentBy: req.user.name });
    const biz = (await settings.get('business_name')) || 'Clarke Mechanical';
    const due = Math.max(0, (invoice.total || 0) - amountPaid);
    await notifyCustomerBySms(customer, `${biz}: a reminder about invoice ${invoice.invoice_number || ''} of ${money(due)}. Please pay in your account. Reply STOP to opt out.`);
    res.json({ ok: true });
  } catch (e) {
    console.error('[billing] reminder failed:', e.message);
    res.status(502).json({ error: 'Could not send the reminder.' });
  }
});

module.exports = router;
