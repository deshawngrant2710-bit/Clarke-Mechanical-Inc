import { useEffect, useState } from 'react';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, CardHeader, StatCard, Btn, Spinner, Empty } from '../components/UI';
import { BarChart3, Download, DollarSign, AlertTriangle, Users } from 'lucide-react';

const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

  useEffect(() => { api.get('/reports').then(r => setData(r.data)).catch(() => setData({})); }, []);
  if (!data) return <Spinner />;

  const revenue = data.revenueByMonth || [];
  const receivables = data.receivables || [];
  const techs = data.techPerformance || [];
  const maxRev = Math.max(1, ...revenue.map(r => r.total));

  return (
    <div className="animate-fade-in">
      <PageHeader title="Reports" subtitle="Revenue, receivables, and team performance" icon={<BarChart3 size={20} />} />

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
