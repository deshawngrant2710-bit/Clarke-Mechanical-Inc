const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { db, list, getById, findOne, create, update, remove, findWhere } = require('../lib/db');
const { authMiddleware, adminOnly, requireStaff } = require('../middleware/auth');
const { genTempPassword } = require('../lib/passwords');

const router = express.Router();
router.use(authMiddleware, requireStaff);

const ROLES = ['customer', 'technician', 'office', 'admin'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const strip = (u) => u && {
  id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone, created_at: u.created_at,
  pay_per_job: u.pay_per_job || 0, salary_amount: u.salary_amount || 0, salary_frequency: u.salary_frequency || 'none',
  also_technician: !!u.also_technician,
};

router.get('/', async (req, res) => {
  const users = (await list('users', { orderBy: 'name' })).map(strip);
  // Enrich with live status: who's clocked in / on break / on a job right now.
  try {
    const [entries, jobs] = await Promise.all([list('time_entries'), list('jobs')]);
    const open = entries.filter(e => !e.clock_out);
    const today = new Date().toISOString().slice(0, 10);
    for (const u of users) {
      const entry = open.find(e => e.technician_id === u.id);
      const mine = jobs.filter(j => j.technician_id === u.id
        || (Array.isArray(j.additional_technician_ids) && j.additional_technician_ids.includes(u.id)));
      const active = mine.filter(j => j.status === 'in-progress');
      const todayJobs = mine.filter(j => j.scheduled_date === today && !['completed', 'cancelled'].includes(j.status));
      const breaks = entry?.breaks || [];
      let currentJob = null;
      const jobId = entry?.job_id || active[0]?.id;
      if (jobId) { const j = jobs.find(x => x.id === jobId); if (j) currentJob = { id: j.id, title: j.title }; }
      u.clocked_in = !!entry;
      u.clocked_in_at = entry?.clock_in || null;
      u.on_break = breaks.length > 0 && !breaks[breaks.length - 1].end;
      u.current_job = currentJob;
      u.today_jobs = todayJobs.length;
      u.active_jobs = active.length;
    }
  } catch (e) { console.error('[employees] status enrich failed:', e.message); }
  res.json(users);
});

router.get('/:id', async (req, res) => {
  const user = await getById('users', req.params.id);
  if (!user) return res.status(404).json({ error: 'Employee not found' });
  const jobs = (await findWhere('jobs', 'technician_id', req.params.id))
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 20);
  res.json({ ...strip(user), jobs });
});

// Create a team member. The admin does NOT set a password — the server issues a
// one-time password (returned once) that the member uses to sign in, then changes.
router.post('/', adminOnly, async (req, res) => {
  const { name, role, phone } = req.body;
  const email = (req.body.email || '').trim().toLowerCase();
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address' });
  if (await findOne('users', 'email', email)) return res.status(409).json({ error: 'Email already in use' });
  const tempPassword = genTempPassword();
  const id = uuid();
  await create('users', id, {
    name: name.trim(), email,
    password: bcrypt.hashSync(tempPassword, 10),
    role: ROLES.includes(role) ? role : 'technician',
    phone: phone || null,
    must_change_password: true,
  });
  res.status(201).json({ ...strip(await getById('users', id)), tempPassword });
});

// Generate a NEW one-time password for an existing user (forgot password / lost
// access). Returns the temp password once; the user must change it on next login.
router.post('/:id/reset-password', adminOnly, async (req, res) => {
  const user = await getById('users', req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const tempPassword = genTempPassword();
  await update('users', req.params.id, { password: bcrypt.hashSync(tempPassword, 10), must_change_password: true });
  res.json({ tempPassword, name: user.name, email: user.email });
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

// Toggle "also works as a technician" so an admin/office user can also be assigned
// jobs and use the technician field workflow — ADMIN ONLY.
router.put('/:id/tech-flag', adminOnly, async (req, res) => {
  const existing = await getById('users', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Employee not found' });
  const saved = await update('users', req.params.id, { also_technician: !!req.body.also_technician });
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
  // Also clear their payroll payment records so they don't linger on the Payroll tab.
  try {
    const pays = await findWhere('payroll_payments', 'user_id', req.params.id);
    for (const p of pays) await remove('payroll_payments', p.id);
  } catch (e) { console.error('[employees] payroll cleanup:', e.message); }
  res.json({ success: true });
});

module.exports = router;
