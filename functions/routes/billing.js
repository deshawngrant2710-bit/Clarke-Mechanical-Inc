const express = require('express');
const { v4: uuid } = require('uuid');
const { db, list, getById, create, update, remove, findWhere, nameMap } = require('../lib/db');
const { authMiddleware, requireRole } = require('../middleware/auth');

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

// Next sequential number like INV-2026-0001 / QUO-2026-0001.
async function nextNumber(collection, prefix) {
  const year = new Date().getFullYear();
  const all = await list(collection);
  const field = collection === 'invoices' ? 'invoice_number' : 'quote_number';
  const count = all.filter(x => (x[field] || '').startsWith(`${prefix}-${year}-`)).length + 1;
  return `${prefix}-${year}-${String(count).padStart(4, '0')}`;
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
  const { customer_id, job_id, status, issue_date, due_date, items = [], tax_rate = 0.0875, notes } = req.body;
  const lineItems = withItemTotals(items);
  const { subtotal, tax_amount, total } = calcTotals(lineItems, tax_rate);
  const invoice_number = await nextNumber('invoices', 'INV');
  const saved = await create('invoices', uuid(), {
    invoice_number, customer_id: customer_id || null, job_id: job_id || null, status: status || 'draft',
    issue_date: issue_date || null, due_date: due_date || null, subtotal, tax_rate, tax_amount, total,
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

router.post('/quotes', async (req, res) => {
  const { customer_id, status, issue_date, expiry_date, items = [], tax_rate = 0.0875, notes } = req.body;
  const lineItems = withItemTotals(items);
  const { subtotal, tax_amount, total } = calcTotals(lineItems, tax_rate);
  const quote_number = await nextNumber('quotes', 'QUO');
  const saved = await create('quotes', uuid(), {
    quote_number, customer_id: customer_id || null, status: status || 'draft', issue_date: issue_date || null,
    expiry_date: expiry_date || null, subtotal, tax_rate, tax_amount, total, notes: notes || null, items: lineItems,
  });
  res.status(201).json(saved);
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
  res.status(201).json(await getById('payments', id));
});

module.exports = router;
