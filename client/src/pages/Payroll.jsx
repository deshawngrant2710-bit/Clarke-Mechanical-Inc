import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import {
  Card, Btn, Modal, Input, Select, Textarea, Empty, SkeletonPage,
  Table, Row, Cell, Badge,
} from '../components/UI';
import { Wallet, DollarSign, Settings2, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';

const money = (n) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const firstOfMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const today = () => new Date().toISOString().slice(0, 10);
const FREQ_LABEL = { none: '—', daily: '/day', weekly: '/week', biweekly: '/2 wks', monthly: '/month' };

export default function Payroll() {
  const { user } = useAuth();
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [workers, setWorkers] = useState(null);
  const [payments, setPayments] = useState([]);
  const [payFor, setPayFor] = useState(null);
  const [settingsFor, setSettingsFor] = useState(null);

  function load() {
    Promise.all([
      api.get(`/payroll/summary?from=${from}&to=${to}`),
      api.get(`/payroll/payments?from=${from}&to=${to}`),
    ]).then(([s, p]) => { setWorkers(s.data.workers); setPayments(p.data); });
  }
  useEffect(() => { if (user?.role === 'admin') load(); /* eslint-disable-next-line */ }, [from, to]);

  if (user?.role !== 'admin') {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Payroll" icon={<Wallet size={20} />} />
        <Card className="p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto mb-4"><ShieldAlert size={26} /></div>
          <p className="font-semibold text-slate-800">Admins only</p>
          <p className="text-sm text-slate-500 mt-1">You need administrator access to view payroll.</p>
        </Card>
      </div>
    );
  }

  if (!workers) return <SkeletonPage stats={0} />;

  const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  return (
    <div className="animate-fade-in">
      <PageHeader title="Payroll" subtitle="Figure out and record what your team is paid" icon={<Wallet size={20} />} />

      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500 bg-white" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500 bg-white" />
        </div>
        <span className="text-sm text-slate-500 ml-auto">Paid this period: <span className="font-semibold text-slate-800">{money(totalPaid)}</span></span>
      </div>

      <Card className="overflow-hidden mb-6">
        <Table head={[
          { label: 'Worker' }, { label: 'Pay setup' }, { label: 'Jobs', align: 'right' },
          { label: 'Per-job pay', align: 'right' }, { label: 'Paid (period)', align: 'right' }, { label: '', align: 'right' },
        ]}>
          {workers.map(w => (
            <Row key={w.id}>
              <Cell>
                <p className="font-semibold text-slate-800">{w.name}</p>
                <Badge status={w.role} />
              </Cell>
              <Cell>
                <div className="text-xs text-slate-500 space-y-0.5">
                  <p>{w.pay_per_job > 0 ? `${money(w.pay_per_job)} / job` : 'No per-job rate'}</p>
                  <p>{w.salary_amount > 0 ? `${money(w.salary_amount)}${FREQ_LABEL[w.salary_frequency] || ''} salary` : 'No salary'}</p>
                </div>
              </Cell>
              <Cell align="right"><span className="tabular-nums">{w.jobs_count}</span></Cell>
              <Cell align="right"><span className="font-medium text-slate-800 tabular-nums">{money(w.per_job_pay)}</span></Cell>
              <Cell align="right"><span className="tabular-nums text-slate-600">{money(w.paid_in_range)}</span></Cell>
              <Cell align="right">
                <div className="flex items-center justify-end gap-1.5">
                  <button onClick={() => setSettingsFor(w)} className="p-1.5 text-slate-400 hover:text-blue-600" title="Pay settings"><Settings2 size={15} /></button>
                  <Btn size="sm" onClick={() => setPayFor(w)}><DollarSign size={14} /> Pay</Btn>
                </div>
              </Cell>
            </Row>
          ))}
        </Table>
      </Card>

      <h2 className="text-card-title text-slate-800 mb-2">Payment history</h2>
      <Card className="overflow-hidden">
        {payments.length === 0 ? (
          <Empty icon={<Wallet size={26} />} title="No payments in this period" message="Record a payment above and it'll show here." />
        ) : (
          <Table head={[{ label: 'Worker' }, { label: 'Date' }, { label: 'Method' }, { label: 'Notes' }, { label: 'Amount', align: 'right' }]}>
            {payments.map(p => (
              <Row key={p.id}>
                <Cell><span className="font-medium text-slate-800">{p.user_name}</span></Cell>
                <Cell><span className="text-sm text-slate-600">{(p.paid_at || '').slice(0, 10)}</span></Cell>
                <Cell><span className="text-sm text-slate-500 capitalize">{p.method}</span></Cell>
                <Cell><span className="text-sm text-slate-500">{p.notes || '—'}</span></Cell>
                <Cell align="right"><span className="font-semibold text-slate-800 tabular-nums">{money(p.amount)}</span></Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <PayModal worker={payFor} range={{ from, to }} onClose={() => setPayFor(null)} onDone={load} />
      <PaySettingsModal worker={settingsFor} onClose={() => setSettingsFor(null)} onDone={load} />
    </div>
  );
}

function PayModal({ worker, range, onClose, onDone }) {
  const [form, setForm] = useState({ amount: '', method: 'zelle', notes: '', paid_at: today() });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (worker) setForm({ amount: worker.per_job_pay > 0 ? String(worker.per_job_pay) : '', method: 'zelle', notes: '', paid_at: today() });
  }, [worker]);

  async function save() {
    if (!(Number(form.amount) > 0)) return toast.error('Enter a payment amount');
    setSaving(true);
    try {
      await api.post('/payroll/payments', {
        user_id: worker.id, amount: Number(form.amount), method: form.method, notes: form.notes,
        paid_at: new Date(form.paid_at).toISOString(), period_from: range.from, period_to: range.to,
      });
      toast.success(`Recorded payment to ${worker.name}`);
      onClose(); onDone();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not record payment'); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={!!worker} onClose={onClose} title={`Pay ${worker?.name || ''}`} subtitle="Record a payment to this worker" size="sm">
      {worker && (
        <div className="space-y-3">
          <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3">
            {worker.jobs_count} completed job{worker.jobs_count === 1 ? '' : 's'} this period · per-job pay {money(worker.per_job_pay)}
            {worker.salary_amount > 0 && <> · salary {money(worker.salary_amount)}{FREQ_LABEL[worker.salary_frequency] || ''}</>}
          </div>
          <Input label="Amount ($) *" type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Method" value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))}>
              <option value="zelle">Zelle</option>
              <option value="cash">Cash</option>
              <option value="check">Check</option>
              <option value="bank">Bank transfer</option>
              <option value="other">Other</option>
            </Select>
            <Input label="Date" type="date" value={form.paid_at} onChange={e => setForm(f => ({ ...f, paid_at: e.target.value }))} />
          </div>
          <Textarea label="Notes (optional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. week of Jul 7, includes salary" />
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="outline" onClick={onClose}>Cancel</Btn>
            <Btn onClick={save} loading={saving}>Record Payment</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

function PaySettingsModal({ worker, onClose, onDone }) {
  const [form, setForm] = useState({ pay_per_job: '', salary_amount: '', salary_frequency: 'none' });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (worker) setForm({
      pay_per_job: worker.pay_per_job ? String(worker.pay_per_job) : '',
      salary_amount: worker.salary_amount ? String(worker.salary_amount) : '',
      salary_frequency: worker.salary_frequency || 'none',
    });
  }, [worker]);

  async function save() {
    setSaving(true);
    try {
      await api.put(`/employees/${worker.id}/pay`, {
        pay_per_job: Number(form.pay_per_job) || 0,
        salary_amount: Number(form.salary_amount) || 0,
        salary_frequency: form.salary_frequency,
      });
      toast.success('Pay settings saved');
      onClose(); onDone();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not save'); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={!!worker} onClose={onClose} title={`Pay settings — ${worker?.name || ''}`} size="sm">
      {worker && (
        <div className="space-y-3">
          <Input label="Pay per completed job ($)" type="number" min="0" step="0.01" value={form.pay_per_job} onChange={e => setForm(f => ({ ...f, pay_per_job: e.target.value }))} placeholder="0.00" hint="Leave blank if this worker isn't paid per job" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Salary amount ($)" type="number" min="0" step="0.01" value={form.salary_amount} onChange={e => setForm(f => ({ ...f, salary_amount: e.target.value }))} placeholder="0.00" />
            <Select label="Salary frequency" value={form.salary_frequency} onChange={e => setForm(f => ({ ...f, salary_frequency: e.target.value }))}>
              <option value="none">None</option>
              <option value="daily">Per day</option>
              <option value="weekly">Per week</option>
              <option value="biweekly">Every 2 weeks</option>
              <option value="monthly">Per month</option>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="outline" onClick={onClose}>Cancel</Btn>
            <Btn onClick={save} loading={saving}>Save</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}
