const express = require('express');
const { v4: uuid } = require('uuid');
const { list, getById, create, update, remove } = require('../lib/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const FIELDS = ['name', 'sku', 'description', 'category', 'quantity', 'min_quantity', 'unit_price', 'supplier', 'location'];

router.get('/', async (req, res) => {
  const items = await list('inventory', { orderBy: 'name' });
  res.json(items);
});

router.post('/', async (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'Name is required' });
  const data = {};
  for (const f of FIELDS) data[f] = req.body[f] ?? (['quantity', 'min_quantity', 'unit_price'].includes(f) ? 0 : null);
  const saved = await create('inventory', uuid(), data);
  res.status(201).json(saved);
});

router.put('/:id', async (req, res) => {
  const existing = await getById('inventory', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item not found' });
  const patch = {};
  for (const f of FIELDS) if (f in req.body) patch[f] = req.body[f];
  const saved = await update('inventory', req.params.id, patch);
  res.json(saved);
});

router.delete('/:id', async (req, res) => {
  await remove('inventory', req.params.id);
  res.json({ success: true });
});

module.exports = router;
