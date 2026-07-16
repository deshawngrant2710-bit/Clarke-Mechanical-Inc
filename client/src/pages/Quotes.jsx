import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import PriceItemInput from '../components/PriceItemInput';
import {
  Card, Btn, Badge, Modal, Input, Select, Textarea, Empty, SkeletonPage,
  StatCard, SearchInput, Table, Row, Cell,
} from '../components/UI';
import { Plus, Search, Trash2, PlusCircle, MinusCircle, ClipboardList, CheckCircle, Send, DollarSign, Mail, FileText, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { sendEmail } from '../lib/email';

const emptyItem = () => ({ description: '', quantity: 1, unit_price: 0 });
const emptyForm = () => ({ customer_id: '', status: 'draft', issue_date: new Date().toISOString().slice(0, 10), expiry_date: '', items: [emptyItem()], tax_rate: 0.0875, notes: '' });
const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Quotes() {
  const navigate = useNavigate();
  const location = useLocation();
  const [quotes, setQuotes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [taxInput, setTaxInput] = useState('8.75');
  const [defaultTaxPct, setDefaultTaxPct] = useState('8.75');
  const [priceBook, setPriceBook] = useState([]);

  function load() {
    Promise.all([api.get('/billing/quotes'), api.get('/customers'), api.get('/billing/config')])
      .then(([q, c, cfg]) => {
        setQuotes(q.data); setCustomers(c.data);
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

  // Prefill + open the New Quote modal when arriving from an inspection.
  useEffect(() => {
    if (location.state?.prefill) {
      setForm({ ...emptyForm(), ...location.state.prefill });
      setModal(true);
    }
  }, []);

  async function duplicateQuote(e, q) {
    e.stopPropagation();
    try {
      await api.post('/billing/quotes', { customer_id: q.customer_id, items: q.items || [], status: 'draft', notes: q.notes || null });
      toast.success('Estimate duplicated');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not duplicate'); }
  }

  async function convertToInvoice(e, q) {
    e.stopPropagation();
    try {
      const { data } = await api.post('/billing/invoices', {
        customer_id: q.customer_id, items: q.items || [], status: 'draft', notes: `Converted from estimate ${q.quote_number}`,
      });
      toast.success('Invoice created from estimate');
      navigate(`/invoices/${data.id}`);
    } catch (err) { toast.error(err.response?.data?.error || 'Could not convert to invoice'); }
  }

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
  function pickItem(idx, it) {
    setForm(f => {
      const items = [...f.items];
      items[idx] = { ...items[idx], description: it.name, unit_price: Number(it.unit_price) || 0 };
      return { ...f, items };
    });
  }
  const subtotal = form.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const tax = subtotal * form.tax_rate;
  const total = subtotal + tax;

  async function previewQuote() {
    if (!form.customer_id) return toast.error('Pick a customer first');
    if (!form.items.some(i => (i.description || '').trim())) return toast.error('Add at least one line item');
    setPreviewing(true);
    try {
      const { data } = await api.post('/billing/quotes/preview', form);
      setPreview(data);
    } catch (e) { toast.error(e.response?.data?.error || 'Could not build the preview'); }
    finally { setPreviewing(false); }
  }

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
        <Btn onClick={openNew}><Plus size={16} /> New Quote</Btn>
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
            action={!search && <Btn onClick={openNew}><Plus size={16} /> New Quote</Btn>} />
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
                    {q.status === 'accepted' && <button onClick={e => convertToInvoice(e, q)} title="Convert to invoice" className="text-slate-400 hover:text-emerald-600 p-1.5 hover:bg-emerald-50 rounded-lg transition-colors"><FileText size={15} /></button>}
                    <button onClick={e => duplicateQuote(e, q)} title="Duplicate" className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-100 rounded-lg transition-colors"><Copy size={15} /></button>
                    <button onClick={e => handleEmail(e, q.id)} title="Email quote to customer" className="text-slate-400 hover:text-blue-600 p-1.5 hover:bg-blue-50 rounded-lg transition-colors"><Mail size={15} /></button>
                    <button onClick={e => handleDelete(e, q.id)} title="Delete quote" className="text-slate-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={15} /></button>
                  </div>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="New Quote" subtitle="Build a professional estimate" size="xl">
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
              <label className="text-sm font-medium text-slate-700">Line items</label>
              <button onClick={() => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }))}
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
                <PlusCircle size={14} /> Add line
              </button>
            </div>
            {priceBook.length > 0 && <p className="text-[11px] text-slate-400 mb-2">Tip: start typing a description to search your price book — the price fills in automatically.</p>}
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
                  <PriceItemInput className="col-span-12 sm:col-span-5" value={item.description} items={priceBook}
                    onChange={v => setItem(i, 'description', v)} onPick={it => pickItem(i, it)} />
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
            <div className="flex justify-between font-bold text-slate-900 pt-2 border-t border-slate-200 text-base"><span>Total</span><span className="tabular-nums">{money(total)}</span></div>
          </div>

          <Textarea label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          <div className="flex justify-between gap-2 pt-2">
            <Btn variant="outline" onClick={previewQuote} loading={previewing}><Mail size={15} /> Preview as customer</Btn>
            <div className="flex gap-2">
              <Btn variant="outline" onClick={() => setModal(false)}>Cancel</Btn>
              <Btn onClick={handleSave} loading={saving}>{saving ? 'Creating…' : 'Create Quote'}</Btn>
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={!!preview} onClose={() => setPreview(null)} title="Customer preview" subtitle={preview?.subject} size="xl">
        <p className="text-xs text-slate-400 mb-2">This is exactly what the customer will see when the estimate is sent.</p>
        <iframe title="estimate preview" srcDoc={preview?.html || ''} className="w-full h-[70vh] rounded-lg border border-slate-200 bg-white" />
      </Modal>
    </div>
  );
}
