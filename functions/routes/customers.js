const express = require('express');
const { v4: uuid } = require('uuid');
const { list, getById, create, update, remove, findWhere } = require('../lib/db');
const { authMiddleware, requireStaff } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireStaff);

// List customers with computed rollups (open jobs, lifetime revenue, balance, last service).
router.get('/', async (req, res) => {
  const [customers, jobs, invoices, users] = await Promise.all([
    list('customers', { orderBy: 'name' }),
    list('jobs'),
    list('invoices'),
    list('users'),
  ]);
  // Anyone with a staff login (non-customer role) should not appear in the customer
  // list — they're an employee, not a client. Matched by email.
  const staffEmails = new Set(
    users.filter(u => u.role && u.role !== 'customer' && u.email).map(u => u.email.toLowerCase())
  );
  const visible = customers.filter(c => !(c.email && staffEmails.has(c.email.toLowerCase())));
  const enriched = visible.map(c => {
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

// Build the customer's fields from the request, deriving the display `name`
// from the business name or contact first/last so all downstream code (jobs,
// invoices, portal) keeps working off `name`.
function customerFields(b) {
  const business = (b.business_name || '').trim();
  const first = (b.first_name || '').trim();
  const last = (b.last_name || '').trim();
  const contact = [first, last].filter(Boolean).join(' ');
  const name = business || contact || (b.name || '').trim();
  return {
    name, business_name: business || null, first_name: first || null, last_name: last || null,
    email: b.email || null, phone: b.phone || null, address: b.address || null,
    city: b.city || null, state: b.state || null, zip: b.zip || null, notes: b.notes || null,
  };
}

router.post('/', async (req, res) => {
  const fields = customerFields(req.body);
  if (!fields.name) return res.status(400).json({ error: 'A business name or contact name is required' });
  const saved = await create('customers', uuid(), fields);
  res.status(201).json(saved);
});

router.put('/:id', async (req, res) => {
  const existing = await getById('customers', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Customer not found' });
  const fields = customerFields(req.body);
  if (!fields.name) return res.status(400).json({ error: 'A business name or contact name is required' });
  const saved = await update('customers', req.params.id, fields);
  res.json(saved);
});

router.delete('/:id', async (req, res) => {
  await remove('customers', req.params.id);
  res.json({ success: true });
});

module.exports = router;
