const express = require('express');
const { list } = require('../lib/db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireRole('admin', 'office'));

router.get('/', async (req, res) => {
  const [invoices, jobs, users, customers, timeEntries] = await Promise.all([
    list('invoices'), list('jobs'), list('users'), list('customers'), list('time_entries'),
  ]);
  const custName = Object.fromEntries(customers.map(c => [c.id, c.name]));
  const paid = invoices.filter(i => i.status === 'paid');

  // Revenue by month (last 12, zero-filled)
  const revMap = {};
  paid.forEach(i => { if (i.issue_date) { const k = i.issue_date.slice(0, 7); revMap[k] = (revMap[k] || 0) + (i.total || 0); } });
  const revenueByMonth = [];
  for (let n = 11; n >= 0; n--) {
    const d = new Date(); d.setMonth(d.getMonth() - n);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    revenueByMonth.push({ month: key, label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), total: revMap[key] || 0 });
  }

  // Outstanding A/R by customer
  const arMap = {};
  invoices.filter(i => !['paid', 'cancelled'].includes(i.status)).forEach(i => {
    const name = custName[i.customer_id] || 'Unknown';
    arMap[name] = (arMap[name] || 0) + (i.total || 0);
  });
  const receivables = Object.entries(arMap).map(([customer, amount]) => ({ customer, amount })).sort((a, b) => b.amount - a.amount);

  // Technician performance
  const techPerformance = users.filter(u => u.role === 'technician').map(u => {
    const theirJobs = jobs.filter(j => j.technician_id === u.id);
    const hours = timeEntries.filter(e => e.technician_id === u.id).reduce((s, e) => s + (e.hours || 0), 0);
    return {
      id: u.id, name: u.name,
      completedJobs: theirJobs.filter(j => j.status === 'completed').length,
      activeJobs: theirJobs.filter(j => !['completed', 'cancelled'].includes(j.status)).length,
      hours: Math.round(hours * 10) / 10,
    };
  }).sort((a, b) => b.completedJobs - a.completedJobs);

  res.json({
    revenueByMonth,
    receivables,
    techPerformance,
    totalPaid: paid.reduce((s, i) => s + (i.total || 0), 0),
    totalOutstanding: invoices.filter(i => !['paid', 'cancelled'].includes(i.status)).reduce((s, i) => s + (i.total || 0), 0),
  });
});

module.exports = router;
