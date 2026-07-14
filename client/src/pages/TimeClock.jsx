import { useEffect, useRef, useState } from 'react';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, CardHeader, Btn, Modal, Select, Empty, SkeletonPage, StatCard, Avatar } from '../components/UI';
import { fileToProof } from '../lib/imageProof';
import { getLocation, mapsLink } from '../lib/geo';
import { useAuth } from '../context/AuthContext';
import { Clock, LogIn, LogOut, Camera, FileText, Image as ImageIcon, Timer, CalendarClock, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';

function fmtTime(iso) { return iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—'; }
function fmtDate(iso) { return iso ? new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—'; }
function elapsed(fromIso, now) {
  const ms = now - new Date(fromIso);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

export default function TimeClock() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [active, setActive] = useState(null);
  const [entries, setEntries] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [clockInOpen, setClockInOpen] = useState(false);
  const [clockOutOpen, setClockOutOpen] = useState(false);
  const [proofView, setProofView] = useState(null);

  function load() {
    return Promise.all([api.get('/time/active'), api.get('/time'), api.get('/jobs')]).then(([a, e, j]) => {
      setActive(a.data); setEntries(e.data);
      setJobs(j.data.filter(job => !['completed', 'cancelled'].includes(job.status)));
      setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  async function viewProof(id) {
    try {
      const { data } = await api.get(`/time/${id}/proof`);
      if (!data.proof) return toast.error('No proof on file');
      setProofView(data);
    } catch { toast.error('Could not load proof'); }
  }

  // Block clocking out until the job you're clocked into is finished.
  function tryClockOut() {
    if (active?.job_id) {
      const j = jobs.find(x => x.id === active.job_id);
      if (j && !['awaiting-signoff', 'completed', 'cancelled'].includes(j.status)) {
        return toast.error(`Finish "${j.title}" (mark the work done) before clocking out.`);
      }
    }
    setClockOutOpen(true);
  }

  if (loading) return <SkeletonPage stats={3} rows={5} />;

  const myEntries = entries.filter(e => e.technician_id === user?.id);
  const todayHours = myEntries
    .filter(e => e.clock_out && new Date(e.clock_in).toDateString() === new Date().toDateString())
    .reduce((s, e) => s + (e.hours || 0), 0);

  // "My hours": this week's total + a 7-day breakdown, from my entries.
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); weekStart.setHours(0, 0, 0, 0);
  const weekHours = myEntries.filter(e => e.clock_in && new Date(e.clock_in) >= weekStart).reduce((s, e) => s + (e.hours || 0), 0);
  const days7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
    const key = d.toDateString();
    const h = myEntries.filter(e => e.clock_in && new Date(e.clock_in).toDateString() === key).reduce((s, e) => s + (e.hours || 0), 0);
    days7.push({ label: d.toLocaleDateString('en-US', { weekday: 'short' }), key, hours: h });
  }
  const maxH = Math.max(1, ...days7.map(d => d.hours));

  return (
    <div className="animate-fade-in">
      <PageHeader title="Time Clock" subtitle="Clock in and out of your shifts" icon={<Clock size={20} />} />

      {/* Clock status */}
      <Card className="p-6 mb-6">
        {active ? (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center animate-[pulse-ring_2s_infinite]"><Timer size={24} /></span>
              <div>
                <p className="text-sm text-slate-500">Clocked in at {fmtTime(active.clock_in)}{active.job_title ? <> · <span className="text-slate-700 font-medium">{active.job_title}</span></> : ''}</p>
                <p className="text-2xl font-bold text-slate-800 tabular-nums">{elapsed(active.clock_in, now)}</p>
              </div>
            </div>
            <Btn variant="danger" size="lg" onClick={tryClockOut}><LogOut size={18} /> Clock Out</Btn>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center"><Clock size={24} /></span>
              <div>
                <p className="text-sm text-slate-500">You're currently clocked out</p>
                <p className="text-lg font-semibold text-slate-700">Ready to start your shift</p>
              </div>
            </div>
            <Btn size="lg" onClick={() => setClockInOpen(true)}><LogIn size={18} /> Clock In</Btn>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Hours Today" value={todayHours} decimals={1} icon={<Timer size={18} />} color="blue" />
        <StatCard label="This Week" value={weekHours} decimals={1} icon={<CalendarClock size={18} />} color="green" />
        <StatCard label="My Shifts" value={myEntries.length} icon={<CalendarClock size={18} />} color="purple" />
        <StatCard label="Status" value={active ? 'On the clock' : 'Off'} animate={false} icon={<Clock size={18} />} color={active ? 'green' : 'slate'} />
      </div>

      {!isAdmin && (
        <Card className="p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2"><Timer size={16} className="text-blue-500" /><h2 className="text-card-title text-slate-800">My hours</h2></div>
            <span className="text-sm text-slate-500">Last 7 days: <span className="font-bold text-slate-800">{days7.reduce((s, d) => s + d.hours, 0).toFixed(1)}h</span></span>
          </div>
          <div className="flex items-end justify-between gap-2 h-28">
            {days7.map(d => (
              <div key={d.key} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                <span className="text-[10px] font-medium text-slate-600 h-3">{d.hours ? d.hours.toFixed(1) : ''}</span>
                <div className="w-full flex items-end justify-center flex-1">
                  <div className="w-6 rounded-t bg-blue-500/80" style={{ height: d.hours ? `${Math.max(6, Math.round((d.hours / maxH) * 100))}%` : '0%' }} />
                </div>
                <span className="text-[10px] text-slate-400">{d.label}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title={isAdmin ? 'All Timesheets' : 'My Timesheet'} icon={<CalendarClock size={16} />} />
        {entries.length === 0 ? (
          <Empty icon={<Clock size={24} />} title="No shifts yet" message="Clock in to start tracking your time." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60 text-left">
                  {isAdmin && <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Technician</th>}
                  <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Job</th>
                  <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Clock In</th>
                  <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Clock Out</th>
                  <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Hours</th>
                  <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Proof</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map(e => (
                  <tr key={e.id} className="hover:bg-slate-50/60">
                    {isAdmin && (
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar name={e.technician_name} className="w-7 h-7 text-[10px]" />
                          <span className="text-slate-700">{e.technician_name}</span>
                        </div>
                      </td>
                    )}
                    <td className="px-5 py-3 text-slate-600">{fmtDate(e.clock_in)}</td>
                    <td className="px-5 py-3 text-slate-600">{e.job_title || <span className="text-slate-300">—</span>}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-600">{fmtTime(e.clock_in)}</span>
                        {e.clock_in_location && <a href={mapsLink(e.clock_in_location)} target="_blank" rel="noreferrer" title="View clock-in location" className="text-blue-500 hover:text-blue-700"><MapPin size={13} /></a>}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {e.clock_out ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-600">{fmtTime(e.clock_out)}</span>
                          {e.clock_out_location && <a href={mapsLink(e.clock_out_location)} target="_blank" rel="noreferrer" title="View clock-out location" className="text-blue-500 hover:text-blue-700"><MapPin size={13} /></a>}
                        </div>
                      ) : <span className="text-xs font-medium text-emerald-600">In progress</span>}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-slate-800">{e.hours != null ? `${e.hours.toFixed(2)}` : '—'}</td>
                    <td className="px-5 py-3 text-right">
                      {e.has_proof ? (
                        <button onClick={() => viewProof(e.id)} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs font-medium">
                          {e.proof_type === 'pdf' ? <FileText size={13} /> : <ImageIcon size={13} />} View
                        </button>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ClockInModal open={clockInOpen} onClose={() => setClockInOpen(false)} onDone={load} jobs={jobs} requireJob={user?.role === 'technician'} />
      <ClockOutModal open={clockOutOpen} onClose={() => setClockOutOpen(false)} onDone={load} />

      <Modal open={!!proofView} onClose={() => setProofView(null)} title="Proof of Work" size="lg">
        {proofView?.proof_type === 'pdf'
          ? <iframe title="proof" src={proofView.proof} className="w-full h-[70vh] rounded-lg border border-slate-200" />
          : <img src={proofView?.proof} alt="proof of work" className="w-full rounded-lg border border-slate-200" />}
      </Modal>
    </div>
  );
}

function ClockInModal({ open, onClose, onDone, jobs, requireJob }) {
  const [jobId, setJobId] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setJobId(''); }, [open]);
  async function submit() {
    if (requireJob && !jobId) return toast.error('Please select the job you\'re clocking in for');
    setBusy(true);
    const t = toast.loading('Getting your location…');
    try {
      const location = await getLocation();
      await api.post('/time/clock-in', { job_id: jobId || null, location });
      toast.success(location ? 'Clocked in — location recorded' : 'Clocked in (location unavailable)', { id: t });
      onClose(); onDone();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not clock in', { id: t }); }
    finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Clock In" subtitle="Start your shift" size="sm">
      <div className="space-y-4">
        <Select label={`Job${requireJob ? ' *' : ' (optional)'}`} value={jobId} onChange={e => setJobId(e.target.value)}>
          <option value="">{requireJob ? 'Select a job…' : 'No specific job'}</option>
          {jobs.map(j => <option key={j.id} value={j.id}>{j.title}{j.customer_name ? ` — ${j.customer_name}` : ''}</option>)}
        </Select>
        <p className="text-xs text-slate-500 flex items-center gap-1.5"><MapPin size={13} /> Your location will be recorded at clock-in. Please allow location access if prompted.</p>
        <div className="flex justify-end gap-2">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn onClick={submit} loading={busy}>{busy ? 'Clocking in…' : 'Clock In'}</Btn>
        </div>
      </div>
    </Modal>
  );
}

function ClockOutModal({ open, onClose, onDone }) {
  const [preview, setPreview] = useState(null);
  const [proof, setProof] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { if (!open) { setPreview(null); setProof(null); } }, [open]);

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await fileToProof(file);
      setProof(result);
      setPreview(result.proof_type === 'pdf' ? { pdf: true, name: file.name } : { img: result.proof });
    } catch (err) { toast.error(err.message); }
  }

  async function submit() {
    if (!proof) return toast.error('A photo of the work is required to clock out');
    setBusy(true);
    const t = toast.loading('Getting your location…');
    try {
      const location = await getLocation();
      await api.post('/time/clock-out', { ...proof, location });
      toast.success('Clocked out — nice work!', { id: t });
      onClose(); onDone();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not clock out', { id: t }); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Clock Out" subtitle="A photo of the completed work is required">
      <div className="space-y-4">
        <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onFile} />
        {!preview ? (
          <button onClick={() => fileRef.current?.click()}
            className="w-full flex flex-col items-center justify-center gap-2 py-10 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-blue-400 hover:bg-blue-50/40 transition-colors">
            <Camera size={28} />
            <span className="text-sm font-medium">Take / upload a photo of the work</span>
            <span className="text-xs text-slate-400">Photo or PDF (under ~600KB)</span>
          </button>
        ) : (
          <div className="space-y-2">
            {preview.img
              ? <img src={preview.img} alt="work proof" className="w-full max-h-72 object-contain rounded-xl border border-slate-200 bg-slate-50" />
              : <div className="flex items-center gap-2 p-4 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-600"><FileText size={18} /> {preview.name}</div>}
            <button onClick={() => fileRef.current?.click()} className="text-xs text-blue-600 hover:text-blue-700">Replace</button>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn variant="danger" onClick={submit} loading={busy} disabled={!proof}>{busy ? 'Clocking out…' : 'Confirm Clock Out'}</Btn>
        </div>
      </div>
    </Modal>
  );
}
