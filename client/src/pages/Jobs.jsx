import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import {
  Card, Btn, Modal, Input, Select, Textarea, Badge, Empty, SkeletonPage,
  StatCard, SearchInput, Table, Row, Cell, Avatar,
} from '../components/UI';
import { Plus, Search, Briefcase, CalendarDays, AlertTriangle, CheckCircle, Clock, Wrench, ChevronRight, Copy, Lock, User, DollarSign, X, Bot } from 'lucide-react';

// Small badge marking a job that came in through the Sona AI phone agent.
const AiLead = () => (
  <span title="Captured by the Sona AI phone assistant — review and confirm with the customer"
    className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded-full shrink-0">
    <Bot size={11} /> AI call
  </span>
);
import { cacheGet, cacheHas, cacheSet } from '../lib/queryCache';
import SheetSelect from '../components/SheetSelect';
import toast from 'react-hot-toast';

function Chip({ children, icon, tone }) {
  const cls = tone === 'muted' ? 'bg-slate-50 text-slate-400' : 'bg-slate-100 text-slate-600';
  return <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${cls}`}>{icon}{children}</span>;
}

function PaymentChip({ invoice, jobStatus }) {
  if (!invoice) {
    if (jobStatus === 'completed' || jobStatus === 'awaiting-signoff') {
      return <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500"><DollarSign size={11} />Unbilled</span>;
    }
    return null;
  }
  const map = {
    paid: ['Paid', 'bg-emerald-100 text-emerald-700'],
    overdue: ['Overdue', 'bg-red-100 text-red-700'],
    partial: ['Partial', 'bg-amber-100 text-amber-700'],
    sent: ['Awaiting payment', 'bg-amber-100 text-amber-700'],
    draft: ['Draft invoice', 'bg-slate-100 text-slate-500'],
    cancelled: ['Void', 'bg-slate-100 text-slate-400'],
  };
  const [label, cls] = map[invoice.status] || [invoice.status, 'bg-slate-100 text-slate-600'];
  return <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${cls}`}><DollarSign size={11} />{label}</span>;
}

function AssignSheet({ job, techs, onClose, onAssign }) {
  if (!job) return null;
  return (
    <div className="lg:hidden fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-900/50 animate-fade-in" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-2xl animate-slide-up max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div>
            <h3 className="font-semibold text-slate-800">Assign technician</h3>
            <p className="text-xs text-slate-400 truncate">{job.title}</p>
          </div>
          <button onClick={onClose} className="p-1.5 -mr-1 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto overscroll-contain p-3 safe-bottom space-y-1.5">
          <button onClick={() => onAssign(job, '')} className="w-full text-left px-3 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-500 hover:bg-slate-50">Unassign</button>
          {techs.map(t => {
            const current = job.technician_id === t.id;
            return (
              <button key={t.id} onClick={() => onAssign(job, t.id)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-3 rounded-xl border text-sm ${current ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <span className="font-medium text-slate-800 truncate">{t.name}</span>
                {current && <span className="text-xs text-blue-500">Current</span>}
              </button>
            );
          })}
          {techs.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No technicians yet</p>}
        </div>
      </div>
    </div>
  );
}

const JOB_TYPES = ['AC Repair', 'AC Installation', 'Heating Repair', 'Heating Installation', 'Maintenance', 'Inspection', 'Ductwork', 'Ventilation', 'Emergency', 'Other'];
const empty = { title: '', description: '', customer_id: '', technician_id: '', status: 'pending', priority: 'normal', job_type: '', scheduled_date: '', scheduled_time: '', address: '', notes: '' };
const isToday = (d) => d === new Date().toISOString().slice(0, 10);

export default function Jobs() {
  const [jobs, setJobs] = useState(() => cacheGet('/jobs') || []);
  const [customers, setCustomers] = useState(() => cacheGet('/customers') || []);
  const [employees, setEmployees] = useState(() => cacheGet('/employees') || []);
  const [invoices, setInvoices] = useState(() => cacheGet('/billing/invoices') || []);
  const [assignJob, setAssignJob] = useState(null);
  const [loading, setLoading] = useState(() => !cacheHas('/jobs'));
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
    Promise.all([
      api.get('/jobs'), api.get('/customers'), api.get('/employees'),
      api.get('/billing/invoices').catch(() => ({ data: [] })),
    ]).then(([j, c, e, inv]) => {
      setJobs(j.data); setCustomers(c.data); setEmployees(e.data); setInvoices(inv.data || []); setLoading(false);
      cacheSet('/jobs', j.data); cacheSet('/customers', c.data); cacheSet('/employees', e.data); cacheSet('/billing/invoices', inv.data || []);
    });
  }

  // Latest invoice per job → payment chip.
  const paymentByJob = {};
  for (const inv of invoices) { if (inv.job_id) paymentByJob[inv.job_id] = inv; }
  const techs = employees.filter(u => u.role === 'technician' || u.also_technician);
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
          <>
          {/* Desktop: table */}
          <div className="hidden lg:block">
          <Table head={[
            { label: 'Job' }, { label: 'Customer' }, { label: 'Technician' },
            { label: 'Priority' }, { label: 'Scheduled' }, { label: 'Status', align: 'right' }, { label: '' },
          ]}>
            {filtered.map(job => (
              <Row key={job.id} onClick={() => navigate(`/jobs/${job.id}`)}>
                <Cell>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-800">{job.title}</p>
                    {job.source === 'sona' && <AiLead />}
                  </div>
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
          </div>

          {/* Mobile: cards with clear chips + tap-to-assign technician */}
          <div className="lg:hidden divide-y divide-slate-100">
            {filtered.map(job => {
              const inv = paymentByJob[job.id];
              return (
                <div key={job.id} className="p-4 active:bg-slate-50">
                  <div onClick={() => navigate(`/jobs/${job.id}`)}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-slate-800 min-w-0 truncate">{job.title}</p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {job.source === 'sona' && <AiLead />}
                        {job._pending && <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full shrink-0">Pending</span>}
                      </div>
                    </div>
                    {job.customer_name && <p className="text-xs text-slate-500 truncate mt-0.5">{job.customer_name}</p>}

                    {/* Chips */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge status={job.status} />
                      <Badge status={job.priority} />
                      {job.job_type && <Chip icon={<Wrench size={11} />}>{job.job_type}</Chip>}
                      {job.scheduled_date
                        ? <Chip icon={<CalendarDays size={11} />}>{new Date(job.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{job.scheduled_time ? ` · ${job.scheduled_time}` : ''}</Chip>
                        : <Chip tone="muted">Unscheduled</Chip>}
                      <PaymentChip invoice={inv} jobStatus={job.status} />
                    </div>
                  </div>

                  {/* Technician — tap opens the assignment sheet */}
                  <div className="mt-2.5 flex items-center gap-2">
                    <button
                      onClick={() => job.status !== 'completed' && setAssignJob(job)}
                      disabled={job.status === 'completed'}
                      className={`flex-1 inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border text-left ${job.technician_name ? 'border-slate-200 text-slate-700' : 'border-dashed border-slate-300 text-amber-600'} disabled:opacity-70`}>
                      <User size={14} className="text-slate-400 shrink-0" />
                      <span className="truncate">{job.technician_name || employees.find(u => u.id === job.technician_id)?.name || 'Assign technician'}</span>
                      {job.status === 'completed' ? <Lock size={12} className="text-slate-300 ml-auto shrink-0" /> : <ChevronRight size={14} className="text-slate-300 ml-auto shrink-0" />}
                    </button>
                    <button onClick={e => duplicateJob(e, job)} title="Duplicate" className="text-slate-400 hover:text-slate-700 p-2 hover:bg-slate-100 rounded-lg transition-colors shrink-0"><Copy size={16} /></button>
                  </div>
                </div>
              );
            })}
          </div>
          </>
        )}
      </Card>

      <AssignSheet job={assignJob} techs={techs} onClose={() => setAssignJob(null)}
        onAssign={(j, id) => { assignTech(j, id); setAssignJob(null); }} />

      <Modal open={modal} onClose={() => setModal(false)} title="Create Job" subtitle="Log a new service work order"
        footer={
          <div className="flex justify-end gap-2">
            <Btn variant="outline" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn onClick={handleSave} loading={saving}>{saving ? 'Creating…' : 'Create Job'}</Btn>
          </div>
        }>
        <div className="space-y-3">
          <Input label="Job Title *" value={form.title} valid={form.title.trim().length > 2} onChange={e => f({ title: e.target.value })} placeholder="e.g. AC Repair - Unit 3B" />
          <div className="grid grid-cols-2 gap-3">
            <SheetSelect label="Customer" title="Select customer" searchable placeholder="Select customer"
              value={form.customer_id}
              options={customers.map(c => ({ value: c.id, label: c.name }))}
              onChange={v => {
                const c = customers.find(x => x.id === v);
                const addr = c ? [c.address, c.city, c.state, c.zip].filter(Boolean).join(', ') : '';
                f(addr ? { customer_id: v, address: addr } : { customer_id: v });
              }} />
            <SheetSelect label="Technician" title="Assign technician" searchable placeholder="Unassigned"
              value={form.technician_id}
              options={employees.map(e => ({ value: e.id, label: e.name }))}
              onChange={v => f({ technician_id: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SheetSelect label="Job Type" title="Job type" placeholder="Select type"
              value={form.job_type}
              options={JOB_TYPES.map(t => ({ value: t, label: t }))}
              onChange={v => f({ job_type: v })} />
            <SheetSelect label="Priority" title="Priority" placeholder={null}
              value={form.priority}
              options={[{ value: 'low', label: 'Low' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' }]}
              onChange={v => f({ priority: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Scheduled Date" type="date" value={form.scheduled_date} onChange={e => f({ scheduled_date: e.target.value })} />
            <Input label="Scheduled Time" type="time" value={form.scheduled_time} onChange={e => f({ scheduled_time: e.target.value })} />
          </div>
          <Input label="Job Address" value={form.address} onChange={e => f({ address: e.target.value })} placeholder="Service address" />
          <Textarea label="Description" value={form.description} onChange={e => f({ description: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}
