import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import PriceItemInput from '../components/PriceItemInput';
import RichTextInput from '../components/RichTextInput';
import {
  Card, Btn, Badge, Input, Select, Empty, SkeletonPage, StatCard, SearchInput, Table, Row, Cell, Modal,
} from '../components/UI';
import {
  FileSignature, Plus, Search, Trash2, PlusCircle, MinusCircle, Send, Printer, Share2, Download,
  FileText, Save, BookMarked, ArrowLeft, CheckCircle2,
} from 'lucide-react';
import { printDocument, sharePdf, downloadPdf } from '../lib/printDoc';
import { PAYMENT_INFO } from '../lib/paymentInfo';
import toast from 'react-hot-toast';

const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);
const emptyItem = () => ({ description: '', note: '', quantity: 1, unit_price: 0 });
const emptyMilestone = () => ({ label: '', percent: '', amount: '', due: '' });
const blank = () => ({
  customer_id: '', title: '', status: 'draft', issue_date: today(), expiry_date: '',
  prepared_by: '', service_address: '', body: '', items: [], milestones: [],
  tax_rate: 0.08875, discount: 0, deposit: 0,
});

function paymentLines() {
  const p = PAYMENT_INFO || {};
  const out = [];
  if (p.zelle?.enabled && p.zelle.email) out.push(`Zelle: ${p.zelle.email}`);
  if (p.bank?.enabled && p.bank.bankName) out.push(`Bank: ${p.bank.bankName}`);
  if (p.bank?.enabled && p.bank.accountNumber) out.push(`Account number: ${p.bank.accountNumber}`);
  if (p.check?.enabled && p.check.payableTo) out.push(`Checks payable to: ${p.check.payableTo}`);
  return out;
}

export default function Proposals() {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // form object when editing/creating
  const [editId, setEditId] = useState(null);
  const [busy, setBusy] = useState('');
  const [tplModal, setTplModal] = useState(false);

  function load() {
    Promise.all([api.get('/proposals'), api.get('/customers'), api.get('/proposals/templates/all')])
      .then(([p, c, t]) => { setRows(p.data); setCustomers(c.data); setTemplates(t.data); })
      .catch(() => setRows([]));
  }
  useEffect(load, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    return rows.filter(r => !q || [r.proposal_number, r.title, r.customer_name].some(v => String(v || '').toLowerCase().includes(q)));
  }, [rows, search]);

  const stats = useMemo(() => ({
    total: (rows || []).length,
    signed: (rows || []).filter(r => r.status === 'accepted').length,
    pending: (rows || []).filter(r => r.status === 'sent').length,
    value: (rows || []).filter(r => r.status === 'accepted').reduce((s, r) => s + (r.total || 0), 0),
  }), [rows]);

  async function openNew() { setEditId(null); setEditing(blank()); }
  async function openEdit(r) {
    setBusy('open');
    try { const { data } = await api.get(`/proposals/${r.id}`); setEditId(r.id); setEditing({
      customer_id: data.customer_id || '', title: data.title || '', status: data.status || 'draft',
      issue_date: data.issue_date || today(), expiry_date: data.expiry_date || '', prepared_by: data.prepared_by || '',
      service_address: data.service_address || '', body: data.body || '',
      items: (data.items || []).map(i => ({ description: i.description || '', note: i.note || '', quantity: i.quantity ?? 1, unit_price: i.unit_price ?? 0 })),
      milestones: (data.milestones || []).map(m => ({ label: m.label || '', percent: m.percent ?? '', amount: m.amount ?? '', due: m.due || '' })),
      tax_rate: data.tax_rate ?? 0.08875, discount: data.discount || 0, deposit: data.deposit || 0,
      signature: data.signature || null,
    }); }
    catch { toast.error('Could not open proposal'); }
    finally { setBusy(''); }
  }
  function closeEditor() { setEditing(null); setEditId(null); }

  // Live totals
  const subtotal = (editing?.items || []).reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0);
  const discount = Math.min(Math.max(Number(editing?.discount) || 0, 0), subtotal);
  const tax = (subtotal - discount) * (Number(editing?.tax_rate) || 0);
  const total = subtotal - discount + tax;

  function setField(k, v) { setEditing(e => ({ ...e, [k]: v })); }
  function setItem(i, k, v) { setEditing(e => { const items = [...e.items]; items[i] = { ...items[i], [k]: (k === 'description' || k === 'note') ? v : Number(v) }; return { ...e, items }; }); }
  function setMs(i, k, v) { setEditing(e => { const milestones = [...e.milestones]; milestones[i] = { ...milestones[i], [k]: v }; return { ...e, milestones }; }); }

  async function save({ send } = {}) {
    if (!editing.customer_id) return toast.error('Choose a customer');
    if (!editing.title.trim()) return toast.error('Give the proposal a title');
    setBusy('save');
    try {
      const payload = { ...editing };
      let id = editId;
      if (id) { await api.put(`/proposals/${id}`, payload); }
      else { const { data } = await api.post('/proposals', payload); id = data.id; setEditId(id); }
      if (send) {
        await api.post(`/proposals/${id}/send`);
        toast.success('Proposal sent to the customer');
      } else {
        toast.success('Proposal saved');
      }
      load();
      if (send) closeEditor();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not save'); }
    finally { setBusy(''); }
  }

  async function saveAsTemplate() {
    const name = window.prompt('Template name (e.g. "Standard install contract")');
    if (!name) return;
    try {
      await api.post('/proposals/templates', { name, body: editing.body, items: editing.items, milestones: editing.milestones });
      const { data } = await api.get('/proposals/templates/all'); setTemplates(data);
      toast.success('Saved as template');
    } catch { toast.error('Could not save template'); }
  }
  function applyTemplate(t) {
    if (!t) return;
    setEditing(e => ({
      ...e,
      body: t.body || e.body,
      items: (t.items && t.items.length) ? t.items.map(i => ({ description: i.description || '', note: i.note || '', quantity: i.quantity ?? 1, unit_price: i.unit_price ?? 0 })) : e.items,
      milestones: (t.milestones && t.milestones.length) ? t.milestones.map(m => ({ label: m.label || '', percent: m.percent ?? '', amount: m.amount ?? '', due: m.due || '' })) : e.milestones,
    }));
    toast.success(`Loaded template: ${t.name}`);
  }

  async function docPayload() {
    let b = {};
    try { b = (await api.get('/auth/public-info')).data || {}; } catch { /* defaults ok */ }
    const c = customers.find(x => x.id === editing.customer_id) || {};
    // Build a doc object matching what the server stores (with computed totals + milestone amounts).
    const items = editing.items.map(i => ({ ...i, total: (Number(i.quantity) || 0) * (Number(i.unit_price) || 0) }));
    const milestones = editing.milestones.map(m => ({
      label: m.label, percent: m.percent === '' ? null : Number(m.percent),
      amount: m.percent !== '' && m.percent != null ? Math.round(total * Number(m.percent)) / 100 : Number(m.amount) || 0,
      due: m.due || null,
    }));
    return {
      kind: 'proposal',
      doc: { ...editing, items, milestones, subtotal, discount, tax_amount: tax, total },
      business: { name: b.business_name, phone: b.business_phone, email: b.business_email, address: b.business_address, website: b.business_website, paymentLines: paymentLines() },
      customer: { name: c.name, email: c.email, phone: c.phone, address: c.address, city: c.city, state: c.state, zip: c.zip },
    };
  }
  async function doPrint() { printDocument(await docPayload()); }
  async function doShare() { const r = await sharePdf(await docPayload()); if (r.method === 'download') toast.success('PDF saved to downloads'); }
  async function doDownload() { await downloadPdf(await docPayload()); toast.success('PDF saved to downloads'); }

  async function del(e, r) {
    e.stopPropagation();
    if (!window.confirm(`Delete proposal ${r.proposal_number}?`)) return;
    try { await api.delete(`/proposals/${r.id}`); toast.success('Deleted'); load(); }
    catch { toast.error('Could not delete'); }
  }
  async function convert(e, r) {
    e.stopPropagation();
    try { const { data } = await api.post(`/proposals/${r.id}/convert-to-invoice`); toast.success('Invoice created'); navigate(`/invoices/${data.id}`); }
    catch (err) { toast.error(err.response?.data?.error || 'Could not convert'); }
  }

  if (!rows) return <SkeletonPage stats={4} />;

  /* ---------------- Editor ---------------- */
  if (editing) {
    const signed = editing.signature;
    return (
      <div className="animate-fade-in max-w-4xl">
        <button onClick={closeEditor} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
          <ArrowLeft size={15} /> Back to proposals
        </button>

        <Card className="p-6 space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-bold text-slate-900">{editId ? 'Edit Proposal' : 'New Proposal'}</h2>
            {signed && <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full"><CheckCircle2 size={15} /> Signed by {signed.name}</span>}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Select label="Customer" value={editing.customer_id} onChange={e => setField('customer_id', e.target.value)}>
              <option value="">Select customer</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Input label="Title" value={editing.title} onChange={e => setField('title', e.target.value)} placeholder="e.g. Rooftop HVAC Replacement — 1577 E 17th St" />
            <Input label="Date" type="date" value={editing.issue_date} onChange={e => setField('issue_date', e.target.value)} />
            <Input label="Valid until" type="date" value={editing.expiry_date} onChange={e => setField('expiry_date', e.target.value)} />
            <Input label="Prepared by" value={editing.prepared_by} onChange={e => setField('prepared_by', e.target.value)} placeholder="Andre D Clarke" />
            <Input label="Service address" value={editing.service_address} onChange={e => setField('service_address', e.target.value)} placeholder="If different from customer" />
          </div>

          {/* Templates */}
          {templates.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap text-sm">
              <span className="text-slate-500 flex items-center gap-1"><BookMarked size={14} /> Start from template:</span>
              {templates.map(t => (
                <button key={t.id} onClick={() => applyTemplate(t)} className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700">{t.name}</button>
              ))}
            </div>
          )}

          {/* Body */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Scope of work, terms &amp; stipulations</label>
            <p className="text-[11px] text-slate-400 mb-2">Write the full contract here. Bold your section titles — they carry through to the PDF. This can be as long as you need.</p>
            <RichTextInput value={editing.body} onChange={v => setField('body', v)} placeholder="1. Scope of Work…  2. Terms & Conditions…  3. Stipulations…" className="min-h-[220px]" />
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">Priced items (optional)</label>
              <button onClick={() => setField('items', [...editing.items, emptyItem()])} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"><PlusCircle size={14} /> Add line</button>
            </div>
            <div className="space-y-2">
              {editing.items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <PriceItemInput className="col-span-12 sm:col-span-6" value={item.description} items={[]} onChange={v => setItem(i, 'description', v)} onPick={() => {}} />
                  <input placeholder="Qty" type="number" min="0" value={item.quantity} onChange={e => setItem(i, 'quantity', e.target.value)} className="col-span-4 sm:col-span-2 px-2.5 py-2 border border-slate-300 rounded-lg text-sm text-right" />
                  <div className="col-span-4 sm:col-span-2 relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                    <input placeholder="0.00" type="number" min="0" step="0.01" value={item.unit_price} onChange={e => setItem(i, 'unit_price', e.target.value)} className="w-full pl-6 pr-2 py-2 border border-slate-300 rounded-lg text-sm text-right" />
                  </div>
                  <div className="col-span-3 sm:col-span-1 text-right text-sm font-medium text-slate-700 tabular-nums">{money((Number(item.quantity) || 0) * (Number(item.unit_price) || 0))}</div>
                  <button onClick={() => setField('items', editing.items.filter((_, idx) => idx !== i))} className="col-span-1 text-slate-300 hover:text-red-500 flex justify-center"><MinusCircle size={16} /></button>
                </div>
              ))}
            </div>
            {editing.items.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2 max-w-xs ml-auto text-sm">
                <span className="text-slate-500">Subtotal</span><span className="text-right tabular-nums">{money(subtotal)}</span>
                <span className="text-slate-500 flex items-center gap-1">Tax %
                  <input type="number" step="0.001" value={((Number(editing.tax_rate) || 0) * 100)} onChange={e => setField('tax_rate', (Number(e.target.value) || 0) / 100)} className="w-16 px-2 py-1 border border-slate-300 rounded text-right" />
                </span><span className="text-right tabular-nums">{money(tax)}</span>
                <span className="font-bold text-slate-900">Total</span><span className="text-right font-bold tabular-nums">{money(total)}</span>
              </div>
            )}
          </div>

          {/* Milestones */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">Payment schedule (optional)</label>
              <button onClick={() => setField('milestones', [...editing.milestones, emptyMilestone()])} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"><PlusCircle size={14} /> Add milestone</button>
            </div>
            <div className="space-y-2">
              {editing.milestones.map((m, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input placeholder="e.g. Deposit on signing" value={m.label} onChange={e => setMs(i, 'label', e.target.value)} className="col-span-12 sm:col-span-5 px-2.5 py-2 border border-slate-300 rounded-lg text-sm" />
                  <div className="col-span-4 sm:col-span-2 relative"><input placeholder="%" type="number" value={m.percent} onChange={e => setMs(i, 'percent', e.target.value)} className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-sm text-right" /><span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">%</span></div>
                  <div className="col-span-4 sm:col-span-2 relative"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span><input placeholder="or amount" type="number" value={m.amount} onChange={e => setMs(i, 'amount', e.target.value)} className="w-full pl-6 pr-2 py-2 border border-slate-300 rounded-lg text-sm text-right" /></div>
                  <input type="date" value={m.due} onChange={e => setMs(i, 'due', e.target.value)} className="col-span-3 sm:col-span-2 px-2 py-2 border border-slate-300 rounded-lg text-sm" />
                  <button onClick={() => setField('milestones', editing.milestones.filter((_, idx) => idx !== i))} className="col-span-1 text-slate-300 hover:text-red-500 flex justify-center"><MinusCircle size={16} /></button>
                </div>
              ))}
              <p className="text-[11px] text-slate-400">Set a percentage <em>or</em> a fixed amount per milestone. Percentages are of the total above.</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
            <Btn onClick={() => save()} loading={busy === 'save'}><Save size={15} /> Save</Btn>
            <Btn variant="outline" onClick={() => save({ send: true })} loading={busy === 'save'}><Send size={15} /> Save &amp; Send</Btn>
            <div className="flex-1" />
            <Btn variant="ghost" onClick={saveAsTemplate}><BookMarked size={15} /> Save as template</Btn>
            <Btn variant="outline" onClick={doShare}><Share2 size={15} /> Send as PDF</Btn>
            <Btn variant="outline" onClick={doDownload}><Download size={15} /> PDF</Btn>
            <Btn variant="outline" onClick={doPrint}><Printer size={15} /> Print</Btn>
          </div>
        </Card>
      </div>
    );
  }

  /* ---------------- List ---------------- */
  return (
    <div className="animate-fade-in">
      <PageHeader title="Proposals" subtitle={`${rows.length} contracts`} icon={<FileSignature size={20} />}>
        <Btn variant="outline" onClick={() => setTplModal(true)}><BookMarked size={15} /> Templates</Btn>
        <Btn onClick={openNew}><Plus size={16} /> New Proposal</Btn>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total" value={stats.total} icon={<FileSignature size={18} />} color="blue" />
        <StatCard label="Signed" value={stats.signed} icon={<CheckCircle2 size={18} />} color="green" />
        <StatCard label="Awaiting signature" value={stats.pending} icon={<Send size={18} />} color="orange" />
        <StatCard label="Signed value" value={stats.value} prefix="$" decimals={0} icon={<FileText size={18} />} color="purple" />
      </div>

      <SearchInput className="mb-4" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by number, title or customer…" icon={<Search size={16} />} />

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <Empty icon={<FileSignature size={28} />} title={search ? 'No matching proposals' : 'No proposals yet'}
            message={search ? 'Try a different search.' : 'Draft a professional contract with scope, pricing and terms — the customer can sign it online.'}
            action={!search && <Btn onClick={openNew}><Plus size={16} /> New Proposal</Btn>} />
        ) : (
          <Table head={[{ label: 'Number' }, { label: 'Title' }, { label: 'Customer' }, { label: 'Amount', align: 'right' }, { label: 'Status', align: 'right' }, { label: '', align: 'right' }]}>
            {filtered.map(r => (
              <Row key={r.id} onClick={() => openEdit(r)}>
                <Cell><span className="font-semibold text-slate-800">{r.proposal_number}</span></Cell>
                <Cell><span className="text-sm text-slate-700">{r.title || <span className="text-slate-300">—</span>}</span></Cell>
                <Cell><span className="text-sm text-slate-600">{r.customer_name || '—'}</span></Cell>
                <Cell align="right"><span className="text-sm font-semibold text-slate-800">{money(r.total)}</span></Cell>
                <Cell align="right"><Badge status={r.status} /></Cell>
                <Cell align="right">
                  <div className="flex items-center justify-end gap-1">
                    {r.status === 'accepted' && <button onClick={e => convert(e, r)} title="Convert to invoice" className="text-slate-400 hover:text-emerald-600 p-1.5 hover:bg-emerald-50 rounded-lg"><FileText size={15} /></button>}
                    <button onClick={e => del(e, r)} title="Delete" className="text-slate-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-lg"><Trash2 size={15} /></button>
                  </div>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <TemplatesModal open={tplModal} onClose={() => setTplModal(false)} templates={templates} refresh={load} />
    </div>
  );
}

function TemplatesModal({ open, onClose, templates, refresh }) {
  const [busy, setBusy] = useState('');
  async function del(t) {
    if (!window.confirm(`Delete template "${t.name}"?`)) return;
    setBusy(t.id);
    try { await api.delete(`/proposals/templates/${t.id}`); toast.success('Template deleted'); refresh(); }
    catch { toast.error('Could not delete'); }
    finally { setBusy(''); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Proposal templates" subtitle="Reusable terms you can start a proposal from">
      {templates.length === 0 ? (
        <p className="text-sm text-slate-500 py-4">No templates yet. When editing a proposal, click <strong>Save as template</strong> to save its wording, items and payment schedule for reuse.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {templates.map(t => (
            <div key={t.id} className="flex items-center justify-between py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">{t.name}</p>
                <p className="text-xs text-slate-400">{(t.items || []).length} item(s) · {(t.milestones || []).length} milestone(s)</p>
              </div>
              <button onClick={() => del(t)} disabled={busy === t.id} className="text-slate-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-lg disabled:opacity-40"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
