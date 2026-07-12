const express = require('express');
const { v4: uuid } = require('uuid');
const { list, getById, create, update, remove } = require('../lib/db');
const { authMiddleware, requireStaff, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireStaff);

const clean = (b) => ({
  name: (b.name || '').trim(),
  category: (b.category || '').trim() || null,
  unit: (b.unit || '').trim() || null,
  unit_price: Number(b.unit_price) || 0,
  notes: (b.notes || '').trim() || null,
});

// GET /api/pricebook — the full price book (any staff can read it for quoting).
router.get('/', async (req, res) => {
  const items = await list('price_book', { orderBy: 'name' });
  res.json(items);
});

// Everything below changes the catalog — admin/office only.
router.post('/', requireRole('admin', 'office'), async (req, res) => {
  const data = clean(req.body);
  if (!data.name) return res.status(400).json({ error: 'Item name is required' });
  const saved = await create('price_book', uuid(), { ...data, created_at: new Date().toISOString() });
  res.status(201).json(saved);
});

router.put('/:id', requireRole('admin', 'office'), async (req, res) => {
  const existing = await getById('price_book', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item not found' });
  const data = clean(req.body);
  if (!data.name) return res.status(400).json({ error: 'Item name is required' });
  const saved = await update('price_book', req.params.id, data);
  res.json(saved);
});

router.delete('/:id', requireRole('admin', 'office'), async (req, res) => {
  await remove('price_book', req.params.id);
  res.json({ success: true });
});

// POST /api/pricebook/import — bulk add items (used to load a spreadsheet).
// Body: { items: [{ name, unit_price, category?, unit? }, ...], replace?: boolean }
router.post('/import', requireRole('admin', 'office'), async (req, res) => {
  const rows = Array.isArray(req.body.items) ? req.body.items : [];
  if (!rows.length) return res.status(400).json({ error: 'No items to import' });
  if (req.body.replace) {
    const existing = await list('price_book');
    for (const it of existing) await remove('price_book', it.id);
  }
  let added = 0;
  for (const r of rows) {
    const data = clean(r);
    if (!data.name) continue;
    await create('price_book', uuid(), { ...data, created_at: new Date().toISOString() });
    added++;
  }
  res.status(201).json({ ok: true, added });
});

module.exports = router;
