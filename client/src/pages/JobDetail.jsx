import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { Card, CardHeader, Btn, Badge, Modal, Input, Select, Textarea, Spinner, Avatar, Empty } from '../components/UI';
import { ArrowLeft, Pencil, Trash2, Camera, Upload, User, MapPin, Calendar, Wrench, CheckCircle2, MailCheck, BellRing, PenLine, Navigation, Phone, MessageSquare, ClipboardCheck, Plus, Package, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { sendEmail } from '../lib/email';
import { directionsLink } from '../lib/geo';
import { propertyLabel, equipmentLabel } from '../lib/inspectionForms';
import { fileToProof } from '../lib/imageProof';
import { useAuth } from '../context/AuthContext';
import SignaturePad from '../components/SignaturePad';

const JOB_TYPES = ['AC Repair', 'AC Installation', 'Heating Repair', 'Heating Installation', 'Maintenance', 'Inspection', 'Ductwork', 'Ventilation', 'Emergency', 'Other'];
const TIMELINE = ['pending', 'scheduled', 'in-progress', 'completed'];
const TIMELINE_LABEL = { pending: 'Created', scheduled: 'Scheduled', 'in-progress': 'In Progress', completed: 'Completed' };

const NEXT_STATUS_LABEL = { scheduled: 'Mark Scheduled', 'in-progress': 'Start Job', completed: 'Mark Complete' };

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isTech = user?.role === 'technician';
  const [job, setJob] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [editModal, setEditModal] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [jobInspections, setJobInspections] = useState([]);
  const [enRouting, setEnRouting] = useState(false);
  const [partForm, setPartForm] = useState({ name: '', quantity: '1', unit_price: '', note: '' });
  const [addingPart, setAddingPart] = useState(false);
  const [emailing, setEmailing] = useState('');
  const [signModal, setSignModal] = useState(false);
  const [signName, setSignName] = useState('');
  const [signing, setSigning] = useState(false);
  const padRef = useRef(null);
  const fileRef = useRef();

  async function captureSignoff() {
    if (!signName.trim()) return toast.error('Enter the customer name');
    if (padRef.current?.isEmpty()) return toast.error('Please have the customer sign');
    setSigning(true);
    try {
      await api.post(`/jobs/${id}/signoff`, { signed_by: signName.trim(), signature: padRef.current.toDataURL() });
      toast.success('Signature captured');
      setSignModal(false); setSignName(''); load();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not save signature'); }
    finally { setSigning(false); }
  }

  function load() {
    Promise.all([api.get(`/jobs/${id}`), api.get('/customers'), api.get('/employees')])
      .then(([j, c, e]) => { setJob(j.data); setForm(j.data); setNotesDraft(''); setCustomers(c.data); setEmployees(e.data); });
    api.get('/inspections').then(r => setJobInspections(r.data.filter(x => x.job_id === id))).catch(() => {});
  }

  async function createInspectionForJob() {
    try {
      const { data } = await api.post('/inspections', {
        job_id: id,
        customer_id: job?.customer_id || null,
        property_type: 'residential',
        equipment_type: 'boiler',
        info: job?.address ? { site_address: job.address } : {},
      });
      navigate(`/inspections/${data.id}`);
    } catch (e) { toast.error(e.response?.data?.error || 'Could not start inspection'); }
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
  async function updateStatus(newStatus) {
    setSaving(true);
    try {
      await api.put(`/jobs/${id}`, { ...job, status: newStatus });
      toast.success(`Marked ${TIMELINE_LABEL[newStatus]}`);
      load();
    } catch { toast.error('Could not update status'); }
    finally { setSaving(false); }
  }
  async function enRoute() {
    setEnRouting(true);
    try { await api.post(`/jobs/${id}/en-route`); toast.success('Customer notified you’re on the way'); }
    catch (e) { toast.error(e.response?.data?.error || 'Could not notify the customer'); }
    finally { setEnRouting(false); }
  }
  async function addPart() {
    if (!partForm.name.trim()) return toast.error('Enter a part or material name');
    setAddingPart(true);
    try {
      await api.post(`/jobs/${id}/parts`, partForm);
      setPartForm({ name: '', quantity: '1', unit_price: '', note: '' });
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not add that'); }
    finally { setAddingPart(false); }
  }
  async function removePart(pid) {
    try { await api.delete(`/jobs/${id}/parts/${pid}`); load(); }
    catch { toast.error('Could not remove'); }
  }
  async function addNote() {
    const text = notesDraft.trim();
    if (!text) return;
    const meta = `${user?.name || 'Technician'} · ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
    const entry = `${meta}\n${text}`;
    const updated = job.notes ? `${entry}\n\n---\n${job.notes}` : entry;
    setSavingNotes(true);
    try {
      await api.put(`/jobs/${id}`, { ...job, notes: updated });
      toast.success('Note added');
      setNotesDraft('');
      load();
    } catch { toast.error('Could not add note'); }
    finally { setSavingNotes(false); }
  }
  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { proof, proof_type } = await fileToProof(file);
      await api.post(`/jobs/${id}/photos`, { proof, proof_type });
      toast.success('Photo uploaded'); load();
    } catch (err) { toast.error(err.message || 'Upload failed'); }
  }
  async function removePhoto(pid) {
    if (!confirm('Remove this photo?')) return;
    try { await api.delete(`/jobs/${id}/photos/${pid}`); load(); }
    catch { toast.error('Could not remove'); }
  }
  async function createInvoice() {
    try {
      const items = (job.parts || []).map(p => ({ description: p.name, quantity: p.quantity || 1, unit_price: p.unit_price || 0 }));
      const { data } = await api.post('/billing/invoices', { customer_id: job.customer_id, job_id: id, items, status: 'draft' });
      toast.success('Invoice created from this job');
      navigate(`/invoices/${data.id}`);
    } catch (e) { toast.error(e.response?.data?.error || 'Could not create invoice'); }
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
  const nextStatus = activeIdx >= 0 && activeIdx < TIMELINE.length - 1 ? TIMELINE[activeIdx + 1] : null;
  const noteEntries = (job.notes || '')
    .split('\n\n---\n')
    .map(s => s.trim())
    .filter(Boolean)
    .map(chunk => {
      const nl = chunk.indexOf('\n');
      const first = nl === -1 ? chunk : chunk.slice(0, nl);
      const rest = nl === -1 ? '' : chunk.slice(nl + 1);
      return first.includes(' · ') && rest ? { meta: first, body: rest } : { meta: null, body: chunk };
    });

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
            {isTech ? (
              <>
                {!cancelled && job.status !== 'completed' && job.customer_email && (
                  <Btn variant="outline" onClick={enRoute} loading={enRouting}><Navigation size={15} /> On my way</Btn>
                )}
                {!cancelled && nextStatus && (
                  <Btn onClick={() => updateStatus(nextStatus)} loading={saving}>
                    {nextStatus === 'completed' ? <CheckCircle2 size={15} /> : nextStatus === 'in-progress' ? <Wrench size={15} /> : <Calendar size={15} />}
                    {NEXT_STATUS_LABEL[nextStatus]}
                  </Btn>
                )}
              </>
            ) : (
              <>
                <Btn variant="outline" onClick={() => notify('job_confirmation', 'Confirmation')} loading={emailing === 'job_confirmation'}><MailCheck size={15} /> Send Confirmation</Btn>
                <Btn variant="outline" onClick={() => notify('job_reminder', 'Reminder')} loading={emailing === 'job_reminder'}><BellRing size={15} /> Send Reminder</Btn>
                {job.customer_id && <Btn variant="outline" onClick={createInvoice}><FileText size={15} /> Create Invoice</Btn>}
                <Btn variant="outline" onClick={() => setEditModal(true)}><Pencil size={15} /> Edit</Btn>
                <Btn variant="danger" onClick={handleDelete}><Trash2 size={15} /> Delete</Btn>
              </>
            )}
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
              {job.customer_phone && (
                <div className="flex items-center gap-2 pl-6">
                  <a
                    href={`tel:${job.customer_phone.replace(/[^\d+]/g, '')}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition-colors"
                  >
                    <Phone size={12} /> Call
                  </a>
                  <a
                    href={`sms:${job.customer_phone.replace(/[^\d+]/g, '')}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition-colors"
                  >
                    <MessageSquare size={12} /> Text
                  </a>
                  <span className="text-xs text-slate-400">{job.customer_phone}</span>
                </div>
              )}
              {(job.scheduled_date || job.scheduled_time) && (
                <div className="flex items-center gap-2.5 text-slate-600"><Calendar size={14} className="text-slate-400" />{job.scheduled_date}{job.scheduled_time ? ` at ${job.scheduled_time}` : ''}</div>
              )}
              {job.address && (
                <div className="flex items-start gap-2.5 text-slate-600">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <p>{job.address}</p>
                    <a
                      href={directionsLink(job.address)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition-colors"
                    >
                      <Navigation size={12} /> Directions
                    </a>
                  </div>
                </div>
              )}
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
          {(isTech || noteEntries.length > 0) && (
            <Card>
              <CardHeader title={`Notes${noteEntries.length ? ` (${noteEntries.length})` : ''}`} />
              <div className="p-5 space-y-4">
                {isTech && (
                  <div className="space-y-2">
                    <Textarea
                      value={notesDraft}
                      onChange={e => setNotesDraft(e.target.value)}
                      rows={3}
                      placeholder="Add a note — work performed, what you found, or parts needed for a return visit…"
                    />
                    <div className="flex justify-end">
                      <Btn size="sm" onClick={addNote} loading={savingNotes} disabled={!notesDraft.trim()}>Add Note</Btn>
                    </div>
                  </div>
                )}
                {noteEntries.length > 0 ? (
                  <div className="space-y-2.5">
                    {noteEntries.map((entry, idx) => (
                      <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        {entry.meta && <p className="text-xs font-semibold text-slate-500 mb-1">{entry.meta}</p>}
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{entry.body}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  isTech && <p className="text-sm text-slate-400">No notes yet.</p>
                )}
              </div>
            </Card>
          )}

          {/* Customer sign-off */}
          <Card>
            <CardHeader title="Customer Sign-off" icon={<PenLine size={15} />} />
            <div className="p-5">
              {job.signed_at ? (
                <div>
                  <p className="text-sm font-medium text-emerald-700 flex items-center gap-1.5"><CheckCircle2 size={14} /> Signed by {job.signed_by}</p>
                  <p className="text-xs text-slate-500 mb-2">{new Date(job.signed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                  {job.signature && <img src={job.signature} alt="signature" className="h-16 bg-white border border-slate-200 rounded" />}
                </div>
              ) : job.status === 'completed' ? (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-sm text-amber-700">Awaiting customer sign-off.</p>
                  <Btn size="sm" onClick={() => { setSignName(job.customer_name || ''); setSignModal(true); }}><PenLine size={14} /> Capture signature</Btn>
                </div>
              ) : (
                <p className="text-sm text-slate-400">Available once the job is marked completed.</p>
              )}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader title={`Photos (${job.photos?.length || 0})`} icon={<Camera size={15} />}
              action={<><input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handlePhotoUpload} />
                <Btn size="sm" onClick={() => fileRef.current?.click()}><Upload size={14} /> Upload</Btn></>} />
            <div className="p-5">
              {!job.photos?.length ? (
                <Empty icon={<Camera size={24} />} title="No photos yet" message="Upload before & after photos, or photos the customer sent, to document this job."
                  action={<Btn size="sm" variant="outline" onClick={() => fileRef.current?.click()}>Upload First Photo</Btn>} />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {job.photos.map(p => (
                    <div key={p.id} className="group relative rounded-xl overflow-hidden border border-slate-200">
                      {p.proof_type === 'pdf' ? (
                        <a href={p.proof} target="_blank" rel="noreferrer" download className="h-32 flex flex-col items-center justify-center text-slate-500 hover:bg-slate-50">
                          <Camera size={22} /><span className="text-xs mt-1">Open PDF</span>
                        </a>
                      ) : (
                        <a href={p.proof} target="_blank" rel="noreferrer" className="block">
                          <img src={p.proof} alt={p.caption || 'job photo'} className="w-full h-32 object-cover group-hover:scale-105 transition-transform duration-300" />
                        </a>
                      )}
                      <button onClick={() => removePhoto(p.id)} className="absolute top-1 right-1 p-1 rounded-md bg-white/90 text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card className="mt-6">
            <CardHeader title={`Inspections (${jobInspections.length})`} icon={<ClipboardCheck size={15} />}
              action={<Btn size="sm" onClick={createInspectionForJob}><Plus size={14} /> New</Btn>} />
            <div className="p-5">
              {jobInspections.length === 0 ? (
                <p className="text-sm text-slate-400">No inspections for this job yet. Start one to capture a checklist and site photos.</p>
              ) : (
                <div className="divide-y divide-slate-100 -my-1">
                  {jobInspections.map(insp => (
                    <button key={insp.id} onClick={() => navigate(`/inspections/${insp.id}`)}
                      className="w-full flex items-center justify-between gap-3 py-3 px-2 -mx-2 rounded-lg text-left hover:bg-slate-50 transition-colors">
                      <span className="text-sm text-slate-700 truncate">{propertyLabel(insp.property_type)} · {equipmentLabel(insp.equipment_type)}</span>
                      <Badge status={insp.status === 'submitted' ? 'completed' : 'pending'} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card className="mt-6">
            <CardHeader title={`Parts & Materials (${job.parts?.length || 0})`} icon={<Package size={15} />} />
            <div className="p-5 space-y-3">
              {job.parts?.length > 0 ? (
                <div className="divide-y divide-slate-100 -mt-2">
                  {job.parts.map(p => (
                    <div key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800 truncate">{p.name}{p.quantity > 1 && <span className="text-slate-400"> × {p.quantity}</span>}</p>
                        {(p.note || p.unit_price != null) && <p className="text-xs text-slate-400">{p.unit_price != null ? `$${Number(p.unit_price).toFixed(2)} ea` : ''}{p.unit_price != null && p.note ? ' · ' : ''}{p.note || ''}</p>}
                      </div>
                      <button onClick={() => removePart(p.id)} className="p-1.5 text-slate-400 hover:text-red-600 shrink-0"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No parts logged yet.</p>
              )}
              <div className="space-y-2 pt-1">
                <Input label="Part / material" value={partForm.name} onChange={e => setPartForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Capacitor 45/5 MFD" />
                <div className="flex gap-2">
                  <Input label="Qty" type="number" min="1" className="w-20" value={partForm.quantity} onChange={e => setPartForm(f => ({ ...f, quantity: e.target.value }))} />
                  <Input label="Unit $ (optional)" type="number" min="0" className="flex-1" value={partForm.unit_price} onChange={e => setPartForm(f => ({ ...f, unit_price: e.target.value }))} placeholder="Cost each" />
                </div>
              </div>
              <div className="flex justify-end">
                <Btn size="sm" onClick={addPart} loading={addingPart} disabled={!partForm.name.trim()}><Plus size={14} /> Add part</Btn>
              </div>
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

      <Modal open={signModal} onClose={() => setSignModal(false)} title="Capture Customer Sign-off" subtitle={job.title}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Hand the device to the customer to confirm the work is complete.</p>
          <Input label="Customer name" value={signName} onChange={e => setSignName(e.target.value)} placeholder={job.customer_name || 'Full name'} />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Signature</label>
            <SignaturePad ref={padRef} />
          </div>
          <div className="flex justify-end gap-2">
            <Btn variant="outline" onClick={() => setSignModal(false)}>Cancel</Btn>
            <Btn onClick={captureSignoff} loading={signing}>{signing ? 'Saving…' : 'Save Signature'}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
