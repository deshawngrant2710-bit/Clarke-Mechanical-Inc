// Recurring business subscriptions (software, tools, recurring vendor fees).
// These are recurring operating expenses — their monthly cost flows into the
// Profit & Loss automatically, so they're not entered as one-off expenses too.
const express = require('express');
const { v4: uuid } = require('uuid');
const { list, getById, create, update, remove } = require('../lib/db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireRole('admin', 'office'));

// Monthly-equivalent cost of a subscription.
function monthlyCost(s) {
  const amt = Number(s.amount) || 0;
  return (s.frequency === 'yearly' || s.frequency === 'annual') ? amt / 12 : amt;
}

function clean(b) {
  const freq = (b.frequency === 'yearly' || b.frequency === 'annual') ? 'yearly' : 'monthly';
  return {
    name: (b.name || '').trim(),
    amount: Math.round((Number(b.amount) || 0) * 100) / 100,
    frequency: freq,
    category: (b.category || 'Software & subscriptions').trim(),
    notes: (b.notes || '').trim() || null,
    active: b.active !== false,
    start_date: b.start_date ? String(b.start_date).slice(0, 10) : null,
  };
}

router.get('/', async (req, res) => {
  const items = (await list('subscriptions')).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const active = items.filter(s => s.active !== false);
  const monthly = Math.round(active.reduce((s, x) => s + monthlyCost(x), 0) * 100) / 100;
  res.json({ items, total_monthly: monthly, total_annual: Math.round(monthly * 12 * 100) / 100 });
});

router.post('/', async (req, res) => {
  const data = clean(req.body);
  if (!data.name) return res.status(400).json({ error: 'Subscription name is required' });
  if (!(data.amount > 0)) return res.status(400).json({ error: 'Enter an amount greater than zero' });
  if (!data.start_date) data.start_date = new Date().toISOString().slice(0, 10);
  const saved = await create('subscriptions', uuid(), { ...data, created_by: req.user.name, created_at: new Date().toISOString() });
  res.status(201).json(saved);
});

router.put('/:id', async (req, res) => {
  const existing = await getById('subscriptions', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Subscription not found' });
  const patch = clean(req.body);
  if (!req.body.start_date) delete patch.start_date; // keep existing start date if not sent
  res.json(await update('subscriptions', req.params.id, patch));
});

router.delete('/:id', async (req, res) => {
  await remove('subscriptions', req.params.id);
  res.json({ success: true });
});

module.exports = router;
module.exports.monthlyCost = monthlyCost;
