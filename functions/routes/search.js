const express = require('express');
const { list } = require('../lib/db');
const { authMiddleware, requireStaff } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireStaff);

// GET /search?q= — quick lookup across customers, jobs, invoices, and estimates.
router.get('/', async (req, res) => {
  const q = (req.query.q || '').toString().trim().toLowerCase();
  if (q.length < 2) return res.json({ customers: [], jobs: [], invoices: [], quotes: [] });

  const [customers, jobs, invoices, quotes] = await Promise.all([
    list('customers'), list('jobs'), list('invoices'), list('quotes'),
  ]);
  const custName = Object.fromEntries(customers.map(c => [c.id, c.name]));
  const has = (s) => (s || '').toString().toLowerCase().includes(q);

  res.json({
    customers: customers.filter(c => has(c.name) || has(c.email) || has(c.phone)).slice(0, 8)
      .map(c => ({ id: c.id, name: c.name, email: c.email || null })),
    jobs: jobs.filter(j => has(j.title) || has(custName[j.customer_id])).slice(0, 8)
      .map(j => ({ id: j.id, title: j.title, status: j.status, customer_name: custName[j.customer_id] || null })),
    invoices: invoices.filter(i => has(i.invoice_number) || has(custName[i.customer_id])).slice(0, 8)
      .map(i => ({ id: i.id, invoice_number: i.invoice_number, total: i.total, status: i.status, customer_name: custName[i.customer_id] || null })),
    quotes: quotes.filter(x => has(x.quote_number) || has(custName[x.customer_id])).slice(0, 8)
      .map(x => ({ id: x.id, quote_number: x.quote_number, status: x.status, customer_name: custName[x.customer_id] || null })),
  });
});

module.exports = router;
