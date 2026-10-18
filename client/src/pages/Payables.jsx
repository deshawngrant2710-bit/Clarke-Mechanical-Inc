import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, StatCard, Btn, Spinner, Empty, Modal, Input, Select, Textarea } from '../components/UI';
import { FileStack, Plus, Check, DollarSign, AlertTriangle, Trash2, Pencil, Ban, Clock, Mail, FileText, ShieldCheck, Eye, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(String(d).length <= 10 ? String(d) + 'T00:00:00' : d);
  return isNaN(dt) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
};
const today = () => new Date().toISOString().slice(0, 10);
const blank = () => ({ vendor_id: '', vendor_name: '', invoice_number: '', amount: '', bill_date: today(), due_date: '', notes: '' });

const STATUS = {
  pending_review: { label: 'To review', cls: 'bg-amber-100 text-amber-700' },
  open: { label: 'Owed', cls: 'bg-blue-100 text-blue-700' },
  paid: { label: 'Paid', cls: 'bg-emerald-100 text-emerald-700' },
  void: { label: 'Void', cls: 'bg-slate-100 text-slate-500' },
};

export default function Payables() {
  const [bills, setBills] = useState(null);
  const [summary, setSummary] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [tab, setTab] = useState('owed'); // owed | review | paid | all
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [gmail, setGmail] = useState(null);
  const [review, setReview] = useState(null);
  const [isAdmin] = useState(() => { try { return JSON.parse(localStorage.getItem('user') || '{}').role === 'admin'; } catch { return false; } });

  const load = () => {
    api.get('/vendor-bills').then(r => setBills(r.data)).catch(() => setBills([]));
    api.get('/vendor-bills/summary').then(r => setSummary(r.data)).catch(() => {});
  };
  const loadGmail = () => api.get('/gmail/status').then(r => setGmail(r.data)).catch(() => setGmail(null));
  useEffect(load, []);
  useEffect(() => { api.get('/purchasing/vendors').then(r => setVendors(r.data)).catch(() => {}); loadGmail(); }, []);

  // Returning from the Google authorization flow.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('gmail') === 'connected') { toast.success('Gmail connected — vendor invoices will import automatically.'); loadGmail(); }
    else if (p.get('gmail') === 'error') toast.error('Could not connect Gmail. Please try again.');
    if (p.get('gmail')) { try { window.history.replaceState({}, '', window.location.pathname); } catch {} }
  }, []);

  const connectGmail = async () => {
    try { const { data } = await api.get('/gmail/connect'); window.location.href = data.url; }
    catch (e) { toast.error(e.response?.data?.error || 'Could not start Gmail connection.'); }
  };
  const disconnectGmail = async () => {
    if (!window.confirm('Disconnect Gmail? Invoices will stop importing automatically.')) return;
    try { await api.post('/gmail/disconnect'); loadGmail(); } catch { toast.error('Could not disconnect.'); }
  };
  const viewPdf = async (id) => {
    try {
      const r = await api.get(`/vendor-bills/${id}/attachment`, { responseType: 'blob' });
      window.open(URL.createObjectURL(r.data), '_blank', 'noopener');
    } catch { toast.error('Could not open the PDF.'); }
  };

  const shown = useMemo(() => {
    const b = bills || [];
    if (tab === 'owed') return b.filter(x => x.status === 'open');
    if (tab === 'review') return b.filter(x => x.status === 'pending_review');
    if (tab === 'paid') return b.filter(x => x.status === 'paid');
    return b;
  }, [bills, tab]);

  const setField = (k, v) => setModal(m => ({ ...m, form: { ...m.form, [k]: v } }));
  const openNew = () => { setErr(''); setModal({ id: null, form: blank() }); };
  const openEdit = (b) => { setErr(''); setModal({ id: b.id, form: { vendor_id: b.vendor_id || '', vendor_name: b.vendor_name || '', invoice_number: b.invoice_number || '', amount: b.amount ?? '', bill_date: (b.bill_date || '').slice(0, 10) || today(), due_date: (b.due_date || '').slice(0, 10), notes: b.notes || '' } }); };

  const save = async () => {
    const f = { ...modal.form };
    if (f.vendor_id) f.vendor_name = vendors.find(v => v.id === f.vendor_id)?.name || f.vendor_name;
    if (!(Number(f.amount) > 0)) { setErr('Enter an amount greater than zero'); return; }
    if (!f.vendor_id && !f.vendor_name.trim()) { setErr('Choose or name a vendor'); return; }
    setSaving(true); setErr('');
    try {
      if (modal.id) await api.put(`/vendor-bills/${modal.id}`, f); else await api.post('/vendor-bills', f);
      setModal(null); load();
    } catch (e) { setErr(e.response?.data?.error || 'Could not save'); } finally { setSaving(false); }
  };
  const act = async (url, body) => { try { await api.post(url, body || {}); load(); } catch (e) { alert(e.response?.data?.error || 'Action failed'); } };
  const del = async (b) => { if (!window.confirm('Delete this bill?')) return; try { await api.delete(`/vendor-bills/${b.id}`); load(); } catch { alert('Could not delete'); } };

  return (
    <div className="animate-fade-in">
      <PageHeader title="Vendor Bills" subtitle="What you owe your vendors (accounts payable)" icon={<FileStack size={20} />}
        action={<Btn onClick={openNew}><Plus size={16} /> Add bill</Btn>} />

      {/* Gmail auto-import status */}
      {gmail && (gmail.connected ? (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-emerald-800"><ShieldCheck size={16} /> Inbox connected{gmail.email ? ` (${gmail.email})` : ''} — vendor invoices import automatically.</div>
          {isAdmin && <button onClick={disconnectGmail} className="text-xs text-slate-500 hover:text-red-600">Disconnect</button>}
        </div>
      ) : gmail.configured ? (
        <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-700"><Mail size={16} className="text-blue-600" /> Auto-capture vendor invoices from your inbox — connect Gmail (read-only).</div>
          {isAdmin ? <Btn size="sm" onClick={connectGmail}><Mail size={14} /> Connect Gmail</Btn> : <span className="text-xs text-slate-400">Ask an admin to connect.</span>}
        </div>
      ) : isAdmin ? (
        <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 flex items-center gap-2"><Mail size={16} /> Email auto-import needs the Google keys added in Render first (see DEPLOY.md).</div>
      ) : null)}

      <div className="grid grid-cols-3 gap-4 mb-5">
        <StatCard label="Outstanding" value={summary?.outstanding || 0} prefix="$" decimals={2} icon={<DollarSign size={18} />} color="orange" />
        <StatCard label="Overdue" value={summary?.overdue || 0} prefix="$" decimals={2} icon={<AlertTriangle size={18} />} color="red" />
        <StatCard label="To review" value={summary?.to_review || 0} icon={<Clock size={18} />} color="blue" animate={false} />
      </div>

      <div className="flex gap-2 mb-4">
        {[['owed', 'Owed'], ['review', 'To review'], ['paid', 'Paid'], ['all', 'All']].map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === k ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{lbl}</button>
        ))}
      </div>

      {bills === null ? <Spinner /> : shown.length === 0 ? (
        <Empty icon={<FileStack size={22} />} title="No bills here" message={tab === 'owed' ? "You're all caught up — nothing owed to vendors." : 'Nothing in this view.'} action={<Btn onClick={openNew}><Plus size={16} /> Add bill</Btn>} />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="px-5 py-2.5 font-semibold">Vendor</th>
                  <th className="px-5 py-2.5 font-semibold">Invoice #</th>
                  <th className="px-5 py-2.5 font-semibold">Due</th>
                  <th className="px-5 py-2.5 font-semibold">Status</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Amount</th>
                  <th className="px-5 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map(b => {
                  const overdue = ['open', 'pending_review'].includes(b.status) && b.due_date && b.due_date < today();
                  const st = STATUS[b.status] || STATUS.open;
                  return (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3 text-slate-800 font-medium">{b.vendor_name || 'Vendor'}</td>
                      <td className="px-5 py-3 text-slate-500">{b.invoice_number || '—'}</td>
                      <td className={`px-5 py-3 ${overdue ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>{fmtDate(b.due_date)}</td>
                      <td className="px-5 py-3"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span></td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">{money(b.amount)}</td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        {b.status === 'pending_review' && <button title="Review invoice" onClick={() => setReview(b)} className="text-blue-600 hover:text-blue-700 p-1"><Eye size={16} /></button>}
                        {b.attachment?.has_data && b.status !== 'pending_review' && <button title="View invoice PDF" onClick={() => viewPdf(b.id)} className="text-slate-400 hover:text-blue-600 p-1"><FileText size={15} /></button>}
                        {['open', 'pending_review'].includes(b.status) && <button title="Mark paid" onClick={() => { if (window.confirm(`Mark ${money(b.amount)} to ${b.vendor_name || 'vendor'} as paid?`)) act(`/vendor-bills/${b.id}/mark-paid`); }} className="text-slate-400 hover:text-emerald-600 p-1"><DollarSign size={16} /></button>}
                        <button title="Edit" onClick={() => openEdit(b)} className="text-slate-400 hover:text-blue-600 p-1"><Pencil size={15} /></button>
                        {b.status !== 'void' && <button title="Void" onClick={() => { if (window.confirm('Void this bill?')) act(`/vendor-bills/${b.id}/void`); }} className="text-slate-400 hover:text-amber-600 p-1"><Ban size={15} /></button>}
                        <button title="Delete" onClick={() => del(b)} className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit bill' : 'Add vendor bill'}
        footer={<><Btn variant="outline" onClick={() => setModal(null)}>Cancel</Btn><Btn onClick={save} loading={saving}>{modal?.id ? 'Save' : 'Add bill'}</Btn></>}>
        {modal && (
          <div className="space-y-4">
            {err && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{err}</div>}
            <Select label="Vendor" value={modal.form.vendor_id} onChange={e => setField('vendor_id', e.target.value)}>
              <option value="">Select a vendor…</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
            {!modal.form.vendor_id && <Input label="Or type vendor name" value={modal.form.vendor_name} onChange={e => setField('vendor_name', e.target.value)} placeholder="Vendor name" />}
            <div className="grid grid-cols-2 gap-3">
              <Input label="Invoice #" value={modal.form.invoice_number} onChange={e => setField('invoice_number', e.target.value)} placeholder="Optional" />
              <Input label="Amount" type="number" step="0.01" min="0" inputMode="decimal" value={modal.form.amount} onChange={e => setField('amount', e.target.value)} placeholder="0.00" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Bill date" type="date" value={modal.form.bill_date} onChange={e => setField('bill_date', e.target.value)} />
              <Input label="Due date" type="date" value={modal.form.due_date} onChange={e => setField('due_date', e.target.value)} />
            </div>
            <Textarea label="Notes (optional)" value={modal.form.notes} onChange={e => setField('notes', e.target.value)} placeholder="What this bill is for" />
          </div>
        )}
      </Modal>

      {review && <ReviewModal bill={review} vendors={vendors} onClose={() => setReview(null)} onSaved={() => { setReview(null); load(); }} />}
    </div>
  );
}

// Side-by-side review: the real invoice PDF next to the AI-extracted fields, so you
// verify (and fix) the amount/dates against the invoice, then approve.
function ReviewModal({ bill, vendors, onClose, onSaved }) {
  const [form, setForm] = useState({
    vendor_id: bill.vendor_id || '', vendor_name: bill.vendor_name || '',
    invoice_number: bill.invoice_number || '', amount: bill.amount ?? '',
    bill_date: (bill.bill_date || '').slice(0, 10), due_date: (bill.due_date || '').slice(0, 10), notes: bill.notes || '',
  });
  const [pdfUrl, setPdfUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    let url;
    if (bill.attachment?.has_data) {
      api.get(`/vendor-bills/${bill.id}/attachment`, { responseType: 'blob' })
        .then(r => { url = URL.createObjectURL(r.data); setPdfUrl(url); }).catch(() => {});
    }
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [bill.id]);

  const saveFields = async () => {
    const f = { ...form };
    if (f.vendor_id) f.vendor_name = vendors.find(v => v.id === f.vendor_id)?.name || f.vendor_name;
    await api.put(`/vendor-bills/${bill.id}`, f);
  };
  const approve = async () => {
    if (!(Number(form.amount) > 0)) return toast.error('Enter the amount before approving');
    setBusy(true);
    try { await saveFields(); await api.post(`/vendor-bills/${bill.id}/approve`); toast.success('Approved — now owed.'); onSaved(); }
    catch (e) { toast.error(e.response?.data?.error || 'Could not approve'); } finally { setBusy(false); }
  };
  const justSave = async () => {
    setBusy(true);
    try { await saveFields(); toast.success('Saved'); onSaved(); } catch { toast.error('Could not save'); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title="Review vendor invoice" subtitle="Check the details against the PDF, then approve" size="xl"
      footer={<>
        <Btn variant="outline" onClick={onClose}>Close</Btn>
        <Btn variant="outline" onClick={justSave} loading={busy}>Save</Btn>
        <Btn onClick={approve} loading={busy}><Check size={15} /> Approve</Btn>
      </>}>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-slate-100 rounded-xl overflow-hidden">
          {bill.attachment?.has_data ? (
            pdfUrl
              ? <iframe src={pdfUrl} title="Invoice PDF" className="w-full h-[300px] md:h-[520px] bg-white" />
              : <div className="flex items-center justify-center h-[300px] md:h-[520px] text-slate-400"><Loader2 size={18} className="animate-spin" /></div>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-slate-400 text-sm p-4 text-center">No PDF on this bill — enter the details manually.</div>
          )}
        </div>
        <div className="space-y-3">
          <p className="text-xs text-slate-500">The AI filled these in — fix anything that doesn't match the invoice, then Approve.</p>
          <Select label="Vendor" value={form.vendor_id} onChange={e => set('vendor_id', e.target.value)}>
            <option value="">{form.vendor_name ? `${form.vendor_name} (unlinked)` : 'Select a vendor…'}</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Invoice #" value={form.invoice_number} onChange={e => set('invoice_number', e.target.value)} />
            <Input label="Amount" type="number" step="0.01" min="0" inputMode="decimal" value={form.amount} onChange={e => set('amount', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Bill date" type="date" value={form.bill_date} onChange={e => set('bill_date', e.target.value)} />
            <Input label="Due date" type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
          </div>
          <Textarea label="Notes" value={form.notes} onChange={e => set('notes', e.target.value)} />
          {bill.email_from && <p className="text-[11px] text-slate-400">From: {bill.email_from}{bill.email_subject ? ` · ${bill.email_subject}` : ''}</p>}
        </div>
      </div>
    </Modal>
  );
}
