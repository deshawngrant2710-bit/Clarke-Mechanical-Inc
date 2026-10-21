import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, StatCard, Btn, Spinner, Empty, Modal, Input, Select, Textarea } from '../components/UI';
import SignaturePad from '../components/SignaturePad';
import { FileStack, Plus, Check, DollarSign, AlertTriangle, Trash2, Pencil, Ban, Clock, Mail, FileText, ShieldCheck, Eye, Loader2, FileCheck2, ClipboardList, RotateCcw, X } from 'lucide-react';
import toast from 'react-hot-toast';

const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(String(d).length <= 10 ? String(d) + 'T00:00:00' : d);
  return isNaN(dt) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
};
const today = () => new Date().toISOString().slice(0, 10);
const blank = () => ({ type: 'bill', vendor_id: '', vendor_name: '', invoice_number: '', amount: '', bill_date: today(), due_date: '', notes: '' });

const STATUS = {
  pending_review: { label: 'To review', cls: 'bg-amber-100 text-amber-700' },
  open: { label: 'Owed', cls: 'bg-blue-100 text-blue-700' },
  paid: { label: 'Paid', cls: 'bg-emerald-100 text-emerald-700' },
  void: { label: 'Void', cls: 'bg-slate-100 text-slate-500' },
  approved: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-700' },
  declined: { label: 'Declined', cls: 'bg-rose-100 text-rose-700' },
  cleared: { label: 'Cleared', cls: 'bg-emerald-100 text-emerald-700' },
};
// Estimate & statement records live alongside bills but aren't money owed.
const isEstimate = (b) => b.type === 'estimate';
const isStatement = (b) => b.type === 'statement';
const isPayable = (b) => !isEstimate(b) && !isStatement(b);

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
  const [sigView, setSigView] = useState(null);
  const [decide, setDecide] = useState(null); // estimate approve/decline modal
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
    if (tab === 'owed') return b.filter(x => isPayable(x) && x.status === 'open');
    if (tab === 'review') return b.filter(x => isPayable(x) && x.status === 'pending_review');
    if (tab === 'estimates') return b.filter(isEstimate);
    if (tab === 'statements') return b.filter(isStatement);
    if (tab === 'paid') return b.filter(x => isPayable(x) && x.status === 'paid');
    if (tab === 'void') return b.filter(x => x.status === 'void');
    return b;
  }, [bills, tab]);

  // Open bills still owed per vendor — used to show a statement's remaining balance.
  const owedByVendor = useMemo(() => {
    const m = {};
    (bills || []).filter(x => isPayable(x) && x.status === 'open').forEach(x => {
      const k = x.vendor_id || (x.vendor_name || '').toLowerCase();
      m[k] = (m[k] || 0) + (Number(x.amount) || 0);
    });
    return m;
  }, [bills]);
  const vendorRemaining = (b) => owedByVendor[b.vendor_id || (b.vendor_name || '').toLowerCase()] || 0;

  const setField = (k, v) => setModal(m => ({ ...m, form: { ...m.form, [k]: v } }));
  const openNew = () => { setErr(''); setModal({ id: null, form: blank() }); };
  const openEdit = (b) => { setErr(''); setModal({ id: b.id, form: { type: b.type === 'refund' || (b.amount || 0) < 0 ? 'refund' : 'bill', vendor_id: b.vendor_id || '', vendor_name: b.vendor_name || '', invoice_number: b.invoice_number || '', amount: Math.abs(b.amount ?? 0) || '', bill_date: (b.bill_date || '').slice(0, 10) || today(), due_date: (b.due_date || '').slice(0, 10), notes: b.notes || '' } }); };

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
      <PageHeader title="Vendor Bills" subtitle="What you owe your vendors (accounts payable)" icon={<FileStack size={20} />}>
        <Btn onClick={openNew}><Plus size={16} /> Add bill</Btn>
      </PageHeader>

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

      <div className="flex flex-wrap gap-2 mb-4">
        {[['owed', 'Owed'], ['review', 'To review'], ['estimates', 'Estimates'], ['statements', 'Statements'], ['paid', 'Paid'], ['void', 'Voided'], ['all', 'All']].map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === k ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{lbl}</button>
        ))}
      </div>

      {bills === null ? <Spinner /> : shown.length === 0 ? (
        <Empty icon={<FileStack size={22} />} title={tab === 'estimates' ? 'No estimates here' : tab === 'statements' ? 'No statements here' : 'No bills here'}
          message={tab === 'owed' ? "You're all caught up — nothing owed to vendors."
            : tab === 'estimates' ? 'Vendor quotes you move here from the review screen will show up here to approve or decline.'
            : tab === 'statements' ? 'Vendor statements you move here from the review screen will show up here to reconcile.'
            : tab === 'void' ? 'Nothing voided.' : 'Nothing in this view.'}
          action={tab === 'owed' || tab === 'all' ? <Btn onClick={openNew}><Plus size={16} /> Add bill</Btn> : null} />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="px-5 py-2.5 font-semibold">Vendor</th>
                  <th className="px-5 py-2.5 font-semibold">{tab === 'estimates' ? 'Ref #' : tab === 'statements' ? 'Statement' : 'Invoice #'}</th>
                  <th className="px-5 py-2.5 font-semibold">{tab === 'statements' ? 'Date' : 'Due'}</th>
                  <th className="px-5 py-2.5 font-semibold">Status</th>
                  <th className="px-5 py-2.5 font-semibold text-right">{tab === 'statements' ? 'Remaining' : 'Amount'}</th>
                  <th className="px-5 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map(b => {
                  const est = isEstimate(b), stm = isStatement(b);
                  const overdue = !est && !stm && ['open', 'pending_review'].includes(b.status) && b.due_date && b.due_date < today();
                  const isRefundBill = b.type === 'refund' || (!est && !stm && (b.amount || 0) < 0);
                  const st = (isRefundBill && b.status === 'paid') ? { label: 'Refunded', cls: 'bg-violet-100 text-violet-700' } : (STATUS[b.status] || STATUS.open);
                  const remaining = stm ? vendorRemaining(b) : 0;
                  return (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <div className="text-slate-800 font-medium">{b.vendor_name || 'Vendor'}</div>
                        {stm && <div className="text-[11px] text-slate-400 mt-0.5">Statement total {money(b.amount)}</div>}
                        {b.approved_by && (
                          <button onClick={() => setSigView(b)} className="text-[11px] text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1 mt-0.5">
                            <ShieldCheck size={11} /> Signed off by {b.approved_by}{b.approval_signature ? ' · view' : ''}
                          </button>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-500">{b.invoice_number || '—'}</td>
                      <td className={`px-5 py-3 ${overdue ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>{fmtDate(stm ? b.bill_date : b.due_date)}</td>
                      <td className="px-5 py-3"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span></td>
                      <td className="px-5 py-3 text-right font-semibold whitespace-nowrap">
                        {stm
                          ? <span className={remaining > 0 ? 'text-orange-600' : 'text-emerald-600'}>{money(remaining)}{remaining <= 0 ? ' ✓' : ''}</span>
                          : <span className="text-slate-900">{money(b.amount)}</span>}
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        {/* Estimates: approve / decline */}
                        {est && b.status === 'pending_review' && <button title="Approve or decline estimate" onClick={() => setDecide(b)} className="text-blue-600 hover:text-blue-700 p-1"><FileCheck2 size={16} /></button>}
                        {est && (b.status === 'approved' || b.status === 'declined') && <button title="Change decision" onClick={() => setDecide(b)} className="text-slate-400 hover:text-blue-600 p-1"><Pencil size={15} /></button>}
                        {/* Statements: mark cleared / reopen */}
                        {stm && b.status !== 'cleared' && <button title="Mark statement cleared" onClick={() => { if (window.confirm(`Confirm this ${b.vendor_name || 'vendor'} statement is cleared / reconciled?`)) act(`/vendor-bills/${b.id}/statement-clear`, { cleared: true }); }} className="text-slate-400 hover:text-emerald-600 p-1"><Check size={16} /></button>}
                        {stm && b.status === 'cleared' && <button title="Reopen statement" onClick={() => act(`/vendor-bills/${b.id}/statement-clear`, { cleared: false })} className="text-slate-400 hover:text-amber-600 p-1"><RotateCcw size={15} /></button>}
                        {/* Bills: review / mark paid */}
                        {!est && !stm && b.status === 'pending_review' && <button title="Review invoice" onClick={() => setReview(b)} className="text-blue-600 hover:text-blue-700 p-1"><Eye size={16} /></button>}
                        {!est && !stm && ['open', 'pending_review'].includes(b.status) && <button title="Mark paid" onClick={() => { if (window.confirm(`Mark ${money(b.amount)} to ${b.vendor_name || 'vendor'} as paid?`)) act(`/vendor-bills/${b.id}/mark-paid`); }} className="text-slate-400 hover:text-emerald-600 p-1"><DollarSign size={16} /></button>}
                        {/* View PDF (any type that has one, except while in the review modal path) */}
                        {b.attachment?.has_data && !(!est && !stm && b.status === 'pending_review') && <button title="View PDF" onClick={() => viewPdf(b.id)} className="text-slate-400 hover:text-blue-600 p-1"><FileText size={15} /></button>}
                        <button title="Edit" onClick={() => openEdit(b)} className="text-slate-400 hover:text-blue-600 p-1"><Pencil size={15} /></button>
                        {b.status === 'void'
                          ? <button title="Unvoid" onClick={() => act(`/vendor-bills/${b.id}/unvoid`)} className="text-slate-400 hover:text-emerald-600 p-1"><RotateCcw size={15} /></button>
                          : <button title="Void" onClick={() => { if (window.confirm('Void this record?')) act(`/vendor-bills/${b.id}/void`); }} className="text-slate-400 hover:text-amber-600 p-1"><Ban size={15} /></button>}
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
            {!modal.id && (
              <Select label="Type" value={modal.form.type} onChange={e => setField('type', e.target.value)}>
                <option value="bill">Bill — we owe this vendor</option>
                <option value="refund">Refund / credit — vendor paid us back</option>
              </Select>
            )}
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

      {decide && <EstimateDecisionModal bill={decide} onClose={() => setDecide(null)} onSaved={() => { setDecide(null); load(); }} />}

      {sigView && (
        <Modal open onClose={() => setSigView(null)} title="Management sign-off" size="md"
          footer={<Btn variant="outline" onClick={() => setSigView(null)}>Close</Btn>}>
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 p-4 text-sm space-y-1.5">
              <div className="flex justify-between"><span className="text-slate-500">Vendor</span><span className="font-semibold text-slate-800">{sigView.vendor_name || 'Vendor'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Amount</span><span className="font-semibold text-slate-900">{money(sigView.amount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Approved by</span><span className="font-semibold text-slate-800">{sigView.approved_by}</span></div>
              {sigView.approved_at && <div className="flex justify-between"><span className="text-slate-500">Date</span><span className="text-slate-700">{fmtDate(sigView.approved_at)}</span></div>}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-1">Signature</p>
              {sigView.approval_signature
                ? <img src={sigView.approval_signature} alt="Approval signature" className="w-full max-h-48 object-contain border border-slate-200 rounded-lg bg-white" />
                : <p className="text-sm text-slate-400">Approved without a signature (e.g. a refund).</p>}
            </div>
          </div>
        </Modal>
      )}
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
  const [signing, setSigning] = useState(false);
  const [signer, setSigner] = useState(() => { try { return JSON.parse(localStorage.getItem('user') || '{}').name || ''; } catch { return ''; } });
  const sigRef = useRef(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isRefund = Number(form.amount) < 0;

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
  const startApprove = () => {
    if (!form.amount || Number(form.amount) === 0) return toast.error('Enter the amount before approving');
    setSigning(true);
  };
  const confirmApprove = async () => {
    // Signature is optional — management can approve with or without signing.
    setBusy(true);
    try {
      await saveFields();
      const sig = sigRef.current && !sigRef.current.isEmpty() ? sigRef.current.toDataURL() : undefined;
      const body = { signer: signer.trim() || undefined, signature: sig };
      if (isRefund) { await api.post(`/vendor-bills/${bill.id}/mark-paid`, { method: 'refund', ...body }); toast.success('Refund approved & recorded.'); }
      else { await api.post(`/vendor-bills/${bill.id}/approve`, body); toast.success('Approved by management.'); }
      onSaved();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not approve'); } finally { setBusy(false); }
  };
  const justSave = async () => {
    setBusy(true);
    try { await saveFields(); toast.success('Saved'); onSaved(); } catch { toast.error('Could not save'); } finally { setBusy(false); }
  };
  const moveTo = async (type) => {
    setBusy(true);
    try {
      await saveFields();
      await api.post(`/vendor-bills/${bill.id}/reclassify`, { type });
      toast.success(type === 'estimate' ? 'Moved to Estimates.' : 'Moved to Statements.');
      onSaved();
    } catch { toast.error('Could not move this document'); } finally { setBusy(false); }
  };

  if (signing) {
    return (
      <Modal open onClose={onClose} title="Management authorization" subtitle={`Sign to ${isRefund ? 'record this refund' : 'approve this bill'}`} size="md"
        footer={<>
          <Btn variant="outline" onClick={() => setSigning(false)}>Back</Btn>
          <Btn onClick={confirmApprove} loading={busy}><Check size={15} /> {isRefund ? 'Confirm refund' : 'Confirm & approve'}</Btn>
        </>}>
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 p-3 text-sm flex items-center justify-between">
            <span className="text-slate-500">{isRefund ? 'Refund from' : 'Bill from'} {form.vendor_name || vendors.find(v => v.id === form.vendor_id)?.name || 'vendor'}</span>
            <span className="font-bold text-slate-900">${Math.abs(Number(form.amount) || 0).toFixed(2)}</span>
          </div>
          <Input label="Approved by (manager)" value={signer} onChange={e => setSigner(e.target.value)} placeholder="Manager name" />
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-slate-700">Signature (optional)</label>
              <button type="button" onClick={() => sigRef.current?.clear()} className="text-xs text-slate-400 hover:text-slate-600">Clear</button>
            </div>
            <div className="border border-slate-300 rounded-lg overflow-hidden"><SignaturePad ref={sigRef} height={180} /></div>
          </div>
          <p className="text-[11px] text-slate-400">Your signature and name are stored on this bill as the approval record.</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Review vendor document" subtitle="Check it against the PDF. If it's a quote or statement, move it; otherwise approve it as a bill." size="xl"
      footer={<>
        <Btn variant="outline" onClick={onClose}>Close</Btn>
        <Btn variant="outline" onClick={() => moveTo('estimate')} loading={busy}><FileCheck2 size={15} /> It's an estimate</Btn>
        <Btn variant="outline" onClick={() => moveTo('statement')} loading={busy}><ClipboardList size={15} /> It's a statement</Btn>
        <Btn onClick={startApprove} loading={busy}><Check size={15} /> Approve as bill</Btn>
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

// Approve or decline a vendor estimate (quote), with an optional management signature.
function EstimateDecisionModal({ bill, onClose, onSaved }) {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState(bill.amount ?? '');
  const [signer, setSigner] = useState(() => { try { return JSON.parse(localStorage.getItem('user') || '{}').name || ''; } catch { return ''; } });
  const sigRef = useRef(null);

  useEffect(() => {
    let url;
    if (bill.attachment?.has_data) {
      api.get(`/vendor-bills/${bill.id}/attachment`, { responseType: 'blob' })
        .then(r => { url = URL.createObjectURL(r.data); setPdfUrl(url); }).catch(() => {});
    }
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [bill.id]);

  const decide = async (decision) => {
    setBusy(true);
    try {
      const sig = sigRef.current && !sigRef.current.isEmpty() ? sigRef.current.toDataURL() : undefined;
      await api.post(`/vendor-bills/${bill.id}/estimate-decision`, {
        decision, signer: signer.trim() || undefined, signature: sig,
        amount: amount === '' ? undefined : Number(amount),
      });
      toast.success(decision === 'approved' ? 'Estimate approved.' : 'Estimate declined.');
      onSaved();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not save decision'); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title="Review vendor estimate" subtitle="Approve the quote or decline it" size="xl"
      footer={<>
        <Btn variant="outline" onClick={onClose}>Close</Btn>
        <Btn variant="danger" onClick={() => decide('declined')} loading={busy}><X size={15} /> Decline</Btn>
        <Btn onClick={() => decide('approved')} loading={busy}><Check size={15} /> Approve estimate</Btn>
      </>}>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-slate-100 rounded-xl overflow-hidden">
          {bill.attachment?.has_data ? (
            pdfUrl
              ? <iframe src={pdfUrl} title="Estimate PDF" className="w-full h-[300px] md:h-[460px] bg-white" />
              : <div className="flex items-center justify-center h-[300px] md:h-[460px] text-slate-400"><Loader2 size={18} className="animate-spin" /></div>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-slate-400 text-sm p-4 text-center">No PDF on this estimate.</div>
          )}
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 p-3 text-sm space-y-1.5">
            <div className="flex justify-between"><span className="text-slate-500">Vendor</span><span className="font-semibold text-slate-800">{bill.vendor_name || 'Vendor'}</span></div>
            {bill.invoice_number && <div className="flex justify-between"><span className="text-slate-500">Ref #</span><span className="text-slate-700">{bill.invoice_number}</span></div>}
          </div>
          <Input label="Quoted amount" type="number" step="0.01" min="0" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
          <Input label="Decided by (manager)" value={signer} onChange={e => setSigner(e.target.value)} placeholder="Manager name" />
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-slate-700">Signature (optional)</label>
              <button type="button" onClick={() => sigRef.current?.clear()} className="text-xs text-slate-400 hover:text-slate-600">Clear</button>
            </div>
            <div className="border border-slate-300 rounded-lg overflow-hidden"><SignaturePad ref={sigRef} height={150} /></div>
          </div>
          <p className="text-[11px] text-slate-400">Approving records that management authorized this quote. It does not add money owed — convert it to a bill when the invoice arrives.</p>
        </div>
      </div>
    </Modal>
  );
}
