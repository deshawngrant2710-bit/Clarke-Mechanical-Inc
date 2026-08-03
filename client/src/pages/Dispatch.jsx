import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Badge, Spinner } from '../components/UI';
import MobileDispatch from '../components/MobileDispatch';
import { LayoutList } from 'lucide-react';
import toast from 'react-hot-toast';

const COLUMNS = [
  { id: 'pending', label: 'Pending' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
];

const fullAddress = (job, c) =>
  job.address || (c ? [c.address, c.city, c.state, c.zip].filter(Boolean).join(', ') : '') || '';

export default function Dispatch() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState(null);
  const today = new Date().toISOString().slice(0, 10);

  function load() {
    Promise.all([
      api.get('/jobs'),
      api.get('/customers'),
      api.get('/employees'),
      api.get('/jobs/route/list', { params: { date: today } }).catch(() => ({ data: { jobs: [] } })),
    ]).then(([j, c, e, rl]) => {
      const custById = Object.fromEntries(c.data.map(x => [x.id, x]));
      const coord = Object.fromEntries((rl.data.jobs || []).map(x => [x.id, x]));
      const enriched = j.data.map(job => {
        const cust = custById[job.customer_id];
        const rlj = coord[job.id];
        return {
          ...job,
          customer_phone: cust?.phone || rlj?.customer_phone || null,
          address: fullAddress(job, cust) || rlj?.address || '',
          lat: rlj?.lat ?? null,
          lng: rlj?.lng ?? null,
        };
      });
      setJobs(enriched);
      setEmployees(e.data);
      setLoading(false);
    });
  }
  useEffect(load, []);

  async function move(job, status) {
    if (!job || job.status === status) return;
    setJobs(js => js.map(j => (j.id === job.id ? { ...j, status } : j)));
    try { await api.put(`/jobs/${job.id}`, { status }); }
    catch { toast.error('Could not update job'); load(); }
  }

  async function assign(job, techId) {
    const name = techId ? (employees.find(e => e.id === techId)?.name || null) : null;
    setJobs(js => js.map(j => (j.id === job.id ? { ...j, technician_id: techId || null, technician_name: name } : j)));
    try { await api.put(`/jobs/${job.id}`, { technician_id: techId || null }); toast.success(techId ? 'Technician assigned' : 'Unassigned'); }
    catch { toast.error('Could not reassign'); load(); }
  }

  if (loading) return <Spinner />;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Dispatch" subtitle="Assign and track jobs" icon={<LayoutList size={20} />} />

      {/* Desktop: drag-and-drop board (unchanged) */}
      <div className="hidden lg:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {COLUMNS.map(col => {
          const colJobs = jobs.filter(j => j.status === col.id);
          return (
            <div key={col.id}
              onDragOver={e => e.preventDefault()}
              onDrop={() => { move(jobs.find(j => j.id === dragId), col.id); setDragId(null); }}
              className="bg-slate-50 rounded-xl p-2 min-h-[240px]">
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-sm font-semibold text-slate-700">{col.label}</span>
                <span className="text-xs font-medium text-slate-400">{colJobs.length}</span>
              </div>
              <div className="space-y-2">
                {colJobs.map(job => (
                  <div key={job.id} draggable onDragStart={() => setDragId(job.id)}
                    onClick={() => navigate(`/jobs/${job.id}`)}
                    className="bg-white rounded-lg border border-slate-200 p-3 cursor-grab active:cursor-grabbing hover:border-blue-300 shadow-sm transition-colors">
                    <p className="text-sm font-medium text-slate-800 truncate">{job.title}</p>
                    <p className="text-xs text-slate-500 truncate">{job.customer_name || 'No customer'}</p>
                    <div className="flex items-center justify-between mt-2 gap-2">
                      <Badge status={job.priority} />
                      {job.technician_name && <span className="text-[10px] text-slate-400 truncate">{job.technician_name}</span>}
                    </div>
                  </div>
                ))}
                {colJobs.length === 0 && <p className="text-xs text-slate-300 text-center py-6">Drop jobs here</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile: card list with quick actions, reassign + move sheets, availability */}
      <MobileDispatch jobs={jobs} employees={employees} onMove={move} onAssign={assign} today={today} />
    </div>
  );
}
