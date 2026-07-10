import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { Card, CardHeader, Btn, Modal, Input, Textarea, Badge, Spinner, Avatar, Empty } from '../components/UI';
import { ArrowLeft, Pencil, Trash2, Phone, Mail, MapPin, Briefcase, Plus, CheckCircle, Clock, StickyNote, Send, MessageSquare, Navigation } from 'lucide-react';
import { directionsLink } from '../lib/geo';
import toast from 'react-hot-toast';

const EMAIL_LABEL = {
  invoice: 'Invoice sent',
  receipt: 'Payment receipt',
  quote: 'Quote sent',
  job_confirmation: 'Appointment confirmation',
  job_reminder: 'Appointment reminder',
};

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [emails, setEmails] = useState([]);
  const [editModal, setEditModal] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  function load() {
    api.get(`/customers/${id}`).then(r => { setCustomer(r.data); setForm(r.data); });
    api.get(`/email/log?customer_id=${id}`).then(r => setEmails(r.data)).catch(() => {});
  }
  useEffect(load, [id]);

  async function handleSave() {
    setSaving(true);
    try {
      await api.put(`/customers/${id}`, form);
      toast.success('Customer updated');
      setEditModal(false); load();
    } catch { toast.error('Error updating'); }
    finally { setSaving(false); }
  }
  async function handleDelete() {
    if (!confirm('Delete this customer? This cannot be undone.')) return;
    await api.delete(`/customers/${id}`);
    toast.success('Customer deleted');
    navigate('/customers');
  }

  if (!customer) return <Spinner />;

  const jobs = customer.jobs || [];
  const openJobs = jobs.filter(j => !['completed', 'cancelled'].includes(j.status)).length;
  const completedJobs = jobs.filter(j => j.status === 'completed').length;
  const location = [customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(', ');

  return (
    <div className="animate-fade-in">
      <button onClick={() => navigate('/customers')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors">
        <ArrowLeft size={15} /> Back to customers
      </button>

      {/* Profile header */}
      <Card className="p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Avatar name={customer.name} className="w-16 h-16 text-xl" />
            <div>
              <h1 className="text-section-title text-slate-900">{customer.name}</h1>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                {customer.phone && <span className="flex items-center gap-1.5 text-sm text-slate-500"><Phone size={13} />{customer.phone}</span>}
                {customer.email && <span className="flex items-center gap-1.5 text-sm text-slate-500"><Mail size={13} />{customer.email}</span>}
                {customer.city && <span className="flex items-center gap-1.5 text-sm text-slate-500"><MapPin size={13} />{customer.city}{customer.state ? `, ${customer.state}` : ''}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Btn variant="outline" onClick={() => setEditModal(true)}><Pencil size={15} /> Edit</Btn>
            <Btn variant="danger" onClick={handleDelete}><Trash2 size={15} /> Delete</Btn>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-100">
          <div><p className="text-2xl font-bold text-slate-800">{jobs.length}</p><p className="text-xs text-slate-500">Total Jobs</p></div>
          <div><p className="text-2xl font-bold text-orange-600">{openJobs}</p><p className="text-xs text-slate-500">Open</p></div>
          <div><p className="text-2xl font-bold text-emerald-600">{completedJobs}</p><p className="text-xs text-slate-500">Completed</p></div>
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader title="Contact & Location" icon={<MapPin size={15} />} />
            <div className="p-5 space-y-3 text-sm">
              {customer.phone && <div className="flex items-center gap-2.5 text-slate-600"><Phone size={14} className="text-slate-400" />{customer.phone}</div>}
              {customer.email && <div className="flex items-center gap-2.5 text-slate-600"><Mail size={14} className="text-slate-400" />{customer.email}</div>}
              {location && <div className="flex items-start gap-2.5 text-slate-600"><MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" /><span>{location}</span></div>}
              {!customer.phone && !customer.email && !location && <p className="text-slate-400">No contact info on file</p>}
              {(customer.phone || customer.email || location) && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {customer.phone && <a href={`tel:${customer.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100"><Phone size={12} /> Call</a>}
                  {customer.phone && <a href={`sms:${customer.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100"><MessageSquare size={12} /> Text</a>}
                  {customer.email && <a href={`mailto:${customer.email}`} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200"><Mail size={12} /> Email</a>}
                  {location && <a href={directionsLink(location)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100"><Navigation size={12} /> Directions</a>}
                </div>
              )}
            </div>
          </Card>
          {customer.notes && (
            <Card>
              <CardHeader title="Notes" icon={<StickyNote size={15} />} />
              <p className="p-5 text-sm text-slate-600 whitespace-pre-wrap">{customer.notes}</p>
            </Card>
          )}

          <Card>
            <CardHeader title="Communication History" icon={<Send size={15} />} />
            {emails.length === 0 ? (
              <p className="p-5 text-sm text-slate-400 text-center">No emails sent yet</p>
            ) : (
              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {emails.map(e => (
                  <div key={e.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
                          <Mail size={12} className="text-slate-400 shrink-0" />{EMAIL_LABEL[e.type] || e.type}
                        </p>
                        <p className="text-xs text-slate-400 truncate">{e.subject}</p>
                      </div>
                      <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${
                        e.status === 'failed' ? 'bg-red-50 text-red-600'
                        : e.status === 'simulated' ? 'bg-slate-100 text-slate-500'
                        : 'bg-emerald-50 text-emerald-600'}`}>{e.status}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">{new Date(e.sent_at.replace(' ', 'T') + 'Z').toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{e.sent_by ? ` · by ${e.sent_by}` : ''}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader title={`Service History (${jobs.length})`} icon={<Briefcase size={15} />}
              action={<Btn size="sm" onClick={() => navigate(`/jobs?new=1&customer_id=${id}`)}><Plus size={14} /> New Job</Btn>} />
            {jobs.length === 0 ? (
              <Empty icon={<Briefcase size={24} />} title="No service history" message="This customer has no jobs yet." />
            ) : (
              <div className="divide-y divide-slate-100">
                {jobs.map(job => (
                  <div key={job.id} onClick={() => navigate(`/jobs/${job.id}`)}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-blue-50/40 cursor-pointer transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${job.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                        {job.status === 'completed' ? <CheckCircle size={15} /> : <Clock size={15} />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{job.title}</p>
                        <p className="text-xs text-slate-500">{job.scheduled_date || 'Unscheduled'} · {job.job_type || 'General'}</p>
                      </div>
                    </div>
                    <Badge status={job.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Modal open={editModal} onClose={() => setEditModal(false)} title="Edit Customer">
        <div className="space-y-3">
          <Input label="Full Name *" value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Phone" icon={<Phone size={15} />} value={form.phone || ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            <Input label="Email" icon={<Mail size={15} />} type="email" value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <Input label="Address" icon={<MapPin size={15} />} value={form.address || ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          <div className="grid grid-cols-3 gap-3">
            <Input label="City" value={form.city || ''} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
            <Input label="State" value={form.state || ''} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} />
            <Input label="ZIP" value={form.zip || ''} onChange={e => setForm(f => ({ ...f, zip: e.target.value }))} />
          </div>
          <Textarea label="Notes" value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="outline" onClick={() => setEditModal(false)}>Cancel</Btn>
            <Btn onClick={handleSave} loading={saving}>{saving ? 'Saving…' : 'Save Changes'}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
