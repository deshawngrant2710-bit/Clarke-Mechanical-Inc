import { useRef, useState } from 'react';
import { Modal, Btn } from './UI';
import SignaturePad from './SignaturePad';
import { Ban, AlertTriangle } from 'lucide-react';

/**
 * Confirmation dialog for voiding a document (estimate or proposal).
 * Requires BOTH a written reason (>= 10 chars) and a hand-drawn e-signature.
 * Calls onConfirm({ reason, signature }) — the parent does the API call and
 * closes the dialog on success.
 *
 * Props:
 *   open, onClose
 *   docLabel   – e.g. "estimate EST-0007" (shown in the copy)
 *   onConfirm  – async ({ reason, signature }) => void   (throws on failure)
 */
export default function VoidDialog({ open, onClose, docLabel = 'this document', onConfirm }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const sigRef = useRef(null);

  function reset() { setReason(''); setErr(''); setBusy(false); sigRef.current?.clear?.(); }
  function close() { if (busy) return; reset(); onClose?.(); }

  async function confirm() {
    setErr('');
    if (reason.trim().length < 10) { setErr('Please give a clear reason (at least 10 characters).'); return; }
    if (!sigRef.current || sigRef.current.isEmpty()) { setErr('Please sign in the box to authorize the void.'); return; }
    const signature = sigRef.current.toDataURL();
    setBusy(true);
    try {
      await onConfirm({ reason: reason.trim(), signature });
      reset();
    } catch (e) {
      setErr(e?.response?.data?.error || 'Could not void. Please try again.');
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title="Void document" subtitle={`Voiding ${docLabel} — this cannot be undone.`} size="md">
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2.5">
          <AlertTriangle size={18} className="text-rose-500 shrink-0 mt-0.5" />
          <p className="text-sm text-rose-800">Once voided, this document is locked and can no longer be edited or sent. The reason and signature below are stored for your records.</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Reason for voiding <span className="text-rose-500">*</span></label>
          <textarea
            rows={3}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Customer requested a revised scope; pricing superseded by EST-0012."
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none transition-all duration-150 resize-none bg-white focus:ring-4 focus:ring-rose-500/15 focus:border-rose-500 hover:border-slate-400 placeholder:text-slate-400"
          />
          <p className="text-[11px] text-slate-400 mt-1">{reason.trim().length}/10 characters minimum</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Authorizing signature <span className="text-rose-500">*</span></label>
          <SignaturePad ref={sigRef} height={170} />
        </div>

        {err && <p className="text-sm text-rose-600 font-medium">{err}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={close} disabled={busy}>Cancel</Btn>
          <Btn variant="danger" onClick={confirm} loading={busy}><Ban size={15} /> Void document</Btn>
        </div>
      </div>
    </Modal>
  );
}
