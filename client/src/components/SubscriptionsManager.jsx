import { useEffect, useState } from 'react';
import api from '../api/client';
import { Card, CardHeader, Btn, Modal, Input, Select, Empty, Spinner } from './UI';
import { RefreshCw, Plus, Pencil, Trash2 } from 'lucide-react';

const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthlyOf = (s) => { const a = Number(s.amount) || 0; return s.frequency === 'yearly' ? a / 12 : a; };
const today = () => new Date().toISOString().slice(0, 10);
const blank = () => ({ name: '', amount: '', frequency: 'monthly', category: 'Software & subscriptions', notes: '', start_date: today() });

// Recurring subscriptions the business pays (software, tools, recurring fees).
// Their monthly cost flows into the Profit & Loss automatically.
export default function SubscriptionsManager({ onChange }) {
  const [data, setData] = useState(null);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const load = () => api.get('/subscriptions').then(r => setData(r.data)).catch(() => setData({ items: [], total_monthly: 0, total_annual: 0 }));
  useEffect(() => { load(); }, []);

  const setField = (k, v) => setModal(m => ({ ...m, form: { ...m.form, [k]: v } }));
  const save = async () => {
    const f = modal.form;
    if (!f.name.trim()) { setErr('Enter a name'); return; }
    if (!(Number(f.amount) > 0)) { setErr('Enter an amount greater than zero'); return; }
    setSaving(true); setErr('');
    try {
      if (modal.id) await api.put(`/subscriptions/${modal.id}`, f); else await api.post('/subscriptions', f);
      setModal(null); await load(); onChange?.();
    } catch (e) { setErr(e.response?.data?.error || 'Could not save'); } finally { setSaving(false); }
  };
  const del = async (s) => {
    if (!window.confirm(`Remove "${s.name}"?`)) return;
    try { await api.delete(`/subscriptions/${s.id}`); await load(); onChange?.(); } catch { alert('Could not delete'); }
  };

  const items = data?.items || [];

  return (
    <Card className="mb-6">
      <CardHeader title="Recurring subscriptions" icon={<RefreshCw size={15} />}
        subtitle={data ? `${money(data.total_monthly)}/mo · ${money(data.total_annual)}/yr` : ''}
        action={<Btn size="sm" onClick={() => { setErr(''); setModal({ id: null, form: blank() }); }}><Plus size={14} /> Add subscription</Btn>} />
      {!data ? <div className="p-5"><Spinner /></div> : items.length === 0 ? (
        <Empty icon={<RefreshCw size={22} />} title="No subscriptions yet" message="Add recurring costs like software, Stripe/Quo fees, or tools. They count toward your monthly spending automatically." />
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map(s => (
            <div key={s.id} className={`flex items-center justify-between px-5 py-3 ${s.active === false ? 'opacity-50' : ''}`}>
              <div className="min-w-0">
                <div className="font-medium text-slate-800">{s.name} {s.active === false && <span className="text-xs text-slate-400">(paused)</span>}</div>
                <div className="text-xs text-slate-400">{s.category}{s.notes ? ` · ${s.notes}` : ''}</div>
              </div>
              <div className="flex items-center gap-3 whitespace-nowrap">
                <div className="text-right">
                  <div className="font-semibold text-slate-900">{money(s.amount)}<span className="text-xs text-slate-400 font-normal">/{s.frequency === 'yearly' ? 'yr' : 'mo'}</span></div>
                  {s.frequency === 'yearly' && <div className="text-xs text-slate-400">{money(monthlyOf(s))}/mo</div>}
                </div>
                <button onClick={() => { setErr(''); setModal({ id: s.id, form: { name: s.name, amount: s.amount, frequency: s.frequency, category: s.category, notes: s.notes || '', active: s.active, start_date: (s.start_date || '').slice(0, 10) } }); }} className="text-slate-400 hover:text-blue-600 p-1"><Pencil size={15} /></button>
                <button onClick={() => del(s)} className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit subscription' : 'Add subscription'}
        footer={<><Btn variant="outline" onClick={() => setModal(null)}>Cancel</Btn><Btn onClick={save} loading={saving}>{modal?.id ? 'Save' : 'Add'}</Btn></>}>
        {modal && (
          <div className="space-y-4">
            {err && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{err}</div>}
            <Input label="Name" value={modal.form.name} onChange={e => setField('name', e.target.value)} placeholder="e.g. QuickBooks, Stripe, Quo" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Amount" type="number" step="0.01" min="0" inputMode="decimal" value={modal.form.amount} onChange={e => setField('amount', e.target.value)} placeholder="0.00" />
              <Select label="Billed" value={modal.form.frequency} onChange={e => setField('frequency', e.target.value)}>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </Select>
            </div>
            <Input label="Started" type="date" value={modal.form.start_date || ''} onChange={e => setField('start_date', e.target.value)} hint="Counts from this month onward — set an earlier date if it started before." />
            <Input label="Category (optional)" value={modal.form.category} onChange={e => setField('category', e.target.value)} />
            <Input label="Note (optional)" value={modal.form.notes} onChange={e => setField('notes', e.target.value)} placeholder="What it's for" />
            {modal.id && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={modal.form.active !== false} onChange={e => setField('active', e.target.checked)} /> Active (counts toward spending)
              </label>
            )}
          </div>
        )}
      </Modal>
    </Card>
  );
}
