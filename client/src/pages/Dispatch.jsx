import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Badge, Spinner } from '../components/UI';
import { LayoutList } from 'lucide-react';
import toast from 'react-hot-toast';

const COLUMNS = [
  { id: 'pending', label: 'Pending' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
];

export default function Dispatch() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState(null);

  function load() { api.get('/jobs').then(r => { setJobs(r.data); setLoading(false); }); }
  useEffect(load, []);

  async function move(job, status) {
    if (!job || job.status === status) return;
    setJobs(js => js.map(j => (j.id === job.id ? { ...j, status } : j)));
    try { await api.put(`/jobs/${job.id}`, { ...job, status }); }
    catch { toast.error('Could not update job'); load(); }
  }

  if (loading) return <Spinner />;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Dispatch" subtitle="Drag jobs between stages" icon={<LayoutList size={20} />} />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
    </div>
  );
}
