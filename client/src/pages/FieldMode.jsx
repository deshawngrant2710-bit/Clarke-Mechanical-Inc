import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import {
  Navigation, MapPin, Phone, MessageSquare, Play, CheckCircle2, Clock, Camera,
  Wrench, ClipboardCheck, PenLine, FileText, ChevronRight, History, Timer, Flag,
} from 'lucide-react';

const today = () => new Date().toISOString().slice(0, 10);
const fullAddress = (job, c) =>
  job.address || (c ? [c.address, c.city, c.state, c.zip].filter(Boolean).join(', ') : '') || '';
const mapsLink = (a) => `https://maps.apple.com/?daddr=${encodeURIComponent(a)}`;

const timeLabel = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  if (!m) return null;
  let h = +m[1]; const mm = m[2]; const ap = h < 12 ? 'AM' : 'PM'; h = h % 12 || 12;
  return `${h}:${mm} ${ap}`;
};

function elapsed(fromISO, tick) {
  if (!fromISO) return null;
  const s = Math.max(0, Math.floor((Date.now() - new Date(fromISO).getTime()) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  void tick;
  return `${h > 0 ? h + ':' : ''}${String(m).padStart(h > 0 ? 2 : 1, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function FieldMode() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [allJobs, setAllJobs] = useState([]);
  const [custById, setCustById] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  // live timer
  useEffect(() => { const iv = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(iv); }, []);

  function load() {
    Promise.all([api.get('/jobs'), api.get('/customers')]).then(([j, c]) => {
      const map = Object.fromEntries(c.data.map(x => [x.id, x]));
      const mine = j.data
        .filter(x => (x.technician_id === user.id || (x.additional_technician_ids || []).includes(user.id))
          && x.scheduled_date === today() && x.status !== 'cancelled')
        .sort((a, b) => (a.scheduled_time || '99:99').localeCompare(b.scheduled_time || '99:99'));
      setJobs(mine);
      setAllJobs(j.data);
      setCustById(map);
      setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(load, []);

  async function patch(job, body, msg) {
    setBusy(true);
    try { await api.put(`/jobs/${job.id}`, body); if (msg) toast.success(msg); load(); }
    catch { toast.error('Could not update — will retry when back online'); }
    finally { setBusy(false); }
  }
  async function startTravel(job) {
    setBusy(true);
    try { await api.post(`/jobs/${job.id}/en-route`); toast.success('Customer notified you are on the way'); }
    catch { toast.error('Could not send notification'); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="p-8 text-center text-slate-400">Loading your day…</div>;

  const active = jobs.find(j => j.status !== 'completed') || null;
  const completedCount = jobs.filter(j => j.status === 'completed').length;

  return (
    <div className="animate-fade-in max-w-2xl mx-auto pb-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">Hi {(user?.name || '').split(' ')[0] || 'there'}</h1>
        <p className="text-sm text-slate-500">
          {jobs.length === 0 ? 'No jobs scheduled today.' : `${jobs.length} job${jobs.length === 1 ? '' : 's'} today · ${completedCount} done`}
        </p>
      </div>

      {active ? <ActiveJob job={active} customer={custById[active.customer_id]} allJobs={allJobs}
        tick={tick} busy={busy} navigate={navigate} patch={patch} startTravel={startTravel} />
        : jobs.length > 0 ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
            <CheckCircle2 className="mx-auto text-emerald-600 mb-2" size={32} />
            <p className="font-semibold text-emerald-800">All jobs done for today</p>
            <p className="text-sm text-emerald-600">Great work.</p>
          </div>
        ) : null}

      {/* Rest of today's schedule */}
      {jobs.length > 1 && (
        <div className="mt-6">
          <p className="text-sm font-bold text-slate-700 mb-2 px-1">Today's schedule</p>
          <div className="space-y-2">
            {jobs.map(j => {
              const c = custById[j.customer_id];
              const isActive = active && j.id === active.id;
              return (
                <button key={j.id} onClick={() => navigate(`/jobs/${j.id}`)}
                  className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border ${isActive ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                  <div className="text-center shrink-0 w-14">
                    <p className="text-xs font-semibold text-slate-700">{timeLabel(j.scheduled_time) || '—'}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800 truncate">{c?.name || j.customer_name || 'Customer'}</p>
                    <p className="text-xs text-slate-500 truncate">{j.title}</p>
                  </div>
                  <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${j.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : j.status === 'in-progress' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                    {j.status === 'in-progress' ? 'Active' : j.status === 'awaiting-signoff' ? 'Sign-off' : j.status === 'completed' ? 'Done' : 'Next'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ActiveJob({ job, customer, allJobs, tick, busy, navigate, patch, startTravel }) {
  const address = fullAddress(job, customer);
  const phone = customer?.phone || job.customer_phone;
  const problem = job.description;
  const history = allJobs
    .filter(j => j.customer_id === job.customer_id && j.id !== job.id)
    .sort((a, b) => (b.scheduled_date || '').localeCompare(a.scheduled_date || ''))
    .slice(0, 4);

  const tiles = [
    { label: 'Diagnosis & notes', icon: <PenLine size={20} />, onClick: () => navigate(`/jobs/${job.id}`) },
    { label: 'Photos', icon: <Camera size={20} />, onClick: () => navigate(`/jobs/${job.id}`) },
    { label: 'Parts & labor', icon: <Wrench size={20} />, onClick: () => navigate(`/jobs/${job.id}`) },
    { label: 'Inspection', icon: <ClipboardCheck size={20} />, onClick: () => navigate(`/inspections?job=${job.id}`) },
    { label: 'Signature', icon: <PenLine size={20} />, onClick: () => navigate(`/jobs/${job.id}`) },
    { label: 'Full job', icon: <FileText size={20} />, onClick: () => navigate(`/jobs/${job.id}`) },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${job.status === 'in-progress' ? 'bg-amber-100 text-amber-700' : job.status === 'awaiting-signoff' ? 'bg-teal-100 text-teal-700' : 'bg-blue-100 text-blue-700'}`}>
            {job.status === 'in-progress' ? 'In progress' : job.status === 'awaiting-signoff' ? 'Awaiting sign-off' : 'Next job'}
          </span>
          {job.scheduled_time && <span className="text-xs text-slate-400">{timeLabel(job.scheduled_time)}</span>}
        </div>
        <h2 className="text-xl font-bold text-slate-900">{customer?.name || job.customer_name || 'Customer'}</h2>
        <p className="text-sm text-slate-500">{job.title}</p>
        {address && (
          <a href={mapsLink(address)} className="flex items-start gap-1.5 text-sm text-blue-600 mt-2">
            <MapPin size={15} className="mt-0.5 shrink-0" /> {address}
          </a>
        )}
        {problem && (
          <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
            <p className="text-[11px] font-semibold uppercase text-slate-400 mb-0.5">Problem</p>
            <p className="text-sm text-slate-700">{problem}</p>
          </div>
        )}
      </div>

      {/* Timer */}
      {job.work_started_at && job.status === 'in-progress' && (
        <div className="mx-5 mb-3 flex items-center justify-center gap-2 py-2 rounded-xl bg-amber-50 text-amber-800 font-mono font-semibold">
          <Timer size={16} /> {elapsed(job.work_started_at, tick)}
        </div>
      )}

      {/* Primary status action */}
      <div className="px-5 pb-3">
        {job.status === 'scheduled' && (
          <div className="grid grid-cols-2 gap-2">
            <button disabled={busy} onClick={() => startTravel(job)}
              className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-slate-800 text-white font-semibold disabled:opacity-50">
              <Navigation size={18} /> Start travel
            </button>
            <button disabled={busy} onClick={() => patch(job, { status: 'in-progress', work_started_at: new Date().toISOString() }, 'Job started')}
              className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-50">
              <Flag size={18} /> Arrived
            </button>
          </div>
        )}
        {job.status === 'in-progress' && (
          <button disabled={busy} onClick={() => patch(job, { status: 'awaiting-signoff', work_ended_at: new Date().toISOString() }, 'Marked work done')}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-teal-600 text-white font-semibold disabled:opacity-50">
            <CheckCircle2 size={18} /> Mark work done
          </button>
        )}
        {job.status === 'awaiting-signoff' && (
          <button onClick={() => navigate(`/jobs/${job.id}`)}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-600 text-white font-semibold">
            <PenLine size={18} /> Collect customer signature
          </button>
        )}
      </div>

      {/* Quick contact */}
      <div className="px-5 pb-4 grid grid-cols-3 gap-2">
        <a href={phone ? `tel:${phone}` : undefined} className={`flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-medium ${phone ? 'bg-slate-100 text-slate-700 active:bg-slate-200' : 'bg-slate-50 text-slate-300'}`}>
          <Phone size={18} /> Call
        </a>
        <a href={phone ? `sms:${phone}` : undefined} className={`flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-medium ${phone ? 'bg-slate-100 text-slate-700 active:bg-slate-200' : 'bg-slate-50 text-slate-300'}`}>
          <MessageSquare size={18} /> Message
        </a>
        <a href={address ? mapsLink(address) : undefined} className={`flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-medium ${address ? 'bg-slate-100 text-slate-700 active:bg-slate-200' : 'bg-slate-50 text-slate-300'}`}>
          <Navigation size={18} /> Directions
        </a>
      </div>

      {/* Tools */}
      <div className="px-5 pb-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4">
        {tiles.map(t => (
          <button key={t.label} onClick={t.onClick}
            className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-slate-50 text-slate-700 active:bg-slate-100 text-[11px] font-medium text-center">
            {t.icon}
            <span className="leading-tight">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Service / equipment history */}
      {history.length > 0 && (
        <div className="px-5 pb-5 border-t border-slate-100 pt-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-400 mb-2"><History size={13} /> Service history</p>
          <div className="space-y-1.5">
            {history.map(h => (
              <button key={h.id} onClick={() => navigate(`/jobs/${h.id}`)} className="w-full flex items-center justify-between gap-2 text-left">
                <div className="min-w-0">
                  <p className="text-sm text-slate-700 truncate">{h.title}</p>
                  <p className="text-xs text-slate-400">{h.scheduled_date || h.completed_date || '—'} · {h.status}</p>
                </div>
                <ChevronRight size={15} className="text-slate-300 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
