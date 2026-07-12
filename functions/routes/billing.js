const express = require('express');
const { v4: uuid } = require('uuid');
const { db, list, getById, create, update, remove, findWhere, nameMap } = require('../lib/db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { render, sendMail } = require('../lib/email');
const settings = require('../lib/settings');

const router = express.Router();
router.use(authMiddleware, requireRole('admin', 'office'));

function calcTotals(items, taxRate) {
  const subtotal = items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0), 0);
  const tax_amount = subtotal * taxRate;
  return { subtotal, tax_amount, total: subtotal + tax_amount };
}
const withItemTotals = (items = []) => items.map(i => ({
  id: i.id || uuid(), description: i.description, quantity: Number(i.quantity) || 0,
  unit_price: Number(i.unit_price) || 0, total: (Number(i.quantity) || 0) * (Number(i.unit_price) || 0),
}));

// Sequential document numbers.
//  - useYear=false → simple running sequence like CL-0001, CL-0002 …
//  - useYear=true  → year-scoped like QUO-2026-0001
async function nextNumber(collection, prefix, useYear = false) {
  const all = await list(collection);
  const field = collection === 'invoices' ? 'invoice_number' : 'quote_number';
  if (useYear) {
    const year = new Date().getFullYear();
    const count = all.filter(x => (x[field] || '').startsWith(`${prefix}-${year}-`)).length + 1;
    return `${prefix}-${year}-${String(count).padStart(4, '0')}`;
  }
  const count = all.filter(x => (x[field] || '').startsWith(`${prefix}-`)).length + 1;
  return `${prefix}-${String(count).padStart(4, '0')}`;
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
  const { customer_id, job_id, status, issue_date, due_date, items = [], tax_rate, notes } = req.body;
  const rate = tax_rate != null ? Number(tax_rate) : (Number(await settings.get('default_tax_rate')) || 0.0875);
  const lineItems = withItemTotals(items);
  const { subtotal, tax_amount, total } = calcTotals(lineItems, rate);
  const invoice_number = await nextNumber('invoices', 'CL');
  const saved = await create('invoices', uuid(), {
    invoice_number, customer_id: customer_id || null, job_id: job_id || null, status: status || 'draft',
    issue_date: issue_date || null, due_date: due_date || null, subtotal, tax_rate: rate, tax_amount, total,
    notes: notes || null, items: lineItems,
  });
  res.status(201).json(saved);
});

router.put('/invoices/:id', async (req, res) => {
  const existing = await getById('invoices', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Invoice not found' });
  const { customer_id, job_id, status, issue_date, due_date, items = [], tax_rate = 0.0875, notes } = req.body;
  const lineItems = withItemTotals(items);
  const { subtotal, tax_amount, total } = calcTotals(lineItems, tax_rate);
  const saved = await update('invoices', req.params.id, {
    customer_id: customer_id || null, job_id: job_id || null, status, issue_date: issue_date || null,
    due_date: due_date || null, subtotal, tax_rate, tax_amount, total, notes: notes || null, items: lineItems,
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
    if (!customer?.email) return;
    const { subject, html } = await render('quote', { ...quote, customer_name: customer.name });
    await sendMail({ type: 'quote', to: customer.email, toName: customer.name, subject, html, relatedId: quote.id, customerId: quote.customer_id, sentBy: 'Automated' });
  } catch (e) { console.error('[billing] estimate email failed:', e.message); }
}

router.post('/quotes', async (req, res) => {
  const { customer_id, status, issue_date, expiry_date, items = [], tax_rate, notes } = req.body;
  const rate = tax_rate != null ? Number(tax_rate) : (Number(await settings.get('default_tax_rate')) || 0.0875);
  const lineItems = withItemTotals(items);
  const { subtotal, tax_amount, total } = calcTotals(lineItems, rate);
  const quote_number = await nextNumber('quotes', 'QUO', true);
  const saved = await create('quotes', uuid(), {
    quote_number, customer_id: customer_id || null, status: status || 'draft', issue_date: issue_date || null,
    expiry_date: expiry_date || null, subtotal, tax_rate: rate, tax_amount, total, notes: notes || null, items: lineItems,
  });
  res.status(201).json(saved);
  emailEstimateSent(saved, null);
});

router.put('/quotes/:id', async (req, res) => {
  const existing = await getById('quotes', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Quote not found' });
  const { customer_id, status, issue_date, expiry_date, items = [], tax_rate = 0.0875, notes } = req.body;
  const lineItems = withItemTotals(items);
  const { subtotal, tax_amount, total } = calcTotals(lineItems, tax_rate);
  const saved = await update('quotes', req.params.id, {
    customer_id: customer_id || null, status, issue_date: issue_date || null, expiry_date: expiry_date || null,
    subtotal, tax_rate, tax_amount, total, notes: notes || null, items: lineItems,
  });
  res.json(saved);
  emailEstimateSent(saved, existing.status);
});

router.delete('/quotes/:id', async (req, res) => {
  await remove('quotes', req.params.id);
  res.json({ success: true });
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
    res.json({ ok: true });
  } catch (e) {
    console.error('[billing] reminder failed:', e.message);
    res.status(502).json({ error: 'Could not send the reminder.' });
  }
});

module.exports = router;
