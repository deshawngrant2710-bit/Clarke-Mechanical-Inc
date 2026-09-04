import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, CardHeader, StatCard, Empty, Spinner, SearchInput, Btn } from '../components/UI';
import { Mail, Search, CheckCircle2, AlertTriangle, RefreshCw, Send } from 'lucide-react';
import toast from 'react-hot-toast';

const fmtWhen = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
const LABEL = {
  invoice: 'Invoice', receipt: 'Receipt', quote: 'Estimate',
  invoice_reminder: 'Payment reminder', job_confirmation: 'Appointment confirmed', job_reminder: 'Appointment reminder',
};

export default function EmailLog() {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [busy, setBusy] = useState('');

  function load() {
    api.get('/email/log?limit=300').then(r => setRows(r.data)).catch(() => setRows([]));
  }
  useEffect(load, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    return rows.filter(r => {
      if (status !== 'all' && (r.status || '') !== status) return false;
      if (!needle) return true;
      return [r.to_email, r.to_name, r.subject, (r.cc_emails || []).join(' ')]
        .some(v => String(v || '').toLowerCase().includes(needle));
    });
  }, [rows, q, status]);

  const counts = useMemo(() => {
    const c = { sent: 0, failed: 0, simulated: 0 };
    (rows || []).forEach(r => { c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }, [rows]);

  async function resend(r) {
    setBusy(r.id);
    try {
      const { data } = await api.post(`/email/log/${r.id}/resend`);
      toast.success(`Re-sent to ${data.to}`);
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not resend'); }
    finally { setBusy(''); }
  }

  if (!rows) return <Spinner />;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Email Log" subtitle="Every message the system sent" icon={<Mail size={20} />}>
        <Btn variant="outline" onClick={load}><RefreshCw size={15} /> Refresh</Btn>
      </PageHeader>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Delivered to provider" value={counts.sent || 0} icon={<CheckCircle2 size={18} />} color="green" />
        <StatCard label="Failed" value={counts.failed || 0} icon={<AlertTriangle size={18} />} color="red" />
        <StatCard label="Not sent (no provider)" value={counts.simulated || 0} icon={<Send size={18} />} color="orange" />
      </div>

      {counts.failed > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{counts.failed} message{counts.failed === 1 ? '' : 's'} failed to send. Open the row to see why — a bad address or a provider rejection is the usual cause.</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <SearchInput className="flex-1" value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search by email address, name or subject…" icon={<Search size={16} />} />
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white outline-none cursor-pointer">
          <option value="all">All statuses</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="simulated">Not sent</option>
        </select>
      </div>

      <Card>
        <CardHeader title="Sent messages" icon={<Mail size={15} />} />
        {filtered.length === 0 ? (
          <Empty icon={<Mail size={22} />} title="Nothing here" message="Emails you send will be listed here with their delivery status." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="px-5 py-2.5 font-semibold">When</th>
                  <th className="px-5 py-2.5 font-semibold">Type</th>
                  <th className="px-5 py-2.5 font-semibold">To</th>
                  <th className="px-5 py-2.5 font-semibold">Subject</th>
                  <th className="px-5 py-2.5 font-semibold">Status</th>
                  <th className="px-5 py-2.5 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(r => (
                  <tr key={r.id} className="align-top">
                    <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{fmtWhen(r.sent_at)}</td>
                    <td className="px-5 py-3 text-slate-700">{LABEL[r.type] || r.type}</td>
                    <td className="px-5 py-3">
                      <div className="text-slate-800">{r.to_email || <span className="text-red-600">no address</span>}</div>
                      {r.to_name && <div className="text-[11px] text-slate-400">{r.to_name}</div>}
                      {(r.cc_emails || []).length > 0 && <div className="text-[11px] text-slate-400">cc: {r.cc_emails.join(', ')}</div>}
                    </td>
                    <td className="px-5 py-3 text-slate-600 max-w-[280px]">
                      <div className="truncate">{r.subject}</div>
                      {r.status === 'failed' && r.error && (
                        <div className="mt-1 text-[11px] text-red-600 whitespace-normal">{r.error}</div>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {r.status === 'sent' && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">Sent</span>}
                      {r.status === 'failed' && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">Failed</span>}
                      {r.status === 'simulated' && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full">Not sent</span>}
                      {r.sent_by && <div className="text-[11px] text-slate-400 mt-1">by {r.sent_by}</div>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => resend(r)} disabled={busy === r.id}
                        title="Send this message again"
                        className="text-slate-400 hover:text-blue-600 p-1.5 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-40">
                        <RefreshCw size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-slate-400 mt-4 leading-relaxed">
        “Sent” means your email provider accepted the message. It doesn’t guarantee the customer’s mail service put it in
        their inbox — spam filtering happens after that point. If a customer says they never got it, resend here, then
        send it directly as a PDF from the invoice page.
      </p>
    </div>
  );
}
