import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import {
  Card, Btn, Badge, Modal, Input, Select, Textarea, Empty, SkeletonPage,
  StatCard, SearchInput, Table, Row, Cell,
} from '../components/UI';
import { Plus, Search, Trash2, PlusCircle, MinusCircle, FileText, DollarSign, AlertTriangle, Clock, Mail, BellRing, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { sendEmail } from '../lib/email';

const emptyItem = () => ({ description: '', quantity: 1, unit_price: 0 });
const emptyForm = () => ({ customer_id: '', job_id: '', status: 'draft', issue_date: new Date().toISOString().slice(0, 10), due_date: '', items: [emptyItem()], tax_rate: 0.0875, notes: '' });
const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [taxInput, setTaxInput] = useState('8.75');
  const [defaultTaxPct, setDefaultTaxPct] = useState('8.75');
  const [priceBook, setPriceBook] = useState([]);
  const navigate = useNavigate();

  function load() {
    Promise.all([api.get('/billing/invoices'), api.get('/customers'), api.get('/billing/config')])
      .then(([inv, cust, cfg]) => {
        setInvoices(inv.data); setCustomers(cust.data);
        setDefaultTaxPct(String(Math.round((Number(cfg.data.default_tax_rate) || 0.0875) * 10000) / 100));
        setLoading(false);
      });
    api.get('/pricebook').then(r => setPriceBook(r.data)).catch(() => {});
  }
  useEffect(load, []);

  function openNew() {
    const f = emptyForm();
    f.tax_rate = (parseFloat(defaultTaxPct) || 0) / 100;
    setForm(f); setTaxInput(defaultTaxPct); setModal(true);
  }

  async function duplicateInvoice(e, inv) {
    e.stopPropagation();
    try {
      await api.post('/billing/invoices', { customer_id: inv.customer_id, items: inv.items || [], status: 'draft', notes: inv.notes || null });
      toast.success('Invoice duplicated');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not duplicate'); }
  }

  async function remindOverdue() {
    if (!confirm('Email a payment reminder to every overdue customer?')) return;
    setReminding(true);
    try {
      const { data } = await api.post('/billing/invoices/remind-overdue');
      toast.success(`Sent ${data.sent} reminder${data.sent === 1 ? '' : 's'}`);
    } catch (e) { toast.error(e.response?.data?.error || 'Could not send reminders'); }
    finally { setReminding(false); }
  }

  const filtered = invoices.filter(i => {
    const q = search.toLowerCase();
    const matchSearch = i.invoice_number?.toLowerCase().includes(q) || i.customer_name?.toLowerCase().includes(q);
    const matchStatus = !statusFilter || i.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const isOverdue = (i) => i.status !== 'paid' && i.due_date && i.due_date < new Date().toISOString().slice(0, 10);
  const stats = {
    outstanding: invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled').reduce((s, i) => s + i.total, 0),
    paid: invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0),
    overdue: invoices.filter(isOverdue).length,
    draft: invoices.filter(i => i.status === 'draft').length,
  };

  function setItem(idx, key, val) {
    setForm(f => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [key]: key === 'description' ? val : Number(val) };
      // If the typed/selected description matches a price-book item, auto-fill its price.
      if (key === 'description') {
        const match = priceBook.find(p => (p.name || '').toLowerCase() === val.trim().toLowerCase());
        if (match) items[idx].unit_price = Number(match.unit_price) || 0;
      }
      return { ...f, items };
    });
  }
  const subtotal = form.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const tax = subtotal * form.tax_rate;
  const total = subtotal + tax;

  async function handleSave() {
    setSaving(true);
    try {
      await api.post('/billing/invoices', form);
      toast.success('Invoice created');
      setModal(false); setForm(emptyForm()); load();
    } catch { toast.error('Error creating invoice'); }
    finally { setSaving(false); }
  }
  async function handleDelete(e, id) {
    e.stopPropagation();
    if (!confirm('Delete invoice?')) return;
    await api.delete(`/billing/invoices/${id}`);
    toast.success('Deleted'); load();
  }
  async function handleEmail(e, id) {
    e.stopPropagation();
    try { await sendEmail('invoice', id, 'Invoice'); load(); } catch { /* toast handled */ }
  }

  if (loading) return <SkeletonPage stats={4} />;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Invoices" subtitle={`${invoices.length} invoices`} icon={<FileText size={20} />}>
        {stats.overdue > 0 && <Btn variant="outline" onClick={remindOverdue} loading={reminding}><BellRing size={15} /> Remind {stats.overdue} Overdue</Btn>}
        <Btn onClick={openNew}><Plus size={16} /> New Invoice</Btn>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Outstanding" value={stats.outstanding} prefix="$" decimals={2} icon={<Clock size={18} />} color="orange" />
        <StatCard label="Revenue Collected" value={stats.paid} prefix="$" decimals={2} icon={<DollarSign size={18} />} color="green" />
        <StatCard label="Overdue" value={stats.overdue} icon={<AlertTriangle size={18} />} color="red" />
        <StatCard label="Drafts" value={stats.draft} icon={<FileText size={18} />} color="slate" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <SearchInput className="flex-1" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by invoice # or customer…" icon={<Search size={16} />} />
        <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="sm:w-48">
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
        </Select>
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <Empty icon={<FileText size={28} />}
            title={search || statusFilter ? 'No matching invoices' : 'No invoices yet'}
            message={search || statusFilter ? 'Try adjusting your search or filters.' : 'Create an invoice to start collecting payments.'}
            action={!search && !statusFilter && <Btn onClick={openNew}><Plus size={16} /> New Invoice</Btn>} />
        ) : (
          <Table head={[
            { label: 'Invoice #' }, { label: 'Customer' }, { label: 'Due Date' },
            { label: 'Amount', align: 'right' }, { label: 'Status', align: 'right' }, { label: '', align: 'right' },
          ]}>
            {filtered.map(inv => (
              <Row key={inv.id} onClick={() => navigate(`/invoices/${inv.id}`)}>
                <Cell><span className="font-semibold text-slate-800">{inv.invoice_number}</span></Cell>
                <Cell><span className="text-sm text-slate-600">{inv.customer_name || <span className="text-slate-300">—</span>}</span></Cell>
                <Cell>
                  <span className={`text-sm ${isOverdue(inv) ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                    {inv.due_date || 'N/A'}{isOverdue(inv) && ' · overdue'}
                  </span>
                </Cell>
                <Cell align="right"><span className="text-sm font-semibold text-slate-800">{money(inv.total)}</span></Cell>
                <Cell align="right"><Badge status={isOverdue(inv) ? 'overdue' : inv.status} /></Cell>
                <Cell align="right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={e => duplicateInvoice(e, inv)} title="Duplicate" className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-100 rounded-lg transition-colors"><Copy size={15} /></button>
                    <button onClick={e => handleEmail(e, inv.id)} title="Email invoice to customer" className="text-slate-400 hover:text-blue-600 p-1.5 hover:bg-blue-50 rounded-lg transition-colors"><Mail size={15} /></button>
                    <button onClick={e => handleDelete(e, inv.id)} title="Delete invoice" className="text-slate-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={15} /></button>
                  </div>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="New Invoice" subtitle="Build and send a professional invoice" size="xl">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Select label="Customer" value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))}>
              <option value="">Select customer</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select label="Status" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Issue Date" type="date" value={form.issue_date} onChange={e => setForm(f => ({ ...f, issue_date: e.target.value }))} />
            <Input label="Due Date" type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
          </div>

          <div>
            <datalist id="pb-items">
              {priceBook.map(p => <option key={p.id} value={p.name}>{p.category ? `${p.category} · ` : ''}${(Number(p.unit_price) || 0).toFixed(2)}</option>)}
            </datalist>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">Line items</label>
              <button onClick={() => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }))}
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
                <PlusCircle size={14} /> Add line
              </button>
            </div>
            {priceBook.length > 0 && <p className="text-[11px] text-slate-400 mb-2">Tip: start typing a description to pick from your price book — the price fills in automatically.</p>}
            <div className="hidden sm:grid grid-cols-12 gap-2 px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              <span className="col-span-5">Description</span>
              <span className="col-span-2 text-right">Qty</span>
              <span className="col-span-2 text-right">Unit price</span>
              <span className="col-span-2 text-right">Amount</span>
              <span className="col-span-1" />
            </div>
            <div className="space-y-2">
              {form.items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input placeholder="Description" value={item.description} onChange={e => setItem(i, 'description', e.target.value)}
                    list="pb-items"
                    className="col-span-12 sm:col-span-5 px-2.5 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500" />
                  <input placeholder="Qty" type="number" min="0" value={item.quantity} onChange={e => setItem(i, 'quantity', e.target.value)}
                    className="col-span-4 sm:col-span-2 px-2.5 py-2 border border-slate-300 rounded-lg text-sm text-right focus:outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500" />
                  <div className="col-span-4 sm:col-span-2 relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                    <input placeholder="0.00" type="number" min="0" step="0.01" value={item.unit_price} onChange={e => setItem(i, 'unit_price', e.target.value)}
                      className="w-full pl-6 pr-2 py-2 border border-slate-300 rounded-lg text-sm text-right focus:outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500" />
                  </div>
                  <div className="col-span-3 sm:col-span-2 text-right text-sm font-medium text-slate-700 tabular-nums">{money((Number(item.quantity) || 0) * (Number(item.unit_price) || 0))}</div>
                  <button onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))}
                    className="col-span-1 text-slate-300 hover:text-red-500 flex justify-center"><MinusCircle size={16} /></button>
                </div>
              ))}
              {form.items.length === 0 && <p className="text-sm text-slate-400 py-2">No items yet — add a line.</p>}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 text-sm space-y-2.5 max-w-xs ml-auto">
            <div className="flex justify-between text-slate-600"><span>Subtotal</span><span className="font-medium tabular-nums">{money(subtotal)}</span></div>
            <div className="flex justify-between items-center text-slate-600">
              <span className="flex items-center gap-2">Tax
                <span className="inline-flex items-center gap-1">
                  <input type="number" min="0" step="0.01" value={taxInput}
                    onChange={e => { setTaxInput(e.target.value); setForm(f => ({ ...f, tax_rate: (parseFloat(e.target.value) || 0) / 100 })); }}
                    className="w-16 px-2 py-1 border border-slate-300 rounded-lg text-sm text-right focus:outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500" />
                  <span className="text-slate-400">%</span>
                </span>
              </span>
              <span className="font-medium tabular-nums">{money(tax)}</span>
            </div>
            <div className="flex justify-between font-bold text-slate-900 pt-2 border-t border-slate-200 text-base"><span>Total Due</span><span className="tabular-nums">{money(total)}</span></div>
          </div>

          <Textarea label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="outline" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn onClick={handleSave} loading={saving}>{saving ? 'Creating…' : 'Create Invoice'}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
