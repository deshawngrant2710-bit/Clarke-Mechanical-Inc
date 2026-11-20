import { useState, useRef } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Sparkles, Camera, X, Check, Loader2, Images } from 'lucide-react';

/*
 * AI part pricing — snap/upload a photo of a part and/or type a description; the
 * AI identifies it, estimates a fair parts price, and matches it to the Price
 * Book. `onApply({ description, unit_price })` feeds the result back to the caller
 * (a line item, the Price Book form, etc.). Prices are estimates the office confirms.
 *
 * Renders its own fixed overlay so it stacks cleanly above an open modal.
 */

const money = (n) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Downscale a photo before upload so it's fast to send and process.
function fileToResizedDataURL(file, max = 1024, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      try { resolve(c.toDataURL('image/jpeg', quality)); } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
    img.src = url;
  });
}

const CONF = { high: 'bg-emerald-100 text-emerald-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-slate-100 text-slate-500' };

// variant="big" renders a large, full-width button that's easy to hit with a thumb
// (used on the Assistant screen); the default is the small inline trigger.
export default function AiPartPricer({ onApply, label = 'AI price', initialDescription = '', triggerClassName = '', iconOnly = false, variant = 'inline', hint = '' }) {
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState(null);       // data URL preview
  const [desc, setDesc] = useState(initialDescription);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [price, setPrice] = useState('');          // editable applied price
  const fileRef = useRef(null);     // camera
  const libRef = useRef(null);      // photo library / files

  function reset() { setImage(null); setDesc(initialDescription); setResult(null); setPrice(''); }
  function close() { setOpen(false); reset(); }

  async function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';             // so picking the same photo again still registers
    if (!f) return;
    try { setImage(await fileToResizedDataURL(f)); setResult(null); }
    catch { toast.error('Could not read that image'); }
  }

  async function run() {
    if (!image && !desc.trim()) return toast.error('Add a photo or a description');
    setBusy(true); setResult(null);
    try {
      const { data } = await api.post('/ai/price-part', { image, description: desc.trim() });
      setResult(data);
      setPrice(String(data.unit_price || ''));
    } catch (e) { toast.error(e.response?.data?.error || 'Could not price that part'); }
    finally { setBusy(false); }
  }

  function apply(useName, usePrice) {
    onApply?.({ description: useName, unit_price: Number(usePrice) || 0 });
    toast.success('Added to the line');
    close();
  }

  return (
    <>
      {variant === 'big' ? (
        <button type="button" onClick={() => setOpen(true)}
          className={triggerClassName || 'w-full flex items-center gap-3 min-h-[60px] px-4 py-3 rounded-2xl bg-blue-600 text-white text-left shadow-sm hover:bg-blue-700 active:bg-blue-800 active:scale-[0.99] transition'}>
          <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-white/15 shrink-0"><Camera size={24} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold leading-tight">{label}</span>
            {hint && <span className="block text-xs text-blue-100 mt-0.5">{hint}</span>}
          </span>
          <Sparkles size={18} className="shrink-0 opacity-80" />
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} title="Price a part with AI" aria-label="Price a part with AI"
          className={triggerClassName || 'inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-colors'}>
          <Sparkles size={15} />{!iconOnly && <span>{label}</span>}
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[10000] flex items-end sm:items-start justify-center sm:p-4 bg-slate-900/50 overflow-y-auto" onMouseDown={close}>
          {/* Phones: a sheet at the bottom, right under the thumb. Desktop: a centered card. */}
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl sm:mt-10 max-h-[92dvh] overflow-y-auto" onMouseDown={e => e.stopPropagation()}
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="flex items-center gap-2 pl-5 pr-2 py-2 border-b border-slate-100 sticky top-0 bg-white z-10 rounded-t-3xl sm:rounded-t-2xl">
              <Sparkles size={18} className="text-blue-600" />
              <span className="font-semibold text-slate-800">AI part pricing</span>
              <button type="button" onClick={close} aria-label="Close" className="ml-auto w-12 h-12 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800"><X size={24} /></button>
            </div>

            <div className="p-5 space-y-3">
              {/* Photo */}
              <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
              <input ref={libRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
              {image ? (
                <div>
                  <img src={image} alt="part" className="w-full max-h-52 object-contain rounded-xl border border-slate-200 bg-slate-50" />
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <button type="button" onClick={() => fileRef.current?.click()} className="min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100"><Camera size={18} /> Retake</button>
                    <button type="button" onClick={() => { setImage(null); setResult(null); }} className="min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100"><X size={18} /> Remove photo</button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className="min-h-[112px] flex flex-col items-center justify-center gap-2 rounded-2xl bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 active:scale-[0.98] transition">
                    <Camera size={34} /> <span className="text-base font-semibold">Take photo</span>
                  </button>
                  <button type="button" onClick={() => libRef.current?.click()}
                    className="min-h-[112px] flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 text-slate-700 hover:border-blue-300 hover:text-blue-700 active:bg-slate-50 active:scale-[0.98] transition">
                    <Images size={34} /> <span className="text-base font-semibold">Choose photo</span>
                  </button>
                </div>
              )}

              {/* Description */}
              <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Or describe the part (optional)"
                className="w-full px-3.5 min-h-[48px] border border-slate-300 rounded-xl text-base outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500" />

              <button type="button" onClick={run} disabled={busy}
                className="w-full min-h-[52px] inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white text-base font-semibold rounded-xl">
                {busy ? <><Loader2 size={16} className="animate-spin" /> Identifying…</> : <><Sparkles size={16} /> Identify &amp; price</>}
              </button>

              {/* Result */}
              {result && (
                <div className="rounded-xl border border-slate-200 p-3.5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800">{result.name}</p>
                      {result.category && <p className="text-xs text-slate-400">{result.category}</p>}
                    </div>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${CONF[result.confidence] || CONF.low}`}>{result.confidence} confidence</span>
                  </div>
                  {result.description && <p className="text-xs text-slate-500">{result.description}</p>}

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500">Est. price</span>
                    <span className="text-slate-400">$</span>
                    <input type="number" inputMode="decimal" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)}
                      className="w-28 px-2.5 min-h-[44px] border border-slate-300 rounded-lg text-base text-right outline-none focus:border-blue-500" />
                    {(result.price_low > 0 || result.price_high > 0) && (
                      <span className="text-xs text-slate-400">range {money(result.price_low)}–{money(result.price_high)}</span>
                    )}
                  </div>

                  {/* Price Book matches */}
                  {result.matches?.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">In your Price Book</p>
                      <div className="space-y-1">
                        {result.matches.map(m => (
                          <button key={m.id} type="button" onClick={() => apply(m.name, m.unit_price)}
                            className="w-full min-h-[48px] flex items-center justify-between gap-2 text-left px-3 py-2 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 active:bg-blue-50">
                            <span className="text-sm text-slate-700 truncate">{m.name}</span>
                            <span className="text-sm font-semibold text-slate-800 shrink-0">{money(m.unit_price)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-[11px] text-slate-400">{result.note}</p>
                  <button type="button" onClick={() => apply(result.name, price)}
                    className="w-full min-h-[52px] inline-flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white text-base font-semibold rounded-xl">
                    <Check size={18} /> Use this price
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
