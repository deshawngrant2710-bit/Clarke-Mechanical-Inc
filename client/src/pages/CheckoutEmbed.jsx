import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import Logo from '../components/Logo';
import { ArrowLeft, Loader2, ShieldCheck, AlertCircle } from 'lucide-react';

// Clarke-branded, on-site card payment. Mounts Stripe's embedded checkout inside
// our own page (no redirect). The webhook records the payment; on completion
// Stripe returns the customer to /billing?stripe=success.
const STRIPE_JS = 'https://js.stripe.com/v3/';
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
  const [state, setState] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');
  const [info, setInfo] = useState(null);
  const checkoutRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.post(`/portal/invoices/${id}/stripe-embedded`);
        if (cancelled) return;
        setInfo(data);
        await loadStripe();
        if (cancelled) return;
        const stripe = window.Stripe(data.publishable_key);
        const checkout = await stripe.initEmbeddedCheckout({ clientSecret: data.client_secret });
        if (cancelled) { try { checkout.destroy(); } catch { /* ignore */ } return; }
        checkoutRef.current = checkout;
        checkout.mount('#checkout-embed');
        setState('ready');
      } catch (e) {
        if (!cancelled) { setError(e.response?.data?.error || e.message || 'Could not start the payment.'); setState('error'); }
      }
    })();
    return () => { cancelled = true; try { checkoutRef.current?.destroy(); } catch { /* ignore */ } };
  }, [id]);

  return (
    <div className="min-h-dvh bg-slate-50">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <button onClick={() => navigate('/billing')} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft size={16} /> Back to invoices
        </button>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-4">
            <Logo variant="full" height={40} />
            {info && (
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Invoice {info.invoice_number}</div>
                <div className="text-xl font-bold text-slate-900">${Number(info.amount || 0).toFixed(2)}</div>
              </div>
            )}
          </div>
          <div className="p-4 sm:p-6">
            {state === 'loading' && <p className="text-slate-400 flex items-center justify-center gap-2 py-16"><Loader2 size={16} className="animate-spin" /> Loading secure checkout…</p>}
            {state === 'error' && (
              <div className="py-12 text-center">
                <AlertCircle size={28} className="mx-auto text-red-400 mb-2" />
                <p className="text-sm text-slate-600">{error}</p>
              </div>
            )}
            <div id="checkout-embed" />
          </div>
          <div className="px-6 py-3 border-t border-slate-100 text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
            <ShieldCheck size={13} className="text-emerald-500" /> Secured by Stripe · Clarke Mechanical Inc.
          </div>
        </div>
      </div>
    </div>
  );
}
