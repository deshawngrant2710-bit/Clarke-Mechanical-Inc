import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, CardHeader, StatCard, Empty, Spinner } from '../components/UI';
import { CreditCard, DollarSign, Banknote } from 'lucide-react';

const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

export default function Payments() {
  const navigate = useNavigate();
  const [payments, setPayments] = useState(null);
  const [method, setMethod] = useState('all');

  useEffect(() => { api.get('/billing/payments').then(r => setPayments(r.data)).catch(() => setPayments([])); }, []);
  if (!payments) return <Spinner />;

  const filtered = payments.filter(p => method === 'all' || p.method === method);
  const total = filtered.reduce((s, p) => s + (p.amount || 0), 0);
  const methods = ['all', ...Array.from(new Set(payments.map(p => p.method || 'cash')))];

  return (
    <div className="animate-fade-in">
      <PageHeader title="Payments" subtitle={`${payments.length} recorded`} icon={<CreditCard size={20} />} />

      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatCard label={method === 'all' ? 'Total Collected' : `${method} total`} value={total} prefix="$" decimals={2} icon={<DollarSign size={18} />} color="green" />
        <StatCard label="Payments" value={filtered.length} icon={<Banknote size={18} />} color="blue" />
      </div>

      <Card>
        <CardHeader title="Payment History" icon={<CreditCard size={15} />}
          action={
            <select value={method} onChange={e => setMethod(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white outline-none capitalize cursor-pointer">
              {methods.map(m => <option key={m} value={m}>{m === 'all' ? 'All methods' : m}</option>)}
            </select>
          } />
        {filtered.length === 0 ? (
          <Empty icon={<CreditCard size={22} />} title="No payments" message="Recorded payments will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="px-5 py-2.5 font-semibold">Date</th>
                  <th className="px-5 py-2.5 font-semibold">Customer</th>
                  <th className="px-5 py-2.5 font-semibold">Invoice</th>
                  <th className="px-5 py-2.5 font-semibold">Method</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(p => (
                  <tr key={p.id} onClick={() => p.invoice_id && navigate(`/invoices/${p.invoice_id}`)} className={p.invoice_id ? 'cursor-pointer hover:bg-slate-50' : ''}>
                    <td className="px-5 py-3 text-slate-600">{fmtDate(p.paid_at)}</td>
                    <td className="px-5 py-3 text-slate-700">{p.customer_name || '—'}</td>
                    <td className="px-5 py-3 text-slate-500">{p.invoice_number || '—'}</td>
                    <td className="px-5 py-3 text-slate-600 capitalize">{p.method}{/pi_/.test(p.reference || '') ? ' (online)' : ''}</td>
                    <td className="px-5 py-3 text-right font-semibold text-emerald-600">{money(p.amount)}</td>
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
