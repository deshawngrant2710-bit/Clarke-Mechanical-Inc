import { useEffect, useState } from 'react';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, CardHeader, StatCard, Btn, Spinner, Empty, Input } from '../components/UI';
import { BarChart3, Download, DollarSign, AlertTriangle, Users, FileText, TrendingUp, TrendingDown, Landmark, Receipt, Percent } from 'lucide-react';
import { buildPnlHtml, printHtml } from '../lib/printDoc';
import ExpensesManager from '../components/ExpensesManager';
import SubscriptionsManager from '../components/SubscriptionsManager';

const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (v) => `$${Math.round(Number(v || 0)).toLocaleString('en-US')}`;
const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(String(d).length <= 10 ? String(d) + 'T00:00:00' : d);
  return isNaN(dt) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
};
const todayStr = () => new Date().toISOString().slice(0, 10);
const yearStart = () => `${new Date().getFullYear()}-01-01`;

function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Small % change pill vs the prior period.
function Delta({ pct, goodWhenUp = true }) {
  if (pct == null) return null;
  const up = pct >= 0;
  const good = goodWhenUp ? up : !up;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${good ? 'text-emerald-600' : 'text-red-500'}`}>
      <Icon size={12} /> {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// Lightweight SVG line chart for revenue / expenses / net over time.
function TrendChart({ data }) {
  const W = 720, H = 240, padL = 48, padR = 16, padT = 16, padB = 28;
  const n = data.length;
  if (!n) return <p className="text-sm text-slate-400 py-8 text-center">No data for this period.</p>;
  const max = Math.max(1, ...data.map(d => Math.max(d.revenue, d.expenses, d.net)));
  const min = Math.min(0, ...data.map(d => d.net));
  const span = max - min || 1;
  const x = (i) => padL + (n === 1 ? (W - padL - padR) / 2 : i * (W - padL - padR) / (n - 1));
  const y = (v) => H - padB - ((v - min) / span) * (H - padT - padB);
  const line = (key) => data.map((d, i) => `${x(i)},${y(d[key])}`).join(' ');
  const ticks = 4;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px]" style={{ height: 240 }}>
        {Array.from({ length: ticks + 1 }).map((_, i) => {
          const v = min + (span * i) / ticks;
          const yy = y(v);
          return (
            <g key={i}>
              <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="#eef2f7" />
              <text x={padL - 6} y={yy + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{money0(v)}</text>
            </g>
          );
        })}
        <polyline fill="none" stroke="#3b82f6" strokeWidth="2.5" points={line('revenue')} />
        <polyline fill="none" stroke="#ef4444" strokeWidth="2.5" points={line('expenses')} />
        <polyline fill="none" stroke="#10b981" strokeWidth="2" strokeDasharray="4 3" points={line('net')} />
        {data.map((d, i) => <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="#94a3b8">{d.label}</text>)}
      </svg>
      <div className="flex gap-4 justify-center text-xs mt-1">
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-blue-500 inline-block" /> Income</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-red-500 inline-block" /> Expenses</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-emerald-500 inline-block" /> Net profit</span>
      </div>
    </div>
  );
}

const AGING_COLS = [['current', 'Current'], ['d1_30', '1–30'], ['d31_60', '31–60'], ['d61_90', '61–90'], ['d90_plus', '90+']];

export default function Reports() {
  const [data, setData] = useState(null);
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(todayStr());
  const [pnl, setPnl] = useState(null);
  const [cash, setCash] = useState(null);
  const [aging, setAging] = useState(null);
  const [tax, setTax] = useState(null);

  useEffect(() => { api.get('/reports').then(r => setData(r.data)).catch(() => setData({})); }, []);
  useEffect(() => { api.get('/reports/cash').then(r => setCash(r.data)).catch(() => setCash(null)); }, []);
  useEffect(() => { api.get('/reports/ar-aging').then(r => setAging(r.data)).catch(() => setAging(null)); }, []);
  const loadRange = () => {
    api.get('/reports/pnl', { params: { from, to } }).then(r => setPnl(r.data)).catch(() => setPnl(null));
    api.get('/reports/tax', { params: { from, to } }).then(r => setTax(r.data)).catch(() => setTax(null));
  };
  useEffect(() => { loadRange(); }, [from, to]);

  const generatePnlPdf = async () => {
    if (!pnl) return;
    let business = {};
    try {
      const { data: b } = await api.get('/settings');
      business = { name: b.business_name, phone: b.business_phone, email: b.business_email, address: b.business_address, website: b.business_website };
    } catch { /* default name */ }
    printHtml(buildPnlHtml({ business, pnl }, { autoPrint: false }));
  };

  if (!data) return <Spinner />;

  const rev = pnl?.revenue?.total || 0;
  const exp = pnl?.expenses?.total || 0;
  const net = pnl ? (pnl.net_profit != null ? pnl.net_profit : rev - exp) : 0;
  const profit = net >= 0;
  const cmp = pnl?.compare;
  const techs = data.techPerformance || [];

  return (
    <div className="animate-fade-in">
      <PageHeader title="Financial Reports" subtitle="Profit & loss, cash, receivables, taxes, and performance" icon={<BarChart3 size={20} />} />

      {/* Controls */}
      <Card className="p-4 mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <Input label="From" type="date" value={from} onChange={e => setFrom(e.target.value)} />
          <Input label="To" type="date" value={to} onChange={e => setTo(e.target.value)} />
          <Btn variant="outline" size="sm" onClick={() => { setFrom(yearStart()); setTo(todayStr()); }}>This year</Btn>
          <div className="ml-auto">
            <Btn size="sm" onClick={generatePnlPdf} disabled={!pnl}><FileText size={14} /> Generate P&L (PDF)</Btn>
          </div>
        </div>
      </Card>

      {/* Overview cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold flex items-center gap-1"><Landmark size={13} /> Cash on hand</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{cash?.connected ? money(cash.total_available) : '—'}</div>
          <div className="text-xs text-slate-400 mt-0.5">{cash?.connected ? `${cash.institution} · as of ${fmtDate(cash.as_of)}` : 'Connect a bank in Banking'}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Income</div>
          <div className="text-xl font-bold text-emerald-600 mt-1">{money(rev)}</div>
          <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">vs prior <Delta pct={cmp?.revenue_change_pct} /></div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Expenses</div>
          <div className="text-xl font-bold text-red-600 mt-1">{money(exp)}</div>
          <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">vs prior <Delta pct={cmp?.expenses_change_pct} goodWhenUp={false} /></div>
        </div>
        <div className={`rounded-xl border p-4 ${profit ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
          <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">{profit ? 'Net profit' : 'Net loss'}</div>
          <div className={`text-xl font-bold mt-1 ${profit ? 'text-emerald-700' : 'text-red-700'}`}>{money(Math.abs(net))}</div>
          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">{((pnl?.margin || 0) * 100).toFixed(1)}% margin <Delta pct={cmp?.net_change_pct} /></div>
        </div>
      </div>

      {/* Trend chart */}
      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-card-title text-slate-800">Income, expenses & profit trend</h2>
          {cmp && <span className="text-xs text-slate-400">vs prior period {fmtDate(cmp.period.from)} – {fmtDate(cmp.period.to)}</span>}
        </div>
        {!pnl ? <Spinner /> : <TrendChart data={pnl.by_month || []} />}
      </Card>

      {/* Income by customer + Expenses by category */}
      {pnl && (
        <div className="grid md:grid-cols-2 gap-5 mb-6">
          <Card className="p-5">
            <h3 className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-3">Income by customer</h3>
            {(pnl.revenue?.by_customer || []).length === 0 ? <p className="text-sm text-slate-400">No income in this period.</p> : (
              <div className="divide-y divide-slate-100">
                {pnl.revenue.by_customer.slice(0, 8).map(c => (
                  <div key={c.name} className="flex items-center justify-between px-1 py-2 text-sm">
                    <span className="text-slate-700 truncate pr-2">{c.name}</span>
                    <span className="font-semibold text-emerald-600 whitespace-nowrap">{money(c.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className="p-5">
            <h3 className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-3">Expenses by category</h3>
            {(pnl.expenses?.by_category || []).length === 0 ? <p className="text-sm text-slate-400">No expenses in this period.</p> : (
              <div className="divide-y divide-slate-100">
                {pnl.expenses.by_category.slice(0, 8).map(c => (
                  <div key={c.name} className="flex items-center justify-between px-1 py-2 text-sm">
                    <span className="text-slate-700 truncate pr-2">{c.name}</span>
                    <span className="font-semibold text-red-600 whitespace-nowrap">{money(c.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* A/R Aging */}
      <Card className="mb-6">
        <CardHeader title="Accounts receivable aging" icon={<AlertTriangle size={15} />}
          action={aging?.by_customer?.length > 0 && <Btn size="sm" variant="outline" onClick={() => downloadCSV('ar-aging.csv', [['Customer', ...AGING_COLS.map(c => c[1]), 'Total'], ...aging.by_customer.map(r => [r.customer, ...AGING_COLS.map(c => r[c[0]]), r.total])])}><Download size={14} /> CSV</Btn>} />
        {!aging ? <div className="p-5"><Spinner /></div> : aging.totals.total === 0 ? (
          <Empty icon={<DollarSign size={22} />} title="Nothing outstanding" message="All invoices are paid — nice." />
        ) : (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-px bg-slate-100 border-y border-slate-100">
              {[...AGING_COLS, ['total', 'Total']].map(([k, lbl]) => (
                <div key={k} className="bg-white px-3 py-3 text-center">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{lbl}{k !== 'total' && k !== 'current' ? ' days' : ''}</div>
                  <div className={`text-sm font-bold mt-1 ${k === 'd90_plus' && aging.totals[k] > 0 ? 'text-red-600' : k === 'total' ? 'text-slate-900' : 'text-slate-700'}`}>{money(aging.totals[k])}</div>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                    <th className="px-5 py-2.5 font-semibold">Customer</th>
                    {AGING_COLS.map(c => <th key={c[0]} className="px-3 py-2.5 font-semibold text-right">{c[1]}</th>)}
                    <th className="px-5 py-2.5 font-semibold text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {aging.by_customer.map(r => (
                    <tr key={r.customer} className="hover:bg-slate-50">
                      <td className="px-5 py-2.5 text-slate-700 font-medium">{r.customer}</td>
                      {AGING_COLS.map(c => <td key={c[0]} className={`px-3 py-2.5 text-right ${c[0] === 'd90_plus' && r[c[0]] > 0 ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>{r[c[0]] > 0 ? money(r[c[0]]) : '—'}</td>)}
                      <td className="px-5 py-2.5 text-right font-semibold text-slate-900">{money(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* Tax summary */}
      <Card className="mb-6">
        <CardHeader title="Tax summary" subtitle={pnl ? `${fmtDate(from)} – ${fmtDate(to)}` : ''} icon={<Percent size={15} />} />
        {!tax ? <div className="p-5"><Spinner /></div> : (
          <div className="p-5 grid md:grid-cols-3 gap-5">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Sales tax collected</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{money(tax.sales_tax_collected)}</div>
              <p className="text-xs text-slate-400 mt-1">On paid invoices this period. Set aside for remittance.</p>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-2">Paid to vendors (1099)</div>
              {tax.vendor_payments.length === 0 ? <p className="text-sm text-slate-400">No vendor payments.</p> : (
                <div className="divide-y divide-slate-100">
                  {tax.vendor_payments.slice(0, 6).map(v => (
                    <div key={v.name} className="flex justify-between py-1.5 text-sm"><span className="text-slate-600 truncate pr-2">{v.name}</span><span className="font-medium text-slate-800">{money(v.amount)}</span></div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-2">Deductible expenses</div>
              {tax.deductible_expenses.length === 0 ? <p className="text-sm text-slate-400">No expenses logged.</p> : (
                <div className="divide-y divide-slate-100">
                  {tax.deductible_expenses.slice(0, 6).map(e => (
                    <div key={e.name} className="flex justify-between py-1.5 text-sm"><span className="text-slate-600 truncate pr-2">{e.name}</span><span className="font-medium text-slate-800">{money(e.amount)}</span></div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Expenses + recurring subscriptions (manage inline) */}
      <ExpensesManager from={from} to={to} onChange={loadRange} />
      <SubscriptionsManager onChange={loadRange} />

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
