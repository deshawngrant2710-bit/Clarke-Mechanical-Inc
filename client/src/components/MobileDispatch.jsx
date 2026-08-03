import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from './UI';
import {
  MapPin, Clock, User, Phone, Navigation, Play, CheckCircle2,
  ArrowLeftRight, ChevronDown, X, Car, MoveRight,
} from 'lucide-react';
import {
  computeTechDay, techStatus, assignmentConflict, travelByJob, minToLabel,
} from '../lib/dispatch';

const GROUPS = [
  { id: 'pending', label: 'Pending' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
];
const MOVE_TARGETS = [
  { id: 'pending', label: 'Pending' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];

function groupOf(status) {
  if (status === 'completed') return 'completed';
  if (status === 'in-progress' || status === 'awaiting-signoff') return 'in-progress';
  if (status === 'scheduled') return 'scheduled';
  if (status === 'pending') return 'pending';
  return null; // cancelled etc. — hidden from the board
}

const mapsLink = (addr) => `https://maps.apple.com/?daddr=${encodeURIComponent(addr)}`;

// --- bottom sheet ---
function Sheet({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="lg:hidden fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-900/50 animate-fade-in" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-2xl animate-slide-up max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="p-1.5 -mr-1 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto overscroll-contain p-3 safe-bottom">{children}</div>
      </div>
    </div>
  );
}

// --- swipe-to-reveal wrapper (reveals actions on left swipe; snaps back) ---
function SwipeRow({ children, onReassign, onMove }) {
  const [dx, setDx] = useState(0);
  const start = useRef(null);
  const REVEAL = 132;

  function onStart(e) { start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, base: dx, locked: null }; }
  function onMoveT(e) {
    if (!start.current) return;
    const x = e.touches[0].clientX - start.current.x;
    const y = e.touches[0].clientY - start.current.y;
    if (start.current.locked == null) start.current.locked = Math.abs(x) > Math.abs(y) ? 'h' : 'v';
    if (start.current.locked !== 'h') return; // let vertical scroll happen
    setDx(Math.max(-REVEAL, Math.min(0, start.current.base + x)));
  }
  function onEnd() {
    if (!start.current) return;
    setDx(dx < -REVEAL / 2 ? -REVEAL : 0);
    start.current = null;
  }

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-y-0 right-0 flex">
        <button onClick={() => { setDx(0); onReassign(); }} className="w-16 flex flex-col items-center justify-center gap-1 bg-blue-600 text-white text-[11px] font-medium">
          <ArrowLeftRight size={16} /> Reassign
        </button>
        <button onClick={() => { setDx(0); onMove(); }} className="w-16 flex flex-col items-center justify-center gap-1 bg-slate-700 text-white text-[11px] font-medium">
          <MoveRight size={16} /> Move
        </button>
      </div>
      <div style={{ transform: `translateX(${dx}px)`, transition: start.current ? 'none' : 'transform .18s ease' }}
        onTouchStart={onStart} onTouchMove={onMoveT} onTouchEnd={onEnd}>
        {children}
      </div>
    </div>
  );
}

export default function MobileDispatch({ jobs, employees, onMove, onAssign, today }) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState({ completed: true });
  const [moveJob, setMoveJob] = useState(null);
  const [reassignJob, setReassignJob] = useState(null);

  const techs = useMemo(
    () => employees.filter(u => u.role === 'technician' || u.also_technician),
    [employees]
  );
  const techIds = techs.map(t => t.id);
  const todayJobs = useMemo(() => jobs.filter(j => j.scheduled_date === today), [jobs, today]);

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const travelMap = useMemo(() => travelByJob(todayJobs, techIds), [todayJobs, techIds]);
  const statusByTech = useMemo(() => {
    const m = {};
    for (const id of techIds) m[id] = techStatus(computeTechDay(id, todayJobs), nowMin);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayJobs, techIds.join(',')]);

  const grouped = GROUPS.map(g => ({ ...g, items: jobs.filter(j => groupOf(j.status) === g.id) }));

  function startOrComplete(job) {
    if (job.status === 'in-progress' || job.status === 'awaiting-signoff') onMove(job, 'completed');
    else onMove(job, 'in-progress');
  }

  return (
    <div className="lg:hidden space-y-4">
      {grouped.map(group => {
        const isCollapsed = collapsed[group.id];
        return (
          <div key={group.id}>
            <button onClick={() => setCollapsed(c => ({ ...c, [group.id]: !c[group.id] }))}
              className="w-full flex items-center justify-between px-1 py-2">
              <span className="text-sm font-bold text-slate-700">{group.label}
                <span className="ml-2 text-xs font-medium text-slate-400">{group.items.length}</span>
              </span>
              <ChevronDown size={18} className={`text-slate-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
            </button>

            {!isCollapsed && (
              <div className="space-y-2">
                {group.items.length === 0 && <p className="text-xs text-slate-300 px-1 pb-2">No jobs</p>}
                {group.items.map(job => {
                  const travel = travelMap[job.id];
                  const canStart = job.status !== 'completed';
                  return (
                    <SwipeRow key={job.id} onReassign={() => setReassignJob(job)} onMove={() => setMoveJob(job)}>
                      <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
                        <div className="flex items-start justify-between gap-2" onClick={() => navigate(`/jobs/${job.id}`)}>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 truncate">{job.customer_name || 'No customer'}</p>
                            <p className="text-xs text-slate-500 truncate">{job.title}</p>
                          </div>
                          <Badge status={job.priority} />
                        </div>

                        <div className="mt-2 space-y-1 text-xs text-slate-600">
                          {job.address && (
                            <p className="flex items-start gap-1.5"><MapPin size={13} className="text-slate-400 mt-0.5 shrink-0" /><span className="truncate">{job.address}</span></p>
                          )}
                          <p className="flex items-center gap-1.5">
                            <Clock size={13} className="text-slate-400 shrink-0" />
                            {job.scheduled_time ? minToLabel(hm(job.scheduled_time)) : 'Unscheduled'}
                            {travel != null && <span className="inline-flex items-center gap-1 text-slate-400"><Car size={12} /> ~{travel}m from prev</span>}
                          </p>
                          <button onClick={() => setReassignJob(job)} className="flex items-center gap-1.5 text-left">
                            <User size={13} className="text-slate-400 shrink-0" />
                            <span className={job.technician_name ? 'text-slate-700' : 'text-amber-600'}>
                              {job.technician_name || 'Unassigned — tap to assign'}
                            </span>
                          </button>
                        </div>

                        {/* quick actions */}
                        <div className="mt-3 grid grid-cols-4 gap-1.5">
                          <Qa icon={<ArrowLeftRight size={15} />} label="Reassign" onClick={() => setReassignJob(job)} />
                          <Qa icon={<Phone size={15} />} label="Call" disabled={!job.customer_phone}
                            href={job.customer_phone ? `tel:${job.customer_phone}` : undefined} />
                          <Qa icon={<Navigation size={15} />} label="Directions" disabled={!job.address}
                            href={job.address ? mapsLink(job.address) : undefined} />
                          {canStart
                            ? <Qa icon={job.status === 'in-progress' || job.status === 'awaiting-signoff' ? <CheckCircle2 size={15} /> : <Play size={15} />}
                                label={job.status === 'in-progress' || job.status === 'awaiting-signoff' ? 'Complete' : 'Start'}
                                onClick={() => startOrComplete(job)} primary />
                            : <Qa icon={<MoveRight size={15} />} label="Move" onClick={() => setMoveJob(job)} />}
                        </div>
                      </div>
                    </SwipeRow>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Move Job sheet */}
      <Sheet open={!!moveJob} onClose={() => setMoveJob(null)} title="Move job to…">
        <div className="space-y-1.5">
          {MOVE_TARGETS.map(t => (
            <button key={t.id} disabled={moveJob?.status === t.id}
              onClick={() => { onMove(moveJob, t.id); setMoveJob(null); }}
              className="w-full flex items-center justify-between px-3 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 disabled:opacity-40 hover:bg-slate-50 active:bg-slate-100">
              {t.label}
              {moveJob?.status === t.id && <span className="text-xs text-slate-400">Current</span>}
            </button>
          ))}
        </div>
      </Sheet>

      {/* Reassign sheet with availability + conflict warning */}
      <ReassignSheet job={reassignJob} techs={techs} statusByTech={statusByTech}
        todayJobs={todayJobs} today={today}
        onClose={() => setReassignJob(null)}
        onAssign={(techId) => { onAssign(reassignJob, techId); setReassignJob(null); }} />
    </div>
  );
}

function hm(s) { const m = /^(\d{1,2}):(\d{2})/.exec(s || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; }

// quick-action button (button or link)
function Qa({ icon, label, onClick, href, disabled, primary }) {
  const cls = `flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-medium transition-colors ${
    disabled ? 'text-slate-300 bg-slate-50' : primary ? 'text-white bg-blue-600 active:bg-blue-700' : 'text-slate-600 bg-slate-100 active:bg-slate-200'
  }`;
  if (href && !disabled) return <a href={href} className={cls} onClick={e => e.stopPropagation()}>{icon}{label}</a>;
  return <button disabled={disabled} onClick={e => { e.stopPropagation(); onClick && onClick(); }} className={cls}>{icon}{label}</button>;
}

function ReassignSheet({ job, techs, statusByTech, todayJobs, today, onClose, onAssign }) {
  const [confirm, setConfirm] = useState(null); // { techId, reason }
  if (!job) return null;
  const checkToday = job.scheduled_date === today;

  function pick(techId) {
    if (checkToday && techId) {
      const { conflict, reason } = assignmentConflict(techId, todayJobs, job);
      if (conflict) { setConfirm({ techId, reason }); return; }
    }
    onAssign(techId);
  }

  return (
    <Sheet open={!!job} onClose={() => { setConfirm(null); onClose(); }} title="Assign technician">
      {confirm && (
        <div className="mb-3 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
          <p className="font-semibold mb-1">🔴 Scheduling conflict</p>
          <p className="text-red-600">{confirm.reason}. Assign anyway?</p>
          <div className="flex gap-2 mt-2">
            <button onClick={() => { onAssign(confirm.techId); }} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold">Assign anyway</button>
            <button onClick={() => setConfirm(null)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium">Cancel</button>
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        <button onClick={() => pick('')} className="w-full text-left px-3 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-500 hover:bg-slate-50">
          Unassign
        </button>
        {techs.map(t => {
          const st = statusByTech[t.id] || { dot: '🟢', label: 'Available' };
          const current = job.technician_id === t.id;
          return (
            <button key={t.id} onClick={() => pick(t.id)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-3 rounded-xl border text-sm ${current ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
              <span className="font-medium text-slate-800 truncate">{t.name}{current && <span className="ml-2 text-xs text-blue-500">Current</span>}</span>
              <span className="flex items-center gap-1 text-xs text-slate-500 shrink-0">{st.dot} {st.label}</span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
