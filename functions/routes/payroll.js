const express = require('express');
const { v4: uuid } = require('uuid');
const { list, getById, create } = require('../lib/db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, adminOnly);

const inRange = (d, from, to) => d && (!from || d >= from) && (!to || d <= to);
// A job counts toward a worker if they were the assigned or an additional technician.
const workedOn = (job, uid) => job.technician_id === uid || (Array.isArray(job.additional_technician_ids) && job.additional_technician_ids.includes(uid));

// GET /api/payroll/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
// Per-worker: completed jobs in range, per-job pay, salary setting, and amount paid in range.
router.get('/summary', async (req, res) => {
  const { from, to } = req.query;
  const [users, jobs, payments] = await Promise.all([list('users'), list('jobs'), list('payroll_payments')]);
  const staff = users.filter(u => u.role && u.role !== 'customer');
  const done = jobs.filter(j => j.status === 'completed');

  const rows = staff.map(u => {
    const theirJobs = done.filter(j => workedOn(j, u.id) && inRange(j.completed_date, from, to));
    const perJob = Number(u.pay_per_job) || 0;
    const per_job_pay = theirJobs.length * perJob;
    const paid_in_range = payments
      .filter(p => p.user_id === u.id && inRange((p.paid_at || '').slice(0, 10), from, to))
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    return {
      id: u.id, name: u.name, role: u.role,
      pay_per_job: perJob, salary_amount: Number(u.salary_amount) || 0, salary_frequency: u.salary_frequency || 'none',
      jobs_count: theirJobs.length, per_job_pay, paid_in_range,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  res.json({ from: from || null, to: to || null, workers: rows });
});

// GET /api/payroll/payments?user_id=&from=&to= — recorded payments, newest first.
router.get('/payments', async (req, res) => {
  const { user_id, from, to } = req.query;
  let payments = await list('payroll_payments');
  if (user_id) payments = payments.filter(p => p.user_id === user_id);
  if (from || to) payments = payments.filter(p => inRange((p.paid_at || '').slice(0, 10), from, to));
  payments.sort((a, b) => (b.paid_at || '').localeCompare(a.paid_at || ''));
  res.json(payments);
});

// POST /api/payroll/payments — record a payment to a worker.
router.post('/payments', async (req, res) => {
  const { user_id, amount, method, notes, period_from, period_to } = req.body;
  if (!user_id) return res.status(400).json({ error: 'A worker is required' });
  const amt = Number(amount) || 0;
  if (amt <= 0) return res.status(400).json({ error: 'Enter a payment amount' });
  const worker = await getById('users', user_id);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });
  const saved = await create('payroll_payments', uuid(), {
    user_id, user_name: worker.name, amount: amt,
    method: method || 'other', notes: notes || null,
    period_from: period_from || null, period_to: period_to || null,
    paid_at: req.body.paid_at || new Date().toISOString(), recorded_by: req.user.name,
  });
  res.status(201).json(saved);
});

module.exports = router;
