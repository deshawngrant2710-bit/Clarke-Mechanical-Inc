import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import PriceItemInput from '../components/PriceItemInput';
import {
  Card, Btn, Badge, Modal, Input, Select, Textarea, Empty, SkeletonPage,
  StatCard, SearchInput, Table, Row, Cell,
} from '../components/UI';
import { Plus, Search, Trash2, PlusCircle, MinusCircle, FileText, DollarSign, AlertTriangle, Clock, Mail, BellRing, Copy, Share2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { sendEmail } from '../lib/email';
import { sharePdf } from '../lib/printDoc';
import { cacheGet, cacheHas, cacheSet } from '../lib/queryCache';
import SheetSelect from '../components/SheetSelect';
import RichTextInput from '../components/RichTextInput';

const emptyItem = () => ({ description: '', note: '', quantity: 1, unit_price: 0 });
const emptyForm = () => ({ customer_id: '', job_id: '', status: 'draft', issue_date: new Date().toISOString().slice(0, 10), due_date: '', items: [emptyItem()], tax_rate: 0.0875, discount_pct: 0, deposit: 0, notes: '' });
const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const DRAFT_KEY = 'clarke_draft_invoice';
const draftHasContent = (f) => !!(f && (f.customer_id
  || (f.items || []).some(it => (it.description || '').trim() || (it.note || '').trim() || Number(it.unit_price))
  || (f.notes || '').trim()));

export default function Invoices() {
  const [invoices, setInvoices] = useState(() => cacheGet('/billing/invoices') || []);
  const [customers, setCustomers] = useState(() => cacheGet('/customers') || []);
  const [loading, setLoading] = useState(() => !cacheHas('/billing/invoices'));
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modal, setModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [taxInput, setTaxInput] = useState('8.75');
  const [defaultTaxPct, setDefaultTaxPct] = useState('8.75');
  const [priceBook, setPriceBook] = useState([]);
  const navigate = useNavigate();
  const location = useLocation();

  function load() {
    Promise.all([api.get('/billing/invoices'), api.get('/customers'), api.get('/billing/config')])
      .then(([inv, cust, cfg]) => {
        setInvoices(inv.data); setCustomers(cust.data);
        cacheSet('/billing/invoices', inv.data); cacheSet('/customers', cust.data);
        setDefaultTaxPct(String(Math.round((Number(cfg.data.default_tax_rate) || 0.0875) * 10000) / 100));
        setLoading(false);
      });
    api.get('/pricebook').then(r => setPriceBook(r.data)).catch(() => {});
  }
  useEffect(load, []);
  useEffect(() => { if (new URLSearchParams(window.location.search).get('new') === '1') openNew(); }, []);
  // Opened from a job ("Create Invoice") to pre-fill, or from an invoice ("Edit Invoice").
  useEffect(() => {
    if (location.state?.newInvoice) {
      openNew(location.state.newInvoice);
      navigate(location.pathname, { replace: true, state: {} });
    } else if (location.state?.editInvoice) {
      openEdit(location.state.editInvoice);
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave a NEW invoice being typed, so it survives a closed laptop / refresh.
  useEffect(() => {
    if (!modal || editingId) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, taxInput })); } catch { /* storage full/blocked */ }
  }, [form, taxInput, modal, editingId]);

  function openNew(prefill) {
    setEditingId(null);
    // Restore an unfinished draft if there's no prefill from a job.
    if (!prefill) {
      try {
        const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
        if (saved?.form && draftHasContent(saved.form)) {
          setForm(saved.form); setTaxInput(saved.taxInput || defaultTaxPct); setModal(true);
          toast('Restored your unsaved draft', { icon: '📝' });
          return;
        }
      } catch { /* ignore */ }
    }
    const f = emptyForm();
    f.tax_rate = (parseFloat(defaultTaxPct) || 0) / 100;
    if (prefill) {
      if (prefill.customer_id) f.customer_id = prefill.customer_id;
      if (prefill.job_id) f.job_id = prefill.job_id;
      if (Array.isArray(prefill.items) && prefill.items.length) {
        f.items = prefill.items.map(it => ({ description: it.description || '', note: it.note || '', quantity: Number(it.quantity) || 1, unit_price: Number(it.unit_price) || 0 }));
      }
      if (prefill.notes) f.notes = prefill.notes;
    }
    setForm(f); setTaxInput(defaultTaxPct); setModal(true);
  }

  // Reopen an existing invoice in the editable form to fix mistakes.
  function openEdit(inv) {
    const items = (inv.items && inv.items.length)
      ? inv.items.map(it => ({ description: it.description || '', note: it.note || '', quantity: Number(it.quantity) || 1, unit_price: Number(it.unit_price) || 0 }))
      : [emptyItem()];
    const sub = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const rate = Number(inv.tax_rate) || 0;
    setForm({
      customer_id: inv.customer_id || '', job_id: inv.job_id || '', status: inv.status || 'draft',
      issue_date: inv.issue_date || new Date().toISOString().slice(0, 10), due_date: inv.due_date || '',
      items, tax_rate: rate, deposit: Number(inv.deposit) || 0, notes: inv.notes || '',
      discount_pct: sub > 0 ? +((Number(inv.discount) || 0) / sub * 100).toFixed(3) : 0,
    });
    setTaxInput(String(+(rate * 100).toFixed(3)));
    setEditingId(inv.id);
    setModal(true);
  }
  function closeModal() { setModal(false); setEditingId(null); }
  function discardDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    const f = emptyForm(); f.tax_rate = (parseFloat(defaultTaxPct) || 0) / 100;
    setForm(f); setTaxInput(defaultTaxPct);
    toast.success('Draft cleared');
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
    outstanding: invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled').reduce((s, i) => s + (i.balance != null ? i.balance : i.total), 0),
    paid: invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0),
    overdue: invoices.filter(isOverdue).length,
    draft: invoices.filter(i => i.status === 'draft').length,
  };

  function setItem(idx, key, val) {
    setForm(f => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [key]: (key === 'description' || key === 'note') ? val : Number(val) };
      return { ...f, items };
    });
  }
  // Picking a price-book item fills the description AND its price in one shot.
  function pickItem(idx, it) {
    setForm(f => {
      const items = [...f.items];
      items[idx] = { ...items[idx], description: it.name, unit_price: Number(it.unit_price) || 0 };
      return { ...f, items };
    });
  }
  const subtotal = form.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const discountPct = Math.min(Math.max(Number(form.discount_pct) || 0, 0), 100);
  const discount = +(subtotal * discountPct / 100).toFixed(2);
  const tax = (subtotal - discount) * form.tax_rate;
  const total = subtotal - discount + tax;

  async function handleSave() {
    setSaving(true);
    try {
      // Backend stores the discount as a dollar amount — send the computed value.
      if (editingId) {
        await api.put(`/billing/invoices/${editingId}`, { ...form, discount });
        toast.success('Invoice updated');
      } else {
        await api.post('/billing/invoices', { ...form, discount });
        toast.success('Invoice created');
      }
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      setModal(false); setEditingId(null); setForm(emptyForm()); load();
    } catch { toast.error(editingId ? 'Error updating invoice' : 'Error creating invoice'); }
    finally { setSaving(false); }
  }
  async function handleDelete(e, id) {
    e.stopPropagation();
    if (!confirm('Delete invoice?')) return;
    await api.delete(`/billing/invoices/${id}`);
    toast.success('Deleted'); load();
  }
  async function shareInvoicePdf(e, inv) {
    e.stopPropagation();
    let b = {};
    try { b = (await api.get('/auth/public-info')).data || {}; } catch { /* defaults are fine */ }
    try {
      const res = await sharePdf({
        kind: 'invoice', doc: inv,
        business: { name: b.business_name, phone: b.business_phone, email: b.business_email, address: b.business_address, website: b.business_website },
        customer: { name: inv.customer_name, email: inv.customer_email, phone: inv.customer_phone, address: inv.customer_address },
      });
      if (res.method === 'download') toast.success('PDF saved to your downloads');
    } catch { toast.error('Could not create the PDF'); }
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
        <Btn onClick={() => openNew()}><Plus size={16} /> New Invoice</Btn>
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
            action={!search && !statusFilter && <Btn onClick={() => openNew()}><Plus size={16} /> New Invoice</Btn>} />
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
                    <button onClick={e => shareInvoicePdf(e, inv)} title="Send as PDF (WhatsApp, etc.)" className="text-slate-400 hover:text-emerald-600 p-1.5 hover:bg-emerald-50 rounded-lg transition-colors"><Share2 size={15} /></button>
                    <button onClick={e => handleEmail(e, inv.id)} title="Email invoice to customer" className="text-slate-400 hover:text-blue-600 p-1.5 hover:bg-blue-50 rounded-lg transition-colors"><Mail size={15} /></button>
                    <button onClick={e => handleDelete(e, inv.id)} title="Delete invoice" className="text-slate-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={15} /></button>
                  </div>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={modal} onClose={closeModal} title={editingId ? 'Edit Invoice' : 'New Invoice'} subtitle={editingId ? 'Fix any mistakes and save' : 'Build and send a professional invoice'} size="xl"
        footer={
          <div className="flex justify-between gap-2">
            <div>{!editingId && <Btn variant="ghost" onClick={discardDraft}>Discard draft</Btn>}</div>
            <div className="flex gap-2">
              <Btn variant="outline" onClick={closeModal}>Cancel</Btn>
              <Btn onClick={handleSave} loading={saving}>{saving ? 'Saving…' : (editingId ? 'Save Changes' : 'Create Invoice')}</Btn>
            </div>
          </div>
        }>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <SheetSelect label="Customer" title="Select customer" searchable placeholder="Select customer"
              value={form.customer_id}
              options={customers.map(c => ({ value: c.id, label: c.name }))}
              onChange={v => setForm(f => ({ ...f, customer_id: v }))} />
            <SheetSelect label="Status" title="Status" placeholder={null}
              value={form.status}
              options={[{ value: 'draft', label: 'Draft' }, { value: 'sent', label: 'Sent' }, { value: 'paid', label: 'Paid' }]}
              onChange={v => setForm(f => ({ ...f, status: v }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Issue Date" type="date" value={form.issue_date} onChange={e => setForm(f => ({ ...f, issue_date: e.target.value }))} />
            <Input label="Due Date" type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
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
                <div key={i} className="space-y-1.5 pb-1">
                  <div className="grid grid-cols-12 gap-2 items-center">
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
                  <RichTextInput className="w-full sm:w-2/3" placeholder="Add a note for this line (optional) — bold/underline supported" value={item.note || ''} onChange={v => setItem(i, 'note', v)} />
                </div>
              ))}
              {form.items.length === 0 && <p className="text-sm text-slate-400 py-2">No items yet — add a line.</p>}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 text-sm space-y-2.5 max-w-xs ml-auto">
            <div className="flex justify-between text-slate-600"><span>Subtotal</span><span className="font-medium tabular-nums">{money(subtotal)}</span></div>
            <div className="flex justify-between items-center text-slate-600">
              <span className="flex items-center gap-1">Discount
                <input type="number" min="0" max="100" step="0.1" value={form.discount_pct || ''}
                  onChange={e => setForm(f => ({ ...f, discount_pct: e.target.value }))}
                  className="w-16 px-2 py-1 border border-slate-300 rounded-lg text-sm text-right focus:outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500" />
                <span>%</span>
              </span>
              <span className="font-medium tabular-nums text-emerald-600">{discount ? `−${money(discount)}` : money(0)}</span>
            </div>
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
            <div className="flex justify-between items-center text-slate-600 pt-1">
              <span className="flex items-center gap-2">Deposit $
                <input type="number" min="0" step="0.01" value={form.deposit || ''}
                  onChange={e => setForm(f => ({ ...f, deposit: e.target.value }))}
                  className="w-20 px-2 py-1 border border-slate-300 rounded-lg text-sm text-right focus:outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500" />
              </span>
              <span className="text-xs text-slate-400">due up front</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes</label>
            <RichTextInput placeholder="Notes shown on the invoice — bold/underline supported" value={form.notes || ''} onChange={v => setForm(f => ({ ...f, notes: v }))} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
