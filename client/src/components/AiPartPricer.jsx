import { useState, useRef } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Sparkles, Camera, X, Check, Loader2 } from 'lucide-react';

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

export default function AiPartPricer({ onApply, label = 'AI price', initialDescription = '', triggerClassName = '', iconOnly = false }) {
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState(null);       // data URL preview
  const [desc, setDesc] = useState(initialDescription);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [price, setPrice] = useState('');          // editable applied price
  const fileRef = useRef(null);

  function reset() { setImage(null); setDesc(initialDescription); setResult(null); setPrice(''); }
  function close() { setOpen(false); reset(); }

  async function onFile(e) {
    const f = e.target.files?.[0];
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
      <button type="button" onClick={() => setOpen(true)} title="Price a part with AI"
        className={triggerClassName || `inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-colors ${iconOnly ? '' : ''}`}>
        <Sparkles size={15} />{!iconOnly && <span>{label}</span>}
      </button>

      {open && (
        <div className="fixed inset-0 z-[10000] flex items-start justify-center p-4 bg-slate-900/50 overflow-y-auto" onMouseDown={close}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl mt-10" onMouseDown={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
              <Sparkles size={16} className="text-blue-600" />
              <span className="font-semibold text-slate-800">AI part pricing</span>
              <button type="button" onClick={close} className="ml-auto p-1 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button>
            </div>

            <div className="p-5 space-y-3">
              {/* Photo */}
              <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
              {image ? (
                <div className="relative">
                  <img src={image} alt="part" className="w-full max-h-52 object-contain rounded-xl border border-slate-200 bg-slate-50" />
                  <button type="button" onClick={() => { setImage(null); setResult(null); }} className="absolute top-2 right-2 bg-white/90 rounded-full p-1 shadow text-slate-600 hover:text-slate-900"><X size={15} /></button>
                </div>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-600">
                  <Camera size={22} /> <span className="text-sm font-medium">Take or upload a photo</span>
                </button>
              )}

              {/* Description */}
              <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Or describe the part (optional)"
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500" />

              <button type="button" onClick={run} disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg">
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
                    <input type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)}
                      className="w-24 px-2 py-1.5 border border-slate-300 rounded-lg text-sm text-right outline-none focus:border-blue-500" />
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
                            className="w-full flex items-center justify-between gap-2 text-left px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40">
                            <span className="text-sm text-slate-700 truncate">{m.name}</span>
                            <span className="text-sm font-semibold text-slate-800 shrink-0">{money(m.unit_price)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-[11px] text-slate-400">{result.note}</p>
                  <button type="button" onClick={() => apply(result.name, price)}
                    className="w-full inline-flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold py-2 rounded-lg">
                    <Check size={15} /> Use this price
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
