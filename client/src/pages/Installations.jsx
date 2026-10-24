import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, StatCard, Btn, Spinner, Empty, Modal, Input, Select } from '../components/UI';
import { HardHat, Plus, FileText, Wrench, ShieldAlert, Trash2, ChevronRight, FolderOpen } from 'lucide-react';
import toast from 'react-hot-toast';

const money = (v) => (v == null || v === '' ? '—' : `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const fmtDate = (d) => { if (!d) return '—'; const x = new Date(String(d).length <= 10 ? d + 'T00:00:00' : d); return isNaN(x) ? d : x.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }); };
const today = () => new Date().toISOString().slice(0, 10);

export const STATUS = {
  planning: { label: 'Planning', cls: 'bg-slate-100 text-slate-600' },
  installing: { label: 'Installing', cls: 'bg-blue-100 text-blue-700' },
  commissioning: { label: 'Commissioning', cls: 'bg-amber-100 text-amber-700' },
  ready_startup: { label: 'Ready for start-up', cls: 'bg-violet-100 text-violet-700' },
  completed: { label: 'Completed', cls: 'bg-emerald-100 text-emerald-700' },
  handed_to_service: { label: 'Handed to service', cls: 'bg-emerald-100 text-emerald-700' },
};

export default function Installations() {
  const nav = useNavigate();
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState('projects'); // projects | warranty
  const [warranty, setWarranty] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ customer_name: '', address: '' });
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.get('/installations').then(r => setItems(r.data)).catch(() => setItems([]));
    api.get('/installations/warranty/expiring?days=120').then(r => setWarranty(r.data)).catch(() => {});
  };
  useEffect(load, []);

  const create = async () => {
    setSaving(true);
    try { const { data } = await api.post('/installations', form); toast.success('Project created'); setModal(false); nav(`/installations/${data.id}`); }
    catch (e) { toast.error(e.response?.data?.error || 'Could not create'); } finally { setSaving(false); }
  };
  const del = async (p) => { if (!window.confirm(`Delete project ${p.project_number}? This removes its documents too.`)) return; try { await api.delete(`/installations/${p.id}`); load(); } catch { toast.error('Could not delete'); } };

  const openCount = useMemo(() => (items || []).filter(p => !['completed', 'handed_to_service'].includes(p.status)).length, [items]);
  const expiringSoon = warranty.filter(w => !w.expired).length;
  const expired = warranty.filter(w => w.expired).length;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Installation Projects" subtitle="Office-only install workspace — documents, equipment & warranty, commissioning" icon={<HardHat size={20} />}>
        <Btn onClick={() => { setForm({ customer_name: '', address: '' }); setModal(true); }}><Plus size={16} /> New project</Btn>
      </PageHeader>

      <div className="grid grid-cols-3 gap-4 mb-5">
        <StatCard label="Open projects" value={openCount} icon={<FolderOpen size={18} />} color="blue" animate={false} />
        <StatCard label="Warranty expiring (120d)" value={expiringSoon} icon={<ShieldAlert size={18} />} color="orange" animate={false} />
        <StatCard label="Warranty expired" value={expired} icon={<ShieldAlert size={18} />} color="red" animate={false} />
      </div>

      <div className="flex gap-2 mb-4">
        {[['projects', 'Projects'], ['warranty', 'Warranty watch']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === k ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{l}</button>
        ))}
      </div>

      {tab === 'projects' ? (
        items === null ? <Spinner /> : items.length === 0 ? (
          <Empty icon={<HardHat size={22} />} title="No installation projects yet" message="Convert a quote or job into a project, or create one from scratch." action={<Btn onClick={() => setModal(true)}><Plus size={16} /> New project</Btn>} />
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                    <th className="px-5 py-2.5 font-semibold">Project</th>
                    <th className="px-5 py-2.5 font-semibold">Customer / address</th>
                    <th className="px-5 py-2.5 font-semibold">Status</th>
                    <th className="px-5 py-2.5 font-semibold text-center">Docs</th>
                    <th className="px-5 py-2.5 font-semibold text-center">Equipment</th>
                    <th className="px-5 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map(p => {
                    const st = STATUS[p.status] || STATUS.planning;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => nav(`/installations/${p.id}`)}>
                        <td className="px-5 py-3"><div className="font-semibold text-slate-800">{p.project_number}</div><div className="text-[11px] text-slate-400">{fmtDate(p.created_at)}</div></td>
                        <td className="px-5 py-3"><div className="text-slate-800">{p.customer_name || '—'}</div><div className="text-[11px] text-slate-500">{[p.address, p.city_state_zip].filter(Boolean).join(' · ') || '—'}</div></td>
                        <td className="px-5 py-3"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span></td>
                        <td className="px-5 py-3 text-center text-slate-600">{p.documents?.length || 0}</td>
                        <td className="px-5 py-3 text-center text-slate-600">{p.equipment?.length || 0}</td>
                        <td className="px-5 py-3 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                          <button title="Open" onClick={() => nav(`/installations/${p.id}`)} className="text-slate-400 hover:text-blue-600 p-1"><ChevronRight size={16} /></button>
                          <button title="Delete" onClick={() => del(p)} className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )
      ) : (
        warranty.length === 0 ? (
          <Empty icon={<ShieldAlert size={22} />} title="Nothing expiring" message="Equipment with a purchase date and warranty length will appear here as it nears expiry." />
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                    <th className="px-5 py-2.5 font-semibold">Equipment</th>
                    <th className="px-5 py-2.5 font-semibold">Bought from</th>
                    <th className="px-5 py-2.5 font-semibold">Project / customer</th>
                    <th className="px-5 py-2.5 font-semibold">Warranty ends</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {warranty.map((w, i) => (
                    <tr key={i} className="hover:bg-slate-50 cursor-pointer" onClick={() => nav(`/installations/${w.project_id}`)}>
                      <td className="px-5 py-3"><div className="font-medium text-slate-800">{[w.category, w.manufacturer, w.model].filter(Boolean).join(' · ') || 'Equipment'}</div><div className="text-[11px] text-slate-400">{w.serial ? `S/N ${w.serial}` : ''}</div></td>
                      <td className="px-5 py-3 text-slate-700">{w.vendor_name || '—'}{w.po_ref ? <span className="text-[11px] text-slate-400"> · {w.po_ref}</span> : ''}</td>
                      <td className="px-5 py-3"><div className="text-slate-700">{w.project_number}</div><div className="text-[11px] text-slate-500">{w.customer_name || ''}</div></td>
                      <td className="px-5 py-3"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${w.expired ? 'bg-red-100 text-red-700' : w.warranty_expiry <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{fmtDate(w.warranty_expiry)}{w.expired ? ' · expired' : ''}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="New installation project"
        footer={<><Btn variant="outline" onClick={() => setModal(false)}>Cancel</Btn><Btn onClick={create} loading={saving}>Create</Btn></>}>
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Tip: you can also start a project straight from a quote or job with the "Convert to installation project" button.</p>
          <Input label="Customer / company" value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} placeholder="e.g. 123 Main St LLC" />
          <Input label="Installation address" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="123 Main Street" />
        </div>
      </Modal>
    </div>
  );
}
