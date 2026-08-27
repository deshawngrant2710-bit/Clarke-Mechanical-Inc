import { useState } from 'react';
import { Modal, Btn } from './UI';
import { Copy, Check, KeyRound } from 'lucide-react';

// Shows a one-time password once, with a copy button. `data` = { tempPassword, name, email }.
export default function TempPasswordModal({ open, onClose, data }) {
  const [copied, setCopied] = useState(false);
  if (!data) return null;
  const copy = async () => {
    try { await navigator.clipboard.writeText(data.tempPassword); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  return (
    <Modal open={open} onClose={onClose} title="One-time password" size="sm">
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-blue-600"><KeyRound size={18} /><span className="text-sm font-semibold">Share this with {data.name || 'the user'}</span></div>
        <p className="text-sm text-slate-600">They sign in with this password once, then set their own in <strong>My Account</strong>. It won't be shown again.</p>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <span className="font-mono text-xl font-bold tracking-wider text-slate-900 select-all">{data.tempPassword}</span>
          <button onClick={copy} className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700 shrink-0">
            {copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        {data.email && <p className="text-xs text-slate-400">Login email: {data.email}</p>}
        <div className="flex justify-end"><Btn onClick={onClose}>Done</Btn></div>
      </div>
    </Modal>
  );
}
