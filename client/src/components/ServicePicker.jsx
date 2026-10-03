import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { Modal, Btn, Input } from './UI';
import { Search, Clock, Plus } from 'lucide-react';
import { CONDITIONS, conditionField, conditionLabel, suggestedCondition } from '../lib/servicePricing';
import toast from 'react-hot-toast';

const money = (n) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Modal to add flat-rate services to an estimate/invoice as line items. The job
// condition (Standard / Member / After-hours / Emergency) selects which price
// tier is applied — chosen once for the whole job, auto-suggested after 4 PM.
// Each added item is a snapshot (its own description + price), so later catalog
// changes never alter saved documents.
export default function ServicePicker({ open, onClose, onAdd }) {
  const [items, setItems] = useState(null);
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('all');
  const [cond, setCond] = useState(suggestedCondition());
  const [qty, setQty] = useState({}); // id -> quantity

  useEffect(() => {
    if (!open || items) return;
    api.get('/service-pricebook').then(r => setItems(r.data.items || [])).catch(() => setItems([]));
  }, [open, items]);
  useEffect(() => { if (open) setCond(suggestedCondition()); }, [open]);

  const categories = useMemo(() => Array.from(new Set((items || []).map(i => i.category).filter(Boolean))).sort(), [items]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items || []).filter(i => i.active !== false &&
      (cat === 'all' || i.category === cat) &&
      (!q || [i.name, i.code, i.category, i.customer_desc].some(v => String(v || '').toLowerCase().includes(q))));
  }, [items, search, cat]);

  const field = conditionField(cond);

  function add(it) {
    const quantity = Math.max(1, Number(qty[it.id]) || 1);
    const price = it.quote_required ? 0 : Number(it.prices[field]) || 0;
    const description = it.customer_desc || it.name;
    const note = it.quote_required ? 'Quote required — price to be confirmed' : (cond !== 'standard' ? `${conditionLabel(cond)} rate` : '');
    onAdd({ description, note, quantity, unit_price: price });
    toast.success(`Added: ${it.name}${it.quote_required ? '' : ` · ${money(price)}`}`);
  }

  return (
    <Modal open={open} onClose={onClose} title="Add service from price book" subtitle="Pick the job condition, then add services" size="xl">
      <div className="space-y-3">
        {/* Job condition */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-500 flex items-center gap-1"><Clock size={13} /> Job condition</span>
          <div className="inline-flex rounded-lg border border-slate-200 p-1 bg-slate-50 flex-wrap">
            {CONDITIONS.map(c => (
              <button key={c.key} type="button" onClick={() => setCond(c.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${cond === c.key ? 'bg-white shadow-sm text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}>{c.label}</button>
            ))}
          </div>
          {suggestedCondition() === 'after_hours' && cond === 'after_hours' && (
            <span className="text-[11px] text-amber-600 font-medium">Auto-set: it's after 4 PM / weekend</span>
          )}
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search services…"
            className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500" />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {['all', ...categories].map(c => (
            <button key={c} type="button" onClick={() => setCat(c)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${cat === c ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{c === 'all' ? 'All' : c}</button>
          ))}
        </div>

        <div className="max-h-[48vh] overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-lg">
          {items === null ? <p className="p-4 text-sm text-slate-400">Loading…</p>
            : filtered.length === 0 ? <p className="p-4 text-sm text-slate-400">No matching services.</p>
            : filtered.map(it => (
              <div key={it.id} className="flex items-center gap-3 p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 leading-tight truncate">{it.name}</p>
                  <p className="text-[11px] text-slate-400">{it.code} · {it.category}</p>
                </div>
                <div className="text-right shrink-0 w-20">
                  {it.quote_required ? <span className="text-xs font-semibold text-orange-600">Quote</span>
                    : <span className="text-sm font-bold text-slate-900 tabular-nums">{money(it.prices[field])}</span>}
                </div>
                <input type="number" min="1" value={qty[it.id] || 1} onChange={e => setQty(q => ({ ...q, [it.id]: e.target.value }))}
                  className="w-14 px-2 py-1.5 border border-slate-300 rounded-lg text-sm text-center" />
                <Btn size="sm" onClick={() => add(it)}><Plus size={14} /></Btn>
              </div>
            ))}
        </div>

        <div className="flex justify-between items-center">
          <p className="text-[11px] text-slate-400">Prices shown are the <strong>{conditionLabel(cond)}</strong> tier. Tax is applied once on the estimate/invoice — no extra surcharge is added.</p>
          <Btn variant="outline" onClick={onClose}>Done</Btn>
        </div>
      </div>
    </Modal>
  );
}
