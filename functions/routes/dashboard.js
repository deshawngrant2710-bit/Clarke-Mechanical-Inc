const express = require('express');
const { list, findWhere, nameMap } = require('../lib/db');
const { authMiddleware, requireStaff } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireStaff);

const today = () => new Date().toISOString().slice(0, 10);
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// Technicians get a personal, scoped dashboard — only their own jobs/schedule/hours,
// and NO company financials, customer list, other technicians, or reviews.
async function technicianDashboard(req, res) {
  const uid = req.user.id;
  const t = today();
  const [jobs, customers, myTime] = await Promise.all([
    list('jobs'), list('customers'), findWhere('time_entries', 'technician_id', uid),
  ]);
  const custName = Object.fromEntries(customers.map(c => [c.id, c.name]));
  const mine = jobs.filter(j => j.technician_id === uid);
  const active = mine.filter(j => !['completed', 'cancelled'].includes(j.status));
  const shape = (j) => ({
    id: j.id, title: j.title, status: j.status, priority: j.priority,
    scheduled_date: j.scheduled_date, scheduled_time: j.scheduled_time, address: j.address,
    customer_name: custName[j.customer_id] || null, job_type: j.job_type,
  });

  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const closed = myTime.filter(e => e.clock_out && e.hours != null);
  const hoursToday = closed.filter(e => (e.clock_in || '').slice(0, 10) === t).reduce((s, e) => s + e.hours, 0);
  const hoursWeek = closed.filter(e => (e.clock_in || '') >= weekAgo).reduce((s, e) => s + e.hours, 0);
  const openShift = myTime.find(e => !e.clock_out) || null;

  res.json({
    scope: 'technician',
    todayJobs: mine.filter(j => j.scheduled_date === t).length,
    openJobs: active.length,
    completedJobs: mine.filter(j => j.status === 'completed').length,
    completedToday: mine.filter(j => j.status === 'completed' && j.completed_date === t).length,
    emergencyJobs: active.filter(j => j.priority === 'urgent' || j.job_type === 'Emergency').length,
    hoursToday: Math.round(hoursToday * 100) / 100,
    hoursThisWeek: Math.round(hoursWeek * 100) / 100,
    onShift: !!openShift,
    todaysSchedule: mine.filter(j => j.scheduled_date === t)
      .sort((a, b) => (a.scheduled_time || '').localeCompare(b.scheduled_time || '')).map(shape),
    upcomingJobs: mine.filter(j => j.scheduled_date && j.scheduled_date > t && !['completed', 'cancelled'].includes(j.status))
      .sort((a, b) => (a.scheduled_date + (a.scheduled_time || '')).localeCompare(b.scheduled_date + (b.scheduled_time || ''))).slice(0, 5).map(shape),
    recentJobs: mine.filter(j => j.status === 'completed')
      .sort((a, b) => (b.completed_date || b.created_at || '').localeCompare(a.completed_date || a.created_at || '')).slice(0, 5).map(shape),
  });
}

router.get('/', async (req, res) => {
  if (req.user.role === 'technician') return technicianDashboard(req, res);

  const [customers, jobs, invoices, inventory, users, reviews] = await Promise.all([
    list('customers'), list('jobs'), list('invoices'), list('inventory'), list('users'), list('reviews'),
  ]);
  const t = today();
  const custName = Object.fromEntries(customers.map(c => [c.id, c.name]));
  const techName = Object.fromEntries(users.map(u => [u.id, u.name]));
  const paid = invoices.filter(i => i.status === 'paid');

  const openJobs = jobs.filter(j => !['completed', 'cancelled'].includes(j.status));
  const sum = (arr, f = 'total') => arr.reduce((s, x) => s + (x[f] || 0), 0);

  // Revenue by month (last 6, zero-filled) using issue_date
  const revMap = {};
  paid.forEach(i => { if (i.issue_date) { const k = i.issue_date.slice(0, 7); revMap[k] = (revMap[k] || 0) + (i.total || 0); } });
  const revenueByMonth = [];
  for (let n = 5; n >= 0; n--) {
    const d = new Date(); d.setMonth(d.getMonth() - n);
    const key = monthKey(d);
    revenueByMonth.push({ month: key, label: d.toLocaleDateString('en-US', { month: 'short' }), total: revMap[key] || 0 });
  }

  // Jobs by status
  const statusCounts = {};
  jobs.forEach(j => { statusCounts[j.status] = (statusCounts[j.status] || 0) + 1; });
  const jobsByStatus = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));

  const byCreated = (a, b) => (b.created_at || '').localeCompare(a.created_at || '');

  res.json({
    totalCustomers: customers.length,
    totalJobs: jobs.length,
    openJobs: openJobs.length,
    completedJobs: jobs.filter(j => j.status === 'completed').length,
    todayJobs: jobs.filter(j => j.scheduled_date === t).length,
    completedToday: jobs.filter(j => j.status === 'completed' && j.completed_date === t).length,
    emergencyJobs: jobs.filter(j => (j.priority === 'urgent' || j.job_type === 'Emergency') && !['completed', 'cancelled'].includes(j.status)).length,

    totalRevenue: sum(paid),
    pendingRevenue: sum(invoices.filter(i => ['sent', 'draft'].includes(i.status))),
    monthlyRevenue: sum(paid.filter(i => i.issue_date && i.issue_date.slice(0, 7) === t.slice(0, 7))),
    outstandingAmount: sum(invoices.filter(i => !['paid', 'cancelled'].includes(i.status))),
    totalInvoices: invoices.length,
    overdueInvoices: invoices.filter(i => i.status !== 'paid' && i.due_date && i.due_date < t).length,
    avgTicket: paid.length ? sum(paid) / paid.length : 0,

    lowStockItems: inventory.filter(i => (i.quantity || 0) <= (i.min_quantity || 0)).length,
    inventoryValue: inventory.reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0), 0),

    recentJobs: [...jobs].sort(byCreated).slice(0, 5).map(j => ({
      id: j.id, title: j.title, status: j.status, priority: j.priority,
      scheduled_date: j.scheduled_date, customer_name: custName[j.customer_id] || null,
    })),
    recentInvoices: [...invoices].sort(byCreated).slice(0, 5).map(i => ({
      id: i.id, invoice_number: i.invoice_number, status: i.status, total: i.total,
      due_date: i.due_date, customer_name: custName[i.customer_id] || null,
    })),
    todaysSchedule: jobs.filter(j => j.scheduled_date === t)
      .sort((a, b) => (a.scheduled_time || '').localeCompare(b.scheduled_time || ''))
      .map(j => ({
        id: j.id, title: j.title, status: j.status, priority: j.priority, scheduled_time: j.scheduled_time,
        address: j.address, customer_name: custName[j.customer_id] || null, technician_name: techName[j.technician_id] || null,
      })),
    technicians: users.filter(u => ['technician', 'dispatcher'].includes(u.role)).sort((a, b) => a.name.localeCompare(b.name)).map(u => ({
      id: u.id, name: u.name, role: u.role,
      active_jobs: jobs.filter(j => j.technician_id === u.id && j.status === 'in-progress').length,
      today_jobs: jobs.filter(j => j.technician_id === u.id && j.scheduled_date === t).length,
    })),
    jobsByStatus,
    revenueByMonth,
    reviewCount: reviews.length,
    avgRating: reviews.length ? reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length : 0,
    recentReviews: [...reviews].sort(byCreated).slice(0, 5).map(r => ({
      id: r.id, rating: r.rating, comment: r.comment, customer_name: r.customer_name, job_title: r.job_title, created_at: r.created_at,
    })),
  });
});

module.exports = router;
