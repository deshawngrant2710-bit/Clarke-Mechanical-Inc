import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, Btn, Spinner, Empty, Modal, Input, Select, Textarea, StatCard } from '../components/UI';
import { Wallet, Plus, Pencil, Trash2, DollarSign, Receipt, Download } from 'lucide-react';

const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(String(d).length <= 10 ? String(d) + 'T00:00:00' : d);
  return isNaN(dt) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
};
const todayStr = () => new Date().toISOString().slice(0, 10);
const yearStart = () => `${new Date().getFullYear()}-01-01`;

const blank = () => ({ date: todayStr(), category: 'Materials & supplies', vendor: '', description: '', amount: '' });

export default function Expenses() {
  const [items, setItems] = useState(null);
  const [categories, setCategories] = useState([]);
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(todayStr());
  const [modal, setModal] = useState(null); // { form, id }
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const load = () => {
    setItems(null);
    api.get('/expenses', { params: { from, to } }).then(r => setItems(r.data)).catch(() => setItems([]));
  };
  useEffect(load, [from, to]);
  useEffect(() => { api.get('/expenses/categories').then(r => setCategories(r.data)).catch(() => {}); }, []);

  const total = useMemo(() => (items || []).reduce((s, e) => s + (Number(e.amount) || 0), 0), [items]);
  const byCat = useMemo(() => {
    const m = {};
    (items || []).forEach(e => { m[e.category || 'Other'] = (m[e.category || 'Other'] || 0) + (Number(e.amount) || 0); });
    return Object.entries(m).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
  }, [items]);

  const openNew = () => { setErr(''); setModal({ form: blank(), id: null }); };
  const openEdit = (e) => { setErr(''); setModal({ id: e.id, form: { date: (e.date || '').slice(0, 10), category: e.category || 'Other', vendor: e.vendor || '', description: e.description || '', amount: e.amount ?? '' } }); };

  const save = async () => {
    const f = modal.form;
    if (!(Number(f.amount) > 0)) { setErr('Enter an amount greater than zero'); return; }
    setSaving(true); setErr('');
    try {
      if (modal.id) await api.put(`/expenses/${modal.id}`, f);
      else await api.post('/expenses', f);
      setModal(null); load();
    } catch (e) { setErr(e.response?.data?.error || 'Could not save the expense'); }
    finally { setSaving(false); }
  };

  const del = async (e) => {
    if (!window.confirm(`Delete this ${money(e.amount)} expense?`)) return;
    try { await api.delete(`/expenses/${e.id}`); load(); } catch { alert('Could not delete'); }
  };

  const exportCSV = () => {
    const rows = [['Date', 'Category', 'Vendor', 'Description', 'Amount'],
      ...(items || []).map(e => [e.date, e.category, e.vendor || '', e.description || '', e.amount])];
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `expenses-${from}-to-${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const setField = (k, v) => setModal(m => ({ ...m, form: { ...m.form, [k]: v } }));

  return (
    <div className="animate-fade-in">
      <PageHeader title="Expenses" subtitle="Log business costs — materials, fuel, rent, insurance and more" icon={<Wallet size={20} />}
        action={<Btn onClick={openNew}><Plus size={16} /> Log expense</Btn>} />

      <div className="grid grid-cols-2 gap-4 mb-5">
        <StatCard label={`Total (${fmtDate(from)} – ${fmtDate(to)})`} value={total} prefix="$" decimals={2} icon={<DollarSign size={18} />} color="red" />
        <StatCard label="Entries" value={(items || []).length} icon={<Receipt size={18} />} color="blue" animate={false} />
      </div>

      <Card className="p-4 mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <Input label="From" type="date" value={from} onChange={e => setFrom(e.target.value)} />
          <Input label="To" type="date" value={to} onChange={e => setTo(e.target.value)} />
          <div className="ml-auto flex gap-2">
            <Btn variant="outline" size="sm" onClick={() => { setFrom(yearStart()); setTo(todayStr()); }}>This year</Btn>
            <Btn variant="outline" size="sm" onClick={exportCSV} disabled={!(items || []).length}><Download size={14} /> CSV</Btn>
          </div>
        </div>
      </Card>

      {byCat.length > 0 && (
        <Card className="p-4 mb-5">
          <h2 className="text-card-title text-slate-800 mb-3">By category</h2>
          <div className="flex flex-wrap gap-2">
            {byCat.map(c => (
              <span key={c.name} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm">
                <span className="text-slate-600">{c.name}</span>
                <span className="font-semibold text-slate-900">{money(c.amount)}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      {items === null ? <Spinner /> : items.length === 0 ? (
        <Empty icon={<Wallet size={22} />} title="No expenses in this range" message="Log your first expense to start tracking costs." action={<Btn onClick={openNew}><Plus size={16} /> Log expense</Btn>} />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="px-5 py-2.5 font-semibold">Date</th>
                  <th className="px-5 py-2.5 font-semibold">Category</th>
                  <th className="px-5 py-2.5 font-semibold">Vendor / Note</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Amount</th>
                  <th className="px-5 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map(e => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 text-slate-700 whitespace-nowrap">{fmtDate(e.date)}</td>
                    <td className="px-5 py-3 text-slate-700">{e.category}</td>
                    <td className="px-5 py-3 text-slate-500">
                      <div className="font-medium text-slate-700">{e.vendor || '—'}</div>
                      {e.description && <div className="text-xs text-slate-400">{e.description}</div>}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">{money(e.amount)}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <button onClick={() => openEdit(e)} className="text-slate-400 hover:text-blue-600 p-1" title="Edit"><Pencil size={15} /></button>
                      <button onClick={() => del(e)} className="text-slate-400 hover:text-red-600 p-1 ml-1" title="Delete"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit expense' : 'Log expense'}
        footer={<>
          <Btn variant="outline" onClick={() => setModal(null)}>Cancel</Btn>
          <Btn onClick={save} loading={saving}>{modal?.id ? 'Save' : 'Add expense'}</Btn>
        </>}>
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
    </div>
  );
}
