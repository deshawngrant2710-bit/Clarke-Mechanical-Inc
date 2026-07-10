import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, CardHeader, Btn, Badge, Modal, Select, Empty, Spinner } from '../components/UI';
import { ClipboardCheck, Plus, Building2, Home, Link2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { PROPERTY_TYPES, EQUIPMENT_TYPES, propertyLabel, equipmentLabel } from '../lib/inspectionForms';

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

export default function Inspections() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ property_type: 'residential', equipment_type: 'boiler' });
  const [creating, setCreating] = useState(false);

  function load() {
    api.get('/inspections').then(r => { setItems(r.data); setLoading(false); });
  }
  useEffect(load, []);

  async function createInspection() {
    setCreating(true);
    try {
      const { data } = await api.post('/inspections', form);
      toast.success('Inspection started');
      navigate(`/inspections/${data.id}`);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not start inspection');
    } finally { setCreating(false); }
  }

  if (loading) return <Spinner />;

  const filtered = items.filter(i => filter === 'all' || i.status === filter);
  const filters = [
    { id: 'all', label: 'All' },
    { id: 'draft', label: 'In progress' },
    { id: 'submitted', label: 'Submitted' },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader title="Inspections" subtitle={`${items.length} total`} icon={<ClipboardCheck size={20} />}>
        <Btn onClick={() => setModal(true)}><Plus size={16} /> New Inspection</Btn>
      </PageHeader>

      <div className="flex gap-1 mb-4 bg-white border border-slate-200 rounded-lg p-1 w-fit flex-wrap">
        {filters.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${filter === f.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>
            {f.label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader title="Inspection Reports" icon={<ClipboardCheck size={15} />} />
        {filtered.length === 0 ? (
          <Empty icon={<ClipboardCheck size={24} />} title="No inspections yet"
            message="Start an inspection to record a boiler or AC checklist and upload site photos."
            action={<Btn onClick={() => setModal(true)}><Plus size={16} /> New Inspection</Btn>} />
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map(i => (
              <div key={i.id} onClick={() => navigate(`/inspections/${i.id}`)}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-blue-50/40 cursor-pointer transition-colors">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-slate-100 text-slate-500 shrink-0">
                  {i.property_type === 'commercial' ? <Building2 size={18} /> : <Home size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {propertyLabel(i.property_type)} · {equipmentLabel(i.equipment_type)}
                    {i.job_id && <span className="ml-2 inline-flex items-center gap-1 text-xs text-blue-600"><Link2 size={11} /> linked</span>}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {i.technician_name || 'Unknown'} · {fmtDate(i.created_at)}
                    {i.info?.site_address ? ` · ${i.info.site_address}` : ''}
                  </p>
                </div>
                <Badge status={i.status === 'submitted' ? 'completed' : 'pending'} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="New Inspection" subtitle="Pick the property and equipment to load the right checklist" size="md">
        <div className="space-y-4">
          <Select label="Property type" value={form.property_type} onChange={e => setForm(f => ({ ...f, property_type: e.target.value }))}>
            {PROPERTY_TYPES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </Select>
          <Select label="Equipment" value={form.equipment_type} onChange={e => setForm(f => ({ ...f, equipment_type: e.target.value }))}>
            {EQUIPMENT_TYPES.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
          </Select>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="outline" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn onClick={createInspection} loading={creating}>Start Inspection</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
