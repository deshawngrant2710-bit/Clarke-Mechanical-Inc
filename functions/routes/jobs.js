const express = require('express');
const { v4: uuid } = require('uuid');
const { db, list, getById, create, update, remove, findWhere, nameMap } = require('../lib/db');
const { authMiddleware, requireStaff } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireStaff);

// List jobs with customer_name + technician_name attached.
router.get('/', async (req, res) => {
  const [jobs, customers, users] = await Promise.all([list('jobs'), nameMap('customers'), nameMap('users')]);
  const rows = jobs
    .map(j => ({ ...j, customer_name: customers[j.customer_id] || null, technician_name: users[j.technician_id] || null }))
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const job = await getById('jobs', req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const [customer, tech, photos] = await Promise.all([
    job.customer_id ? getById('customers', job.customer_id) : null,
    job.technician_id ? getById('users', job.technician_id) : null,
    findWhere('job_photos', 'job_id', req.params.id),
  ]);
  res.json({
    ...job,
    customer_name: customer?.name || null,
    customer_phone: customer?.phone || null,
    customer_email: customer?.email || null,
    technician_name: tech?.name || null,
    photos,
  });
});

router.post('/', async (req, res) => {
  const b = req.body;
  if (!b.title) return res.status(400).json({ error: 'Title is required' });
  const saved = await create('jobs', uuid(), {
    title: b.title, description: b.description || null,
    customer_id: b.customer_id || null, technician_id: b.technician_id || null,
    status: b.status || 'pending', priority: b.priority || 'normal', job_type: b.job_type || null,
    scheduled_date: b.scheduled_date || null, scheduled_time: b.scheduled_time || null,
    completed_date: b.completed_date || null, address: b.address || null, notes: b.notes || null,
  });
  res.status(201).json(saved);
});

router.put('/:id', async (req, res) => {
  const existing = await getById('jobs', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Job not found' });
  const fields = ['title', 'description', 'customer_id', 'technician_id', 'status', 'priority',
    'job_type', 'scheduled_date', 'scheduled_time', 'completed_date', 'address', 'notes'];
  const patch = {};
  for (const f of fields) if (f in req.body) patch[f] = req.body[f] ?? null;
  const saved = await update('jobs', req.params.id, patch);
  res.json(saved);
});

router.delete('/:id', async (req, res) => {
  const photos = await findWhere('job_photos', 'job_id', req.params.id);
  await Promise.all(photos.map(p => db.collection('job_photos').doc(p.id).delete()));
  await remove('jobs', req.params.id);
  res.json({ success: true });
});

module.exports = router;
