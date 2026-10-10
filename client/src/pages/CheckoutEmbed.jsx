import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import Logo from '../components/Logo';
import { ArrowLeft, Loader2, ShieldCheck, AlertCircle, Lock } from 'lucide-react';

// Clarke-branded, on-site card checkout built on Stripe's Payment Element — we own
// the whole page layout (big logo, order summary, pay button); Stripe only renders
// the secure card fields. The payment is recorded via stripe-confirm + the webhook.
const STRIPE_JS = 'https://js.stripe.com/v3/';
const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function loadStripe() {
  return new Promise((resolve, reject) => {
    if (window.Stripe) return resolve();
    const s = document.createElement('script');
    s.src = STRIPE_JS; s.async = true;
    s.onload = () => (window.Stripe ? resolve() : reject(new Error('Could not load Stripe.')));
    s.onerror = () => reject(new Error('Could not load Stripe.'));
    document.head.appendChild(s);
  });
}

export default function CheckoutEmbed() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const stripeRef = useRef(null);
  const elementsRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    api.post(`/portal/invoices/${id}/payment-intent`)
      .then(r => { if (!cancelled) { setData(r.data); setStatus('ready'); } })
      .catch(e => { if (!cancelled) { setErr(e.response?.data?.error || 'Could not start the payment.'); setStatus('error'); } });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (!data?.client_secret) return;
    let element;
    (async () => {
      try {
        await loadStripe();
        const stripe = window.Stripe(data.publishable_key);
        const elements = stripe.elements({
          clientSecret: data.client_secret,
          appearance: { theme: 'stripe', variables: { colorPrimary: '#1d4ed8', borderRadius: '10px', fontFamily: 'system-ui, sans-serif' } },
        });
        element = elements.create('payment', { layout: 'tabs' });
        element.mount('#payment-element');
        stripeRef.current = stripe;
        elementsRef.current = elements;
      } catch (e) { setErr(e.message || 'Could not load the payment form.'); }
    })();
    return () => { try { element?.unmount(); } catch { /* ignore */ } };
  }, [data?.client_secret]);

  async function handlePay(e) {
    e.preventDefault();
    if (!stripeRef.current || !elementsRef.current) return;
    setSubmitting(true); setErr('');
    const { error, paymentIntent } = await stripeRef.current.confirmPayment({
      elements: elementsRef.current,
      redirect: 'if_required',
      confirmParams: { return_url: `${window.location.origin}/billing?stripe=success` },
    });
    if (error) { setErr(error.message || 'Payment did not go through.'); setSubmitting(false); return; }
    if (paymentIntent && paymentIntent.status === 'succeeded') {
      try { await api.post(`/portal/invoices/${id}/stripe-confirm`, { payment_intent: paymentIntent.id }); } catch { /* webhook will catch it */ }
      navigate('/billing?stripe=success');
    } else { setSubmitting(false); }
  }

  const inv = data?.invoice;

  return (
    <div className="min-h-dvh bg-slate-100">
      {/* Branded header band */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col items-center">
          <Logo variant="full" height={56} />
          <p className="mt-2 text-sm text-slate-500">Secure payment</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <button onClick={() => navigate('/billing')} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft size={16} /> Back to invoices
        </button>

        {status === 'error' ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center max-w-md mx-auto">
            <AlertCircle size={30} className="mx-auto text-red-400 mb-2" />
            <p className="text-sm text-slate-600">{err}</p>
          </div>
        ) : status === 'loading' ? (
          <p className="text-slate-400 flex items-center justify-center gap-2 py-20"><Loader2 size={18} className="animate-spin" /> Loading secure checkout…</p>
        ) : (
          <div className="grid md:grid-cols-5 gap-6 items-start">
            {/* Order summary */}
            <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 p-5">
              <h2 className="text-card-title text-slate-800 mb-1">Order summary</h2>
              <p className="text-xs text-slate-400 mb-4">Invoice {inv?.invoice_number}</p>
              <div className="divide-y divide-slate-100">
                {(inv?.items || []).map((it, i) => (
                  <div key={i} className="flex justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="text-sm text-slate-700">{it.description}</div>
                      <div className="text-xs text-slate-400">{it.quantity} × {money(it.unit_price)}</div>
                    </div>
                    <div className="text-sm font-medium text-slate-800 whitespace-nowrap">{money(it.total)}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5 text-sm">
                {inv?.subtotal != null && <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{money(inv.subtotal)}</span></div>}
                {inv?.discount_amount > 0 && <div className="flex justify-between text-emerald-600"><span>Discount</span><span>−{money(inv.discount_amount)}</span></div>}
                {inv?.tax_amount > 0 && <div className="flex justify-between text-slate-500"><span>Tax</span><span>{money(inv.tax_amount)}</span></div>}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-200 flex justify-between items-center">
                <span className="text-sm font-semibold text-slate-700">Amount due</span>
                <span className="text-2xl font-bold text-slate-900">{money(data?.amount_due)}</span>
              </div>
            </div>

            {/* Payment */}
            <form onSubmit={handlePay} className="md:col-span-3 bg-white rounded-2xl border border-slate-200 p-5">
              <h2 className="text-card-title text-slate-800 mb-4 flex items-center gap-2"><Lock size={15} className="text-slate-400" /> Payment details</h2>
              <div id="payment-element" className="min-h-[220px]" />
              {err && <div className="mt-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{err}</div>}
              <button type="submit" disabled={submitting}
                className="mt-5 w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl text-base">
                {submitting ? <><Loader2 size={18} className="animate-spin" /> Processing…</> : <>Pay {money(data?.amount_due)}</>}
              </button>
              <p className="mt-3 text-[11px] text-slate-400 flex items-center justify-center gap-1.5"><ShieldCheck size={13} className="text-emerald-500" /> Payments are encrypted and processed securely by Stripe.</p>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
