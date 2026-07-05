import { useEffect, useState } from 'react';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import {
  Card, Btn, Badge, Modal, Input, Select, Textarea, Empty, SkeletonPage,
  StatCard, SearchInput, Table, Row, Cell,
} from '../components/UI';
import { Plus, Search, Trash2, PlusCircle, MinusCircle, ClipboardList, CheckCircle, Send, DollarSign, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import { sendEmail } from '../lib/email';

const emptyItem = () => ({ description: '', quantity: 1, unit_price: 0 });
const emptyForm = () => ({ customer_id: '', status: 'draft', issue_date: new Date().toISOString().slice(0, 10), expiry_date: '', items: [emptyItem()], tax_rate: 0.0875, notes: '' });
const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Quotes() {
  const [quotes, setQuotes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  function load() {
    Promise.all([api.get('/billing/quotes'), api.get('/customers')])
      .then(([q, c]) => { setQuotes(q.data); setCustomers(c.data); setLoading(false); });
  }
  useEffect(load, []);

  const filtered = quotes.filter(q =>
    q.quote_number?.toLowerCase().includes(search.toLowerCase()) ||
    q.customer_name?.toLowerCase().includes(search.toLowerCase()));

  const stats = {
    total: quotes.length,
    accepted: quotes.filter(q => q.status === 'accepted').length,
    pending: quotes.filter(q => q.status === 'sent').length,
    value: quotes.filter(q => q.status === 'accepted').reduce((s, q) => s + q.total, 0),
  };

  function setItem(idx, key, val) {
    setForm(f => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [key]: key === 'description' ? val : Number(val) };
      return { ...f, items };
    });
  }
  const subtotal = form.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const tax = subtotal * form.tax_rate;
  const total = subtotal + tax;

  async function handleSave() {
    setSaving(true);
    try {
      await api.post('/billing/quotes', form);
      toast.success('Quote created');
      setModal(false); setForm(emptyForm()); load();
    } catch { toast.error('Error creating quote'); }
    finally { setSaving(false); }
  }
  async function handleDelete(e, id) {
    e.stopPropagation();
    if (!confirm('Delete quote?')) return;
    await api.delete(`/billing/quotes/${id}`);
    toast.success('Deleted'); load();
  }
  async function handleEmail(e, id) {
    e.stopPropagation();
    try { await sendEmail('quote', id, 'Quote'); load(); } catch { /* toast handled */ }
  }

  if (loading) return <SkeletonPage stats={4} />;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Quotes" subtitle={`${quotes.length} estimates`} icon={<ClipboardList size={20} />}>
        <Btn onClick={() => setModal(true)}><Plus size={16} /> New Quote</Btn>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Quotes" value={stats.total} icon={<ClipboardList size={18} />} color="blue" />
        <StatCard label="Accepted" value={stats.accepted} icon={<CheckCircle size={18} />} color="green" />
        <StatCard label="Awaiting Response" value={stats.pending} icon={<Send size={18} />} color="orange" />
        <StatCard label="Won Value" value={stats.value} prefix="$" decimals={0} icon={<DollarSign size={18} />} color="purple" />
      </div>

      <SearchInput className="mb-4" value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by quote # or customer…" icon={<Search size={16} />} />

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <Empty icon={<ClipboardList size={28} />}
            title={search ? 'No matching quotes' : 'No quotes yet'}
            message={search ? 'Try a different search.' : 'Create a professional estimate to win new work.'}
            action={!search && <Btn onClick={() => setModal(true)}><Plus size={16} /> New Quote</Btn>} />
        ) : (
          <Table head={[
            { label: 'Quote #' }, { label: 'Customer' }, { label: 'Expires' },
            { label: 'Amount', align: 'right' }, { label: 'Status', align: 'right' }, { label: '', align: 'right' },
          ]}>
            {filtered.map(q => (
              <Row key={q.id}>
                <Cell><span className="font-semibold text-slate-800">{q.quote_number}</span></Cell>
                <Cell><span className="text-sm text-slate-600">{q.customer_name || <span className="text-slate-300">—</span>}</span></Cell>
                <Cell><span className="text-sm text-slate-500">{q.expiry_date || 'N/A'}</span></Cell>
                <Cell align="right"><span className="text-sm font-semibold text-slate-800">{money(q.total)}</span></Cell>
                <Cell align="right"><Badge status={q.status} /></Cell>
                <Cell align="right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={e => handleEmail(e, q.id)} title="Email quote to customer" className="text-slate-400 hover:text-blue-600 p-1.5 hover:bg-blue-50 rounded-lg transition-colors"><Mail size={15} /></button>
                    <button onClick={e => handleDelete(e, q.id)} title="Delete quote" className="text-slate-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={15} /></button>
                  </div>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="New Quote" subtitle="Build a professional estimate">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Select label="Customer" value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))}>
              <option value="">Select customer</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select label="Status" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="accepted">Accepted</option>
              <option value="declined">Declined</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Issue Date" type="date" value={form.issue_date} onChange={e => setForm(f => ({ ...f, issue_date: e.target.value }))} />
            <Input label="Expiry Date" type="date" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">Line Items</label>
              <button onClick={() => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }))}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
                <PlusCircle size={14} /> Add Item
              </button>
            </div>
            <div className="space-y-2">
              {form.items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input placeholder="Description" value={item.description} onChange={e => setItem(i, 'description', e.target.value)}
                    className="col-span-6 px-2.5 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500" />
                  <input placeholder="Qty" type="number" value={item.quantity} onChange={e => setItem(i, 'quantity', e.target.value)}
                    className="col-span-2 px-2.5 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500" />
                  <input placeholder="Price" type="number" value={item.unit_price} onChange={e => setItem(i, 'unit_price', e.target.value)}
                    className="col-span-3 px-2.5 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500" />
                  <button onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))}
                    className="col-span-1 text-slate-300 hover:text-red-500 flex justify-center"><MinusCircle size={16} /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-br from-slate-50 to-blue-50/40 rounded-xl p-4 text-sm space-y-1.5 border border-slate-100">
            <div className="flex justify-between text-slate-600"><span>Subtotal</span><span className="font-medium">{money(subtotal)}</span></div>
            <div className="flex justify-between text-slate-600"><span>Tax (8.75%)</span><span className="font-medium">{money(tax)}</span></div>
            <div className="flex justify-between font-bold text-slate-900 pt-1.5 border-t border-slate-200 text-base"><span>Total</span><span>{money(total)}</span></div>
          </div>

          <Textarea label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="outline" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn onClick={handleSave} loading={saving}>{saving ? 'Creating…' : 'Create Quote'}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
