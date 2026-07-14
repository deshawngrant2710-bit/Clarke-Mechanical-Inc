const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { db, list, getById, findOne, create, update, remove, findWhere } = require('../lib/db');
const { authMiddleware, adminOnly, requireStaff } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireStaff);

const ROLES = ['customer', 'technician', 'office', 'admin'];
const strip = (u) => u && {
  id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone, created_at: u.created_at,
  pay_per_job: u.pay_per_job || 0, salary_amount: u.salary_amount || 0, salary_frequency: u.salary_frequency || 'none',
};

router.get('/', async (req, res) => {
  const users = (await list('users', { orderBy: 'name' })).map(strip);
  res.json(users);
});

router.get('/:id', async (req, res) => {
  const user = await getById('users', req.params.id);
  if (!user) return res.status(404).json({ error: 'Employee not found' });
  const jobs = (await findWhere('jobs', 'technician_id', req.params.id))
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 20);
  res.json({ ...strip(user), jobs });
});

router.post('/', adminOnly, async (req, res) => {
  const { name, email, password, role, phone } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password required' });
  if (await findOne('users', 'email', email)) return res.status(409).json({ error: 'Email already in use' });
  const id = uuid();
  await create('users', id, { name, email, password: bcrypt.hashSync(password, 10), role: role || 'customer', phone: phone || null });
  res.status(201).json(strip(await getById('users', id)));
});

// Update profile (name/phone). Role is NOT editable here.
router.put('/:id', async (req, res) => {
  if (req.user.role !== 'admin' && req.user.id !== req.params.id) return res.status(403).json({ error: 'Forbidden' });
  const existing = await getById('users', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Employee not found' });
  const saved = await update('users', req.params.id, { name: req.body.name, phone: req.body.phone || null });
  res.json(strip(saved));
});

// Change role — ADMIN ONLY.
router.put('/:id/role', adminOnly, async (req, res) => {
  const { role } = req.body;
  if (!ROLES.includes(role)) return res.status(400).json({ error: `Role must be one of: ${ROLES.join(', ')}` });
  const existing = await getById('users', req.params.id);
  if (!existing) return res.status(404).json({ error: 'User not found' });
  if (req.params.id === req.user.id && role !== 'admin') return res.status(400).json({ error: 'You cannot change your own admin role' });
  const saved = await update('users', req.params.id, { role });
  res.json(strip(saved));
});

// Set a worker's pay settings — ADMIN ONLY.
router.put('/:id/pay', adminOnly, async (req, res) => {
  const existing = await getById('users', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Employee not found' });
  const freqs = ['none', 'daily', 'weekly', 'biweekly', 'monthly'];
  const saved = await update('users', req.params.id, {
    pay_per_job: Number(req.body.pay_per_job) || 0,
    salary_amount: Number(req.body.salary_amount) || 0,
    salary_frequency: freqs.includes(req.body.salary_frequency) ? req.body.salary_frequency : 'none',
  });
  res.json(strip(saved));
});

router.delete('/:id', adminOnly, async (req, res) => {
  await remove('users', req.params.id);
  res.json({ success: true });
});

module.exports = router;
