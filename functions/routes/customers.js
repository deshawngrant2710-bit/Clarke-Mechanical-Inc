const express = require('express');
const { v4: uuid } = require('uuid');
const { list, getById, create, update, remove, findWhere } = require('../lib/db');
const { authMiddleware, requireStaff } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireStaff);

// List customers with computed rollups (open jobs, lifetime revenue, balance, last service).
router.get('/', async (req, res) => {
  const [customers, jobs, invoices] = await Promise.all([
    list('customers', { orderBy: 'name' }),
    list('jobs'),
    list('invoices'),
  ]);
  const enriched = customers.map(c => {
    const cJobs = jobs.filter(j => j.customer_id === c.id);
    const cInv = invoices.filter(i => i.customer_id === c.id);
    return {
      ...c,
      open_jobs: cJobs.filter(j => !['completed', 'cancelled'].includes(j.status)).length,
      lifetime_revenue: cInv.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total || 0), 0),
      balance_due: cInv.filter(i => !['paid', 'cancelled'].includes(i.status)).reduce((s, i) => s + (i.total || 0), 0),
      last_service: cJobs.reduce((m, j) => (j.scheduled_date && (!m || j.scheduled_date > m) ? j.scheduled_date : m), null),
    };
  });
  res.json(enriched);
});

router.get('/:id', async (req, res) => {
  const customer = await getById('customers', req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  const jobs = (await findWhere('jobs', 'customer_id', req.params.id))
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  res.json({ ...customer, jobs });
});

router.post('/', async (req, res) => {
  const { name, email, phone, address, city, state, zip, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const saved = await create('customers', uuid(), {
    name, email: email || null, phone: phone || null, address: address || null,
    city: city || null, state: state || null, zip: zip || null, notes: notes || null,
  });
  res.status(201).json(saved);
});

router.put('/:id', async (req, res) => {
  const existing = await getById('customers', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Customer not found' });
  const { name, email, phone, address, city, state, zip, notes } = req.body;
  const saved = await update('customers', req.params.id, {
    name, email: email || null, phone: phone || null, address: address || null,
    city: city || null, state: state || null, zip: zip || null, notes: notes || null,
  });
  res.json(saved);
});

router.delete('/:id', async (req, res) => {
  await remove('customers', req.params.id);
  res.json({ success: true });
});

module.exports = router;
