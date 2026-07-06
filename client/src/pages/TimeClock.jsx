import { useEffect, useRef, useState } from 'react';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, CardHeader, Btn, Modal, Empty, SkeletonPage, StatCard, Avatar } from '../components/UI';
import { fileToProof } from '../lib/imageProof';
import { useAuth } from '../context/AuthContext';
import { Clock, LogIn, LogOut, Camera, FileText, Image as ImageIcon, Timer, CalendarClock } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [clockOutOpen, setClockOutOpen] = useState(false);
  const [proofView, setProofView] = useState(null);
  const [busy, setBusy] = useState(false);

  function load() {
    return Promise.all([api.get('/time/active'), api.get('/time')]).then(([a, e]) => {
      setActive(a.data); setEntries(e.data); setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  async function clockIn() {
    setBusy(true);
    try { await api.post('/time/clock-in'); toast.success('Clocked in'); await load(); }
    catch (e) { toast.error(e.response?.data?.error || 'Could not clock in'); }
    finally { setBusy(false); }
  }

  async function viewProof(id) {
    try {
      const { data } = await api.get(`/time/${id}/proof`);
      if (!data.proof) return toast.error('No proof on file');
      setProofView(data);
    } catch { toast.error('Could not load proof'); }
  }

  if (loading) return <SkeletonPage stats={3} rows={5} />;

  const myEntries = entries.filter(e => e.technician_id === user?.id);
  const todayHours = myEntries
    .filter(e => e.clock_out && new Date(e.clock_in).toDateString() === new Date().toDateString())
    .reduce((s, e) => s + (e.hours || 0), 0);

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
                <p className="text-sm text-slate-500">Clocked in at {fmtTime(active.clock_in)}</p>
                <p className="text-2xl font-bold text-slate-800 tabular-nums">{elapsed(active.clock_in, now)}</p>
              </div>
            </div>
            <Btn variant="danger" size="lg" onClick={() => setClockOutOpen(true)}><LogOut size={18} /> Clock Out</Btn>
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
            <Btn size="lg" onClick={clockIn} loading={busy}><LogIn size={18} /> Clock In</Btn>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatCard label="Hours Today" value={todayHours} decimals={1} icon={<Timer size={18} />} color="blue" />
        <StatCard label="My Shifts" value={myEntries.length} icon={<CalendarClock size={18} />} color="purple" />
        <StatCard label={active ? 'Status' : 'Status'} value={active ? 'On the clock' : 'Off'} animate={false} icon={<Clock size={18} />} color={active ? 'green' : 'slate'} />
      </div>

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
                    <td className="px-5 py-3 text-slate-600">{fmtTime(e.clock_in)}</td>
                    <td className="px-5 py-3">{e.clock_out ? <span className="text-slate-600">{fmtTime(e.clock_out)}</span> : <span className="text-xs font-medium text-emerald-600">In progress</span>}</td>
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

      <ClockOutModal open={clockOutOpen} onClose={() => setClockOutOpen(false)} onDone={load} />

      <Modal open={!!proofView} onClose={() => setProofView(null)} title="Proof of Work" size="lg">
        {proofView?.proof_type === 'pdf'
          ? <iframe title="proof" src={proofView.proof} className="w-full h-[70vh] rounded-lg border border-slate-200" />
          : <img src={proofView?.proof} alt="proof of work" className="w-full rounded-lg border border-slate-200" />}
      </Modal>
    </div>
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
    try {
      await api.post('/time/clock-out', proof);
      toast.success('Clocked out — nice work!');
      onClose(); onDone();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not clock out'); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Clock Out" subtitle="A photo of the completed work is required">
      <div className="space-y-4">
        <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={onFile} />
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
