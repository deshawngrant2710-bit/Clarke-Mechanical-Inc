import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import api from '../api/client';
import { Modal, Btn } from './UI';
import { CreditCard, Banknote, Trash2, ExternalLink } from 'lucide-react';
import { loadHelcimPayJs } from '../lib/helcimPay';
import toast from 'react-hot-toast';

const isNative = !!Capacitor?.isNativePlatform?.();

export default function PayInvoiceModal({ invoice, onClose, onPaid }) {
  const [status, setStatus] = useState('ready'); // ready | disabled | processing | browser
  const [error, setError] = useState('');
  const [cashSending, setCashSending] = useState(false);
  const [savedCards, setSavedCards] = useState([]);
  const [payingSaved, setPayingSaved] = useState(null);
  const [checking, setChecking] = useState(false);
  const listenerRef = useRef(null);
  const browsingRef = useRef(false);
  const amount = Number(invoice?.total || 0);

  useEffect(() => {
    api.get('/portal/payment-config').then(r => { if (!r.data.enabled) setStatus('disabled'); }).catch(() => setStatus('disabled'));
    api.get('/portal/payment-methods').then(r => setSavedCards(r.data || [])).catch(() => {});
    // When the user returns from the browser payment, re-check whether it's paid.
    const onVis = () => { if (document.visibilityState === 'visible' && browsingRef.current) checkPaid(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      if (listenerRef.current) window.removeEventListener('message', listenerRef.current);
    };
    // eslint-disable-next-line
  }, []);

  // ---- Website: HelcimPay.js renders directly in the page ----
  async function payInPage() {
    setError(''); setStatus('processing');
    try {
      const { data: init } = await api.post(`/portal/invoices/${invoice.id}/helcim-initialize`);
      const checkoutToken = init.checkoutToken;
      await loadHelcimPayJs();
      const handler = async (event) => {
        if (!event.data || event.data.eventName !== `helcim-pay-js-${checkoutToken}`) return;
        if (event.data.eventStatus === 'ABORTED') { setError('Payment was cancelled or failed. Please try again.'); setStatus('ready'); }
        if (event.data.eventStatus === 'SUCCESS') {
          window.removeEventListener('message', handler); listenerRef.current = null;
          try {
            let msg = event.data.eventMessage;
            if (typeof msg === 'string') msg = JSON.parse(msg);
            await api.post(`/portal/invoices/${invoice.id}/helcim-confirm`, { checkoutToken, data: msg.data, hash: msg.hash });
            window.removeHelcimPayIframe?.();
            toast.success('Payment successful — thank you!');
            onPaid?.();
          } catch (e) { setError(e.response?.data?.error || 'We could not confirm the payment. If you were charged, contact the office.'); setStatus('ready'); }
        }
      };
      listenerRef.current = handler;
      window.addEventListener('message', handler);
      window.appendHelcimPayIframe(checkoutToken);
      setStatus('ready');
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Could not start the payment. Please try again.');
      setStatus(e.response?.status === 503 ? 'disabled' : 'ready');
    }
  }

  // ---- Mobile app: open a secure payment page in the browser (Helcim can't render in-app) ----
  async function payInBrowser() {
    setError(''); setStatus('processing');
    try {
      const { data } = await api.post(`/portal/invoices/${invoice.id}/pay-link`);
      window.open(data.url, '_blank');
      browsingRef.current = true;
      setStatus('browser');
    } catch (e) {
      setError(e.response?.data?.error || 'Could not open the payment page.');
      setStatus(e.response?.status === 503 ? 'disabled' : 'ready');
    }
  }

  async function checkPaid() {
    setChecking(true);
    try {
      const { data } = await api.get(`/portal/invoices/${invoice.id}/payment-status`);
      if (data.paid) { browsingRef.current = false; toast.success('Payment received — thank you!'); onPaid?.(); }
      else setError('We haven’t seen the payment yet. If you just finished, give it a moment and tap again.');
    } catch { /* ignore */ } finally { setChecking(false); }
  }

  const payNewCard = () => (isNative ? payInBrowser() : payInPage());

  async function paySaved(pmId) {
    setPayingSaved(pmId); setError('');
    try {
      await api.post(`/portal/invoices/${invoice.id}/pay-saved`, { paymentMethodId: pmId });
      toast.success('Payment successful — thank you!');
      onPaid?.();
    } catch (e) {
      setError(e.response?.data?.error || 'Could not charge that card. Please pay with a new card below.');
    } finally { setPayingSaved(null); }
  }

  async function removeCard(pmId) {
    try {
      await api.delete(`/portal/payment-methods/${pmId}`);
      setSavedCards(cards => cards.filter(c => c.id !== pmId));
    } catch { toast.error('Could not remove that card.'); }
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
        {savedCards.length > 0 && status !== 'disabled' && status !== 'browser' && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Saved cards</p>
            {savedCards.map(c => (
              <div key={c.id} className="flex items-center gap-2">
                <button onClick={() => paySaved(c.id)} disabled={!!payingSaved}
                  className="flex-1 flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 text-sm disabled:opacity-50">
                  <span className="flex items-center gap-2 text-slate-700"><CreditCard size={15} className="text-slate-400" /> <span className="uppercase">{c.brand}</span> •••• {c.last4}</span>
                  <span className="font-semibold text-blue-600">{payingSaved === c.id ? 'Paying…' : `Pay $${amount.toFixed(2)}`}</span>
                </button>
                <button onClick={() => removeCard(c.id)} title="Remove card" className="p-2 text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>
              </div>
            ))}
            <div className="flex items-center gap-3 text-xs text-slate-400 pt-1"><div className="flex-1 h-px bg-slate-200" /> or use a new card <div className="flex-1 h-px bg-slate-200" /></div>
          </div>
        )}

        {status === 'browser' ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 text-center space-y-3">
            <p className="text-sm text-slate-700">We opened a secure payment page in your browser. Complete the payment there, then come back.</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Btn onClick={checkPaid} loading={checking} className="w-full justify-center">I’ve completed the payment</Btn>
          </div>
        ) : status !== 'disabled' ? (
          <>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Btn onClick={payNewCard} loading={status === 'processing'} disabled={status === 'processing'} className="w-full justify-center">
              {isNative ? <ExternalLink size={16} /> : <CreditCard size={16} />} Pay ${amount.toFixed(2)} by card
            </Btn>
            <p className="text-[11px] text-slate-400 text-center">Processed securely by Helcim.{isNative ? ' Opens a secure browser page.' : ' You can save your card for faster future payments.'}</p>
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
