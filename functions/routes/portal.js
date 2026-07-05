const express = require('express');
const { db, findWhere, nameMap } = require('../lib/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// Find the customer record(s) linked to the logged-in user by email → their ids.
async function myCustomerIds(req) {
  const email = (req.user?.email || '').toLowerCase();
  if (!email) return { ids: [], records: [] };
  const records = await findWhere('customers', 'email', email);
  return { ids: records.map(r => r.id), records };
}

const byCreated = (a, b) => (b.created_at || '').localeCompare(a.created_at || '');

router.get('/me', async (req, res) => {
  const { ids, records } = await myCustomerIds(req);
  let openJobs = 0, balanceDue = 0, invoiceCount = 0;
  if (ids.length) {
    const [jobs, invoices] = await Promise.all([
      Promise.all(ids.map(id => findWhere('jobs', 'customer_id', id))).then(a => a.flat()),
      Promise.all(ids.map(id => findWhere('invoices', 'customer_id', id))).then(a => a.flat()),
    ]);
    openJobs = jobs.filter(j => !['completed', 'cancelled'].includes(j.status)).length;
    invoiceCount = invoices.length;
    balanceDue = invoices.filter(i => !['paid', 'cancelled'].includes(i.status)).reduce((s, i) => s + (i.total || 0), 0);
  }
  res.json({
    name: req.user.name, email: req.user.email, role: req.user.role,
    linked: records.length > 0,
    profile: records[0] || null,
    stats: { openJobs, invoiceCount, balanceDue },
  });
});

router.get('/jobs', async (req, res) => {
  const { ids } = await myCustomerIds(req);
  if (!ids.length) return res.json([]);
  const [jobsNested, techs] = await Promise.all([
    Promise.all(ids.map(id => findWhere('jobs', 'customer_id', id))),
    nameMap('users'),
  ]);
  const jobs = jobsNested.flat()
    .map(j => ({
      id: j.id, title: j.title, status: j.status, priority: j.priority, job_type: j.job_type,
      scheduled_date: j.scheduled_date, scheduled_time: j.scheduled_time, address: j.address,
      description: j.description, technician_name: techs[j.technician_id] || null, created_at: j.created_at,
    }))
    .sort(byCreated);
  res.json(jobs);
});

router.get('/invoices', async (req, res) => {
  const { ids } = await myCustomerIds(req);
  if (!ids.length) return res.json([]);
  const invNested = await Promise.all(ids.map(id => findWhere('invoices', 'customer_id', id)));
  res.json(invNested.flat().sort(byCreated));
});

router.get('/quotes', async (req, res) => {
  const { ids } = await myCustomerIds(req);
  if (!ids.length) return res.json([]);
  const qNested = await Promise.all(ids.map(id => findWhere('quotes', 'customer_id', id)));
  res.json(qNested.flat().sort(byCreated));
});

module.exports = router;
