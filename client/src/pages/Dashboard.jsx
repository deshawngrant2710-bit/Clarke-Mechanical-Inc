import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { StatCard, Card, CardHeader, Badge, Avatar, SkeletonPage, Btn } from '../components/UI';

// Open today's stops as a multi-stop route in Google Maps.
function openRoute(jobs) {
  const stops = (jobs || []).filter(j => j.address).map(j => encodeURIComponent(j.address));
  if (stops.length) window.open(`https://www.google.com/maps/dir/${stops.join('/')}`, '_blank', 'noreferrer');
}
import { DonutChart, AreaChart } from '../components/Charts';
import {
  Users, Briefcase, DollarSign, AlertTriangle,
  Clock, Receipt, TrendingUp, CalendarDays, UserPlus, FilePlus,
  Wrench, ArrowRight, Zap, Star, CheckCircle, Timer, MapPin, Navigation, MessagesSquare,
} from 'lucide-react';
import { directionsLink } from '../lib/geo';
import Logo from '../components/Logo';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../context/AuthContext';

const STATUS_COLORS = {
  scheduled: '#3b82f6', 'in-progress': '#8b5cf6', pending: '#f59e0b',
  completed: '#10b981', cancelled: '#94a3b8', emergency: '#ef4444',
};

const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function QuickAction({ icon, label, onClick, color }) {
  return (
    <button onClick={onClick}
      className="group flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 hover:-translate-y-0.5 transition-all duration-200">
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${color} group-hover:scale-110 transition-transform`}>{icon}</span>
      <span className="text-xs font-medium text-slate-600 group-hover:text-slate-900 text-center leading-tight">{label}</span>
    </button>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    api.get('/dashboard').then(r => setData(r.data)).catch(console.error);
  }, []);

  if (!data) return <SkeletonPage stats={data?.scope === 'technician' ? 4 : 8} />;

  if (data.scope === 'technician') return <TechnicianDashboard data={data} navigate={navigate} name={user?.name} />;

  const na = data.needsAttention || {};
  const naItems = [
    { label: 'Unassigned jobs', count: na.unassignedJobs, to: '/jobs', Icon: Briefcase },
    { label: 'Overdue invoices', count: na.overdueInvoices, to: '/invoices', Icon: AlertTriangle },
    { label: 'Pending estimates', count: na.pendingQuotes, to: '/quotes', Icon: Receipt },
    { label: 'New service requests', count: na.newRequests, to: '/jobs', Icon: Zap },
    { label: 'Waiting live chats', count: na.waitingChats, to: '/support', Icon: MessagesSquare },
    { label: 'Cash payment requests', count: na.cashRequests, to: '/invoices', Icon: DollarSign },
  ].filter(i => i.count > 0);

  const donutData = data.jobsByStatus
    .filter(s => s.count > 0)
    .map(s => ({ label: s.status.replace('-', ' '), value: s.count, color: STATUS_COLORS[s.status] || '#94a3b8' }));

  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <div className="flex items-center justify-between mb-6 bg-white rounded-2xl border border-slate-200 shadow-[var(--shadow-sm)] px-6 py-5 relative overflow-hidden">
        <div className="absolute -right-10 -top-16 w-64 h-64 rounded-full bg-gradient-to-br from-blue-500/5 to-transparent blur-2xl" />
        <div className="flex items-center gap-4 relative">
          <Logo variant="full" height={50} />
        </div>
        <div className="text-right relative">
          <p className="text-sm font-semibold text-slate-700">Command Center</p>
          <p className="text-xs text-slate-400">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
        </div>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard label="Total Customers" value={data.totalCustomers} icon={<Users size={18} />} color="blue" onClick={() => navigate('/customers')} />
        <StatCard label="Open Jobs" value={data.openJobs} icon={<Briefcase size={18} />} color="orange" sub={`${data.totalJobs} all-time`} onClick={() => navigate('/jobs')} />
        <StatCard label="Today's Jobs" value={data.todayJobs} icon={<CalendarDays size={18} />} color="purple" sub={`${data.completedToday} completed`} onClick={() => navigate('/schedule')} />
        <StatCard label="Monthly Revenue" value={data.monthlyRevenue} prefix="$" decimals={0} icon={<TrendingUp size={18} />} color="green" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Revenue Collected" value={data.totalRevenue} prefix="$" decimals={2} icon={<DollarSign size={18} />} color="green" />
        <StatCard label="Pending Revenue" value={data.pendingRevenue} prefix="$" decimals={2} icon={<Clock size={18} />} color="blue" />
        <StatCard label="Avg. Ticket" value={data.avgTicket} prefix="$" decimals={2} icon={<Receipt size={18} />} color="purple" />
        <StatCard label="Outstanding" value={data.outstandingAmount} prefix="$" decimals={2} icon={<AlertTriangle size={18} />} color="red" sub={`${data.overdueInvoices} overdue`} onClick={() => navigate('/invoices')} />
      </div>

      {naItems.length > 0 && (
        <Card className="p-5 mb-6">
          <div className="flex items-center gap-2 mb-3"><AlertTriangle size={16} className="text-amber-500" /><h2 className="text-card-title text-slate-800">Needs attention</h2></div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {naItems.map(i => (
              <button key={i.label} onClick={() => navigate(i.to)} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 text-left transition-colors">
                <span className="flex items-center gap-2 text-sm text-slate-700"><i.Icon size={15} className="text-slate-400" /> {i.label}</span>
                <span className="min-w-6 h-6 px-1.5 flex items-center justify-center rounded-full bg-amber-100 text-amber-700 text-xs font-bold">{i.count}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Charts row */}
      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-card-title text-slate-800">Revenue Trend</h2>
              <p className="text-xs text-slate-400">Collected revenue · last 6 months</p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">
              <TrendingUp size={14} /> {money(data.totalRevenue)}
            </span>
          </div>
          <AreaChart data={data.revenueByMonth} />
        </Card>

        <Card className="p-5">
          <h2 className="text-card-title text-slate-800 mb-4">Jobs by Status</h2>
          {donutData.length > 0
            ? <DonutChart data={donutData} />
            : <p className="text-sm text-slate-400 py-10 text-center">No jobs yet</p>}
        </Card>
      </div>

      {/* Quick actions */}
      <Card className="p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Zap size={16} className="text-blue-500" />
          <h2 className="text-card-title text-slate-800">Quick Actions</h2>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          <QuickAction icon={<UserPlus size={18} />} label="New Customer" color="bg-blue-50 text-blue-600" onClick={() => navigate('/customers')} />
          <QuickAction icon={<Wrench size={18} />} label="New Job" color="bg-orange-50 text-orange-600" onClick={() => navigate('/jobs?new=1')} />
          <QuickAction icon={<FilePlus size={18} />} label="New Invoice" color="bg-emerald-50 text-emerald-600" onClick={() => navigate('/invoices')} />
          <QuickAction icon={<Receipt size={18} />} label="New Quote" color="bg-violet-50 text-violet-600" onClick={() => navigate('/quotes')} />
          <QuickAction icon={<CalendarDays size={18} />} label="Schedule" color="bg-cyan-50 text-cyan-600" onClick={() => navigate('/schedule')} />
          <QuickAction icon={<Users size={18} />} label="Team" color="bg-rose-50 text-rose-600" onClick={() => navigate('/employees')} />
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Today's schedule */}
        <Card className="lg:col-span-2">
          <CardHeader title="Today's Schedule" icon={<CalendarDays size={16} />}
            action={<button onClick={() => navigate('/schedule')} className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1">View calendar <ArrowRight size={12} /></button>} />
          <div className="divide-y divide-slate-100">
            {data.todaysSchedule.length === 0 && (
              <p className="text-sm text-slate-400 p-6 text-center">No jobs scheduled for today</p>
            )}
            {data.todaysSchedule.map(job => (
              <div key={job.id} onClick={() => navigate(`/jobs/${job.id}`)}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-blue-50/40 cursor-pointer transition-colors">
                <div className="w-14 text-center shrink-0">
                  <p className="text-sm font-bold text-slate-800">{job.scheduled_time || '—'}</p>
                </div>
                <div className="w-px h-9 bg-slate-200" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{job.title}</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1 truncate">
                    {job.customer_name || 'No customer'}
                    {job.technician_name && <> · <Wrench size={10} /> {job.technician_name}</>}
                  </p>
                </div>
                <Badge status={job.status} />
              </div>
            ))}
          </div>
        </Card>

        {/* Technician status */}
        <Card>
          <CardHeader title="Technicians" icon={<Users size={16} />} />
          <div className="p-3 space-y-1">
            {data.technicians.length === 0 && <p className="text-sm text-slate-400 p-4 text-center">No technicians</p>}
            {data.technicians.map(t => {
              const online = t.active_jobs > 0;
              const busy = t.today_jobs > 0;
              const state = online ? { c: 'bg-violet-500', l: 'Working' } : busy ? { c: 'bg-emerald-500', l: 'Available' } : { c: 'bg-slate-300', l: 'Off duty' };
              return (
                <div key={t.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-50">
                  <div className="relative">
                    <Avatar name={t.name} className="w-9 h-9 text-xs" />
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${state.c} ${online ? 'animate-[pulse-ring_2s_infinite]' : ''}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{t.name}</p>
                    <p className="text-xs text-slate-400 capitalize">{state.l} · {t.today_jobs} today</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Customer reviews */}
      <Card className="mt-6">
        <CardHeader title="Customer Reviews" icon={<Star size={16} />}
          action={data.reviewCount > 0 && (
            <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <Star size={15} className="fill-amber-400 text-amber-400" /> {data.avgRating.toFixed(1)}
              <span className="text-slate-400 font-normal">· {data.reviewCount} review{data.reviewCount !== 1 ? 's' : ''}</span>
            </span>
          )} />
        {(!data.recentReviews || data.recentReviews.length === 0) ? (
          <p className="text-sm text-slate-400 p-6 text-center">No reviews yet — customers can rate completed services from their portal.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.recentReviews.map(r => (
              <div key={r.id} className="px-5 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-800">{r.customer_name}</p>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map(n => <Star key={n} size={13} className={n <= r.rating ? 'fill-amber-400 text-amber-400' : 'fill-slate-200 text-slate-200'} />)}
                  </div>
                </div>
                <p className="text-xs text-slate-400">{r.job_title}</p>
                {r.comment && <p className="text-sm text-slate-600 mt-1 italic">"{r.comment}"</p>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ================================================================== */
/*  Technician dashboard — scoped to their own work only               */
/* ================================================================== */
function TechnicianDashboard({ data, navigate, name }) {
  const first = (name || 'there').split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const JobRow = ({ job, showDate }) => (
    <div onClick={() => navigate(`/jobs/${job.id}`)}
      className="flex items-center gap-4 px-5 py-3.5 hover:bg-blue-50/40 cursor-pointer transition-colors">
      <div className="w-16 text-center shrink-0">
        {showDate
          ? <><p className="text-[10px] font-semibold text-slate-400 uppercase">{job.scheduled_date ? new Date(job.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' }) : ''}</p>
              <p className="text-lg font-bold text-slate-700 leading-none">{job.scheduled_date ? new Date(job.scheduled_date + 'T00:00:00').getDate() : '—'}</p></>
          : <p className="text-sm font-bold text-slate-800">{job.scheduled_time || '—'}</p>}
      </div>
      <div className="w-px h-9 bg-slate-200" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{job.title}</p>
        <p className="text-xs text-slate-500 flex items-center gap-1 truncate">
          {job.customer_name || 'No customer'}{job.address && <> · <MapPin size={10} /> {job.address}</>}
        </p>
      </div>
      {job.address && (
        <a
          href={directionsLink(job.address)}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="Get directions"
          className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition-colors"
        >
          <Navigation size={13} /> <span className="hidden sm:inline">Directions</span>
        </a>
      )}
      <Badge status={job.status} />
    </div>
  );

  return (
    <div className="animate-fade-in">
      <PageHeader title={`${greeting}, ${first}`} subtitle="Here's your day at a glance" icon={<Wrench size={20} />}>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${data.onShift ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          <span className={`w-2 h-2 rounded-full ${data.onShift ? 'bg-emerald-500 animate-[pulse-ring_2s_infinite]' : 'bg-slate-400'}`} />
          {data.onShift ? 'On the clock' : 'Off the clock'}
        </span>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Today's Jobs" value={data.todayJobs} icon={<CalendarDays size={18} />} color="blue" />
        <StatCard label="Open Jobs" value={data.openJobs} icon={<Briefcase size={18} />} color="orange" sub={data.emergencyJobs ? `${data.emergencyJobs} urgent` : ''} />
        <StatCard label="Completed Today" value={data.completedToday} icon={<CheckCircle size={18} />} color="green" sub={`${data.completedJobs} all-time`} />
        <StatCard label="Hours Today" value={data.hoursToday} decimals={1} icon={<Timer size={18} />} color="purple" sub={`${data.hoursThisWeek}h this week`} />
      </div>

      <Card className="p-5 mb-6">
        <div className="flex items-center gap-2 mb-4"><Zap size={16} className="text-blue-500" /><h2 className="text-card-title text-slate-800">Quick Actions</h2></div>
        <div className="grid grid-cols-3 gap-3">
          <QuickAction icon={<Clock size={18} />} label="Time Clock" color="bg-emerald-50 text-emerald-600" onClick={() => navigate('/time-clock')} />
          <QuickAction icon={<CalendarDays size={18} />} label="My Schedule" color="bg-blue-50 text-blue-600" onClick={() => navigate('/schedule')} />
          <QuickAction icon={<Briefcase size={18} />} label="All My Jobs" color="bg-orange-50 text-orange-600" onClick={() => navigate('/jobs')} />
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Today's Schedule" icon={<CalendarDays size={16} />}
            action={data.todaysSchedule.some(j => j.address) && (
              <Btn size="sm" variant="outline" onClick={() => openRoute(data.todaysSchedule)}><MapPin size={14} /> Route</Btn>
            )} />
          <div className="divide-y divide-slate-100">
            {data.todaysSchedule.length === 0
              ? <p className="text-sm text-slate-400 p-6 text-center">No jobs scheduled for today 🎉</p>
              : data.todaysSchedule.map(j => <JobRow key={j.id} job={j} />)}
          </div>
        </Card>

        <Card>
          <CardHeader title="Upcoming Jobs" icon={<ArrowRight size={16} />} />
          <div className="divide-y divide-slate-100">
            {data.upcomingJobs.length === 0
              ? <p className="text-sm text-slate-400 p-6 text-center">Nothing upcoming</p>
              : data.upcomingJobs.map(j => <JobRow key={j.id} job={j} showDate />)}
          </div>
        </Card>
      </div>
    </div>
  );
}
