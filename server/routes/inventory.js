const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  const { low_stock } = req.query;
  let query = 'SELECT * FROM inventory ORDER BY name ASC';
  if (low_stock === 'true') query = 'SELECT * FROM inventory WHERE quantity <= min_quantity ORDER BY name ASC';
  res.json(db.prepare(query).all());
});

router.get('/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  res.json(item);
});

router.post('/', (req, res) => {
  const { name, sku, description, category, quantity, min_quantity, unit_price, supplier, location } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const id = uuidv4();
  db.prepare(`INSERT INTO inventory (id, name, sku, description, category, quantity, min_quantity, unit_price, supplier, location)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, name, sku || null, description || null, category || null,
         quantity || 0, min_quantity || 0, unit_price || 0, supplier || null, location || null);
  res.status(201).json(db.prepare('SELECT * FROM inventory WHERE id = ?').get(id));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM inventory WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item not found' });
  const { name, sku, description, category, quantity, min_quantity, unit_price, supplier, location } = req.body;
  db.prepare(`UPDATE inventory SET name=?, sku=?, description=?, category=?, quantity=?, min_quantity=?, unit_price=?, supplier=?, location=? WHERE id=?`)
    .run(name, sku || null, description || null, category || null,
         quantity || 0, min_quantity || 0, unit_price || 0, supplier || null, location || null, req.params.id);
  res.json(db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM inventory WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
