import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, Badge, Btn, Spinner } from '../components/UI';
import { cacheGet, cacheSet } from '../lib/queryCache';
import SheetSelect from '../components/SheetSelect';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { ChevronLeft, ChevronRight, Plus, Calendar as CalIcon, AlertTriangle, UserX, BellRing } from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths,
  addDays, subDays, startOfWeek, addWeeks, subWeeks,
} from 'date-fns';

const DOT = {
  'in-progress': 'bg-violet-500', scheduled: 'bg-blue-500', 'awaiting-signoff': 'bg-teal-500',
  pending: 'bg-amber-500', completed: 'bg-emerald-500', cancelled: 'bg-slate-400',
};
const isEmergency = (j) => j.priority === 'urgent' || j.job_type === 'Emergency';
const ds = (d) => format(d, 'yyyy-MM-dd');
function fmtTime(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  if (!m) return null;
  let h = +m[1]; const ap = h < 12 ? 'AM' : 'PM'; h = h % 12 || 12;
  return `${h}:${m[2]} ${ap}`;
}
const VIEWS = [['agenda', 'Agenda'], ['day', 'Day'], ['week', 'Week'], ['month', 'Month']];

function JobRow({ job, navigate }) {
  const emer = isEmergency(job);
  return (
    <button onClick={() => navigate(`/jobs/${job.id}`)}
      className={`w-full text-left flex items-stretch gap-3 p-3 rounded-xl border transition-colors ${emer ? 'border-red-200 bg-red-50/60' : 'border-slate-100 hover:border-blue-200 hover:bg-blue-50/40'}`}>
      <div className="w-16 shrink-0 text-center self-center">
        <p className={`text-sm font-bold ${emer ? 'text-red-600' : 'text-slate-700'}`}>{fmtTime(job.scheduled_time) || 'Anytime'}</p>
      </div>
      <div className={`w-1 rounded-full ${emer ? 'bg-red-500' : DOT[job.status] || 'bg-blue-500'}`} />
      <div className="min-w-0 flex-1 self-center">
        <div className="flex items-center gap-2">
          {emer && <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0"><AlertTriangle size={10} />Emergency</span>}
          <p className="font-medium text-slate-800 truncate">{job.title}</p>
        </div>
        <p className="text-xs text-slate-500 truncate">
          {job.customer_name || 'No customer'}{job.technician_name ? ` · ${job.technician_name}` : ' · Unassigned'}
        </p>
      </div>
      <div className="self-center"><Badge status={job.status} /></div>
    </button>
  );
}

export default function Schedule() {
  const [jobs, setJobs] = useState(() => cacheGet('/jobs') || null);
  const [employees, setEmployees] = useState(() => cacheGet('/employees') || []);
  const [view, setView] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 1024 ? 'agenda' : 'month'));
  const [cursor, setCursor] = useState(new Date());   // anchor date for day/week/month
  const [selected, setSelected] = useState(new Date());
  const [tech, setTech] = useState('');               // '' all | id | 'unassigned'
  const [remLoading, setRemLoading] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  async function sendReminders() {
    if (remLoading) return;
    setRemLoading(true);
    try {
      const { data } = await api.post('/jobs/send-reminders', {});
      const { total = 0, texted = 0, emailed = 0, date } = data || {};
      if (!total) toast(`No appointments scheduled for ${date} — nothing to remind.`);
      else toast.success(`Reminders sent for ${total} appointment${total === 1 ? '' : 's'} on ${date} (${texted} text, ${emailed} email).`);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not send reminders');
    } finally { setRemLoading(false); }
  }

  useEffect(() => {
    api.get('/jobs').then(r => { setJobs(r.data); cacheSet('/jobs', r.data); });
    api.get('/employees').then(r => { setEmployees(r.data); cacheSet('/employees', r.data); }).catch(() => {});
  }, []);
  if (!jobs) return <Spinner />;

  const techs = employees.filter(u => u.role === 'technician' || u.also_technician);
  const matchTech = (j) => tech === '' ? true : tech === 'unassigned' ? !j.technician_id : j.technician_id === tech;
  const visible = jobs.filter(j => j.scheduled_date && j.status !== 'cancelled' && matchTech(j));
  const forDay = (day) => visible.filter(j => j.scheduled_date === ds(day)).sort((a, b) => (a.scheduled_time || '99').localeCompare(b.scheduled_time || '99'));

  const todayStr = ds(new Date());
  const today = new Date();
  const unassignedUpcoming = jobs.filter(j => j.scheduled_date && j.scheduled_date >= todayStr && !j.technician_id && !['completed', 'cancelled'].includes(j.status));

  function step(dir) {
    if (view === 'day') setCursor(c => (dir > 0 ? addDays(c, 1) : subDays(c, 1)));
    else if (view === 'week') setCursor(c => (dir > 0 ? addWeeks(c, 1) : subWeeks(c, 1)));
    else setCursor(c => (dir > 0 ? addMonths(c, 1) : subMonths(c, 1)));
  }
  function goToday() { setCursor(new Date()); setSelected(new Date()); }

  const rangeLabel =
    view === 'day' ? format(cursor, 'EEEE, MMM d')
    : view === 'week' ? `Week of ${format(startOfWeek(cursor), 'MMM d')}`
    : view === 'month' ? format(cursor, 'MMMM yyyy')
    : 'Upcoming';

  return (
    <div className="animate-fade-in">
      <PageHeader title="Schedule" subtitle="Dispatch calendar & job planning" icon={<CalIcon size={20} />}>
        {['admin', 'office'].includes(user?.role) && (
          <Btn variant="outline" onClick={sendReminders} loading={remLoading} title="Text & email tomorrow's customers a reminder">
            <BellRing size={16} /> Send reminders
          </Btn>
        )}
        <Btn onClick={() => navigate('/jobs?new=1')}><Plus size={16} /> New Job</Btn>
      </PageHeader>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {VIEWS.map(([id, label]) => (
            <button key={id} onClick={() => setView(id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}>{label}</button>
          ))}
        </div>
        <div className="w-44">
          <SheetSelect title="Filter by technician" placeholder={null} value={tech}
            options={[{ value: '', label: 'All technicians' }, { value: 'unassigned', label: 'Unassigned only' }, ...techs.map(t => ({ value: t.id, label: t.name }))]}
            onChange={setTech} />
        </div>
        {view !== 'agenda' && (
          <div className="flex items-center gap-1 ml-auto">
            <button onClick={goToday} className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Today</button>
            <button onClick={() => step(-1)} className="p-2 hover:bg-slate-100 rounded-lg"><ChevronLeft size={18} /></button>
            <span className="text-sm font-semibold text-slate-700 w-40 text-center">{rangeLabel}</span>
            <button onClick={() => step(1)} className="p-2 hover:bg-slate-100 rounded-lg"><ChevronRight size={18} /></button>
          </div>
        )}
      </div>

      {/* Unassigned banner */}
      {unassignedUpcoming.length > 0 && tech !== 'unassigned' && (
        <button onClick={() => setTech('unassigned')}
          className="w-full flex items-center gap-2 mb-4 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <UserX size={16} className="shrink-0" />
          <span className="font-medium">{unassignedUpcoming.length} upcoming job{unassignedUpcoming.length === 1 ? '' : 's'} need a technician</span>
          <span className="ml-auto font-semibold">View</span>
        </button>
      )}

      {/* ---- AGENDA ---- */}
      {view === 'agenda' && <Agenda visible={visible} todayStr={todayStr} navigate={navigate} />}

      {/* ---- DAY ---- */}
      {view === 'day' && (
        <Card className="p-4">
          <div className="space-y-2">
            {forDay(cursor).length === 0
              ? <p className="text-sm text-slate-400 py-10 text-center">No jobs scheduled this day</p>
              : forDay(cursor).map(j => <JobRow key={j.id} job={j} navigate={navigate} />)}
          </div>
        </Card>
      )}

      {/* ---- WEEK ---- */}
      {view === 'week' && (
        <div className="space-y-4">
          {eachDayOfInterval({ start: startOfWeek(cursor), end: addDays(startOfWeek(cursor), 6) }).map(day => {
            const list = forDay(day);
            const isToday = isSameDay(day, today);
            return (
              <Card key={ds(day)} className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-sm font-bold ${isToday ? 'text-blue-600' : 'text-slate-700'}`}>{format(day, 'EEEE, MMM d')}</span>
                  <span className="text-xs text-slate-400">{list.length || 'no'} job{list.length === 1 ? '' : 's'}</span>
                </div>
                <div className="space-y-2">
                  {list.map(j => <JobRow key={j.id} job={j} navigate={navigate} />)}
                  {list.length === 0 && <p className="text-xs text-slate-300 pl-1">—</p>}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ---- MONTH ---- */}
      {view === 'month' && (
        <Card className="p-4">
          <div className="grid grid-cols-7 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="text-center text-[11px] font-semibold text-slate-400 py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startOfMonth(cursor).getDay() }).map((_, i) => <div key={`e${i}`} />)}
            {eachDayOfInterval({ start: startOfMonth(cursor), end: endOfMonth(cursor) }).map(day => {
              const list = forDay(day);
              const emer = list.some(isEmergency);
              const isToday = isSameDay(day, today);
              const isSel = selected && isSameDay(day, selected);
              return (
                <button key={ds(day)} onClick={() => setSelected(day)}
                  className={`min-h-[52px] p-1 rounded-lg flex flex-col items-center gap-1 border transition-colors ${isSel ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500/30' : isToday ? 'border-blue-200 bg-blue-50/40' : 'border-slate-100 hover:bg-slate-50'}`}>
                  <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-blue-600 text-white' : 'text-slate-600'}`}>{format(day, 'd')}</span>
                  {list.length > 0 && (
                    <span className={`text-[10px] font-semibold px-1.5 rounded-full ${emer ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{list.length}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected day's jobs beneath the calendar */}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-sm font-semibold text-slate-800 mb-2">{selected ? format(selected, 'EEEE, MMMM d') : 'Select a day'}</p>
            <div className="space-y-2">
              {(selected ? forDay(selected) : []).length === 0
                ? <p className="text-sm text-slate-400 py-4 text-center">No jobs scheduled</p>
                : forDay(selected).map(j => <JobRow key={j.id} job={j} navigate={navigate} />)}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function Agenda({ visible, todayStr, navigate }) {
  const upcoming = visible
    .filter(j => j.scheduled_date >= todayStr)
    .sort((a, b) => (a.scheduled_date + (a.scheduled_time || '99')).localeCompare(b.scheduled_date + (b.scheduled_time || '99')));
  if (upcoming.length === 0) return <Card className="p-8 text-center text-slate-400">No upcoming jobs</Card>;

  const groups = [];
  let cur = null;
  for (const j of upcoming) {
    if (!cur || cur.date !== j.scheduled_date) { cur = { date: j.scheduled_date, items: [] }; groups.push(cur); }
    cur.items.push(j);
  }
  const label = (dstr) => {
    const d = new Date(dstr + 'T00:00:00');
    const t = new Date(); const tm = new Date(); tm.setDate(tm.getDate() + 1);
    if (dstr === todayStr) return 'Today';
    if (isSameDay(d, tm)) return 'Tomorrow';
    return format(d, 'EEEE, MMM d');
  };

  return (
    <div className="space-y-4">
      {groups.map(g => (
        <div key={g.date}>
          <p className="text-sm font-bold text-slate-700 mb-2 px-1">{label(g.date)} <span className="text-xs font-normal text-slate-400">· {g.items.length}</span></p>
          <div className="space-y-2">
            {g.items.map(j => <JobRow key={j.id} job={j} navigate={navigate} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
