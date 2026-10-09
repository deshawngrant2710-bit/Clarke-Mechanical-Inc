import { useEffect, useState } from 'react';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, CardHeader, StatCard, Btn, Spinner, Empty, Input } from '../components/UI';
import { BarChart3, Download, DollarSign, AlertTriangle, Users, FileText, TrendingUp, TrendingDown } from 'lucide-react';
import { buildPnlHtml, printHtml } from '../lib/printDoc';

const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(String(d).length <= 10 ? String(d) + 'T00:00:00' : d);
  return isNaN(dt) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
};
const todayStr = () => new Date().toISOString().slice(0, 10);
const yearStart = () => `${new Date().getFullYear()}-01-01`;

function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const [data, setData] = useState(null);
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(todayStr());
  const [pnl, setPnl] = useState(null);
  const [pnlLoading, setPnlLoading] = useState(false);

  useEffect(() => { api.get('/reports').then(r => setData(r.data)).catch(() => setData({})); }, []);
  useEffect(() => {
    setPnlLoading(true);
    api.get('/reports/pnl', { params: { from, to } })
      .then(r => setPnl(r.data)).catch(() => setPnl(null))
      .finally(() => setPnlLoading(false));
  }, [from, to]);

  const generatePnlPdf = async () => {
    if (!pnl) return;
    let business = {};
    try {
      const { data: b } = await api.get('/settings');
      business = { name: b.business_name, phone: b.business_phone, email: b.business_email, address: b.business_address, website: b.business_website };
    } catch { /* fall back to default name in the template */ }
    printHtml(buildPnlHtml({ business, pnl }, { autoPrint: false }));
  };

  if (!data) return <Spinner />;

  const revenue = data.revenueByMonth || [];
  const receivables = data.receivables || [];
  const techs = data.techPerformance || [];
  const maxRev = Math.max(1, ...revenue.map(r => r.total));

  return (
    <div className="animate-fade-in">
      <PageHeader title="Reports" subtitle="Profit & loss, revenue, receivables, and team performance" icon={<BarChart3 size={20} />} />

      {/* Income & Expense / Profit & Loss */}
      <Card className="p-5 mb-6">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <h2 className="text-card-title text-slate-800">Income & Expense (Profit & Loss)</h2>
            <p className="text-xs text-slate-500 mt-0.5">Income collected vs. money spent for the selected period.</p>
          </div>
          <div className="flex items-end gap-2">
            <Input label="From" type="date" value={from} onChange={e => setFrom(e.target.value)} />
            <Input label="To" type="date" value={to} onChange={e => setTo(e.target.value)} />
            <Btn variant="outline" size="sm" onClick={() => { setFrom(yearStart()); setTo(todayStr()); }}>This year</Btn>
            <Btn size="sm" onClick={generatePnlPdf} disabled={!pnl}><FileText size={14} /> Generate P&L (PDF)</Btn>
          </div>
        </div>

        {pnlLoading && !pnl ? <Spinner /> : !pnl ? (
          <Empty icon={<BarChart3 size={22} />} title="No data" message="Couldn't load the profit & loss figures." />
        ) : (() => {
          const rev = pnl.revenue?.total || 0;
          const exp = pnl.expenses?.total || 0;
          const net = pnl.net_profit != null ? pnl.net_profit : rev - exp;
          const profit = net >= 0;
          return (
            <>
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Total Income</div>
                  <div className="text-xl font-bold text-emerald-600 mt-1">{money(rev)}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{pnl.revenue?.payments || 0} payment{pnl.revenue?.payments === 1 ? '' : 's'}</div>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Total Expenses</div>
                  <div className="text-xl font-bold text-red-600 mt-1">{money(exp)}</div>
                  <div className="text-xs text-slate-400 mt-0.5">materials, payroll, overhead</div>
                </div>
                <div className={`rounded-xl border p-4 ${profit ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                  <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold flex items-center gap-1">{profit ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {profit ? 'Net Profit' : 'Net Loss'}</div>
                  <div className={`text-xl font-bold mt-1 ${profit ? 'text-emerald-700' : 'text-red-700'}`}>{money(Math.abs(net))}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{(pnl.margin * 100).toFixed(1)}% margin</div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-5">
                <div>
                  <h3 className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">Income by customer</h3>
                  {(pnl.revenue?.by_customer || []).length === 0 ? (
                    <p className="text-sm text-slate-400">No income in this period.</p>
                  ) : (
                    <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                      {pnl.revenue.by_customer.slice(0, 8).map(c => (
                        <div key={c.name} className="flex items-center justify-between px-3 py-2 text-sm">
                          <span className="text-slate-700 truncate pr-2">{c.name}</span>
                          <span className="font-semibold text-emerald-600 whitespace-nowrap">{money(c.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">Expenses by category</h3>
                  {(pnl.expenses?.by_category || []).length === 0 ? (
                    <p className="text-sm text-slate-400">No expenses in this period.</p>
                  ) : (
                    <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                      {pnl.expenses.by_category.slice(0, 8).map(c => (
                        <div key={c.name} className="flex items-center justify-between px-3 py-2 text-sm">
                          <span className="text-slate-700 truncate pr-2">{c.name}</span>
                          <span className="font-semibold text-red-600 whitespace-nowrap">{money(c.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          );
        })()}
      </Card>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatCard label="Revenue Collected" value={data.totalPaid} prefix="$" decimals={2} icon={<DollarSign size={18} />} color="green" />
        <StatCard label="Outstanding A/R" value={data.totalOutstanding} prefix="$" decimals={2} icon={<AlertTriangle size={18} />} color="red" />
      </div>

      {/* Revenue by month */}
      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-card-title text-slate-800">Revenue by month</h2>
          <Btn size="sm" variant="outline" onClick={() => downloadCSV('revenue-by-month.csv', [['Month', 'Revenue'], ...revenue.map(r => [r.month, r.total])])}><Download size={14} /> CSV</Btn>
        </div>
        <div className="flex items-end justify-between gap-2 h-40">
          {revenue.map(r => (
            <div key={r.month} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
              <span className="text-[10px] font-medium text-slate-500 h-3">{r.total ? `$${Math.round(r.total / 1000)}k` : ''}</span>
              <div className="w-full flex items-end justify-center flex-1">
                <div className="w-7 rounded-t bg-blue-500/80" style={{ height: r.total ? `${Math.max(4, Math.round((r.total / maxRev) * 100))}%` : '0%' }} title={money(r.total)} />
              </div>
              <span className="text-[10px] text-slate-400">{r.label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Outstanding by customer */}
      <Card className="mb-6">
        <CardHeader title="Outstanding by customer" icon={<AlertTriangle size={15} />}
          action={receivables.length > 0 && <Btn size="sm" variant="outline" onClick={() => downloadCSV('receivables.csv', [['Customer', 'Amount'], ...receivables.map(r => [r.customer, r.amount])])}><Download size={14} /> CSV</Btn>} />
        {receivables.length === 0 ? (
          <Empty icon={<DollarSign size={22} />} title="Nothing outstanding" message="All invoices are paid or there are none yet." />
        ) : (
          <div className="divide-y divide-slate-100">
            {receivables.map(r => (
              <div key={r.customer} className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-slate-700">{r.customer}</span>
                <span className="text-sm font-semibold text-red-600">{money(r.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Technician performance */}
      <Card>
        <CardHeader title="Technician performance" icon={<Users size={15} />}
          action={techs.length > 0 && <Btn size="sm" variant="outline" onClick={() => downloadCSV('tech-performance.csv', [['Technician', 'Completed jobs', 'Active jobs', 'Hours'], ...techs.map(t => [t.name, t.completedJobs, t.activeJobs, t.hours])])}><Download size={14} /> CSV</Btn>} />
        {techs.length === 0 ? (
          <Empty icon={<Users size={22} />} title="No technicians" message="Add technicians to see performance here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="px-5 py-2.5 font-semibold">Technician</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Completed</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Active</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {techs.map(t => (
                  <tr key={t.id}>
                    <td className="px-5 py-3 text-slate-700 font-medium">{t.name}</td>
                    <td className="px-5 py-3 text-right text-slate-700">{t.completedJobs}</td>
                    <td className="px-5 py-3 text-right text-slate-500">{t.activeJobs}</td>
                    <td className="px-5 py-3 text-right text-slate-700">{t.hours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
