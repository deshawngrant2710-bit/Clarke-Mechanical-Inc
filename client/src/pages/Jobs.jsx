import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import {
  Card, Btn, Modal, Input, Select, Textarea, Badge, Empty, SkeletonPage,
  StatCard, SearchInput, Table, Row, Cell, Avatar,
} from '../components/UI';
import { Plus, Search, Briefcase, CalendarDays, AlertTriangle, CheckCircle, Clock, Wrench, ChevronRight, Copy, Lock } from 'lucide-react';
import toast from 'react-hot-toast';

const JOB_TYPES = ['AC Repair', 'AC Installation', 'Heating Repair', 'Heating Installation', 'Maintenance', 'Inspection', 'Ductwork', 'Ventilation', 'Emergency', 'Other'];
const empty = { title: '', description: '', customer_id: '', technician_id: '', status: 'pending', priority: 'normal', job_type: '', scheduled_date: '', scheduled_time: '', address: '', notes: '' };
const isToday = (d) => d === new Date().toISOString().slice(0, 10);

export default function Jobs() {
  const [jobs, setJobs] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();

  async function duplicateJob(e, job) {
    e.stopPropagation();
    try {
      const { data } = await api.post('/jobs', {
        title: job.title, description: job.description, customer_id: job.customer_id, technician_id: job.technician_id,
        status: 'pending', priority: job.priority, job_type: job.job_type, address: job.address, notes: job.notes,
      });
      toast.success('Job duplicated');
      navigate(`/jobs/${data.id}`);
    } catch { toast.error('Could not duplicate job'); }
  }

  async function assignTech(job, technician_id) {
    try {
      await api.put(`/jobs/${job.id}`, { ...job, technician_id: technician_id || null });
      toast.success(technician_id ? 'Technician assigned' : 'Unassigned');
      load();
    } catch { toast.error('Could not assign technician'); }
  }

  function load() {
    Promise.all([api.get('/jobs'), api.get('/customers'), api.get('/employees')])
      .then(([j, c, e]) => { setJobs(j.data); setCustomers(c.data); setEmployees(e.data); setLoading(false); });
  }
  useEffect(() => {
    load();
    const cid = params.get('customer_id');
    if (cid) setForm(f => ({ ...f, customer_id: cid }));
    if (params.get('new') === '1') setModal(true);
  }, []);

  const filtered = jobs.filter(j => {
    const matchSearch = j.title.toLowerCase().includes(search.toLowerCase()) ||
      j.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      j.technician_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || j.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = {
    today: jobs.filter(j => isToday(j.scheduled_date)).length,
    open: jobs.filter(j => !['completed', 'cancelled'].includes(j.status)).length,
    emergency: jobs.filter(j => (j.priority === 'urgent' || j.job_type === 'Emergency') && !['completed', 'cancelled'].includes(j.status)).length,
    completed: jobs.filter(j => j.status === 'completed').length,
  };

  async function handleSave() {
    if (!form.title.trim()) return toast.error('Title is required');
    setSaving(true);
    try {
      await api.post('/jobs', form);
      toast.success('Job created');
      setModal(false); setForm(empty); load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error creating job');
    } finally { setSaving(false); }
  }
  const f = v => setForm(prev => ({ ...prev, ...v }));

  if (loading) return <SkeletonPage stats={4} />;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Jobs" subtitle={`${jobs.length} total work orders`} icon={<Briefcase size={20} />}>
        <Btn onClick={() => setModal(true)}><Plus size={16} /> New Job</Btn>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Today's Jobs" value={stats.today} icon={<CalendarDays size={18} />} color="blue" />
        <StatCard label="Open Jobs" value={stats.open} icon={<Clock size={18} />} color="orange" />
        <StatCard label="Emergency" value={stats.emergency} icon={<AlertTriangle size={18} />} color="red" />
        <StatCard label="Completed" value={stats.completed} icon={<CheckCircle size={18} />} color="green" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <SearchInput className="flex-1" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search jobs, customers, technicians…" icon={<Search size={16} />} />
        <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="sm:w-52">
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="scheduled">Scheduled</option>
          <option value="in-progress">In Progress</option>
          <option value="awaiting-signoff">Awaiting Sign-off</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <Empty icon={<Briefcase size={28} />}
            title={search || statusFilter ? 'No matching jobs' : 'No jobs yet'}
            message={search || statusFilter ? 'Try adjusting your search or filters.' : 'Create your first work order to dispatch a technician.'}
            action={!search && !statusFilter && <Btn onClick={() => setModal(true)}><Plus size={16} /> New Job</Btn>} />
        ) : (
          <Table head={[
            { label: 'Job' }, { label: 'Customer' }, { label: 'Technician' },
            { label: 'Priority' }, { label: 'Scheduled' }, { label: 'Status', align: 'right' }, { label: '' },
          ]}>
            {filtered.map(job => (
              <Row key={job.id} onClick={() => navigate(`/jobs/${job.id}`)}>
                <Cell>
                  <p className="font-semibold text-slate-800">{job.title}</p>
                  {job.job_type && <p className="text-xs text-slate-400">{job.job_type}</p>}
                </Cell>
                <Cell><span className="text-sm text-slate-600">{job.customer_name || <span className="text-slate-300">—</span>}</span></Cell>
                <Cell>
                  {job.status === 'completed' ? (
                    // Technician is locked once the job is completed.
                    <span className="text-sm text-slate-600 inline-flex items-center gap-1.5" title="Locked — job completed">
                      {job.technician_name || employees.find(u => u.id === job.technician_id)?.name || <span className="text-slate-300">—</span>}
                      <Lock size={11} className="text-slate-300" />
                    </span>
                  ) : (
                    <div onClick={e => e.stopPropagation()}>
                      <select value={job.technician_id || ''} onChange={e => assignTech(job, e.target.value)}
                        className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-blue-500 hover:border-slate-300 max-w-[150px] cursor-pointer">
                        <option value="">Unassigned</option>
                        {employees.filter(u => u.role === 'technician' || u.also_technician).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </div>
                  )}
                </Cell>
                <Cell><Badge status={job.priority} /></Cell>
                <Cell>
                  {job.scheduled_date ? (
                    <div>
                      <p className="text-sm text-slate-700">{new Date(job.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                      {job.scheduled_time && <p className="text-xs text-slate-400">{job.scheduled_time}</p>}
                    </div>
                  ) : <span className="text-xs text-slate-400">Unscheduled</span>}
                </Cell>
                <Cell align="right"><Badge status={job.status} /></Cell>
                <Cell align="right">
                  <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                    <button onClick={e => duplicateJob(e, job)} title="Duplicate" className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-100 rounded-lg transition-colors"><Copy size={15} /></button>
                    <ChevronRight size={16} className="text-slate-300 inline" />
                  </div>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="Create Job" subtitle="Log a new service work order">
        <div className="space-y-3">
          <Input label="Job Title *" value={form.title} valid={form.title.trim().length > 2} onChange={e => f({ title: e.target.value })} placeholder="e.g. AC Repair - Unit 3B" />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Customer" value={form.customer_id} onChange={e => {
              const c = customers.find(x => x.id === e.target.value);
              const addr = c ? [c.address, c.city, c.state, c.zip].filter(Boolean).join(', ') : '';
              f(addr ? { customer_id: e.target.value, address: addr } : { customer_id: e.target.value });
            }}>
              <option value="">Select customer</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select label="Technician" value={form.technician_id} onChange={e => f({ technician_id: e.target.value })}>
              <option value="">Unassigned</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Job Type" value={form.job_type} onChange={e => f({ job_type: e.target.value })}>
              <option value="">Select type</option>
              {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Select label="Priority" value={form.priority} onChange={e => f({ priority: e.target.value })}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Scheduled Date" type="date" value={form.scheduled_date} onChange={e => f({ scheduled_date: e.target.value })} />
            <Input label="Scheduled Time" type="time" value={form.scheduled_time} onChange={e => f({ scheduled_time: e.target.value })} />
          </div>
          <Input label="Job Address" value={form.address} onChange={e => f({ address: e.target.value })} placeholder="Service address" />
          <Textarea label="Description" value={form.description} onChange={e => f({ description: e.target.value })} />
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="outline" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn onClick={handleSave} loading={saving}>{saving ? 'Creating…' : 'Create Job'}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
