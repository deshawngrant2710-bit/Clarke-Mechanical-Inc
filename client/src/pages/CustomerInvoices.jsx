import { useEffect, useState } from 'react';
import api from '../api/client';
import { Card, CardHeader, Badge, Btn, Empty, Spinner, Modal } from '../components/UI';
import { printDocument, buildDocumentHtml } from '../lib/printDoc';
import PayInvoiceModal from '../components/PayInvoiceModal';
import {
  FileText, ClipboardList, ChevronDown, CreditCard, Eye, Receipt,
  Download, Check, X, DollarSign, Lock,
} from 'lucide-react';
import toast from 'react-hot-toast';

const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CustomerInvoices() {
  const [me, setMe] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [tab, setTab] = useState('invoices');
  const [expanded, setExpanded] = useState(null);
  const [payInvoice, setPayInvoice] = useState(null);
  const [viewDoc, setViewDoc] = useState(null);
  const [loading, setLoading] = useState(true);

  function load() {
    return Promise.all([api.get('/portal/me'), api.get('/portal/invoices'), api.get('/portal/quotes')])
      .then(([m, i, q]) => { setMe(m.data); setInvoices(i.data); setQuotes(q.data); setLoading(false); })
      .catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  const toggle = (id) => setExpanded(e => (e === id ? null : id));

  function payBalance() {
    const unpaid = invoices.find(i => i.status !== 'paid' && i.status !== 'cancelled');
    if (unpaid) setPayInvoice(unpaid);
  }

  async function respondQuote(id, decision) {
    try {
      await api.post(`/portal/quotes/${id}/respond`, { decision });
      toast.success(decision === 'accepted' ? 'Estimate accepted — thank you!' : 'Estimate declined');
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not update'); }
  }

  if (loading) return <Spinner />;

  const balanceDue = me?.stats?.balanceDue || 0;
  const tabs = [
    { id: 'invoices', label: 'Invoices', count: invoices.length },
    { id: 'quotes', label: 'Estimates', count: quotes.length },
  ];

  return (
    <div className="animate-fade-in max-w-3xl mx-auto">
      <div className="mb-5">
        <h1 className="text-page-title flex items-center gap-2"><FileText size={20} className="text-blue-600" /> Billing &amp; Invoices</h1>
        <p className="text-sm text-slate-500 mt-0.5">View, download, and pay your invoices and estimates.</p>
      </div>

      {/* Balance summary */}
      <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-blue-500 text-white p-5 shadow-sm mb-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="flex items-center gap-1.5 text-blue-100 text-xs font-semibold uppercase tracking-wide"><DollarSign size={14} /> Balance due</p>
            <p className="text-3xl font-bold tabular-nums mt-1">{money(balanceDue)}</p>
            {me?.business?.name && <p className="text-xs text-blue-100 mt-1">Payable to {me.business.name}</p>}
          </div>
          {balanceDue > 0
            ? <Btn variant="secondary" onClick={payBalance}><CreditCard size={15} /> Pay balance</Btn>
            : <span className="inline-flex items-center gap-1.5 text-sm font-medium bg-white/15 rounded-full px-3 py-1.5"><Check size={15} /> All paid up</span>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-white border border-slate-200 rounded-lg p-1 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setExpanded(null); }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>
            {t.label}<span className="opacity-70"> ({t.count})</span>
          </button>
        ))}
      </div>

      {/* INVOICES */}
      {tab === 'invoices' && (
        <Card>
          <CardHeader title="Invoices" icon={<FileText size={15} />} />
          {invoices.length === 0 ? <Empty icon={<FileText size={24} />} title="No invoices" message="Your invoices will appear here." /> : (
            <div className="divide-y divide-slate-100">
              {invoices.map(inv => (
                <div key={inv.id}>
                  <button onClick={() => toggle(inv.id)} className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 text-left">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{inv.invoice_number}</p>
                      <p className="text-xs text-slate-500">Issued {inv.issue_date || 'N/A'} · Due {inv.due_date || 'N/A'}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-slate-800">{money(inv.total)}</span>
                      <Badge status={inv.status} />
                      <ChevronDown size={16} className={`text-slate-400 transition-transform ${expanded === inv.id ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  {expanded === inv.id && (
                    <div className="px-5 pb-4 pt-1 bg-slate-50/60 animate-fade-in">
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-slate-200/70">
                          {(inv.items || []).map((it, i) => (
                            <tr key={i}>
                              <td className="py-1.5 text-slate-600">{it.description}{it.note && <div className="text-[11px] font-bold text-slate-700 mt-0.5">{it.note}</div>}</td>
                              <td className="py-1.5 text-right text-slate-500 w-16">×{it.quantity}</td>
                              <td className="py-1.5 text-right text-slate-800 font-medium w-24">{money(it.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="flex flex-wrap items-end justify-between gap-3 mt-2 pt-2 border-t border-slate-200">
                        <div className="flex flex-wrap gap-2">
                          {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                            <Btn size="sm" onClick={() => setPayInvoice(inv)}><CreditCard size={14} /> Pay now</Btn>
                          )}
                          <Btn size="sm" variant="outline" onClick={() => setViewDoc({ kind: 'invoice', doc: inv })}><Eye size={14} /> View</Btn>
                          {inv.status === 'paid' && (
                            <Btn size="sm" variant="outline" onClick={() => setViewDoc({ kind: 'receipt', doc: inv })}><Receipt size={14} /> Receipt</Btn>
                          )}
                          <Btn size="sm" variant="outline" onClick={() => printDocument({ kind: 'invoice', doc: inv, business: me.business, customer: me.profile })}><Download size={14} /> Download PDF</Btn>
                        </div>
                        <div className="w-48 space-y-0.5 text-sm">
                          <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{money(inv.subtotal)}</span></div>
                          {inv.discount > 0 && <div className="flex justify-between text-emerald-600"><span>Discount</span><span>−{money(inv.discount)}</span></div>}
                          <div className="flex justify-between text-slate-500"><span>Tax</span><span>{money(inv.tax_amount)}</span></div>
                          <div className="flex justify-between font-bold text-slate-800"><span>Total</span><span>{money(inv.total)}</span></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ESTIMATES */}
      {tab === 'quotes' && (
        <Card>
          <CardHeader title="Estimates" icon={<ClipboardList size={15} />} />
          {quotes.length === 0 ? <Empty icon={<ClipboardList size={24} />} title="No estimates" message="Estimates we send you will appear here — you can accept or decline them online." /> : (
            <div className="divide-y divide-slate-100">
              {quotes.map(q => {
                const pending = ['sent', 'draft'].includes(q.status);
                return (
                  <div key={q.id}>
                    <button onClick={() => toggle(q.id)} className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 text-left">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{q.quote_number}</p>
                        <p className="text-xs text-slate-500">Expires {q.expiry_date || 'N/A'}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-slate-800">{money(q.total)}</span>
                        <Badge status={q.status} />
                        <ChevronDown size={16} className={`text-slate-400 transition-transform ${expanded === q.id ? 'rotate-180' : ''}`} />
                      </div>
                    </button>
                    {expanded === q.id && (
                      <div className="px-5 pb-4 pt-1 bg-slate-50/60 animate-fade-in">
                        <table className="w-full text-sm mb-3">
                          <tbody className="divide-y divide-slate-200/70">
                            {(q.items || []).map((it, i) => (
                              <tr key={i}>
                                <td className="py-1.5 text-slate-600">{it.description}{it.note && <div className="text-[11px] font-bold text-slate-700 mt-0.5">{it.note}</div>}</td>
                                <td className="py-1.5 text-right text-slate-500 w-16">×{it.quantity}</td>
                                <td className="py-1.5 text-right text-slate-800 font-medium w-24">{money(it.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <Btn size="sm" variant="outline" onClick={() => setViewDoc({ kind: 'quote', doc: q })}><Eye size={14} /> View</Btn>
                          <Btn size="sm" variant="outline" onClick={() => printDocument({ kind: 'quote', doc: q, business: me.business, customer: me.profile })}><Download size={14} /> Download PDF</Btn>
                          {pending ? (
                            <div className="flex gap-2">
                              <Btn size="sm" variant="outline" onClick={() => respondQuote(q.id, 'declined')}><X size={14} /> Decline</Btn>
                              <Btn size="sm" variant="success" onClick={() => respondQuote(q.id, 'accepted')}><Check size={14} /> Accept Estimate</Btn>
                            </div>
                          ) : (
                            <p className={`text-sm font-medium ${q.status === 'accepted' ? 'text-emerald-600' : 'text-slate-500'}`}>You {q.status} this estimate.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-4">
        <Lock size={12} /> Pay by Zelle, bank transfer, check, or cash. Tap Pay on an invoice for details.
      </div>

      {payInvoice && <PayInvoiceModal invoice={payInvoice} onClose={() => setPayInvoice(null)} onPaid={() => { setPayInvoice(null); load(); }} />}
      {viewDoc && (
        <Modal open={!!viewDoc} onClose={() => setViewDoc(null)} size="xl"
          title={`${viewDoc.kind === 'invoice' ? 'Invoice' : viewDoc.kind === 'receipt' ? 'Receipt' : 'Estimate'} ${viewDoc.doc.invoice_number || viewDoc.doc.quote_number || ''}`}>
          <iframe
            title="Document preview"
            srcDoc={buildDocumentHtml({ kind: viewDoc.kind, doc: viewDoc.doc, business: me?.business, customer: me?.profile })}
            className="w-full h-[68vh] rounded-lg border border-slate-200 bg-white"
          />
          <div className="flex justify-end gap-2 mt-4">
            <Btn variant="outline" onClick={() => setViewDoc(null)}>Close</Btn>
            <Btn onClick={() => printDocument({ kind: viewDoc.kind, doc: viewDoc.doc, business: me?.business, customer: me?.profile })}><Download size={14} /> Download PDF</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
