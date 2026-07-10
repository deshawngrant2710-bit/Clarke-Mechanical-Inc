import { useEffect, useRef, useState } from 'react';
import api from '../api/client';
import { Modal, Btn } from './UI';
import { CreditCard, Banknote } from 'lucide-react';
import toast from 'react-hot-toast';

const STRIPE_JS = 'https://js.stripe.com/v3/';

// Inject Stripe.js once; resolve when window.Stripe is ready.
function loadStripeJs() {
  return new Promise((resolve, reject) => {
    if (window.Stripe) return resolve(window.Stripe);
    const existing = document.querySelector(`script[src="${STRIPE_JS}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Stripe));
      existing.addEventListener('error', () => reject(new Error('Could not load the payment form.')));
      return;
    }
    const script = document.createElement('script');
    script.src = STRIPE_JS;
    script.async = true;
    script.onload = () => resolve(window.Stripe);
    script.onerror = () => reject(new Error('Could not load the payment form.'));
    document.head.appendChild(script);
  });
}

const ELEMENT_ID = 'stripe-payment-element';

export default function PayInvoiceModal({ invoice, onClose, onPaid }) {
  const [status, setStatus] = useState('loading'); // loading | ready | processing | disabled
  const [error, setError] = useState('');
  const [cashSending, setCashSending] = useState(false);
  const stripeRef = useRef(null);
  const elementsRef = useRef(null);
  const amount = Number(invoice?.total || 0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: cfg } = await api.get('/portal/payment-config');
        if (cancelled) return;
        if (!cfg.enabled) { setStatus('disabled'); return; }
        const { data: intent } = await api.post(`/portal/invoices/${invoice.id}/create-intent`);
        if (cancelled) return;
        const Stripe = await loadStripeJs();
        if (cancelled) return;
        const stripe = Stripe(cfg.publishableKey);
        const elements = stripe.elements({ clientSecret: intent.clientSecret });
        const paymentElement = elements.create('payment');
        paymentElement.mount(`#${ELEMENT_ID}`);
        stripeRef.current = stripe;
        elementsRef.current = elements;
        if (!cancelled) setStatus('ready');
      } catch (e) {
        if (!cancelled) { setStatus('disabled'); setError(e.response?.data?.error || e.message || 'Could not start the payment form.'); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function payCard() {
    if (!stripeRef.current || !elementsRef.current) return;
    setStatus('processing'); setError('');
    try {
      const { error: stripeError, paymentIntent } = await stripeRef.current.confirmPayment({
        elements: elementsRef.current,
        confirmParams: { return_url: window.location.href },
        redirect: 'if_required',
      });
      if (stripeError) throw new Error(stripeError.message || 'Please check your card details and try again.');
      if (!paymentIntent || paymentIntent.status !== 'succeeded') throw new Error('Payment did not complete. Please try again.');
      await api.post(`/portal/invoices/${invoice.id}/confirm-payment`, { paymentIntentId: paymentIntent.id });
      toast.success('Payment successful — thank you!');
      onPaid?.();
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Payment failed. Please try again.');
      setStatus('ready');
    }
  }

  async function payCash() {
    setCashSending(true);
    try {
      await api.post(`/portal/invoices/${invoice.id}/pay-cash`);
      toast.success('Got it — the office will reach out to arrange cash payment.');
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not send that request.');
    } finally { setCashSending(false); }
  }

  return (
    <Modal open={!!invoice} onClose={onClose} title={`Pay Invoice ${invoice?.invoice_number || ''}`}
      subtitle={`Amount due: $${amount.toFixed(2)}`} size="md">
      <div className="space-y-4">
        {status !== 'disabled' ? (
          <>
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700"><CreditCard size={16} className="text-slate-400" /> Pay by card</div>
            <div id={ELEMENT_ID} className="min-h-[40px]" />
            {status === 'loading' && <p className="text-sm text-slate-400">Loading secure card form…</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Btn onClick={payCard} loading={status === 'processing'} disabled={status === 'loading' || status === 'processing'} className="w-full justify-center">
              Pay ${amount.toFixed(2)} by card
            </Btn>
            <p className="text-[11px] text-slate-400 text-center">Payments are processed securely by Stripe. We never see or store your card number.</p>
          </>
        ) : (
          <p className="text-sm text-slate-500">{error || 'Online card payments aren’t available right now — you can pay by cash below, or contact the office.'}</p>
        )}

        <div className="flex items-center gap-3 text-xs text-slate-400"><div className="flex-1 h-px bg-slate-200" /> or <div className="flex-1 h-px bg-slate-200" /></div>

        <Btn variant="outline" onClick={payCash} loading={cashSending} className="w-full justify-center">
          <Banknote size={15} /> Pay with cash (notify the office)
        </Btn>
      </div>
    </Modal>
  );
}
