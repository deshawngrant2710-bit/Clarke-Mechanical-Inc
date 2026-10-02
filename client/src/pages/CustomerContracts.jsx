import { useEffect, useRef, useState } from 'react';
import api from '../api/client';
import { Card, Btn, Badge, Spinner, Empty, Modal, Input } from '../components/UI';
import SignaturePad from '../components/SignaturePad';
import { Flame, Download, Printer, CheckCircle2, Check, CreditCard, ShieldCheck } from 'lucide-react';
import { printDocument, downloadPdf } from '../lib/printDoc';
import { contractDocPayload, packageFor, money } from '../lib/boilerContract';
import { loadHelcimPayJs } from '../lib/helcimPay';
import toast from 'react-hot-toast';

const fmtDate = (d) => (d ? new Date(String(d).length <= 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const ACCEPTED = ['accepted', 'active', 'expiring_soon', 'expired'];

export default function CustomerContracts() {
  const [list, setList] = useState(null);
  const [me, setMe] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);     // full contract + tier_options + fee_invoice
  const [selected, setSelected] = useState([]);    // chosen tier ids
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false);
  const sigRef = useRef(null);

  function loadList() { api.get('/portal/contracts').then(r => setList(r.data)).catch(() => setList([])); }
  useEffect(() => {
    loadList();
    api.get('/auth/public-info').then(r => setMe(r.data)).catch(() => setMe({}));
  }, []);

  async function open(id) {
    setOpenId(id); setDetail(null); setSelected([]); setName('');
    try {
      const { data } = await api.get(`/portal/contracts/${id}`);
      setDetail(data);
      setSelected(Array.isArray(data.selected_packages) ? data.selected_packages : []);
    } catch { toast.error('Could not open the agreement'); setOpenId(null); }
  }
  function close() { setOpenId(null); setDetail(null); }

  const tiers = detail?.tier_options || [];
  const isAccepted = detail && ACCEPTED.includes(detail.status);
  const total = tiers.filter(t => selected.includes(t.id)).reduce((s, t) => s + t.price, 0);

  function toggle(id) {
    setSelected(cur => cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
  }

  // HelcimPay card checkout for a portal invoice (same flow as the hosted pay page).
  function payInvoiceByCard(invoiceId) {
    return new Promise(async (resolve, reject) => {
      try {
        const { data: init } = await api.post(`/portal/invoices/${invoiceId}/helcim-initialize`);
        const checkoutToken = init.checkoutToken;
        await loadHelcimPayJs();
        const handler = async (event) => {
          if (!event.data || event.data.eventName !== `helcim-pay-js-${checkoutToken}`) return;
          if (event.data.eventStatus === 'ABORTED') {
            window.removeEventListener('message', handler);
            reject(new Error('Payment was cancelled or did not go through.'));
          }
          if (event.data.eventStatus === 'SUCCESS') {
            window.removeEventListener('message', handler);
            try {
              let msg = event.data.eventMessage;
              if (typeof msg === 'string') msg = JSON.parse(msg);
              await api.post(`/portal/invoices/${invoiceId}/helcim-confirm`, { checkoutToken, data: msg.data, hash: msg.hash });
              window.removeHelcimPayIframe?.();
              resolve();
            } catch (e) { reject(new Error(e.response?.data?.error || 'We could not confirm the payment. If you were charged, contact the office.')); }
          }
        };
        window.addEventListener('message', handler);
        window.appendHelcimPayIframe(checkoutToken);
      } catch (e) { reject(new Error(e.response?.data?.error || e.message || 'Could not start the payment.')); }
    });
  }

  async function acceptAndPay() {
    if (!selected.length) return toast.error('Please select at least one plan');
    if (!name.trim()) return toast.error('Please type your full name to sign');
    if (!sigRef.current || sigRef.current.isEmpty()) return toast.error('Please sign in the box');
    setBusy(true);
    try {
      const image = sigRef.current.toDataURL();
      const { data } = await api.post(`/portal/contracts/${openId}/accept`, { name: name.trim(), image, selected });
      toast.success('Agreement accepted');
      if (data.payments_enabled && data.invoice_id) {
        setPaying(true);
        try {
          await payInvoiceByCard(data.invoice_id);
          toast.success('Payment complete — thank you!');
        } catch (e) {
          toast.error(e.message + ' You can pay from this page anytime.');
        } finally { setPaying(false); }
      } else {
        toast('Our office will send you payment details.', { icon: 'ℹ️' });
      }
      await open(openId); loadList();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not accept the agreement');
    } finally { setBusy(false); }
  }

  async function payNow() {
    if (!detail?.fee_invoice?.id) return;
    setPaying(true);
    try {
      await payInvoiceByCard(detail.fee_invoice.id);
      toast.success('Payment complete — thank you!');
      await open(openId); loadList();
    } catch (e) { toast.error(e.message); }
    finally { setPaying(false); }
  }

  async function buildDoc() {
    const customer = { name: detail.customer_name || (me && me.name) };
    return contractDocPayload({ ...detail, contract_number: detail.contract_number }, me || {}, customer);
  }
  async function view() { try { printDocument(await buildDoc()); } catch { toast.error('Could not open the agreement'); } }
  async function download() { try { await downloadPdf(await buildDoc()); toast.success('Saved'); } catch { toast.error('Could not download'); } }

  if (list === null) return <Spinner />;

  return (
    <div className="animate-fade-in max-w-3xl mx-auto">
      <div className="flex items-center gap-2.5 mb-5">
        <Flame size={22} className="text-slate-400" />
        <h1 className="text-xl font-bold text-slate-900">Service Agreements</h1>
      </div>

      {list.length === 0 ? (
        <Empty icon={<Flame size={28} />} title="No service agreements" message="When we prepare a boiler service agreement for you, it'll appear here to review, sign and pay." />
      ) : (
        <div className="space-y-3">
          {list.map(c => {
            const pk = packageFor(c.package);
            return (
              <Card key={c.id} className="p-4 sm:p-5 cursor-pointer hover:shadow-[var(--shadow-md)] transition" onClick={() => open(c.id)}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Agreement {c.contract_number}</p>
                    <h2 className="font-bold text-slate-900">{c.property_name || c.property_address || 'Boiler service agreement'}</h2>
                  </div>
                  <Badge status={c.status} />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-3">
                  <div className="text-slate-500">Plan</div><div className="text-slate-800 font-medium text-right">{ACCEPTED.includes(c.status) ? (pk ? pk.name : c.package || '—') : 'Choose your plan'}</div>
                  {ACCEPTED.includes(c.status) && (<><div className="text-slate-500">Annual price</div><div className="text-slate-800 font-medium text-right">{money(c.annual_price)}</div></>)}
                  <div className="text-slate-500">Term</div><div className="text-slate-800 text-right">{fmtDate(c.start_date)} – {fmtDate(c.expiry_date)}</div>
                </div>
                <div className="flex justify-end">
                  <Btn size="sm" variant={ACCEPTED.includes(c.status) ? 'outline' : 'primary'} onClick={(e) => { e.stopPropagation(); open(c.id); }}>
                    {ACCEPTED.includes(c.status) ? 'View agreement' : 'Review & sign'}
                  </Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={!!openId} onClose={close} title={detail ? `Agreement ${detail.contract_number}` : 'Service agreement'}
        subtitle={detail?.property_name || detail?.property_address || ''} size="lg">
        {!detail ? <Spinner /> : (
          <div className="space-y-5">
            {isAccepted ? (
              /* ---------- Accepted: summary + payment status ---------- */
              <>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5"><CheckCircle2 size={16} /> Accepted{detail.signature?.name ? ` by ${detail.signature.name}` : ''}</p>
                  {detail.accepted_at && <p className="text-xs text-emerald-700/90 mt-0.5">{new Date(detail.accepted_at).toLocaleString()}</p>}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Your plan{(detail.selected_packages || []).length > 1 ? 's' : ''}</p>
                  <div className="space-y-1.5">
                    {tiers.filter(t => (detail.selected_packages || [detail.package]).includes(t.id)).map(t => (
                      <div key={t.id} className="flex items-center justify-between text-sm">
                        <span className="text-slate-700 flex items-center gap-1.5"><Check size={14} className="text-emerald-500" /> {t.name} <span className="text-slate-400">· {t.frequency}</span></span>
                        <span className="font-semibold text-slate-800">{money(t.price)}/yr</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-sm border-t border-slate-100 pt-1.5 mt-1.5">
                      <span className="font-bold text-slate-900">Annual total</span>
                      <span className="font-bold text-slate-900">{money(detail.accepted_total || detail.annual_price)}</span>
                    </div>
                  </div>
                </div>

                {detail.fee_invoice && (
                  <div className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">Payment</p>
                        <p className="text-xs text-slate-500">Invoice {detail.fee_invoice.invoice_number} · {money(detail.fee_invoice.total)}</p>
                      </div>
                      {detail.fee_invoice.balance <= 0
                        ? <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full"><CheckCircle2 size={14} /> Paid</span>
                        : <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 bg-amber-50 px-3 py-1 rounded-full">{money(detail.fee_invoice.balance)} due</span>}
                    </div>
                    {detail.fee_invoice.balance > 0 && detail.payments_enabled && (
                      <Btn className="w-full justify-center mt-3" onClick={payNow} loading={paying}><CreditCard size={15} /> Pay {money(detail.fee_invoice.balance)} by card</Btn>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <Btn variant="outline" size="sm" onClick={view}><Printer size={14} /> View</Btn>
                  <Btn variant="outline" size="sm" onClick={download}><Download size={14} /> PDF</Btn>
                </div>
              </>
            ) : (
              /* ---------- Not yet accepted: choose plan(s) + sign + pay ---------- */
              <>
                <p className="text-sm text-slate-600">Select the service plan(s) you'd like. You can choose more than one — the annual total updates below.</p>

                <div className="space-y-2.5">
                  {tiers.map(t => {
                    const on = selected.includes(t.id);
                    return (
                      <button key={t.id} type="button" onClick={() => toggle(t.id)}
                        className={`w-full text-left rounded-xl border-2 p-4 transition ${on ? 'border-blue-500 bg-blue-50/60' : 'border-slate-200 hover:border-slate-300'}`}>
                        <div className="flex items-start gap-3">
                          <span className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${on ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                            {on && <Check size={14} className="text-white" strokeWidth={3} />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-bold text-slate-900">{t.name}</p>
                              <p className="font-bold text-slate-900 whitespace-nowrap">{money(t.price)}<span className="text-xs font-medium text-slate-500">/yr</span></p>
                            </div>
                            <p className="text-xs text-slate-500 mb-1.5">{t.frequency} · {t.visits} visits/yr · {t.labor_discount}% repair-labor discount{t.parts_discount ? ` · ${t.parts_discount}% parts` : ''}</p>
                            <ul className="text-xs text-slate-600 space-y-0.5">
                              {t.scope.slice(0, 4).map((s, i) => <li key={i} className="flex items-start gap-1.5"><Check size={12} className="text-emerald-500 mt-0.5 shrink-0" />{s}</li>)}
                              {t.scope.length > 4 && <li className="text-slate-400">+{t.scope.length - 4} more</li>}
                            </ul>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
                  <span className="font-semibold text-slate-700">Annual total</span>
                  <span className="text-lg font-bold text-slate-900">{money(total)}</span>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Type your full name to sign <span className="text-rose-500">*</span></label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. John Smith" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Signature <span className="text-rose-500">*</span></label>
                  <SignaturePad ref={sigRef} height={170} />
                </div>

                <p className="text-[11px] text-slate-400 flex items-start gap-1.5"><ShieldCheck size={13} className="mt-0.5 shrink-0" /> By signing you accept the selected plan(s), scope, price and terms of agreement {detail.contract_number}. Repairs, replacement parts and emergency work are billed separately unless included.</p>

                <Btn className="w-full justify-center" onClick={acceptAndPay} loading={busy || paying} disabled={!selected.length}>
                  <CreditCard size={16} /> {detail.payments_enabled ? `Accept & pay ${money(total)}` : `Accept ${money(total)} agreement`}
                </Btn>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
