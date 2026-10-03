import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import {
  Card, Btn, Input, Select, Textarea, Empty, SkeletonPage, StatCard, SearchInput, Modal,
} from '../components/UI';
import { BookOpen, Plus, Search, DownloadCloud, Settings as SettingsIcon, Pencil, Clock, AlertTriangle } from 'lucide-react';
import { CONDITIONS } from '../lib/servicePricing';
import toast from 'react-hot-toast';

const money = (n) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n) => `${Math.round((Number(n) || 0) * 100)}%`;
const SETTING_FIELDS = [
  ['labor_rate', 'Base labor / tech-hr ($)'], ['diagnostic_fee', 'Diagnostic fee ($)'], ['travel_fee', 'Truck / travel fee ($)'],
  ['after_hours_mult', 'After-hours multiplier'], ['emergency_mult', 'Emergency / holiday multiplier'],
  ['contract_discount', 'Contract / member discount (e.g. 0.10)'],
  ['markup_under_250', 'Material markup < $250'], ['markup_250_1000', 'Material markup $250–$1,000'], ['markup_over_1000', 'Material markup > $1,000'],
  ['helper_rate', 'Helper / apprentice rate ($)'], ['target_margin', 'Target gross margin (e.g. 0.55)'],
];
const emptyService = () => ({ code: '', category: '', name: '', customer_desc: '', material: 0, hours: 0, parts: 0, quote_required: false, active: true });

export default function ServicePriceBook() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canManage = ['admin', 'office'].includes(user?.role);

  const [data, setData] = useState(null);     // { items, conditions, is_admin }
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('all');
  const [cond, setCond] = useState('standard');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [busy, setBusy] = useState('');

  function load() {
    api.get(`/service-pricebook${isAdmin ? '?all=1' : ''}`).then(r => setData(r.data)).catch(() => setData({ items: [], conditions: CONDITIONS, is_admin: false }));
  }
  useEffect(load, []); // eslint-disable-line

  const items = data?.items || [];
  const categories = useMemo(() => Array.from(new Set(items.map(i => i.category).filter(Boolean))).sort(), [items]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(i =>
      (cat === 'all' || i.category === cat) &&
      (!q || [i.name, i.code, i.category, i.customer_desc].some(v => String(v || '').toLowerCase().includes(q))));
  }, [items, search, cat]);

  async function runImport() {
    setBusy('import');
    try { const { data: r } = await api.post('/service-pricebook/import', {}); toast.success(`Imported ${r.total} services (${r.added} new, ${r.updated} updated)`); load(); }
    catch (e) { toast.error(e.response?.data?.error || 'Import failed'); }
    finally { setBusy(''); }
  }
  async function openSettings() {
    try { const { data: s } = await api.get('/service-pricebook/settings'); setSettings(s); setSettingsOpen(true); }
    catch { toast.error('Could not load settings'); }
  }
  async function saveSettings() {
    setBusy('settings');
    try { await api.put('/service-pricebook/settings', settings); toast.success('Pricing updated — catalog recalculated'); setSettingsOpen(false); load(); }
    catch (e) { toast.error(e.response?.data?.error || 'Could not save'); }
    finally { setBusy(''); }
  }
  async function saveService() {
    if (!editItem.name.trim()) return toast.error('Service name is required');
    setBusy('svc');
    try {
      if (editItem.id) await api.put(`/service-pricebook/${editItem.id}`, editItem);
      else await api.post('/service-pricebook', editItem);
      toast.success('Saved'); setEditItem(null); load();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not save'); }
    finally { setBusy(''); }
  }
  async function toggleActive(it) {
    try { await api.put(`/service-pricebook/${it.id}`, { active: !it.active }); load(); }
    catch { toast.error('Could not update'); }
  }

  if (!data) return <SkeletonPage stats={3} />;

  // First-run: empty catalog
  if (items.length === 0) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Service Pricing" subtitle="Flat-rate HVAC service price book" icon={<BookOpen size={20} />} />
        <Card className="p-8">
          <Empty icon={<BookOpen size={28} />} title="No services yet"
            message={canManage ? 'Import the 134-item flat-rate price book to get started. Re-importing is safe — it never creates duplicates.' : 'The price book has not been set up yet. Ask an admin to import it.'}
            action={canManage && <Btn onClick={runImport} loading={busy === 'import'}><DownloadCloud size={16} /> Import price book</Btn>} />
        </Card>
      </div>
    );
  }

  const condField = (CONDITIONS.find(c => c.key === cond) || CONDITIONS[0]).field;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Service Pricing" subtitle={`${items.filter(i => i.active).length} flat-rate services`} icon={<BookOpen size={20} />}>
        {isAdmin && <Btn variant="outline" onClick={openSettings}><SettingsIcon size={16} /> Pricing settings</Btn>}
        {canManage && <Btn variant="outline" onClick={runImport} loading={busy === 'import'}><DownloadCloud size={16} /> Re-import</Btn>}
        {canManage && <Btn onClick={() => setEditItem(emptyService())}><Plus size={16} /> Add service</Btn>}
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
        <StatCard label="Services" value={items.filter(i => i.active).length} icon={<BookOpen size={18} />} color="blue" />
        <StatCard label="Categories" value={categories.length} icon={<Search size={18} />} color="purple" />
        <StatCard label="Quote-only" value={items.filter(i => i.quote_required).length} icon={<AlertTriangle size={18} />} color="orange" />
      </div>

      {/* Condition selector — view the whole catalog at any price tier */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs font-semibold text-slate-500 flex items-center gap-1"><Clock size={13} /> Showing</span>
        <div className="inline-flex rounded-lg border border-slate-200 p-1 bg-slate-50 flex-wrap">
          {CONDITIONS.map(c => (
            <button key={c.key} onClick={() => setCond(c.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${cond === c.key ? 'bg-white shadow-sm text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}>{c.label}</button>
          ))}
        </div>
      </div>

      <SearchInput className="mb-3" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search services, codes, categories…" icon={<Search size={16} />} />

      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
        {['all', ...categories].map(c => (
          <button key={c} onClick={() => setCat(c)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${cat === c ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {c === 'all' ? 'All' : c}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="p-2"><Empty icon={<Search size={26} />} title="No matches" message="Try a different search or category." /></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(it => (
            <Card key={it.id} className={`p-3.5 ${it.active === false ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono font-semibold text-slate-400">{it.code}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{it.category}</span>
                    {it.active === false && <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 px-1.5 rounded">Inactive</span>}
                  </div>
                  <p className="font-semibold text-slate-900 leading-tight mt-0.5">{it.name}</p>
                  {it.customer_desc && <p className="text-xs text-slate-500 mt-0.5">{it.customer_desc}</p>}
                </div>
                <div className="text-right shrink-0">
                  {it.quote_required
                    ? <span className="inline-block text-sm font-bold text-orange-600">Quote required</span>
                    : <span className="text-lg font-bold text-slate-900 tabular-nums">{money(it.prices[condField])}</span>}
                  {!it.quote_required && <p className="text-[10px] text-slate-400 capitalize">{(CONDITIONS.find(c => c.key === cond) || {}).label}</p>}
                </div>
              </div>

              {!it.quote_required && (
                <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
                  {CONDITIONS.map(c => (
                    <div key={c.key} className={`rounded-lg py-1 ${cond === c.key ? 'bg-blue-50' : 'bg-slate-50'}`}>
                      <p className="text-[9px] uppercase tracking-wide text-slate-400 leading-tight">{c.label}</p>
                      <p className="text-xs font-semibold text-slate-800 tabular-nums">{money(it.prices[c.field])}</p>
                    </div>
                  ))}
                </div>
              )}

              {isAdmin && !it.quote_required && (
                <div className="mt-2 flex items-center gap-x-3 gap-y-0.5 flex-wrap text-[11px] text-slate-400">
                  <span>Labor: {it.hours}h</span><span>Material: {money(it.material)}</span><span>Parts: {money(it.parts)}</span>
                  <span>Loaded: {money(it.loaded)}</span><span className="font-semibold text-slate-500">Margin: {pct(it.gross_margin)} ({money(it.gross_profit)})</span>
                </div>
              )}

              {canManage && (
                <div className="mt-2 flex gap-2">
                  <button onClick={() => setEditItem({ ...it, customer_desc: it.customer_desc || '' })} className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"><Pencil size={12} /> Edit</button>
                  <button onClick={() => toggleActive(it)} className="text-xs font-medium text-slate-500 hover:text-slate-700">{it.active === false ? 'Reactivate' : 'Deactivate'}</button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Pricing settings (admin) */}
      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Pricing settings" subtitle="Changing these recalculates every service price" size="lg">
        {settings && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {SETTING_FIELDS.map(([k, label]) => (
                <Input key={k} label={label} type="number" step="any" value={settings[k]} onChange={e => setSettings(s => ({ ...s, [k]: e.target.value }))} />
              ))}
            </div>
            <p className="text-[11px] text-slate-400">After-hours and emergency add a labor-only premium to the standard price (they don't stack with the member discount). Member/contract price is the standard price less the contract discount.</p>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setSettingsOpen(false)}>Cancel</Btn>
              <Btn onClick={saveSettings} loading={busy === 'settings'}>Save settings</Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* Add / edit service (admin/office) */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title={editItem?.id ? 'Edit service' : 'Add service'} size="lg">
        {editItem && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Code" value={editItem.code} onChange={e => setEditItem(s => ({ ...s, code: e.target.value }))} placeholder="e.g. R-027" />
              <Input label="Category" value={editItem.category} onChange={e => setEditItem(s => ({ ...s, category: e.target.value }))} />
            </div>
            <Input label="Service name (internal)" value={editItem.name} onChange={e => setEditItem(s => ({ ...s, name: e.target.value }))} />
            <Textarea label="Customer-facing description (optional)" rows={2} value={editItem.customer_desc} onChange={e => setEditItem(s => ({ ...s, customer_desc: e.target.value }))} placeholder="What the customer sees on the estimate/invoice" />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={!!editItem.quote_required} onChange={e => setEditItem(s => ({ ...s, quote_required: e.target.checked }))} /> Quote required (no flat price)
            </label>
            {!editItem.quote_required && (
              <div className="grid grid-cols-3 gap-3">
                <Input label="Tech hours" type="number" step="any" value={editItem.hours} onChange={e => setEditItem(s => ({ ...s, hours: e.target.value }))} />
                <Input label="Material ($)" type="number" step="any" value={editItem.material} onChange={e => setEditItem(s => ({ ...s, material: e.target.value }))} />
                <Input label="Parts ($)" type="number" step="any" value={editItem.parts} onChange={e => setEditItem(s => ({ ...s, parts: e.target.value }))} />
              </div>
            )}
            {editItem.id && (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={editItem.active !== false} onChange={e => setEditItem(s => ({ ...s, active: e.target.checked }))} /> Active
              </label>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Btn variant="ghost" onClick={() => setEditItem(null)}>Cancel</Btn>
              <Btn onClick={saveService} loading={busy === 'svc'}>Save</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
