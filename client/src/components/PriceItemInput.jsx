import { useState, useRef, useEffect } from 'react';

// Description input with a searchable price-book dropdown.
// - Type freely for a custom line, or pick an item to auto-fill its price.
// - onChange(text) updates the description; onPick(item) fills description + price.
export default function PriceItemInput({ value, onChange, onPick, items = [], placeholder = 'Description', className = '' }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const q = (value || '').trim().toLowerCase();
  const matches = (q
    ? items.filter(it => (it.name || '').toLowerCase().includes(q) || (it.category || '').toLowerCase().includes(q))
    : items
  ).slice(0, 12);

  const money = (n) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  function pick(it) { onPick(it); setOpen(false); }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <input value={value} placeholder={placeholder}
        onChange={e => { onChange(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => items.length && setOpen(true)}
        onKeyDown={e => {
          if (!open || !matches.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, matches.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); pick(matches[active]); }
          else if (e.key === 'Escape') { setOpen(false); }
        }}
        className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500" />
      {open && matches.length > 0 && (
        <div className="absolute z-40 mt-1 left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-xl max-h-64 overflow-y-auto">
          {matches.map((it, i) => (
            <button type="button" key={it.id || i} onMouseDown={e => e.preventDefault()} onClick={() => pick(it)}
              onMouseEnter={() => setActive(i)}
              className={`w-full text-left px-3 py-2 flex items-center justify-between gap-3 ${i === active ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
              <span className="min-w-0">
                <span className="block text-sm text-slate-800 truncate">{it.name}</span>
                {it.category && <span className="block text-[11px] text-slate-400 truncate">{it.category}</span>}
              </span>
              <span className="text-sm font-semibold text-slate-700 tabular-nums shrink-0">{money(it.unit_price)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
