import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import Logo from '../components/Logo';
import { loadHelcimPayJs } from '../lib/helcimPay';
import { CreditCard, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

// Public invoice payment page (opened in the browser from the mobile app, or shared
// as a link). No login — the URL token authorizes paying this one invoice.
export default function PayLink() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | processing | done | invalid
  const [error, setError] = useState('');
  const listenerRef = useRef(null);

  useEffect(() => {
    api.get(`/pay/${token}`)
      .then(r => {
        setInfo(r.data);
        if (r.data.paid) setState('done');
        else if (!r.data.enabled) { setState('invalid'); setError('Online payments aren’t available right now.'); }
        else setState('ready');
      })
      .catch(e => { setState('invalid'); setError(e.response?.data?.error || 'This payment link is invalid or has expired.'); });
    return () => { if (listenerRef.current) window.removeEventListener('message', listenerRef.current); };
  }, [token]);

  async function pay() {
    setError(''); setState('processing');
    try {
      const { data: init } = await api.post(`/pay/${token}/initialize`);
      const checkoutToken = init.checkoutToken;
      await loadHelcimPayJs();
      const handler = async (event) => {
        if (!event.data || event.data.eventName !== `helcim-pay-js-${checkoutToken}`) return;
        if (event.data.eventStatus === 'ABORTED') { setError('Payment was cancelled or failed. Please try again.'); setState('ready'); }
        if (event.data.eventStatus === 'SUCCESS') {
          window.removeEventListener('message', handler); listenerRef.current = null;
          try {
            let msg = event.data.eventMessage;
            if (typeof msg === 'string') msg = JSON.parse(msg);
            await api.post(`/pay/${token}/confirm`, { checkoutToken, data: msg.data, hash: msg.hash });
            window.removeHelcimPayIframe?.();
            setState('done');
          } catch (e) { setError(e.response?.data?.error || 'We could not confirm the payment. If you were charged, contact the office.'); setState('ready'); }
        }
      };
      listenerRef.current = handler;
      window.addEventListener('message', handler);
      window.appendHelcimPayIframe(checkoutToken);
      setState('ready');
    } catch (e) { setError(e.response?.data?.error || e.message || 'Could not start the payment.'); setState('ready'); }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-slate-200 p-6 text-center">
        <div className="flex justify-center mb-4"><Logo variant="full" height={44} /></div>

        {state === 'loading' && <p className="text-slate-400 flex items-center justify-center gap-2 py-8"><Loader2 size={16} className="animate-spin" /> Loading…</p>}

        {state === 'invalid' && (
          <div className="py-6">
            <AlertCircle size={32} className="mx-auto text-red-400 mb-2" />
            <p className="text-sm text-slate-600">{error}</p>
          </div>
        )}

        {state === 'done' && (
          <div className="py-6">
            <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-2" />
            <p className="font-semibold text-slate-800">Payment complete</p>
            <p className="text-sm text-slate-500 mt-1">Thank you! {info?.invoice_number ? `Invoice ${info.invoice_number} is paid.` : ''} You can close this window and return to the app.</p>
          </div>
        )}

        {(state === 'ready' || state === 'processing') && info && (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{info.business || 'Clarke Mechanical'}</p>
            <p className="text-sm text-slate-500 mt-1">{info.invoice_number ? `Invoice ${info.invoice_number}` : 'Invoice payment'}</p>
            <p className="text-3xl font-bold text-slate-900 my-3">${Number(info.amount || 0).toFixed(2)}</p>
            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
            <button onClick={pay} disabled={state === 'processing'}
              className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl">
              {state === 'processing' ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
              Pay ${Number(info.amount || 0).toFixed(2)} by card
            </button>
            <p className="text-[11px] text-slate-400 mt-3">Processed securely by Helcim.</p>
          </>
        )}
      </div>
    </div>
  );
}
