const express = require('express');
const { list, getById } = require('../lib/db');
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

  const [payments, invoices, customers, expenses, pos, payroll, subscriptions] = await Promise.all([
    list('payments'), list('invoices'), list('customers'), list('expenses'), list('purchase_orders'), list('payroll_payments'), list('subscriptions'),
  ]);
  const subMonthly = (s) => { const a = Number(s.amount) || 0; return (s.frequency === 'yearly' || s.frequency === 'annual') ? a / 12 : a; };
  const monthlySubs = round2(subscriptions.filter(s => s.active !== false).reduce((s0, x) => s0 + subMonthly(x), 0));
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

  const months = monthSeries(from, to);
  // Recurring subscriptions: their monthly cost applies to every month in range.
  const subsForPeriod = round2(monthlySubs * months.length);
  if (subsForPeriod > 0) add('Software & subscriptions', subsForPeriod);

  const expensesTotal = round2(manualTotal + poTotal + payrollTotal + subsForPeriod);
  const net = round2(revenueTotal - expensesTotal);
  const margin = revenueTotal > 0 ? net / revenueTotal : 0;

  const by_month = months.map(m => ({
    month: m.key, label: m.label,
    revenue: round2(revByMonth[m.key] || 0),
    expenses: round2((expByMonth[m.key] || 0) + monthlySubs),
    net: round2((revByMonth[m.key] || 0) - ((expByMonth[m.key] || 0) + monthlySubs)),
  }));
  items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // Prior period of equal length immediately before `from`, for comparison.
  const fromD = new Date(from + 'T00:00:00'), toD = new Date(to + 'T00:00:00');
  const dayMs = 864e5;
  const priorTo = new Date(fromD.getTime() - dayMs).toISOString().slice(0, 10);
  const priorFrom = new Date(fromD.getTime() - dayMs - (toD - fromD)).toISOString().slice(0, 10);
  const sumIn = (arr, dateOf, amtOf, filt) => round2(arr.filter(x => (!filt || filt(x)) && inRange(d10(dateOf(x)), priorFrom, priorTo)).reduce((s, x) => s + (Number(amtOf(x)) || 0), 0));
  const pRev = sumIn(payments, p => p.paid_at, p => p.amount);
  const priorMonths = monthSeries(priorFrom, priorTo).length;
  const pExp = round2(
    sumIn(expenses, e => e.date, e => e.amount) +
    sumIn(pos, o => o.order_date || o.created_at, o => o.total, o => o.status !== 'cancelled') +
    sumIn(payroll, p => p.paid_at, p => p.amount) +
    (monthlySubs * priorMonths));
  const pNet = round2(pRev - pExp);
  const pct = (cur, prev) => (prev ? round2(((cur - prev) / Math.abs(prev)) * 100) : null);

  res.json({
    period: { from, to },
    revenue: { total: revenueTotal, payments: pays.length, by_customer: sortDesc(revByCust) },
    expenses: { total: expensesTotal, manual: manualTotal, purchase_orders: poTotal, payroll: payrollTotal, subscriptions: subsForPeriod, by_category: sortDesc(expByCat), items },
    net_profit: net, margin,
    by_month,
    compare: {
      period: { from: priorFrom, to: priorTo },
      revenue: pRev, expenses: pExp, net_profit: pNet,
      revenue_change_pct: pct(revenueTotal, pRev),
      expenses_change_pct: pct(expensesTotal, pExp),
      net_change_pct: pct(net, pNet),
    },
  });
});

// GET /api/reports/ar-aging — outstanding invoices bucketed by days past due.
router.get('/ar-aging', async (req, res) => {
  const [invoices, customers, paid] = await Promise.all([list('invoices'), list('customers'), paidMap()]);
  const custName = Object.fromEntries(customers.map(c => [c.id, c.name]));
  const today = new Date().toISOString().slice(0, 10);
  const open = invoices.filter(i => !['paid', 'cancelled', 'draft'].includes(i.status));
  const blankRow = () => ({ current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 });
  const totals = blankRow();
  const rows = {};
  for (const i of open) {
    const bal = balanceOf(i, paid);
    if (bal <= 0) continue;
    const due = d10(i.due_date || i.issue_date || today);
    const daysPast = Math.floor((new Date(today) - new Date(due)) / 864e5);
    const key = daysPast <= 0 ? 'current' : daysPast <= 30 ? 'd1_30' : daysPast <= 60 ? 'd31_60' : daysPast <= 90 ? 'd61_90' : 'd90_plus';
    const name = custName[i.customer_id] || 'Unknown';
    rows[name] = rows[name] || { customer: name, ...blankRow() };
    rows[name][key] += bal; rows[name].total += bal;
    totals[key] += bal; totals.total += bal;
  }
  const r2row = (r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'number' ? round2(v) : v]));
  res.json({
    as_of: today,
    totals: r2row(totals),
    by_customer: Object.values(rows).map(r2row).sort((a, b) => b.total - a.total),
  });
});

// GET /api/reports/cash — cash on hand from the connected bank (last synced balances).
router.get('/cash', async (req, res) => {
  const conn = await getById('bank_connection', 'default').catch(() => null);
  if (!conn) return res.json({ connected: false, total_available: 0, accounts: [] });
  const cash = (conn.accounts || []).filter(a => String(a.type || '').toLowerCase() !== 'credit');
  const total = round2(cash.reduce((s, a) => s + (Number(a.available != null ? a.available : a.current) || 0), 0));
  res.json({ connected: true, institution: conn.institution_name || 'Bank', as_of: conn.connected_at || null, total_available: total, accounts: cash });
});

// GET /api/reports/tax?from&to — sales tax collected, vendor payments (1099), deductible expenses.
router.get('/tax', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const from = req.query.from || `${new Date().getFullYear()}-01-01`;
  const to = req.query.to || today;
  const [invoices, pos, expenses] = await Promise.all([list('invoices'), list('purchase_orders'), list('expenses')]);

  let salesTax = 0; const taxByMonth = {};
  invoices.filter(i => i.status === 'paid' && inRange(d10(i.issue_date), from, to)).forEach(i => {
    const t = Number(i.tax_amount) || 0; salesTax += t;
    const k = d10(i.issue_date).slice(0, 7); taxByMonth[k] = (taxByMonth[k] || 0) + t;
  });

  const vendors = {};
  pos.filter(o => o.status !== 'cancelled' && inRange(d10(o.order_date || o.created_at), from, to))
    .forEach(o => { const n = o.vendor_name || 'Vendor'; vendors[n] = (vendors[n] || 0) + (Number(o.total) || 0); });

  const expCat = {};
  expenses.filter(e => inRange(d10(e.date), from, to))
    .forEach(e => { const c = e.category || 'Other'; expCat[c] = (expCat[c] || 0) + (Number(e.amount) || 0); });

  res.json({
    period: { from, to },
    sales_tax_collected: round2(salesTax),
    sales_tax_by_month: Object.entries(taxByMonth).map(([month, amount]) => ({ month, amount: round2(amount) })).sort((a, b) => a.month.localeCompare(b.month)),
    vendor_payments: sortDesc(vendors),
    deductible_expenses: sortDesc(expCat),
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
