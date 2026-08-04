import { useEffect, useState, useRef } from 'react';
import api from '../api/client';
import { Card, CardHeader, Badge, Btn, Empty, Modal, Input, Textarea } from './UI';
import SignaturePad from './SignaturePad';
import {
  Briefcase, FileText, Clock, CheckCircle, Calendar, Wrench, MapPin, ChevronDown,
  Check, Ban, CalendarClock, PenLine, Star, Camera, Navigation, Plus,
} from 'lucide-react';
import toast from 'react-hot-toast';

const JOB_STEPS = [
  { key: 'pending', label: 'Requested' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'in-progress', label: 'In Progress' },
  { key: 'awaiting-signoff', label: 'Sign-off' },
  { key: 'completed', label: 'Completed' },
];

const tomorrowStr = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };

export function Stars({ value, size = 14, onChange }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type={onChange ? 'button' : undefined} disabled={!onChange}
          onClick={onChange ? () => onChange(n) : undefined}
          className={onChange ? 'cursor-pointer' : 'cursor-default'}>
          <Star size={size} className={n <= value ? 'fill-amber-400 text-amber-400' : 'fill-slate-200 text-slate-200'} />
        </button>
      ))}
    </div>
  );
}

function JobPhotoThumb({ jobId, photo }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get(`/portal/jobs/${jobId}/photos/${photo.id}`).then(r => setData(r.data)).catch(() => {});
  }, [jobId, photo.id]);
  if (!data) return <div className="w-16 h-16 rounded-lg bg-slate-100 animate-pulse" />;
  const isPdf = (data.proof_type || photo.proof_type) === 'pdf';
  return isPdf ? (
    <a href={data.proof} target="_blank" rel="noreferrer" download="photo.pdf" className="w-16 h-16 rounded-lg border border-slate-200 flex flex-col items-center justify-center text-slate-500 hover:bg-slate-50">
      <FileText size={18} /><span className="text-[9px]">PDF</span>
    </a>
  ) : (
    <a href={data.proof} target="_blank" rel="noreferrer" className="block">
      <img src={data.proof} alt="job photo" className="w-16 h-16 rounded-lg object-cover border border-slate-200" />
    </a>
  );
}

function JobTimeline({ status }) {
  if (status === 'cancelled') {
    return <div className="text-sm text-red-600 font-medium bg-red-50 rounded-lg px-3 py-2 flex items-center gap-2"><Ban size={14} /> This service was cancelled.</div>;
  }
  const idx = JOB_STEPS.findIndex(s => s.key === status);
  return (
    <div className="flex items-center pt-1 pb-2">
      {JOB_STEPS.map((s, i) => {
        const done = i <= idx;
        return (
          <div key={s.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${done ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                {done ? <Check size={13} /> : i + 1}
              </div>
              <span className={`text-[10px] mt-1 ${done ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>{s.label}</span>
            </div>
            {i < JOB_STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-1 -mt-4 ${i < idx ? 'bg-blue-600' : 'bg-slate-200'}`} />}
          </div>
        );
      })}
    </div>
  );
}

function JobRow({ j, expanded, onToggle, onReschedule, onCancel, onSignoff, onReview }) {
  const editable = ['pending', 'scheduled'].includes(j.status);
  return (
    <div>
      <button onClick={() => onToggle(j.id)} className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 text-left">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${j.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
            {j.status === 'completed' ? <CheckCircle size={15} /> : <Clock size={15} />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{j.title}</p>
            <p className="text-xs text-slate-500 flex items-center gap-1.5"><Calendar size={11} />{j.scheduled_date || 'To be scheduled'}{j.scheduled_time ? ` · ${j.scheduled_time}` : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {j.en_route_at && !['completed', 'cancelled'].includes(j.status) && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-semibold"><Navigation size={10} /> On the way</span>
          )}
          <Badge status={j.status} />
          <ChevronDown size={16} className={`text-slate-400 transition-transform ${expanded === j.id ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {expanded === j.id && (
        <div className="px-5 pb-4 pt-1 bg-slate-50/60 animate-fade-in">
          <JobTimeline status={j.status} />
          <div className="text-sm text-slate-600 space-y-1.5 mt-2">
            {j.job_type && <p><span className="text-slate-400">Type:</span> {j.job_type}</p>}
            {j.description && <p><span className="text-slate-400">Details:</span> {j.description}</p>}
            {j.technician_name && <p className="flex items-center gap-1.5"><Wrench size={12} className="text-slate-400" /> Technician: {j.technician_name}{j.additional_technician_names?.length > 0 ? `, ${j.additional_technician_names.join(', ')}` : ''}</p>}
            {j.address && <p className="flex items-center gap-1.5"><MapPin size={12} className="text-slate-400" /> {j.address}</p>}
          </div>
          {j.photos?.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1.5"><Camera size={12} /> Photos</p>
              <div className="flex flex-wrap gap-2">
                {j.photos.map(p => <JobPhotoThumb key={p.id} jobId={j.id} photo={p} />)}
              </div>
            </div>
          )}
          {editable && (
            <div className="flex gap-2 mt-3">
              <Btn size="sm" variant="outline" onClick={() => onReschedule(j)}><CalendarClock size={14} /> Reschedule</Btn>
              <Btn size="sm" variant="outline" className="!text-red-600 !border-red-200 hover:!bg-red-50" onClick={() => onCancel(j.id)}><Ban size={14} /> Cancel</Btn>
            </div>
          )}
          {(j.status === 'awaiting-signoff' || j.status === 'completed') && (
            <div className="mt-3 space-y-3">
              {j.signed_at ? (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                  <p className="text-sm font-medium text-emerald-700 flex items-center gap-1.5"><CheckCircle size={14} /> Signed off by {j.signed_by}</p>
                  <p className="text-xs text-slate-500">{new Date(j.signed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                  {j.signature && <img src={j.signature} alt="signature" className="mt-2 h-14 bg-white border border-slate-200 rounded" />}
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-sm text-amber-800">Your technician has finished the work. Please review and sign off to mark this service complete.</p>
                  <Btn size="sm" onClick={() => onSignoff(j)}><PenLine size={14} /> Sign off</Btn>
                </div>
              )}
              {j.status === 'completed' && (j.review ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-slate-500">Your rating:</span>
                  <Stars value={j.review.rating} />
                  {j.review.comment && <span className="text-sm text-slate-500 italic">"{j.review.comment}"</span>}
                </div>
              ) : (
                <Btn size="sm" variant="outline" onClick={() => onReview(j)}><Star size={14} /> Leave a review</Btn>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SignoffModal({ job, defaultName, onClose, onDone }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const padRef = useRef(null);
  useEffect(() => { if (job) setName(defaultName || ''); }, [job, defaultName]);
  async function submit() {
    if (!name.trim()) return toast.error('Please type your name');
    if (padRef.current?.isEmpty()) return toast.error('Please sign in the box');
    setSaving(true);
    try {
      await api.post(`/portal/jobs/${job.id}/signoff`, { signed_by: name.trim(), signature: padRef.current.toDataURL() });
      toast.success('Signed off — thank you!');
      onClose(); onDone();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not sign off'); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={!!job} onClose={onClose} title="Sign Off on Completed Work" subtitle={job?.title}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">By signing below, you confirm the work described above was completed to your satisfaction.</p>
        <Input label="Your name" value={name} onChange={e => setName(e.target.value)} placeholder="Full name" />
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Signature</label>
          <SignaturePad ref={padRef} />
        </div>
        <div className="flex justify-end gap-2">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn onClick={submit} loading={saving}>{saving ? 'Submitting…' : 'Confirm & Sign Off'}</Btn>
        </div>
      </div>
    </Modal>
  );
}

export function ReviewModal({ job, onClose, onDone }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (job) { setRating(0); setComment(''); } }, [job]);
  async function save() {
    if (!rating) return toast.error('Please choose a star rating');
    setSaving(true);
    try {
      await api.post('/portal/reviews', { job_id: job.id, rating, comment });
      toast.success('Thanks for your feedback!');
      onClose(); onDone();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not submit review'); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={!!job} onClose={onClose} title="Leave a Review" subtitle={job?.title} size="sm">
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-2 py-2">
          <Stars value={rating} size={34} onChange={setRating} />
          <span className="text-xs text-slate-400">{rating ? `${rating} of 5 stars` : 'Tap to rate'}</span>
        </div>
        <Textarea label="Comments (optional)" value={comment} onChange={e => setComment(e.target.value)} placeholder="How was your experience?" />
        <div className="flex justify-end gap-2">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} loading={saving}>{saving ? 'Submitting…' : 'Submit Review'}</Btn>
        </div>
      </div>
    </Modal>
  );
}

export function RescheduleModal({ job, onClose, onDone }) {
  const [date, setDate] = useState('');
  const [window, setWindow] = useState('');
  const [slots, setSlots] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const minDate = tomorrowStr();
  useEffect(() => { if (job) { setDate(''); setWindow(''); setSlots(null); } }, [job]);

  useEffect(() => {
    if (!date) { setSlots(null); return; }
    setLoadingSlots(true); setWindow('');
    api.get(`/portal/availability?date=${date}`)
      .then(r => setSlots(r.data.windows || []))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [date]);

  async function save() {
    if (!date) return toast.error('Please pick a new date.');
    if (!window) return toast.error('Please choose an available arrival window.');
    setSaving(true);
    try {
      await api.put(`/portal/jobs/${job.id}/reschedule`, { preferred_date: date, booking_window: window });
      toast.success('Appointment moved — the office will confirm the new time.');
      onClose(); onDone();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not reschedule');
      if (e.response?.status === 409 && date) {
        api.get(`/portal/availability?date=${date}`).then(r => setSlots(r.data.windows || [])).catch(() => {});
        setWindow('');
      }
    }
    finally { setSaving(false); }
  }
  return (
    <Modal open={!!job} onClose={onClose} title="Reschedule Appointment" subtitle={job?.title} size="sm">
      <div className="space-y-3">
        <Input label="New date *" type="date" min={minDate} value={date} onChange={e => setDate(e.target.value)} />
        {date && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Arrival window *</label>
            {loadingSlots ? (
              <p className="text-sm text-slate-400">Checking availability…</p>
            ) : slots && slots.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {slots.map(s => (
                  <button key={s.label} type="button" disabled={s.full}
                    onClick={() => setWindow(s.label)}
                    className={`text-sm rounded-lg px-3 py-2 ring-1 text-left transition-colors ${
                      s.full ? 'bg-slate-50 text-slate-300 ring-slate-200 cursor-not-allowed line-through'
                      : window === s.label ? 'bg-blue-600 text-white ring-blue-600'
                      : 'bg-white text-slate-700 ring-slate-200 hover:border-slate-300'}`}>
                    <span className="block font-medium">{s.label}</span>
                    <span className={`text-xs ${window === s.label ? 'text-blue-100' : 'text-slate-400'}`}>{s.full ? 'Full' : `${s.remaining} left`}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-amber-600">No openings on this day — please try another date.</p>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} loading={saving}>{saving ? 'Saving…' : 'Move Appointment'}</Btn>
        </div>
      </div>
    </Modal>
  );
}

// Shared customer job/appointment list. When `grouped`, splits into Upcoming / Past.
export default function CustomerJobs({ jobs = [], me, onReload = () => {}, onRequestService, grouped = false }) {
  const [expanded, setExpanded] = useState(null);
  const [rescheduleJob, setRescheduleJob] = useState(null);
  const [reviewJob, setReviewJob] = useState(null);
  const [signoffJob, setSignoffJob] = useState(null);
  const toggle = (id) => setExpanded(e => (e === id ? null : id));

  async function cancelJob(id) {
    if (!confirm('Cancel this service request?')) return;
    try { await api.post(`/portal/jobs/${id}/cancel`); toast.success('Service cancelled'); onReload(); }
    catch (e) { toast.error(e.response?.data?.error || 'Could not cancel'); }
  }

  const rowProps = {
    expanded, onToggle: toggle, onReschedule: setRescheduleJob,
    onCancel: cancelJob, onSignoff: setSignoffJob, onReview: setReviewJob,
  };

  const isPast = (j) => ['completed', 'cancelled'].includes(j.status);
  const upcoming = jobs.filter(j => !isPast(j));
  const past = jobs.filter(isPast);
  const requestBtn = onRequestService && <Btn size="sm" onClick={onRequestService}><Plus size={14} /> Request Service</Btn>;

  const modals = (
    <>
      <RescheduleModal job={rescheduleJob} onClose={() => setRescheduleJob(null)} onDone={onReload} />
      <ReviewModal job={reviewJob} onClose={() => setReviewJob(null)} onDone={onReload} />
      <SignoffModal job={signoffJob} defaultName={me?.name} onClose={() => setSignoffJob(null)} onDone={onReload} />
    </>
  );

  if (grouped) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader title="Upcoming" icon={<CalendarClock size={15} />} action={requestBtn} />
          {upcoming.length === 0 ? (
            <Empty icon={<Calendar size={24} />} title="No upcoming appointments"
              message="Request a service and it'll show up here."
              action={onRequestService && <Btn onClick={onRequestService}><Plus size={16} /> Request Service</Btn>} />
          ) : (
            <div className="divide-y divide-slate-100">
              {upcoming.map(j => <JobRow key={j.id} j={j} {...rowProps} />)}
            </div>
          )}
        </Card>
        {past.length > 0 && (
          <Card>
            <CardHeader title="Service History" icon={<Briefcase size={15} />} />
            <div className="divide-y divide-slate-100">
              {past.map(j => <JobRow key={j.id} j={j} {...rowProps} />)}
            </div>
          </Card>
        )}
        {modals}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader title="Service History" icon={<Briefcase size={15} />} action={requestBtn} />
      {jobs.length === 0 ? (
        <Empty icon={<Briefcase size={24} />} title="No services yet"
          message="Request your first service and it'll show up here."
          action={onRequestService && <Btn onClick={onRequestService}><Plus size={16} /> Request Service</Btn>} />
      ) : (
        <div className="divide-y divide-slate-100">
          {jobs.map(j => <JobRow key={j.id} j={j} {...rowProps} />)}
        </div>
      )}
      {modals}
    </Card>
  );
}
