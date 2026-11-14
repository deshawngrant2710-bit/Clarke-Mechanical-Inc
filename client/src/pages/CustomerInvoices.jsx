import { useEffect, useState } from 'react';
import api from '../api/client';
import { Btn, Spinner } from '../components/UI';
import { downloadPdf } from '../lib/printDoc';
import PayInvoiceModal from '../components/PayInvoiceModal';
import DocumentPreviewModal from '../components/portal/DocumentPreview';
import { InvoiceList, EstimateList } from '../components/portal/BillingLists';
import { isPayable } from '../lib/payable';
import { FileText, CreditCard, Check, DollarSign, Lock } from 'lucide-react';
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

  // Returning from Stripe checkout: the webhook marks the invoice paid a moment
  // later, so reload a few times until it shows up.
  useEffect(() => {
    if (!/[?&]stripe=success/.test(window.location.search)) return;
    toast.success('Payment received — thank you!');
    let n = 0;
    const t = setInterval(() => { load(); if (++n >= 5) clearInterval(t); }, 1500);
    try { window.history.replaceState({}, '', window.location.pathname); } catch {}
    return () => clearInterval(t);
  }, []);

  const toggle = (id) => setExpanded(e => (e === id ? null : id));

  function payBalance() {
    // Oldest payable invoice first (same eligibility rule as the server).
    const unpaid = [...invoices].reverse().find(isPayable);
    if (unpaid) setPayInvoice(unpaid);
  }

  const download = (opts) => downloadPdf({ ...opts, business: me?.business, customer: me?.profile });

  async function respondQuote(quote, decision) {
    const id = typeof quote === 'string' ? quote : quote.id;
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
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-blue-100 text-xs font-semibold uppercase tracking-wide"><DollarSign size={14} /> Balance due</p>
            <p className="text-3xl font-bold tabular-nums mt-1 break-all">{money(balanceDue)}</p>
            {me?.business?.name && <p className="text-xs text-blue-100 mt-1">Payable to {me.business.name}</p>}
          </div>
          {balanceDue > 0 && invoices.some(isPayable)
            ? <Btn variant="secondary" onClick={payBalance}><CreditCard size={15} /> Pay balance</Btn>
            : <span className="inline-flex items-center gap-1.5 text-sm font-medium bg-white/15 rounded-full px-3 py-1.5"><Check size={15} /> All paid up</span>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-4 bg-white border border-slate-200 rounded-lg p-1 w-fit max-w-full">
        {tabs.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setExpanded(null); }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>
            {t.label}<span className="opacity-70"> ({t.count})</span>
          </button>
        ))}
      </div>

      {tab === 'invoices' && (
        <InvoiceList invoices={invoices} expanded={expanded} onToggle={toggle}
          onPay={setPayInvoice} onView={setViewDoc} onDownload={download} />
      )}
      {tab === 'quotes' && (
        <EstimateList quotes={quotes} expanded={expanded} onToggle={toggle}
          onView={setViewDoc} onDownload={download} onRespond={respondQuote} />
      )}

      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-4">
        <Lock size={12} className="shrink-0" /> Pay by Zelle, bank transfer, check, or cash. Tap Pay on an invoice for details.
      </div>

      {payInvoice && <PayInvoiceModal invoice={payInvoice} stripeEnabled={me?.stripe_enabled} onClose={() => setPayInvoice(null)} onPaid={() => { setPayInvoice(null); load(); }} />}
      {viewDoc && <DocumentPreviewModal view={viewDoc} onClose={() => setViewDoc(null)} business={me?.business} customer={me?.profile} />}
    </div>
  );
}
