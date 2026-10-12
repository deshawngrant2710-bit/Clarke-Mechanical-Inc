import { useEffect, useState } from 'react';
import api from '../api/client';
import { Card, CardHeader, Btn, Modal, Input, Select, Textarea, Empty, Spinner } from './UI';
import { Wallet, Plus, Pencil, Trash2, Download } from 'lucide-react';

const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(String(d).length <= 10 ? String(d) + 'T00:00:00' : d);
  return isNaN(dt) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
};
const today = () => new Date().toISOString().slice(0, 10);
const blank = () => ({ date: today(), category: 'Materials & supplies', vendor: '', description: '', amount: '' });

// One-off business expenses, scoped to the report's date range. Recurring costs
// live in Subscriptions instead.
export default function ExpensesManager({ from, to, onChange }) {
  const [items, setItems] = useState(null);
  const [categories, setCategories] = useState([]);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const load = () => api.get('/expenses', { params: { from, to } }).then(r => setItems(r.data)).catch(() => setItems([]));
  useEffect(() => { setItems(null); load(); }, [from, to]);
  useEffect(() => { api.get('/expenses/categories').then(r => setCategories(r.data)).catch(() => {}); }, []);

  const total = (items || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const setField = (k, v) => setModal(m => ({ ...m, form: { ...m.form, [k]: v } }));

  const save = async () => {
    const f = modal.form;
    if (!(Number(f.amount) > 0)) { setErr('Enter an amount greater than zero'); return; }
    setSaving(true); setErr('');
    try {
      if (modal.id) await api.put(`/expenses/${modal.id}`, f); else await api.post('/expenses', f);
      setModal(null); await load(); onChange?.();
    } catch (e) { setErr(e.response?.data?.error || 'Could not save'); } finally { setSaving(false); }
  };
  const del = async (e) => {
    if (!window.confirm(`Delete this ${money(e.amount)} expense?`)) return;
    try { await api.delete(`/expenses/${e.id}`); await load(); onChange?.(); } catch { alert('Could not delete'); }
  };
  const exportCSV = () => {
    const rows = [['Date', 'Category', 'Vendor', 'Description', 'Amount'], ...(items || []).map(e => [e.date, e.category, e.vendor || '', e.description || '', e.amount])];
    const url = URL.createObjectURL(new Blob([rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `expenses-${from}-to-${to}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <Card className="mb-6">
      <CardHeader title="Expenses" subtitle={`One-off costs · total ${money(total)}`} icon={<Wallet size={15} />}
        action={<div className="flex gap-2">
          {(items || []).length > 0 && <Btn size="sm" variant="outline" onClick={exportCSV}><Download size={14} /> CSV</Btn>}
          <Btn size="sm" onClick={() => { setErr(''); setModal({ id: null, form: blank() }); }}><Plus size={14} /> Log expense</Btn>
        </div>} />
      {items === null ? <div className="p-5"><Spinner /></div> : items.length === 0 ? (
        <Empty icon={<Wallet size={22} />} title="No expenses in this range" message="Log materials, fuel, insurance and other one-off costs." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
              <th className="px-5 py-2.5 font-semibold">Date</th><th className="px-5 py-2.5 font-semibold">Category</th>
              <th className="px-5 py-2.5 font-semibold">Vendor / Note</th><th className="px-5 py-2.5 font-semibold text-right">Amount</th><th className="px-5 py-2.5"></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {items.map(e => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="px-5 py-2.5 text-slate-700 whitespace-nowrap">{fmtDate(e.date)}</td>
                  <td className="px-5 py-2.5 text-slate-700">{e.category}</td>
                  <td className="px-5 py-2.5 text-slate-500"><div className="font-medium text-slate-700">{e.vendor || '—'}</div>{e.description && <div className="text-xs text-slate-400">{e.description}</div>}</td>
                  <td className="px-5 py-2.5 text-right font-semibold text-slate-900 whitespace-nowrap">{money(e.amount)}</td>
                  <td className="px-5 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => { setErr(''); setModal({ id: e.id, form: { date: (e.date || '').slice(0, 10), category: e.category || 'Other', vendor: e.vendor || '', description: e.description || '', amount: e.amount ?? '' } }); }} className="text-slate-400 hover:text-blue-600 p-1"><Pencil size={15} /></button>
                    <button onClick={() => del(e)} className="text-slate-400 hover:text-red-600 p-1 ml-1"><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit expense' : 'Log expense'}
        footer={<><Btn variant="outline" onClick={() => setModal(null)}>Cancel</Btn><Btn onClick={save} loading={saving}>{modal?.id ? 'Save' : 'Add expense'}</Btn></>}>
        {modal && (
          <div className="space-y-4">
            {err && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{err}</div>}
            <div className="grid grid-cols-2 gap-3">
              <Input label="Date" type="date" value={modal.form.date} onChange={e => setField('date', e.target.value)} />
              <Input label="Amount" type="number" step="0.01" min="0" inputMode="decimal" value={modal.form.amount} onChange={e => setField('amount', e.target.value)} placeholder="0.00" />
            </div>
            <Select label="Category" value={modal.form.category} onChange={e => setField('category', e.target.value)}>
              {(categories.length ? categories : [modal.form.category]).map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Input label="Vendor (optional)" value={modal.form.vendor} onChange={e => setField('vendor', e.target.value)} placeholder="e.g. Home Depot, Con Edison" />
            <Textarea label="Description (optional)" value={modal.form.description} onChange={e => setField('description', e.target.value)} placeholder="What was this for?" />
          </div>
        )}
      </Modal>
    </Card>
  );
}
