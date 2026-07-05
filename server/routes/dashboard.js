const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  const totalCustomers = db.prepare('SELECT COUNT(*) as c FROM customers').get().c;
  const totalJobs = db.prepare('SELECT COUNT(*) as c FROM jobs').get().c;
  const openJobs = db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status NOT IN ('completed', 'cancelled')").get().c;
  const completedJobs = db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status = 'completed'").get().c;
  const todayJobs = db.prepare("SELECT COUNT(*) as c FROM jobs WHERE scheduled_date = date('now')").get().c;
  const completedToday = db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status = 'completed' AND completed_date = date('now')").get().c;
  const emergencyJobs = db.prepare("SELECT COUNT(*) as c FROM jobs WHERE (priority = 'urgent' OR job_type = 'Emergency') AND status NOT IN ('completed','cancelled')").get().c;

  const totalRevenue = db.prepare("SELECT COALESCE(SUM(total), 0) as t FROM invoices WHERE status = 'paid'").get().t;
  const pendingRevenue = db.prepare("SELECT COALESCE(SUM(total), 0) as t FROM invoices WHERE status IN ('sent', 'draft')").get().t;
  const monthlyRevenue = db.prepare("SELECT COALESCE(SUM(total),0) as t FROM invoices WHERE status='paid' AND strftime('%Y-%m', issue_date) = strftime('%Y-%m','now')").get().t;
  const outstandingAmount = db.prepare("SELECT COALESCE(SUM(total),0) as t FROM invoices WHERE status != 'paid' AND status != 'cancelled'").get().t;
  const totalInvoices = db.prepare('SELECT COUNT(*) as c FROM invoices').get().c;
  const overdueInvoices = db.prepare("SELECT COUNT(*) as c FROM invoices WHERE status != 'paid' AND due_date < date('now')").get().c;
  const avgTicket = db.prepare("SELECT COALESCE(AVG(total),0) as t FROM invoices WHERE status='paid'").get().t;

  const lowStockItems = db.prepare('SELECT COUNT(*) as c FROM inventory WHERE quantity <= min_quantity').get().c;
  const inventoryValue = db.prepare('SELECT COALESCE(SUM(quantity * unit_price),0) as t FROM inventory').get().t;

  const recentJobs = db.prepare(`
    SELECT j.id, j.title, j.status, j.priority, j.scheduled_date, c.name as customer_name
    FROM jobs j LEFT JOIN customers c ON j.customer_id = c.id
    ORDER BY j.created_at DESC LIMIT 5
  `).all();

  const recentInvoices = db.prepare(`
    SELECT i.id, i.invoice_number, i.status, i.total, i.due_date, c.name as customer_name
    FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id
    ORDER BY i.created_at DESC LIMIT 5
  `).all();

  const todaysSchedule = db.prepare(`
    SELECT j.id, j.title, j.status, j.priority, j.scheduled_time, j.address,
           c.name as customer_name, u.name as technician_name
    FROM jobs j
    LEFT JOIN customers c ON j.customer_id = c.id
    LEFT JOIN users u ON j.technician_id = u.id
    WHERE j.scheduled_date = date('now')
    ORDER BY j.scheduled_time ASC
  `).all();

  const technicians = db.prepare(`
    SELECT u.id, u.name, u.role,
      (SELECT COUNT(*) FROM jobs j WHERE j.technician_id = u.id AND j.status = 'in-progress') as active_jobs,
      (SELECT COUNT(*) FROM jobs j WHERE j.technician_id = u.id AND j.scheduled_date = date('now')) as today_jobs
    FROM users u WHERE u.role IN ('technician','dispatcher') ORDER BY u.name ASC
  `).all();

  const jobsByStatus = db.prepare("SELECT status, COUNT(*) as count FROM jobs GROUP BY status").all();

  // Last 6 months of paid revenue, ascending, zero-filled
  const raw = db.prepare(`
    SELECT strftime('%Y-%m', issue_date) as month, SUM(total) as total
    FROM invoices WHERE status = 'paid' AND issue_date IS NOT NULL
    GROUP BY month
  `).all();
  const revMap = Object.fromEntries(raw.map(r => [r.month, r.total]));
  const revenueByMonth = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    revenueByMonth.push({
      month: key,
      label: d.toLocaleDateString('en-US', { month: 'short' }),
      total: revMap[key] || 0,
    });
  }

  res.json({
    totalCustomers, totalJobs, openJobs, completedJobs, todayJobs, completedToday, emergencyJobs,
    totalRevenue, pendingRevenue, monthlyRevenue, outstandingAmount, totalInvoices, overdueInvoices, avgTicket,
    lowStockItems, inventoryValue,
    recentJobs, recentInvoices, todaysSchedule, technicians, jobsByStatus, revenueByMonth,
  });
});

module.exports = router;
