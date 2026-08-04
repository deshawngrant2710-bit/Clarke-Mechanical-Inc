import { useState } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';

// A select that stays a native dropdown on desktop but opens an app-styled
// bottom sheet on mobile (title, optional search, checkmark, Cancel/Done).
// options: [{ value, label }].
export default function SheetSelect({ label, value, onChange, options = [], placeholder = 'Select', title, searchable, disabled }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const selected = options.find(o => String(o.value) === String(value));
  const filtered = q ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : options;

  function pick(v) { onChange(v); setOpen(false); }

  return (
    <div>
      {label && <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>}

      {/* Desktop: native select */}
      <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
        className="hidden lg:block w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500 disabled:opacity-60">
        {placeholder != null && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {/* Mobile: button that opens a bottom sheet */}
      <button type="button" disabled={disabled} onClick={() => { setQ(''); setOpen(true); }}
        className="lg:hidden w-full flex items-center justify-between gap-2 px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-left disabled:opacity-60">
        <span className={selected ? 'text-slate-800 truncate' : 'text-slate-400 truncate'}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={16} className="text-slate-400 shrink-0" />
      </button>

      {open && (
        <div className="lg:hidden fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-slate-900/50 animate-fade-in" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-2xl max-h-[78vh] flex flex-col animate-slide-up safe-bottom">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <button onClick={() => setOpen(false)} className="text-sm text-slate-500 w-14 text-left">Cancel</button>
              <span className="font-semibold text-slate-800 truncate">{title || label || 'Select'}</span>
              <button onClick={() => setOpen(false)} className="text-sm font-semibold text-blue-600 w-14 text-right">Done</button>
            </div>
            {searchable && (
              <div className="p-3 border-b border-slate-100">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
                    className="w-full pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500" />
                  {q && <button onClick={() => setQ('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"><X size={14} /></button>}
                </div>
              </div>
            )}
            <div className="overflow-y-auto overscroll-contain">
              {placeholder != null && (
                <button onClick={() => pick('')} className="w-full flex items-center justify-between px-4 py-3.5 text-left border-b border-slate-50 active:bg-slate-50">
                  <span className="text-slate-500">{placeholder}</span>
                  {!value && <Check size={16} className="text-blue-600" />}
                </button>
              )}
              {filtered.map(o => (
                <button key={o.value} onClick={() => pick(o.value)} className="w-full flex items-center justify-between gap-2 px-4 py-3.5 text-left border-b border-slate-50 active:bg-slate-50">
                  <span className="text-slate-800 truncate">{o.label}</span>
                  {String(o.value) === String(value) && <Check size={16} className="text-blue-600 shrink-0" />}
                </button>
              ))}
              {filtered.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No matches</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
