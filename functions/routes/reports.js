const express = require('express');
const { list } = require('../lib/db');
const { paidMap, balanceOf } = require('../lib/outstanding');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireRole('admin', 'office'));

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const d10 = (s) => String(s || '').slice(0, 10);
const inRange = (d, from, to) => (!from || d >= from) && (!to || d <= to);
const sortDesc = (obj) => Object.entries(obj).map(([k, v]) => ({ name: k, amount: round2(v) })).sort((a, b) => b.amount - a.amount);
function monthSeries(from, to) {
  const out = [];
  const s = new Date(from + 'T00:00:00'); const e = new Date(to + 'T00:00:00');
  let y = s.getFullYear(), m = s.getMonth();
  for (let guard = 0; guard < 120; guard++) {
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    out.push({ key, label: new Date(y, m, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) });
    if (y === e.getFullYear() && m === e.getMonth()) break;
    m++; if (m > 11) { m = 0; y++; }
  }
  return out;
}

// GET /api/reports/pnl?from=YYYY-MM-DD&to=YYYY-MM-DD — Profit & Loss.
// Revenue = cash collected (payments) in the period; Expenses = manual expenses +
// purchase orders + payroll paid in the period. Nets to profit/loss, broken down
// by customer (income) and by category/source (expenses).
router.get('/pnl', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const from = req.query.from || `${new Date().getFullYear()}-01-01`;
  const to = req.query.to || today;

  const [payments, invoices, customers, expenses, pos, payroll] = await Promise.all([
    list('payments'), list('invoices'), list('customers'), list('expenses'), list('purchase_orders'), list('payroll_payments'),
  ]);
  const custName = Object.fromEntries(customers.map(c => [c.id, c.name]));
  const invCustomer = Object.fromEntries(invoices.map(i => [i.id, i.customer_id]));
  const mk = (s) => d10(s).slice(0, 7);

  // ---- Revenue (cash received) ----
  const pays = payments.filter(p => inRange(d10(p.paid_at), from, to));
  const revenueTotal = round2(pays.reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const revByCust = {}, revByMonth = {};
  for (const p of pays) {
    const amt = Number(p.amount) || 0;
    const name = custName[invCustomer[p.invoice_id]] || 'Other / unassigned';
    revByCust[name] = (revByCust[name] || 0) + amt;
    revByMonth[mk(p.paid_at)] = (revByMonth[mk(p.paid_at)] || 0) + amt;
  }

  // ---- Expenses ----
  const expByCat = {}, expByMonth = {}, items = [];
  const add = (cat, amt) => { expByCat[cat] = (expByCat[cat] || 0) + amt; };
  const addM = (key, amt) => { expByMonth[key] = (expByMonth[key] || 0) + amt; };

  const manual = expenses.filter(e => inRange(d10(e.date), from, to));
  for (const e of manual) {
    const amt = Number(e.amount) || 0;
    add(e.category || 'Other', amt); addM(mk(e.date), amt);
    items.push({ date: d10(e.date), category: e.category || 'Other', source: 'expense', name: e.vendor || e.description || e.category || 'Expense', amount: round2(amt) });
  }
  const manualTotal = round2(manual.reduce((s, e) => s + (Number(e.amount) || 0), 0));

  const poIn = pos.filter(o => o.status !== 'cancelled' && inRange(d10(o.order_date || o.created_at), from, to));
  const poTotal = round2(poIn.reduce((s, o) => s + (Number(o.total) || 0), 0));
  for (const o of poIn) {
    const amt = Number(o.total) || 0; if (!amt) continue;
    add('Materials & parts (purchase orders)', amt); addM(mk(o.order_date || o.created_at), amt);
    items.push({ date: d10(o.order_date || o.created_at), category: 'Materials & parts (purchase orders)', source: 'purchase_order', name: `PO ${o.po_number || ''} — ${o.vendor_name || 'Vendor'}`.trim(), amount: round2(amt) });
  }

  const payrollIn = payroll.filter(p => inRange(d10(p.paid_at), from, to));
  const payrollTotal = round2(payrollIn.reduce((s, p) => s + (Number(p.amount) || 0), 0));
  for (const p of payrollIn) {
    const amt = Number(p.amount) || 0; if (!amt) continue;
    add('Payroll & labor', amt); addM(mk(p.paid_at), amt);
    items.push({ date: d10(p.paid_at), category: 'Payroll & labor', source: 'payroll', name: `Payroll — ${p.user_name || 'Employee'}`, amount: round2(amt) });
  }

  const expensesTotal = round2(manualTotal + poTotal + payrollTotal);
  const net = round2(revenueTotal - expensesTotal);
  const margin = revenueTotal > 0 ? net / revenueTotal : 0;

  const months = monthSeries(from, to);
  const by_month = months.map(m => ({
    month: m.key, label: m.label,
    revenue: round2(revByMonth[m.key] || 0), expenses: round2(expByMonth[m.key] || 0),
    net: round2((revByMonth[m.key] || 0) - (expByMonth[m.key] || 0)),
  }));
  items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  res.json({
    period: { from, to },
    revenue: { total: revenueTotal, payments: pays.length, by_customer: sortDesc(revByCust) },
    expenses: { total: expensesTotal, manual: manualTotal, purchase_orders: poTotal, payroll: payrollTotal, by_category: sortDesc(expByCat), items },
    net_profit: net, margin,
    by_month,
  });
});

router.get('/', async (req, res) => {
  const [invoices, jobs, users, customers, timeEntries, paidBy] = await Promise.all([
    list('invoices'), list('jobs'), list('users'), list('customers'), list('time_entries'), paidMap(),
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
    arMap[name] = (arMap[name] || 0) + balanceOf(i, paidBy);
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
    totalPaid: Object.values(paidBy).reduce((s, v) => s + v, 0),
    totalOutstanding: invoices.filter(i => !['paid', 'cancelled'].includes(i.status)).reduce((s, i) => s + balanceOf(i, paidBy), 0),
  });
});

module.exports = router;
