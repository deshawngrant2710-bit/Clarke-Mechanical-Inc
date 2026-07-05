import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, Badge, Btn, Avatar, Spinner } from '../components/UI';
import { ChevronLeft, ChevronRight, Plus, Calendar as CalIcon, MapPin, Clock } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from 'date-fns';

const DOT = {
  emergency: 'bg-red-500', urgent: 'bg-red-500',
  'in-progress': 'bg-violet-500', scheduled: 'bg-blue-500',
  pending: 'bg-amber-500', completed: 'bg-emerald-500', cancelled: 'bg-slate-400',
};
const jobColor = (j) => DOT[j.priority === 'urgent' ? 'urgent' : j.status] || 'bg-blue-500';

export default function Schedule() {
  const [jobs, setJobs] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selected, setSelected] = useState(new Date());
  const navigate = useNavigate();

  useEffect(() => { api.get('/jobs').then(r => setJobs(r.data)); }, []);
  if (!jobs) return <Spinner />;

  const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
  const firstDayOfWeek = startOfMonth(currentMonth).getDay();
  const jobsForDay = (day) => jobs.filter(j => j.scheduled_date && isSameDay(new Date(j.scheduled_date + 'T00:00:00'), day));
  const selectedJobs = selected ? jobsForDay(selected) : [];
  const today = new Date();
  const upcoming = jobs
    .filter(j => j.scheduled_date && new Date(j.scheduled_date + 'T00:00:00') >= new Date(today.toDateString()))
    .sort((a, b) => (a.scheduled_date + (a.scheduled_time || '')).localeCompare(b.scheduled_date + (b.scheduled_time || '')))
    .slice(0, 5);

  const legend = [
    ['Scheduled', 'bg-blue-500'], ['In Progress', 'bg-violet-500'],
    ['Pending', 'bg-amber-500'], ['Completed', 'bg-emerald-500'], ['Emergency', 'bg-red-500'],
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader title="Schedule" subtitle="Dispatch calendar & job planning" icon={<CalIcon size={20} />}>
        <Btn onClick={() => navigate('/jobs?new=1')}><Plus size={16} /> New Job</Btn>
      </PageHeader>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-section-title text-slate-800">{format(currentMonth, 'MMMM yyyy')}</h2>
              <div className="flex items-center gap-1">
                <button onClick={() => { setCurrentMonth(new Date()); setSelected(new Date()); }}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Today</button>
                <button onClick={() => setCurrentMonth(m => subMonths(m, 1))} className="p-2 hover:bg-slate-100 rounded-lg transition-colors"><ChevronLeft size={18} /></button>
                <button onClick={() => setCurrentMonth(m => addMonths(m, 1))} className="p-2 hover:bg-slate-100 rounded-lg transition-colors"><ChevronRight size={18} /></button>
              </div>
            </div>

            <div className="grid grid-cols-7 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} className="text-center text-xs font-semibold text-slate-400 py-1">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e${i}`} />)}
              {days.map(day => {
                const dayJobs = jobsForDay(day);
                const isToday = isSameDay(day, today);
                const isSelected = selected && isSameDay(day, selected);
                return (
                  <button key={day.toISOString()} onClick={() => setSelected(day)}
                    className={`min-h-[76px] p-1.5 rounded-xl text-left border transition-all duration-150 ${
                      isSelected ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20'
                      : isToday ? 'border-blue-200 bg-blue-50/40'
                      : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}>
                    <p className={`text-xs font-bold mb-1 w-5 h-5 flex items-center justify-center rounded-full ${isToday ? 'bg-blue-600 text-white' : 'text-slate-600'}`}>
                      {format(day, 'd')}
                    </p>
                    <div className="space-y-0.5">
                      {dayJobs.slice(0, 2).map(j => (
                        <div key={j.id} className="flex items-center gap-1 text-[10px] leading-tight">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${jobColor(j)}`} />
                          <span className="truncate text-slate-600">{j.title}</span>
                        </div>
                      ))}
                      {dayJobs.length > 2 && <p className="text-[10px] text-slate-400 pl-2.5">+{dayJobs.length - 2} more</p>}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-slate-100">
              {legend.map(([label, color]) => (
                <span key={label} className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className={`w-2 h-2 rounded-full ${color}`} />{label}
                </span>
              ))}
            </div>
          </Card>
        </div>

        {/* Side panel */}
        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="text-card-title text-slate-800 mb-1">{selected ? format(selected, 'EEEE, MMMM d') : 'Select a day'}</h3>
            <p className="text-xs text-slate-400 mb-4">{selectedJobs.length} job{selectedJobs.length !== 1 ? 's' : ''} scheduled</p>
            {selectedJobs.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">No jobs scheduled</p>
            ) : (
              <div className="space-y-2.5">
                {selectedJobs.map(job => (
                  <div key={job.id} onClick={() => navigate(`/jobs/${job.id}`)}
                    className="p-3 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/40 cursor-pointer transition-all">
                    <div className="flex justify-between items-start gap-2 mb-1.5">
                      <p className="text-sm font-semibold text-slate-800">{job.title}</p>
                      <Badge status={job.status} />
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                      {job.scheduled_time && <span className="flex items-center gap-1"><Clock size={11} />{job.scheduled_time}</span>}
                      {job.customer_name && <span className="flex items-center gap-1"><MapPin size={11} />{job.customer_name}</span>}
                      {job.technician_name && <span className="flex items-center gap-1"><Avatar name={job.technician_name} className="w-4 h-4 text-[7px]" />{job.technician_name}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="text-card-title text-slate-800 mb-4">Upcoming Jobs</h3>
            {upcoming.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">Nothing upcoming</p>
            ) : (
              <div className="space-y-3">
                {upcoming.map(job => (
                  <div key={job.id} onClick={() => navigate(`/jobs/${job.id}`)}
                    className="flex items-center gap-3 cursor-pointer group">
                    <div className="w-11 shrink-0 text-center">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase">{format(new Date(job.scheduled_date + 'T00:00:00'), 'MMM')}</p>
                      <p className="text-lg font-bold text-slate-700 leading-none">{format(new Date(job.scheduled_date + 'T00:00:00'), 'd')}</p>
                    </div>
                    <div className="flex-1 min-w-0 border-l border-slate-100 pl-3">
                      <p className="text-sm font-medium text-slate-800 truncate group-hover:text-blue-600 transition-colors">{job.title}</p>
                      <p className="text-xs text-slate-400 truncate">{job.customer_name || 'No customer'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
