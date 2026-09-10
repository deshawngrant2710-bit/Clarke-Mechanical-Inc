import { useEffect, useRef, useState } from 'react';
import api from '../api/client';
import { Card, Btn, Badge, Spinner, Empty, Input } from '../components/UI';
import SignaturePad from '../components/SignaturePad';
import { FileSignature, ArrowLeft, CheckCircle2, Download, Printer } from 'lucide-react';
import { printDocument, downloadPdf } from '../lib/printDoc';
import { sanitizeRich } from '../lib/richText';
import toast from 'react-hot-toast';

const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => (d ? new Date(String(d).length <= 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

export default function CustomerProposals() {
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null);   // full proposal being viewed
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const sigRef = useRef(null);

  function load() { api.get('/portal/proposals').then(r => setList(r.data)).catch(() => setList([])); }
  useEffect(load, []);

  async function view(p) {
    setBusy(true);
    try { const { data } = await api.get(`/portal/proposals/${p.id}`); setOpen(data); setName(''); setAgreed(false); }
    catch { toast.error('Could not open proposal'); }
    finally { setBusy(false); }
  }

  async function accept() {
    if (!name.trim()) return toast.error('Please type your full name');
    if (!agreed) return toast.error('Please tick the box to agree to the terms');
    if (sigRef.current?.isEmpty()) return toast.error('Please draw your signature');
    setBusy(true);
    try {
      const image = sigRef.current.toDataURL();
      const { data } = await api.post(`/portal/proposals/${open.id}/accept`, { name: name.trim(), image });
      setOpen(data);
      toast.success('Thank you — your proposal is signed.');
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not submit'); }
    finally { setBusy(false); }
  }

  async function docPayload(p) {
    let b = {};
    try { b = (await api.get('/auth/public-info')).data || {}; } catch { /* defaults */ }
    return {
      kind: 'proposal', doc: p,
      business: { name: b.business_name, phone: b.business_phone, email: b.business_email, address: b.business_address, website: b.business_website },
      customer: { name: p.customer_name },
    };
  }

  if (list === null) return <Spinner />;

  /* ---- Reading / signing one proposal ---- */
  if (open) {
    const signed = open.status === 'accepted' && open.signature;
    return (
      <div className="animate-fade-in max-w-3xl mx-auto">
        <button onClick={() => setOpen(null)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
          <ArrowLeft size={15} /> Back
        </button>

        <Card className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-3 mb-1">
            <div>
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Proposal {open.proposal_number}</p>
              <h1 className="text-xl font-bold text-slate-900 mt-1">{open.title}</h1>
            </div>
            <Badge status={open.status} />
          </div>
          <p className="text-sm text-slate-500 mb-5">Dated {fmtDate(open.issue_date)}{open.expiry_date ? ` · Valid until ${fmtDate(open.expiry_date)}` : ''}</p>

          {/* Body */}
          <div className="prose-sm max-w-none text-slate-700 leading-relaxed whitespace-pre-wrap mb-6"
            dangerouslySetInnerHTML={{ __html: sanitizeRich(open.body) }} />

          {/* Items */}
          {(open.items || []).length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden mb-5">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                  <tr><th className="px-4 py-2.5 font-semibold">Description</th><th className="px-4 py-2.5 font-semibold text-right">Qty</th><th className="px-4 py-2.5 font-semibold text-right">Amount</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {open.items.map((it, i) => (
                    <tr key={i}><td className="px-4 py-2.5 text-slate-700">{it.description}</td><td className="px-4 py-2.5 text-right text-slate-500">{it.quantity}</td><td className="px-4 py-2.5 text-right font-medium text-slate-800">{money(it.total)}</td></tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-end gap-6 px-4 py-3 bg-slate-50 text-sm">
                <span className="text-slate-500">Total</span><span className="font-bold text-slate-900">{money(open.total)}</span>
              </div>
            </div>
          )}

          {/* Payment schedule */}
          {(open.milestones || []).length > 0 && (
            <div className="mb-6">
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">Payment schedule</p>
              <div className="space-y-1.5">
                {open.milestones.map((m, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-slate-600">{m.label}{m.due ? ` · ${fmtDate(m.due)}` : ''}</span>
                    <span className="font-medium text-slate-800">{m.percent != null ? `${m.percent}%  ` : ''}{money(m.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PDF actions */}
          <div className="flex gap-2 mb-6">
            <Btn variant="outline" size="sm" onClick={async () => downloadPdf(await docPayload(open))}><Download size={14} /> PDF</Btn>
            <Btn variant="outline" size="sm" onClick={async () => printDocument(await docPayload(open))}><Printer size={14} /> Print</Btn>
          </div>

          {/* Signature */}
          {signed ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 size={16} /> Accepted &amp; signed</p>
              <p className="text-sm text-emerald-800 mt-1">Signed by {open.signature.name} on {fmtDate(open.signature.signed_at)}.</p>
              {open.signature.image && <img src={open.signature.image} alt="signature" className="mt-3 h-16 bg-white rounded border border-emerald-200" />}
            </div>
          ) : ['declined', 'expired'].includes(open.status) ? (
            <p className="text-sm text-slate-500">This proposal is no longer available for signing. Please contact our office if you have questions.</p>
          ) : (
            <div className="rounded-xl border border-slate-200 p-4 sm:p-5">
              <p className="text-sm font-semibold text-slate-800 mb-3">Review &amp; sign</p>
              <Input label="Type your full name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Danielle Ortiz" />
              <label className="block text-sm font-medium text-slate-700 mt-3 mb-1.5">Draw your signature</label>
              <div className="border border-slate-300 rounded-lg overflow-hidden">
                <SignaturePad ref={sigRef} height={170} />
              </div>
              <label className="flex items-start gap-2 mt-3 text-sm text-slate-600">
                <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-1" />
                <span>I have read and agree to the scope of work, pricing and terms set out in this proposal.</span>
              </label>
              <Btn className="w-full mt-4" onClick={accept} loading={busy}><CheckCircle2 size={16} /> Accept &amp; Sign</Btn>
            </div>
          )}
        </Card>
      </div>
    );
  }

  /* ---- List ---- */
  return (
    <div className="animate-fade-in max-w-3xl mx-auto">
      <div className="flex items-center gap-2.5 mb-5">
        <FileSignature size={22} className="text-slate-400" />
        <h1 className="text-xl font-bold text-slate-900">Proposals &amp; Contracts</h1>
      </div>
      {list.length === 0 ? (
        <Empty icon={<FileSignature size={28} />} title="No proposals yet" message="When we send you a proposal or contract, it'll appear here to review and sign." />
      ) : (
        <div className="space-y-3">
          {list.map(p => (
            <Card key={p.id} hover onClick={() => view(p)} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 truncate">{p.title || p.proposal_number}</p>
                <p className="text-xs text-slate-400 mt-0.5">{p.proposal_number} · {money(p.total)}{p.expiry_date ? ` · valid until ${fmtDate(p.expiry_date)}` : ''}</p>
              </div>
              <Badge status={p.status} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
