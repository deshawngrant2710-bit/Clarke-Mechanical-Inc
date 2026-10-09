// Business expenses the office logs manually (fuel, rent, tools, insurance, etc.).
// These feed the Profit & Loss report alongside purchase orders and payroll.
const express = require('express');
const { v4: uuid } = require('uuid');
const { list, getById, create, update, remove } = require('../lib/db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireRole('admin', 'office'));

const CATEGORIES = [
  'Materials & supplies', 'Fuel & vehicle', 'Tools & equipment', 'Rent & utilities',
  'Insurance', 'Licenses & permits', 'Subcontractors', 'Marketing', 'Office & software',
  'Taxes & fees', 'Other',
];

function clean(b) {
  return {
    date: b.date || new Date().toISOString().slice(0, 10),
    category: (b.category || 'Other').trim(),
    vendor: (b.vendor || '').trim() || null,
    description: (b.description || '').trim() || null,
    amount: Math.round((Number(b.amount) || 0) * 100) / 100,
  };
}
const inRange = (d, from, to) => (!from || d >= from) && (!to || d <= to);

router.get('/categories', (req, res) => res.json(CATEGORIES));

// GET /api/expenses?from=&to= — expenses in the date range (newest first).
router.get('/', async (req, res) => {
  const { from, to } = req.query;
  let items = await list('expenses');
  if (from || to) items = items.filter(e => inRange((e.date || '').slice(0, 10), from, to));
  items.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created_at || '').localeCompare(a.created_at || ''));
  res.json(items);
});

router.post('/', async (req, res) => {
  const data = clean(req.body);
  if (!(data.amount > 0)) return res.status(400).json({ error: 'Enter an amount greater than zero' });
  const saved = await create('expenses', uuid(), { ...data, created_by: req.user.name, created_at: new Date().toISOString() });
  res.status(201).json(saved);
});

router.put('/:id', async (req, res) => {
  const existing = await getById('expenses', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Expense not found' });
  const data = clean(req.body);
  if (!(data.amount > 0)) return res.status(400).json({ error: 'Enter an amount greater than zero' });
  res.json(await update('expenses', req.params.id, data));
});

router.delete('/:id', async (req, res) => {
  await remove('expenses', req.params.id);
  res.json({ success: true });
});

module.exports = router;
module.exports.CATEGORIES = CATEGORIES;
