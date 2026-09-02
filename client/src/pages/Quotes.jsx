import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import PriceItemInput from '../components/PriceItemInput';
import RichTextInput from '../components/RichTextInput';
import EmailRecipientsModal from '../components/EmailRecipientsModal';
import {
  Card, Btn, Badge, Modal, Input, Select, Textarea, Empty, SkeletonPage,
  StatCard, SearchInput, Table, Row, Cell,
} from '../components/UI';
import { Plus, Search, Trash2, PlusCircle, MinusCircle, ClipboardList, CheckCircle, Send, DollarSign, Mail, FileText, Copy, Briefcase, Printer } from 'lucide-react';
import { printDocument } from '../lib/printDoc';
import toast from 'react-hot-toast';
import { sendEmail } from '../lib/email';

const emptyItem = () => ({ description: '', note: '', quantity: 1, unit_price: 0 });
const emptyForm = () => ({ customer_id: '', status: 'draft', issue_date: new Date().toISOString().slice(0, 10), expiry_date: '', items: [emptyItem()], tax_rate: 0.0875, discount_pct: 0, deposit: 0, notes: '' });
const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const DRAFT_KEY = 'clarke_draft_estimate';
const draftHasContent = (f) => !!(f && (f.customer_id
  || (f.items || []).some(it => (it.description || '').trim() || (it.note || '').trim() || Number(it.unit_price))
  || (f.notes || '').trim()));

export default function Quotes() {
  const navigate = useNavigate();
  const location = useLocation();
  const [quotes, setQuotes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [emailTarget, setEmailTarget] = useState(null);
  const [emailing, setEmailing] = useState(false);
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

  // Autosave a NEW estimate being typed, so it survives a closed laptop / refresh.
  // (Skip while editing an existing estimate — we don't want to overwrite the new-draft.)
  useEffect(() => {
    if (!modal || editingId) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, taxInput })); } catch { /* ignore */ }
  }, [form, taxInput, modal, editingId]);

  // Open an existing estimate for editing — works for any status (draft, sent, accepted…).
  function openEdit(q) {
    const pct = q.subtotal > 0 && q.discount ? Math.round((q.discount / q.subtotal) * 10000) / 100 : 0;
    const taxPctVal = Math.round((Number(q.tax_rate) || 0) * 10000) / 100;
    setForm({
      customer_id: q.customer_id || '',
      status: q.status || 'draft',
      issue_date: q.issue_date || new Date().toISOString().slice(0, 10),
      expiry_date: q.expiry_date || '',
      items: (q.items && q.items.length ? q.items : [emptyItem()]).map(it => ({
        description: it.description || '', note: it.note || '',
        quantity: Number(it.quantity) || 1, unit_price: Number(it.unit_price) || 0,
      })),
      tax_rate: Number(q.tax_rate) || 0.0875,
      discount_pct: pct,
      deposit: Number(q.deposit) || 0,
      notes: q.notes || '',
    });
    setTaxInput(String(taxPctVal || defaultTaxPct));
    setEditingId(q.id);
    setModal(true);
  }
  function closeModal() { setModal(false); setEditingId(null); }

  function openNew() {
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (saved?.form && draftHasContent(saved.form)) {
        setForm(saved.form); setTaxInput(saved.taxInput || defaultTaxPct); setModal(true);
        toast('Restored your unsaved draft', { icon: '📝' });
        return;
      }
    } catch { /* ignore */ }
    const f = emptyForm();
    f.tax_rate = (parseFloat(defaultTaxPct) || 0) / 100;
    setForm(f); setTaxInput(defaultTaxPct); setModal(true);
  }
  function discardDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    const f = emptyForm(); f.tax_rate = (parseFloat(defaultTaxPct) || 0) / 100;
    setForm(f); setTaxInput(defaultTaxPct);
    toast.success('Draft cleared');
  }

  // Prefill + open the New Quote modal when arriving from an inspection, or from the
  // dashboard "Create" button (?new=1).
  useEffect(() => {
    if (location.state?.prefill) {
      setForm({ ...emptyForm(), ...location.state.prefill });
      setModal(true);
    } else if (new URLSearchParams(location.search).get('new') === '1') {
      openNew();
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

  async function convertToJob(e, q) {
    e.stopPropagation();
    try {
      const { data } = await api.post(`/billing/quotes/${q.id}/convert-to-job`);
      toast.success(data.already ? 'Opening the linked job' : 'Job created from estimate');
      navigate(`/jobs/${data.job_id || data.id}`);
    } catch (err) { toast.error(err.response?.data?.error || 'Could not convert to job'); }
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
      items[idx] = { ...items[idx], [key]: (key === 'description' || key === 'note') ? val : Number(val) };
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
  const discountPct = Math.min(Math.max(Number(form.discount_pct) || 0, 0), 100);
  const discount = +(subtotal * discountPct / 100).toFixed(2);
  const tax = (subtotal - discount) * form.tax_rate;
  const total = subtotal - discount + tax;

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
      if (editingId) {
        await api.put(`/billing/quotes/${editingId}`, { ...form, discount });
        toast.success('Quote updated');
      } else {
        await api.post('/billing/quotes', { ...form, discount });
        try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
        toast.success('Quote created');
      }
      setModal(false); setEditingId(null); setForm(emptyForm()); load();
    } catch { toast.error(editingId ? 'Error updating quote' : 'Error creating quote'); }
    finally { setSaving(false); }
  }
  async function handleDelete(e, id) {
    e.stopPropagation();
    if (!confirm('Delete quote?')) return;
    await api.delete(`/billing/quotes/${id}`);
    toast.success('Deleted'); load();
  }
  function handleEmail(e, q) {
    e.stopPropagation();
    const email = customers.find(c => c.id === q.customer_id)?.email || '';
    setEmailTarget({ id: q.id, email, number: q.quote_number });
  }
  async function printQuote(e, q) {
    e.stopPropagation();
    const c = customers.find(x => x.id === q.customer_id) || {};
    let b = {};
    try { b = (await api.get('/auth/public-info')).data || {}; } catch { /* defaults are fine */ }
    printDocument({
      kind: 'quote', doc: q,
      business: { name: b.business_name, phone: b.business_phone, email: b.business_email, address: b.business_address, website: b.business_website },
      customer: { name: q.customer_name || c.name, email: c.email, phone: c.phone, address: c.address },
    });
  }
  async function sendQuoteEmail(cc = []) {
    if (!emailTarget) return;
    setEmailing(true);
    try { await sendEmail('quote', emailTarget.id, 'Estimate', cc); setEmailTarget(null); load(); }
    catch { /* toast handled */ }
    finally { setEmailing(false); }
  }

  if (loading) return <SkeletonPage stats={4} />;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Quotes" subtitle={`${quotes.length} estimates`} icon={<ClipboardList size={20} />}>
        <Btn onClick={() => openNew()}><Plus size={16} /> New Quote</Btn>
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
            action={!search && <Btn onClick={() => openNew()}><Plus size={16} /> New Quote</Btn>} />
        ) : (
          <Table head={[
            { label: 'Quote #' }, { label: 'Customer' }, { label: 'Expires' },
            { label: 'Amount', align: 'right' }, { label: 'Status', align: 'right' }, { label: '', align: 'right' },
          ]}>
            {filtered.map(q => (
              <Row key={q.id} onClick={() => openEdit(q)}>
                <Cell><span className="font-semibold text-slate-800">{q.quote_number}</span></Cell>
                <Cell><span className="text-sm text-slate-600">{q.customer_name || <span className="text-slate-300">—</span>}</span></Cell>
                <Cell><span className="text-sm text-slate-500">{q.expiry_date || 'N/A'}</span></Cell>
                <Cell align="right"><span className="text-sm font-semibold text-slate-800">{money(q.total)}</span></Cell>
                <Cell align="right"><Badge status={q.status} /></Cell>
                <Cell align="right">
                  <div className="flex items-center justify-end gap-1">
                    {q.converted_job_id
                      ? <button onClick={e => { e.stopPropagation(); navigate(`/jobs/${q.converted_job_id}`); }} title="Open linked job" className="text-blue-500 hover:text-blue-700 p-1.5 hover:bg-blue-50 rounded-lg transition-colors"><Briefcase size={15} /></button>
                      : ['accepted', 'sent'].includes(q.status) && <button onClick={e => convertToJob(e, q)} title="Convert to job" className="text-slate-400 hover:text-blue-600 p-1.5 hover:bg-blue-50 rounded-lg transition-colors"><Briefcase size={15} /></button>}
                    {q.status === 'accepted' && <button onClick={e => convertToInvoice(e, q)} title="Convert to invoice" className="text-slate-400 hover:text-emerald-600 p-1.5 hover:bg-emerald-50 rounded-lg transition-colors"><FileText size={15} /></button>}
                    <button onClick={e => duplicateQuote(e, q)} title="Duplicate" className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-100 rounded-lg transition-colors"><Copy size={15} /></button>
                    <button onClick={e => printQuote(e, q)} title="Print / Download PDF" className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-100 rounded-lg transition-colors"><Printer size={15} /></button>
                    <button onClick={e => handleEmail(e, q)} title="Email estimate to customer" className="text-slate-400 hover:text-blue-600 p-1.5 hover:bg-blue-50 rounded-lg transition-colors"><Mail size={15} /></button>
                    <button onClick={e => handleDelete(e, q.id)} title="Delete quote" className="text-slate-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={15} /></button>
                  </div>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={modal} onClose={closeModal} title={editingId ? 'Edit Quote' : 'New Quote'} subtitle={editingId ? 'Update this estimate' : 'Build a professional estimate'} size="xl">
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
            <div className="flex justify-between font-bold text-slate-900 pt-2 border-t border-slate-200 text-base"><span>Total</span><span className="tabular-nums">{money(total)}</span></div>
            <div className="flex justify-between items-center text-slate-600 pt-1">
              <span className="flex items-center gap-2">Deposit $
                <input type="number" min="0" step="0.01" value={form.deposit || ''}
                  onChange={e => setForm(f => ({ ...f, deposit: e.target.value }))}
                  className="w-20 px-2 py-1 border border-slate-300 rounded-lg text-sm text-right focus:outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500" />
              </span>
              <span className="text-xs text-slate-400">requested up front</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes</label>
            <RichTextInput placeholder="Notes shown on the estimate — bold/underline supported" value={form.notes || ''} onChange={v => setForm(f => ({ ...f, notes: v }))} />
          </div>
          <div className="flex justify-between gap-2 pt-2">
            <Btn variant="outline" onClick={previewQuote} loading={previewing}><Mail size={15} /> Preview as customer</Btn>
            <div className="flex gap-2">
              {!editingId && <Btn variant="ghost" onClick={discardDraft}>Discard draft</Btn>}
              <Btn variant="outline" onClick={closeModal}>Cancel</Btn>
              <Btn onClick={handleSave} loading={saving}>{saving ? (editingId ? 'Saving…' : 'Creating…') : (editingId ? 'Save Changes' : 'Create Quote')}</Btn>
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={!!preview} onClose={() => setPreview(null)} title="Customer preview" subtitle={preview?.subject} size="xl">
        <p className="text-xs text-slate-400 mb-2">This is exactly what the customer will see when the estimate is sent.</p>
        <iframe title="estimate preview" srcDoc={preview?.html || ''} className="w-full h-[70vh] rounded-lg border border-slate-200 bg-white" />
      </Modal>

      <EmailRecipientsModal open={!!emailTarget} onClose={() => setEmailTarget(null)} to={emailTarget?.email}
        title={`Email estimate ${emailTarget?.number || ''}`} sending={emailing} onSend={(cc) => sendQuoteEmail(cc)} />
    </div>
  );
}
