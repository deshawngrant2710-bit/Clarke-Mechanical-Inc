const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  const customers = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM jobs j WHERE j.customer_id = c.id AND j.status NOT IN ('completed','cancelled')) AS open_jobs,
      (SELECT COALESCE(SUM(i.total),0) FROM invoices i WHERE i.customer_id = c.id AND i.status = 'paid') AS lifetime_revenue,
      (SELECT COALESCE(SUM(i.total),0) FROM invoices i WHERE i.customer_id = c.id AND i.status NOT IN ('paid','cancelled')) AS balance_due,
      (SELECT MAX(j.scheduled_date) FROM jobs j WHERE j.customer_id = c.id) AS last_service
    FROM customers c ORDER BY c.name ASC
  `).all();
  res.json(customers);
});

router.get('/:id', (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  const jobs = db.prepare('SELECT * FROM jobs WHERE customer_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json({ ...customer, jobs });
});

router.post('/', (req, res) => {
  const { name, email, phone, address, city, state, zip, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const id = uuidv4();
  db.prepare('INSERT INTO customers (id, name, email, phone, address, city, state, zip, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, name, email || null, phone || null, address || null, city || null, state || null, zip || null, notes || null);
  res.status(201).json(db.prepare('SELECT * FROM customers WHERE id = ?').get(id));
});

router.put('/:id', (req, res) => {
  const { name, email, phone, address, city, state, zip, notes } = req.body;
  const existing = db.prepare('SELECT id FROM customers WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Customer not found' });
  db.prepare(`UPDATE customers SET name=?, email=?, phone=?, address=?, city=?, state=?, zip=?, notes=? WHERE id=?`)
    .run(name, email || null, phone || null, address || null, city || null, state || null, zip || null, notes || null, req.params.id);
  res.json(db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM customers WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Customer not found' });
  db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
