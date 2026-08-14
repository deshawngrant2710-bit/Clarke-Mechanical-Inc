import { useState } from 'react';
import api from '../api/client';
import { Modal, Btn } from './UI';
import { PAYMENT_INFO } from '../lib/paymentInfo';
import { Banknote, Landmark, Mail as MailIcon, Copy, Check, Send, Smartphone } from 'lucide-react';
import toast from 'react-hot-toast';

const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function CopyRow({ label, value }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  const copy = async () => {
    try { await navigator.clipboard.writeText(String(value)); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* clipboard unavailable */ }
  };
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <button onClick={copy} className="flex items-center gap-1.5 text-sm font-medium text-slate-800 hover:text-blue-600 min-w-0">
        <span className="truncate">{value}</span>
        {copied ? <Check size={13} className="text-emerald-500 shrink-0" /> : <Copy size={13} className="text-slate-400 shrink-0" />}
      </button>
    </div>
  );
}

export default function PayInvoiceModal({ invoice, onClose, onPaid }) {
  const [notifying, setNotifying] = useState(null);
  const amount = Number(invoice?.total || 0);
  const memo = invoice?.invoice_number || '';

  async function notify(method) {
    setNotifying(method);
    try {
      await api.post(`/portal/invoices/${invoice.id}/pay-cash`, { method });
      toast.success("Thanks! We've let the office know and will confirm once your payment is received.");
      onPaid ? onPaid() : onClose();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not notify the office. Please call us.');
    } finally { setNotifying(null); }
  }

  const z = PAYMENT_INFO.zelle, b = PAYMENT_INFO.bank, c = PAYMENT_INFO.check;
  const anyZelle = z?.email || z?.phone;
  const anyBank = b?.accountNumber || b?.routingNumber || b?.bankName;
  const anyCheck = c?.mailTo;

  return (
    <Modal open={!!invoice} onClose={onClose} title={`Pay Invoice ${invoice?.invoice_number || ''}`}
      subtitle={`Amount due: ${money(amount)}`} size="md">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Choose how you'd like to pay. Use <strong>{memo || 'your invoice number'}</strong> as the reference/memo, then tap <strong>I've sent it</strong> so we can match your payment.
        </p>

        {z?.enabled && (
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-2"><Smartphone size={16} className="text-blue-600" /><p className="text-sm font-semibold text-slate-800">Zelle</p></div>
            {anyZelle ? (
              <div className="divide-y divide-slate-100">
                <CopyRow label="Send to" value={z.name} />
                <CopyRow label="Email" value={z.email} />
                <CopyRow label="Phone" value={z.phone} />
                <CopyRow label="Amount" value={money(amount)} />
                <CopyRow label="Memo" value={memo} />
              </div>
            ) : <p className="text-xs text-slate-500">Contact our office for Zelle details.</p>}
            <Btn size="sm" variant="outline" className="mt-3 w-full justify-center" loading={notifying === 'Zelle'} onClick={() => notify('Zelle')}><Send size={14} /> I've sent it by Zelle</Btn>
          </div>
        )}

        {b?.enabled && (
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-2"><Landmark size={16} className="text-blue-600" /><p className="text-sm font-semibold text-slate-800">Bank transfer (ACH / Wire)</p></div>
            {anyBank ? (
              <div className="divide-y divide-slate-100">
                <CopyRow label="Bank" value={b.bankName} />
                <CopyRow label="Account name" value={b.accountName} />
                <CopyRow label="Account #" value={b.accountNumber} />
                <CopyRow label="Routing # (ACH)" value={b.routingNumber} />
                <CopyRow label="Routing # (Wire)" value={b.wireRoutingNumber} />
                <CopyRow label="Amount" value={money(amount)} />
                <CopyRow label="Memo" value={memo} />
              </div>
            ) : <p className="text-xs text-slate-500">Contact our office for bank transfer details.</p>}
            <Btn size="sm" variant="outline" className="mt-3 w-full justify-center" loading={notifying === 'Bank transfer'} onClick={() => notify('Bank transfer')}><Send size={14} /> I've sent the transfer</Btn>
          </div>
        )}

        {c?.enabled && (
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-2"><MailIcon size={16} className="text-blue-600" /><p className="text-sm font-semibold text-slate-800">Check</p></div>
            <div className="divide-y divide-slate-100">
              <CopyRow label="Payable to" value={c.payableTo} />
              {anyCheck ? <CopyRow label="Mail to" value={c.mailTo} /> : null}
              <CopyRow label="Memo" value={memo} />
            </div>
            {!anyCheck && <p className="text-xs text-slate-500 mt-1">Contact our office for where to mail your check.</p>}
            <Btn size="sm" variant="outline" className="mt-3 w-full justify-center" loading={notifying === 'Check'} onClick={() => notify('Check')}><Send size={14} /> I've mailed a check</Btn>
          </div>
        )}

        {PAYMENT_INFO.cash?.enabled && (
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-2"><Banknote size={16} className="text-emerald-600" /><p className="text-sm font-semibold text-slate-800">Cash</p></div>
            <p className="text-xs text-slate-500 mb-3">Prefer cash? Let us know and our office will arrange collection.</p>
            <Btn size="sm" variant="outline" className="w-full justify-center" loading={notifying === 'Cash'} onClick={() => notify('Cash')}><Banknote size={14} /> Pay with cash (notify office)</Btn>
          </div>
        )}
      </div>
    </Modal>
  );
}
