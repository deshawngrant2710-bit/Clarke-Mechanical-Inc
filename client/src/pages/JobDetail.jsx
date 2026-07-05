import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { Card, CardHeader, Btn, Badge, Modal, Input, Select, Textarea, Spinner, Avatar, Empty } from '../components/UI';
import { ArrowLeft, Pencil, Trash2, Camera, Upload, User, MapPin, Calendar, Wrench, CheckCircle2, MailCheck, BellRing } from 'lucide-react';
import toast from 'react-hot-toast';
import { sendEmail } from '../lib/email';

const JOB_TYPES = ['AC Repair', 'AC Installation', 'Heating Repair', 'Heating Installation', 'Maintenance', 'Inspection', 'Ductwork', 'Ventilation', 'Emergency', 'Other'];
const TIMELINE = ['pending', 'scheduled', 'in-progress', 'completed'];
const TIMELINE_LABEL = { pending: 'Created', scheduled: 'Scheduled', 'in-progress': 'In Progress', completed: 'Completed' };

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [editModal, setEditModal] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [emailing, setEmailing] = useState('');
  const fileRef = useRef();

  function load() {
    Promise.all([api.get(`/jobs/${id}`), api.get('/customers'), api.get('/employees')])
      .then(([j, c, e]) => { setJob(j.data); setForm(j.data); setCustomers(c.data); setEmployees(e.data); });
  }
  useEffect(load, [id]);

  async function handleSave() {
    setSaving(true);
    try {
      await api.put(`/jobs/${id}`, form);
      toast.success('Job updated');
      setEditModal(false); load();
    } catch { toast.error('Error updating job'); }
    finally { setSaving(false); }
  }
  async function handleDelete() {
    if (!confirm('Delete this job?')) return;
    await api.delete(`/jobs/${id}`);
    toast.success('Deleted'); navigate('/jobs');
  }
  async function handlePhotoUpload(e) {
    const files = e.target.files;
    if (!files.length) return;
    const fd = new FormData();
    Array.from(files).forEach(f => fd.append('photos', f));
    try {
      await api.post(`/jobs/${id}/photos`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success(`${files.length} photo(s) uploaded`); load();
    } catch { toast.error('Upload failed'); }
  }
  async function notify(type, label) {
    setEmailing(type);
    try { await sendEmail(type, id, label); } catch { /* toast handled */ }
    finally { setEmailing(''); }
  }
  const f = v => setForm(prev => ({ ...prev, ...v }));
  if (!job) return <Spinner />;

  const cancelled = job.status === 'cancelled';
  const activeIdx = TIMELINE.indexOf(job.status);

  return (
    <div className="animate-fade-in">
      <button onClick={() => navigate('/jobs')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors">
        <ArrowLeft size={15} /> Back to jobs
      </button>

      {/* Header */}
      <Card className="p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <Badge status={job.status} />
              <Badge status={job.priority} />
              {job.job_type && <span className="text-xs font-medium text-slate-400">{job.job_type}</span>}
            </div>
            <h1 className="text-section-title text-slate-900">{job.title}</h1>
            <p className="text-xs text-slate-400 mt-1 font-mono">Job #{id.slice(0, 8).toUpperCase()}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Btn variant="outline" onClick={() => notify('job_confirmation', 'Confirmation')} loading={emailing === 'job_confirmation'}><MailCheck size={15} /> Send Confirmation</Btn>
            <Btn variant="outline" onClick={() => notify('job_reminder', 'Reminder')} loading={emailing === 'job_reminder'}><BellRing size={15} /> Send Reminder</Btn>
            <Btn variant="outline" onClick={() => setEditModal(true)}><Pencil size={15} /> Edit</Btn>
            <Btn variant="danger" onClick={handleDelete}><Trash2 size={15} /> Delete</Btn>
          </div>
        </div>

        {/* Status timeline */}
        {!cancelled ? (
          <div className="flex items-center pt-2">
            {TIMELINE.map((step, i) => {
              const done = i <= activeIdx;
              return (
                <div key={step} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${done ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                      {done ? <CheckCircle2 size={16} /> : i + 1}
                    </div>
                    <span className={`text-[11px] mt-1.5 font-medium ${done ? 'text-slate-700' : 'text-slate-400'}`}>{TIMELINE_LABEL[step]}</span>
                  </div>
                  {i < TIMELINE.length - 1 && <div className={`flex-1 h-0.5 mx-2 -mt-5 ${i < activeIdx ? 'bg-blue-600' : 'bg-slate-100'}`} />}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-red-600 font-medium bg-red-50 rounded-lg px-4 py-2.5">This job has been cancelled.</div>
        )}
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader title="Details" icon={<Calendar size={15} />} />
            <div className="p-5 space-y-3 text-sm">
              {job.customer_name && (
                <div className="flex items-center gap-2.5 text-slate-600">
                  <User size={14} className="text-slate-400" />
                  <button className="text-blue-600 hover:underline font-medium" onClick={() => navigate(`/customers/${job.customer_id}`)}>{job.customer_name}</button>
                </div>
              )}
              {(job.scheduled_date || job.scheduled_time) && (
                <div className="flex items-center gap-2.5 text-slate-600"><Calendar size={14} className="text-slate-400" />{job.scheduled_date}{job.scheduled_time ? ` at ${job.scheduled_time}` : ''}</div>
              )}
              {job.address && <div className="flex items-start gap-2.5 text-slate-600"><MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" />{job.address}</div>}
              <div className="flex items-center gap-2.5 pt-3 border-t border-slate-100">
                {job.technician_name ? (
                  <><Avatar name={job.technician_name} className="w-8 h-8 text-xs" /><div><p className="text-sm font-medium text-slate-800">{job.technician_name}</p><p className="text-xs text-slate-400">Assigned technician</p></div></>
                ) : <span className="text-xs text-slate-400 flex items-center gap-1.5"><Wrench size={14} /> Unassigned</span>}
              </div>
              {job.completed_date && <p className="text-emerald-600 text-xs font-medium flex items-center gap-1"><CheckCircle2 size={12} /> Completed {job.completed_date}</p>}
            </div>
          </Card>

          {job.description && (
            <Card><CardHeader title="Description" /><p className="p-5 text-sm text-slate-700 whitespace-pre-wrap">{job.description}</p></Card>
          )}
          {job.notes && (
            <Card><CardHeader title="Notes" /><p className="p-5 text-sm text-slate-700 whitespace-pre-wrap">{job.notes}</p></Card>
          )}
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader title={`Photos (${job.photos?.length || 0})`} icon={<Camera size={15} />}
              action={<><input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
                <Btn size="sm" onClick={() => fileRef.current?.click()}><Upload size={14} /> Upload</Btn></>} />
            <div className="p-5">
              {!job.photos?.length ? (
                <Empty icon={<Camera size={24} />} title="No photos yet" message="Upload before & after photos to document this job."
                  action={<Btn size="sm" variant="outline" onClick={() => fileRef.current?.click()}>Upload First Photo</Btn>} />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {job.photos.map(p => (
                    <a key={p.id} href={`/uploads/${p.filename}`} target="_blank" rel="noreferrer" className="group relative rounded-xl overflow-hidden">
                      <img src={`/uploads/${p.filename}`} alt={p.original_name} className="w-full h-32 object-cover group-hover:scale-105 transition-transform duration-300" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Modal open={editModal} onClose={() => setEditModal(false)} title="Edit Job">
        <div className="space-y-3">
          <Input label="Title" value={form.title || ''} onChange={e => f({ title: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Status" value={form.status || 'pending'} onChange={e => f({ status: e.target.value })}>
              <option value="pending">Pending</option>
              <option value="scheduled">Scheduled</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
            <Select label="Priority" value={form.priority || 'normal'} onChange={e => f({ priority: e.target.value })}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Customer" value={form.customer_id || ''} onChange={e => f({ customer_id: e.target.value })}>
              <option value="">No customer</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select label="Technician" value={form.technician_id || ''} onChange={e => f({ technician_id: e.target.value })}>
              <option value="">Unassigned</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Scheduled Date" type="date" value={form.scheduled_date || ''} onChange={e => f({ scheduled_date: e.target.value })} />
            <Input label="Scheduled Time" type="time" value={form.scheduled_time || ''} onChange={e => f({ scheduled_time: e.target.value })} />
          </div>
          <Select label="Job Type" value={form.job_type || ''} onChange={e => f({ job_type: e.target.value })}>
            <option value="">Select type</option>
            {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Input label="Address" value={form.address || ''} onChange={e => f({ address: e.target.value })} />
          {form.status === 'completed' && (
            <Input label="Completed Date" type="date" value={form.completed_date || ''} onChange={e => f({ completed_date: e.target.value })} />
          )}
          <Textarea label="Description" value={form.description || ''} onChange={e => f({ description: e.target.value })} />
          <Textarea label="Notes" value={form.notes || ''} onChange={e => f({ notes: e.target.value })} />
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="outline" onClick={() => setEditModal(false)}>Cancel</Btn>
            <Btn onClick={handleSave} loading={saving}>{saving ? 'Saving…' : 'Save Changes'}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
