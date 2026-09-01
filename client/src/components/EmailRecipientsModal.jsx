import { useEffect, useState } from 'react';
import { Modal, Btn, Textarea } from './UI';
import { Mail } from 'lucide-react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Confirms the primary recipient and lets the user add extra (CC) addresses.
// onSend(ccArray) is called with the cleaned list.
export default function EmailRecipientsModal({ open, onClose, to, title = 'Send email', onSend, sending }) {
  const [extra, setExtra] = useState('');
  useEffect(() => { if (open) setExtra(''); }, [open]);

  const list = extra.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
  const invalid = list.filter(e => !EMAIL_RE.test(e));

  function submit() {
    const valid = [...new Set(list.filter(e => EMAIL_RE.test(e)))];
    onSend(valid);
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="space-y-3">
        <div className="text-sm text-slate-600">
          Sends to the customer:
          <div className="mt-1 flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-slate-800 font-medium">
            <Mail size={14} className="text-slate-400" /> {to || <span className="text-slate-400">No customer email on file</span>}
          </div>
        </div>
        <Textarea label="Also send to (optional)" value={extra} onChange={e => setExtra(e.target.value)} rows={2}
          placeholder="jane@company.com, accounting@company.com" />
        <p className="text-xs text-slate-400">Separate multiple emails with commas. Up to 10.</p>
        {invalid.length > 0 && <p className="text-xs text-red-500">Check these — they don't look like emails: {invalid.join(', ')}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn onClick={submit} loading={sending} disabled={!to}><Mail size={15} /> Send{list.length ? ` to ${1 + list.length}` : ''}</Btn>
        </div>
      </div>
    </Modal>
  );
}
