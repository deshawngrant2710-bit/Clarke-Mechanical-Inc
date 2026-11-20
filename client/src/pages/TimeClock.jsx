import { useEffect, useRef, useState } from 'react';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, CardHeader, Btn, Modal, Select, Empty, SkeletonPage, StatCard, Avatar } from '../components/UI';
import { fileToProof } from '../lib/imageProof';
import { getLocation, mapsLink } from '../lib/geo';
import { useAuth } from '../context/AuthContext';
import { Clock, LogIn, LogOut, Camera, FileText, Image as ImageIcon, Timer, CalendarClock, MapPin, Pencil, Trash2, Coffee, AlertTriangle, CheckCircle2, Edit3 } from 'lucide-react';
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
  const [proofView, setProofView] = useState(null);
  const [editEntry, setEditEntry] = useState(null);

  function load() {
    return Promise.all([api.get('/time/active'), api.get('/time'), api.get('/jobs')]).then(([a, e, j]) => {
      setActive(a.data); setEntries(e.data);
      setJobs(j.data.filter(job => !['completed', 'cancelled'].includes(job.status)));
      setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { const h = () => load(); window.addEventListener('cm-synced', h); return () => window.removeEventListener('cm-synced', h); }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  async function viewProof(id) {
    try {
      const { data } = await api.get(`/time/${id}/proof`);
      if (!data.proof) return toast.error('No proof on file');
      setProofView(data);
    } catch { toast.error('Could not load proof'); }
  }

  async function deleteEntry(e) {
    if (!window.confirm(`Delete this time entry for ${e.technician_name}? This can't be undone.`)) return;
    try { await api.delete(`/time/${e.id}`); toast.success('Time entry deleted'); load(); }
    catch (err) { toast.error(err.response?.data?.error || 'Could not delete'); }
  }

  const isManager = user?.role === 'admin' || user?.role === 'office';
  const [correctEntry, setCorrectEntry] = useState(null);
  const activeBreaks = active?.breaks || [];
  const onBreakNow = activeBreaks.length > 0 && !activeBreaks[activeBreaks.length - 1].end;
  const activeJobTitle = active?.job_id ? (jobs.find(j => j.id === active.job_id)?.title || null) : null;

  async function startBreak() { try { await api.post('/time/break/start'); load(); } catch (e) { toast.error(e.response?.data?.error || 'Could not start break'); } }
  async function endBreak() { try { await api.post('/time/break/end'); load(); } catch (e) { toast.error(e.response?.data?.error || 'Could not end break'); } }
  async function approveEntry(e) { try { await api.post(`/time/${e.id}/approve`, { approved: !e.approved }); load(); } catch { toast.error('Could not update approval'); } }
  async function resolveCorrection(e, approve) { try { await api.post(`/time/${e.id}/resolve-correction`, { approve }); toast.success(approve ? 'Correction applied' : 'Correction denied'); load(); } catch (err) { toast.error(err.response?.data?.error || 'Could not resolve'); } }


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

  // Overtime (>40h/week), break totals, and missed clock-out detection.
  const OT = Math.max(0, weekHours - 40);
  const weekBreakMin = myEntries.filter(e => e.clock_in && new Date(e.clock_in) >= weekStart).reduce((s, e) => s + (e.break_minutes || 0), 0);
  const missed = (() => {
    if (active && (Date.now() - new Date(active.clock_in)) > 16 * 3600000) return active;
    return (isManager ? entries : myEntries).find(e => !e.clock_out && new Date(e.clock_in).toDateString() !== new Date().toDateString()) || null;
  })();
  const pendingCorrections = entries.filter(e => e.correction?.status === 'pending');

  return (
    <div className="animate-fade-in">
      <PageHeader title="Time Clock" subtitle="Your hours are tracked automatically from your jobs" icon={<Clock size={20} />} />

      {/* Clock status */}
      <Card className="p-6 mb-6">
        {active ? (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center animate-[pulse-ring_2s_infinite]"><Timer size={24} /></span>
              <div>
                <p className="text-sm text-slate-500">On the clock since {fmtTime(active.clock_in)}{(active.job_title || activeJobTitle) ? <> · <span className="text-slate-700 font-medium">{active.job_title || activeJobTitle}</span></> : ''}</p>
                <p className="text-2xl font-bold text-slate-800 tabular-nums">{elapsed(active.clock_in, now)}</p>
                {onBreakNow && <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 mt-1"><Coffee size={12} /> On break</span>}
                <p className="text-xs text-slate-500 mt-1">Your time stops by itself when this job is closed.</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Btn variant="outline" size="lg" onClick={onBreakNow ? endBreak : startBreak}><Coffee size={16} /> {onBreakNow ? 'End break' : 'Start break'}</Btn>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center"><Clock size={24} /></span>
              <div>
                <p className="text-sm text-slate-500">You're off the clock</p>
                <p className="text-lg font-semibold text-slate-700">Nothing to do here — just start your job</p>
                <p className="text-xs text-slate-500 mt-0.5">Starting a job clocks you in. Closing it clocks you out.</p>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Missed clock-out warning */}
      {missed && (
        <div className="mb-6 flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertTriangle size={16} className="shrink-0" />
          <span><span className="font-semibold">Shift still open.</span> A shift from {fmtDate(missed.clock_in)} is still running because its job hasn't been closed. {isManager ? 'Close the job, or edit the entry to set the correct end time.' : 'Close the job, or ask your manager to correct it.'}</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Hours Today" value={todayHours} decimals={1} icon={<Timer size={18} />} color="blue" />
        <StatCard label="Billable This Week" value={weekHours} decimals={1} icon={<CalendarClock size={18} />} color="green"
          sub={`${(weekBreakMin / 60).toFixed(1)}h breaks${OT > 0 ? ` · ${OT.toFixed(1)}h OT` : ''}`} />
        <StatCard label="Overtime (wk)" value={OT} decimals={1} icon={<AlertTriangle size={18} />} color={OT > 0 ? 'orange' : 'slate'} />
        <StatCard label="Status" value={onBreakNow ? 'On break' : active ? 'On the clock' : 'Off'} animate={false} icon={<Clock size={18} />} color={onBreakNow ? 'orange' : active ? 'green' : 'slate'} />
      </div>

      {/* Manager: pending correction requests */}
      {isManager && pendingCorrections.length > 0 && (
        <Card className="p-5 mb-6 border-amber-200">
          <div className="flex items-center gap-2 mb-3"><FileText size={16} className="text-amber-500" /><h2 className="text-card-title text-slate-800">Correction requests ({pendingCorrections.length})</h2></div>
          <div className="space-y-2">
            {pendingCorrections.map(e => (
              <div key={e.id} className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-slate-100">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{e.technician_name} · {fmtDate(e.clock_in)}</p>
                  <p className="text-xs text-slate-500">Requested: {fmtTime(e.correction.requested_clock_in)} → {e.correction.requested_clock_out ? fmtTime(e.correction.requested_clock_out) : 'open'}</p>
                  <p className="text-xs text-slate-500 italic">"{e.correction.reason}"</p>
                </div>
                <button onClick={() => resolveCorrection(e, true)} className="text-xs font-semibold text-white bg-emerald-600 px-3 py-1.5 rounded-lg">Approve</button>
                <button onClick={() => resolveCorrection(e, false)} className="text-xs font-medium text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg">Deny</button>
              </div>
            ))}
          </div>
        </Card>
      )}

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
          <Empty icon={<Clock size={24} />} title="No shifts yet" message="Start a job and your time is tracked automatically." />
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
                      <div className="inline-flex items-center gap-2.5 justify-end">
                        {e.needs_review && <span title={e.review_reason || ''} className="text-[10px] font-semibold text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">Check times</span>}
                        {e.correction?.status === 'pending' && <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">Fix pending</span>}
                        {e.has_proof ? (
                          <button onClick={() => viewProof(e.id)} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs font-medium">
                            {e.proof_type === 'pdf' ? <FileText size={13} /> : <ImageIcon size={13} />} View
                          </button>
                        ) : <span className="text-slate-300 text-xs">—</span>}
                        {!isManager && e.technician_id === user?.id && e.clock_out && e.correction?.status !== 'pending' && (
                          <button onClick={() => setCorrectEntry(e)} title="Request a correction" className="text-slate-400 hover:text-blue-600"><Edit3 size={13} /></button>
                        )}
                        {!isManager && e.approved && <span title={`Approved by ${e.approved_by || ''}`} className="text-emerald-600"><CheckCircle2 size={14} /></span>}
                        {isManager && <button onClick={() => approveEntry(e)} title={e.approved ? `Approved by ${e.approved_by || ''} — tap to unapprove` : 'Approve'} className={e.approved ? 'text-emerald-600' : 'text-slate-300 hover:text-emerald-600'}><CheckCircle2 size={15} /></button>}
                        {isAdmin && <button onClick={() => setEditEntry(e)} title="Edit times" className="text-slate-400 hover:text-blue-600"><Pencil size={13} /></button>}
                        {isAdmin && <button onClick={() => deleteEntry(e)} title="Delete entry" className="text-slate-400 hover:text-red-600"><Trash2 size={13} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>


      <EditTimeModal entry={editEntry} onClose={() => setEditEntry(null)} onDone={load} />
      <CorrectionModal entry={correctEntry} onClose={() => setCorrectEntry(null)} onDone={load} />

      <Modal open={!!proofView} onClose={() => setProofView(null)} title="Proof of Work" size="lg">
        {proofView?.proof_type === 'pdf'
          ? <iframe title="proof" src={proofView.proof} className="w-full h-[70vh] rounded-lg border border-slate-200" />
          : <img src={proofView?.proof} alt="proof of work" className="w-full rounded-lg border border-slate-200" />}
      </Modal>
    </div>
  );
}

// ISO -> value for <input type="datetime-local"> (local time), and blank if none.
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function CorrectionModal({ entry, onClose, onDone }) {
  const [ci, setCi] = useState('');
  const [co, setCo] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (entry) { setCi(toLocalInput(entry.clock_in)); setCo(toLocalInput(entry.clock_out)); setReason(''); } }, [entry]);
  if (!entry) return null;

  async function submit() {
    if (!reason.trim()) return toast.error('Please explain the correction');
    setSaving(true);
    try {
      await api.post(`/time/${entry.id}/request-correction`, {
        clock_in: ci ? new Date(ci).toISOString() : null,
        clock_out: co ? new Date(co).toISOString() : null,
        reason,
      });
      toast.success('Correction requested — your manager will review it');
      onClose(); onDone();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not submit'); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={!!entry} onClose={onClose} title="Request a correction" subtitle="Your manager reviews and applies it" size="sm">
      <div className="space-y-3">
        <label className="block text-sm font-medium text-slate-700">Corrected clock-in
          <input type="datetime-local" value={ci} onChange={e => setCi(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
        </label>
        <label className="block text-sm font-medium text-slate-700">Corrected clock-out
          <input type="datetime-local" value={co} onChange={e => setCo(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
        </label>
        <label className="block text-sm font-medium text-slate-700">Reason
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="e.g. Forgot to clock out — left site at 4:30pm"
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn onClick={submit} loading={saving}>Submit request</Btn>
        </div>
      </div>
    </Modal>
  );
}

function EditTimeModal({ entry, onClose, onDone }) {
  const [clockIn, setClockIn] = useState('');
  const [clockOut, setClockOut] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (entry) { setClockIn(toLocalInput(entry.clock_in)); setClockOut(toLocalInput(entry.clock_out)); }
  }, [entry]);

  async function save() {
    if (!clockIn) return toast.error('Clock-in time is required');
    setSaving(true);
    try {
      await api.put(`/time/${entry.id}`, {
        clock_in: new Date(clockIn).toISOString(),
        clock_out: clockOut ? new Date(clockOut).toISOString() : null,
      });
      toast.success('Timesheet updated');
      onClose(); onDone();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not update'); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={!!entry} onClose={onClose} title="Edit time entry" subtitle={entry ? `${entry.technician_name}${entry.job_title ? ` · ${entry.job_title}` : ''}` : ''} size="sm">
      {entry && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Clock in</label>
            <input type="datetime-local" value={clockIn} onChange={e => setClockIn(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Clock out</label>
            <input type="datetime-local" value={clockOut} onChange={e => setClockOut(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500" />
            <p className="text-xs text-slate-400 mt-1">Hours recalculate automatically. Leave blank if the shift is still open.</p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="outline" onClick={onClose}>Cancel</Btn>
            <Btn onClick={save} loading={saving}>Save</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}
