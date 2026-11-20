import { useEffect, useRef, useState } from 'react';
import { Camera, Images, X, CheckCircle2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { fileToProof } from '../lib/imageProof';

/*
 * "Mark work done" step: asks for a photo of the finished work, then hands it back
 * via onConfirm({ proof, proof_type }). The photo is saved on the job and becomes the
 * proof on the time entry when the job is closed (the clock stops automatically).
 * Big thumb-sized buttons; a sheet at the bottom on phones.
 *   allowSkip — office/admin marking a job done from a desk can skip the photo.
 */
export default function WorkDonePhoto({ open, jobTitle, onClose, onConfirm, allowSkip = false }) {
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const camRef = useRef(null), libRef = useRef(null);
  useEffect(() => { if (!open) { setPhoto(null); setBusy(false); } }, [open]);
  if (!open) return null;

  async function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try { setPhoto(await fileToProof(f)); } catch (err) { toast.error(err.message || 'Could not read that photo'); }
  }
  async function confirm(p) {
    setBusy(true);
    try { await onConfirm(p); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/50" onMouseDown={busy ? undefined : onClose}>
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92dvh] overflow-y-auto" onMouseDown={e => e.stopPropagation()}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center gap-2 pl-5 pr-2 py-2 border-b border-slate-100">
          <div className="min-w-0 flex-1 py-1.5">
            <p className="font-semibold text-slate-800">Photo of the finished work</p>
            {jobTitle && <p className="text-xs text-slate-500 truncate">{jobTitle}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="w-12 h-12 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-40"><X size={24} /></button>
        </div>
        <div className="p-5 space-y-3">
          <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
          <input ref={libRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
          {photo ? (
            <>
              <img src={photo.proof} alt="finished work" className="w-full max-h-64 object-contain rounded-xl border border-slate-200 bg-slate-50" />
              <button type="button" disabled={busy} onClick={() => confirm(photo)}
                className="w-full min-h-[56px] inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-60 text-white text-base font-semibold">
                {busy ? <><Loader2 size={20} className="animate-spin" /> Saving…</> : <><CheckCircle2 size={20} /> Save photo &amp; mark work done</>}
              </button>
              <button type="button" disabled={busy} onClick={() => camRef.current?.click()}
                className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Camera size={18} /> Retake</button>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600">Take a picture of the completed work. It's saved on the job, and your time stops automatically when the job is closed.</p>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => camRef.current?.click()}
                  className="min-h-[112px] flex flex-col items-center justify-center gap-2 rounded-2xl bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 active:scale-[0.98] transition">
                  <Camera size={34} /> <span className="text-base font-semibold">Take photo</span>
                </button>
                <button type="button" onClick={() => libRef.current?.click()}
                  className="min-h-[112px] flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 text-slate-700 hover:border-blue-300 hover:text-blue-700 active:bg-slate-50 active:scale-[0.98] transition">
                  <Images size={34} /> <span className="text-base font-semibold">Choose photo</span>
                </button>
              </div>
              {allowSkip && (
                <button type="button" disabled={busy} onClick={() => confirm(null)}
                  className="w-full min-h-[48px] rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50">
                  {busy ? 'Saving…' : 'Mark done without a photo (office only)'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
