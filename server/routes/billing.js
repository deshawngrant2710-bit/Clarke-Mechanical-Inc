const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

function calcTotals(items, taxRate) {
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const tax_amount = subtotal * taxRate;
  return { subtotal, tax_amount, total: subtotal + tax_amount };
}

// INVOICES
router.get('/invoices', (req, res) => {
  const invoices = db.prepare(`
    SELECT i.*, c.name as customer_name FROM invoices i
    LEFT JOIN customers c ON i.customer_id = c.id
    ORDER BY i.created_at DESC
  `).all();
  res.json(invoices);
});

router.get('/invoices/:id', (req, res) => {
  const invoice = db.prepare(`
    SELECT i.*, c.name as customer_name, c.email as customer_email,
           c.phone as customer_phone, c.address as customer_address
    FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id
    WHERE i.id = ?
  `).get(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(req.params.id);
  const payments = db.prepare('SELECT * FROM payments WHERE invoice_id = ?').all(req.params.id);
  res.json({ ...invoice, items, payments });
});

router.post('/invoices', (req, res) => {
  const { customer_id, job_id, status, issue_date, due_date, items = [], tax_rate = 0.0875, notes } = req.body;
  const id = uuidv4();
  const year = new Date().getFullYear();
  const count = db.prepare("SELECT COUNT(*) as c FROM invoices WHERE invoice_number LIKE ?").get(`INV-${year}-%`).c + 1;
  const invoice_number = `INV-${year}-${String(count).padStart(4, '0')}`;
  const { subtotal, tax_amount, total } = calcTotals(items, tax_rate);

  db.prepare(`INSERT INTO invoices (id, invoice_number, customer_id, job_id, status, issue_date, due_date, subtotal, tax_rate, tax_amount, total, notes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, invoice_number, customer_id || null, job_id || null, status || 'draft',
         issue_date || null, due_date || null, subtotal, tax_rate, tax_amount, total, notes || null);

  const insertItem = db.prepare('INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?, ?)');
  items.forEach(item => insertItem.run(uuidv4(), id, item.description, item.quantity, item.unit_price, item.quantity * item.unit_price));

  res.status(201).json(db.prepare('SELECT * FROM invoices WHERE id = ?').get(id));
});

router.put('/invoices/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM invoices WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Invoice not found' });
  const { customer_id, job_id, status, issue_date, due_date, items = [], tax_rate = 0.0875, notes } = req.body;
  const { subtotal, tax_amount, total } = calcTotals(items, tax_rate);

  db.prepare(`UPDATE invoices SET customer_id=?, job_id=?, status=?, issue_date=?, due_date=?,
              subtotal=?, tax_rate=?, tax_amount=?, total=?, notes=? WHERE id=?`)
    .run(customer_id || null, job_id || null, status, issue_date || null, due_date || null,
         subtotal, tax_rate, tax_amount, total, notes || null, req.params.id);

  db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(req.params.id);
  const insertItem = db.prepare('INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?, ?)');
  items.forEach(item => insertItem.run(uuidv4(), req.params.id, item.description, item.quantity, item.unit_price, item.quantity * item.unit_price));

  res.json(db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id));
});

router.delete('/invoices/:id', (req, res) => {
  db.prepare('DELETE FROM invoices WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// QUOTES
router.get('/quotes', (req, res) => {
  const quotes = db.prepare(`
    SELECT q.*, c.name as customer_name FROM quotes q
    LEFT JOIN customers c ON q.customer_id = c.id
    ORDER BY q.created_at DESC
  `).all();
  res.json(quotes);
});

router.get('/quotes/:id', (req, res) => {
  const quote = db.prepare(`
    SELECT q.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
    FROM quotes q LEFT JOIN customers c ON q.customer_id = c.id WHERE q.id = ?
  `).get(req.params.id);
  if (!quote) return res.status(404).json({ error: 'Quote not found' });
  const items = db.prepare('SELECT * FROM quote_items WHERE quote_id = ?').all(req.params.id);
  res.json({ ...quote, items });
});

router.post('/quotes', (req, res) => {
  const { customer_id, status, issue_date, expiry_date, items = [], tax_rate = 0.0875, notes } = req.body;
  const id = uuidv4();
  const year = new Date().getFullYear();
  const count = db.prepare("SELECT COUNT(*) as c FROM quotes WHERE quote_number LIKE ?").get(`QUO-${year}-%`).c + 1;
  const quote_number = `QUO-${year}-${String(count).padStart(4, '0')}`;
  const { subtotal, tax_amount, total } = calcTotals(items, tax_rate);

  db.prepare(`INSERT INTO quotes (id, quote_number, customer_id, status, issue_date, expiry_date, subtotal, tax_rate, tax_amount, total, notes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, quote_number, customer_id || null, status || 'draft', issue_date || null,
         expiry_date || null, subtotal, tax_rate, tax_amount, total, notes || null);

  const insertItem = db.prepare('INSERT INTO quote_items (id, quote_id, description, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?, ?)');
  items.forEach(item => insertItem.run(uuidv4(), id, item.description, item.quantity, item.unit_price, item.quantity * item.unit_price));

  res.status(201).json(db.prepare('SELECT * FROM quotes WHERE id = ?').get(id));
});

router.put('/quotes/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM quotes WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Quote not found' });
  const { customer_id, status, issue_date, expiry_date, items = [], tax_rate = 0.0875, notes } = req.body;
  const { subtotal, tax_amount, total } = calcTotals(items, tax_rate);

  db.prepare(`UPDATE quotes SET customer_id=?, status=?, issue_date=?, expiry_date=?,
              subtotal=?, tax_rate=?, tax_amount=?, total=?, notes=? WHERE id=?`)
    .run(customer_id || null, status, issue_date || null, expiry_date || null,
         subtotal, tax_rate, tax_amount, total, notes || null, req.params.id);

  db.prepare('DELETE FROM quote_items WHERE quote_id = ?').run(req.params.id);
  const insertItem = db.prepare('INSERT INTO quote_items (id, quote_id, description, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?, ?)');
  items.forEach(item => insertItem.run(uuidv4(), req.params.id, item.description, item.quantity, item.unit_price, item.quantity * item.unit_price));

  res.json(db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id));
});

router.delete('/quotes/:id', (req, res) => {
  db.prepare('DELETE FROM quotes WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// PAYMENTS
router.post('/invoices/:id/payments', (req, res) => {
  const { amount, method, reference, notes } = req.body;
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  const id = uuidv4();
  db.prepare('INSERT INTO payments (id, invoice_id, amount, method, reference, notes) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, req.params.id, amount, method || 'cash', reference || null, notes || null);

  const paid = db.prepare('SELECT SUM(amount) as total FROM payments WHERE invoice_id = ?').get(req.params.id).total || 0;
  if (paid >= invoice.total) {
    db.prepare("UPDATE invoices SET status = 'paid' WHERE id = ?").run(req.params.id);
  }
  res.status(201).json(db.prepare('SELECT * FROM payments WHERE id = ?').get(id));
});

module.exports = router;
