import { useEffect, useState } from 'react';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, Btn, Empty, SkeletonPage } from '../components/UI';
import {
  Bot, Play, CheckCircle2, XCircle, AlertTriangle, MinusCircle,
  RefreshCw, Clock, ShieldCheck, Database, Image as ImageIcon, Plug, ListChecks,
} from 'lucide-react';
import toast from 'react-hot-toast';

const STATUS = {
  pass: { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', ring: 'border-emerald-200', label: 'Pass' },
  warn: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', ring: 'border-amber-200', label: 'Warning' },
  fail: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', ring: 'border-red-200', label: 'Failed' },
  skip: { icon: MinusCircle, color: 'text-slate-400', bg: 'bg-slate-50', ring: 'border-slate-200', label: 'Skipped' },
};
const GROUP_ICON = {
  System: Database,
  Persistence: ImageIcon,
  Portals: ShieldCheck,
  Integrations: Plug,
  Integrity: ListChecks,
};

function when(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function SystemCheck() {
  const [report, setReport] = useState(null);
  const [hist, setHist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  function loadHistory() { api.get('/diagnostics/history').then(r => setHist(r.data || [])).catch(() => {}); }
  useEffect(() => {
    Promise.all([
      api.get('/diagnostics/latest').then(r => setReport(r.data)).catch(() => {}),
      api.get('/diagnostics/history').then(r => setHist(r.data || [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  async function runSweep() {
    setRunning(true);
    const t = toast.loading('Claude Mechanical Bot is sweeping the app…');
    try {
      const { data } = await api.post('/diagnostics/run');
      setReport(data);
      loadHistory();
      toast.success(data.ok ? 'All clear — everything checks out' : `${data.summary.failed} problem(s) found`, { id: t });
    } catch (e) {
      toast.error(e.response?.data?.error || 'The sweep could not finish', { id: t });
    } finally { setRunning(false); }
  }

  async function openReport(id) {
    try { const { data } = await api.get(`/diagnostics/report/${id}`); setReport(data); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    catch { toast.error('Could not open that report'); }
  }

  if (loading) return <SkeletonPage stats={4} rows={6} />;

  const groups = report ? [...new Set(report.checks.map(c => c.group))] : [];
  const overall = report ? (report.status || (report.ok ? 'pass' : 'fail')) : null;
  const banner = overall === 'pass'
    ? { bg: 'bg-emerald-50', ring: 'border-emerald-200', color: 'text-emerald-800', icon: CheckCircle2, iconColor: 'text-emerald-600', title: 'Everything is running properly', sub: 'All checks passed.' }
    : overall === 'warn'
      ? { bg: 'bg-amber-50', ring: 'border-amber-200', color: 'text-amber-800', icon: AlertTriangle, iconColor: 'text-amber-600', title: 'Running, with a few warnings', sub: 'Nothing failed, but some things are worth a look.' }
      : { bg: 'bg-red-50', ring: 'border-red-200', color: 'text-red-800', icon: XCircle, iconColor: 'text-red-600', title: 'Problems found', sub: 'One or more checks failed — see the details below.' };

  return (
    <div className="animate-fade-in max-w-4xl mx-auto pb-8">
      <PageHeader title="Claude Mechanical Bot" subtitle="Automatic health checks across the whole app" icon={<Bot size={20} />}>
        <Btn onClick={runSweep} loading={running} disabled={running}>
          {running ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
          {running ? 'Sweeping…' : 'Run sweep now'}
        </Btn>
      </PageHeader>

      {!report ? (
        <Card className="p-8">
          <Empty icon={<Bot size={28} />} title="No sweep has run yet"
            message="Tap “Run sweep now” and the bot will check the database, uploads, every portal, and more — then tell you if anything is wrong. It also runs on its own every 2 days."
            action={<Btn onClick={runSweep} loading={running}><Play size={16} /> Run the first sweep</Btn>} />
        </Card>
      ) : (
        <>
          {/* Overall banner */}
          <div className={`rounded-2xl border ${banner.ring} ${banner.bg} p-5 mb-5 flex items-start gap-4`}>
            <banner.icon className={`${banner.iconColor} shrink-0`} size={32} />
            <div className="min-w-0 flex-1">
              <h2 className={`text-lg font-bold ${banner.color}`}>{banner.title}</h2>
              <p className={`text-sm ${banner.color} opacity-80`}>{banner.sub}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1"><Clock size={12} /> {when(report.at)}</span>
                <span>{report.trigger === 'scheduled' ? 'Automatic run' : 'Manual run'}</span>
                <span>{(report.durationMs / 1000).toFixed(1)}s</span>
              </div>
            </div>
          </div>

          {/* Summary counts */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              ['Passed', report.summary.passed, 'text-emerald-600', 'bg-emerald-50'],
              ['Warnings', report.summary.warned, 'text-amber-600', 'bg-amber-50'],
              ['Failed', report.summary.failed, 'text-red-600', 'bg-red-50'],
              ['Total', report.summary.total, 'text-slate-700', 'bg-slate-50'],
            ].map(([label, val, color, bg]) => (
              <div key={label} className={`rounded-xl ${bg} p-3 text-center`}>
                <p className={`text-2xl font-bold ${color}`}>{val}</p>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
            ))}
          </div>

          {/* Checks grouped */}
          {groups.map(group => {
            const GroupIcon = GROUP_ICON[group] || ListChecks;
            const rows = report.checks.filter(c => c.group === group);
            return (
              <div key={group} className="mb-5">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <GroupIcon size={15} className="text-slate-400" />
                  <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">{group}</h3>
                </div>
                <Card className="divide-y divide-slate-100 overflow-hidden">
                  {rows.map((c, i) => {
                    const s = STATUS[c.status] || STATUS.skip;
                    const Icon = s.icon;
                    return (
                      <div key={i} className="flex items-start gap-3 p-3.5">
                        <Icon size={18} className={`${s.color} shrink-0 mt-0.5`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800">{c.name}</p>
                          {c.detail && <p className="text-xs text-slate-500 mt-0.5">{c.detail}</p>}
                        </div>
                        <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${s.bg} ${s.color} shrink-0`}>{s.label}</span>
                      </div>
                    );
                  })}
                </Card>
              </div>
            );
          })}

          {/* History */}
          {hist.length > 0 && (
            <div className="mt-8">
              <h3 className="text-sm font-bold text-slate-700 mb-2 px-1">Recent sweeps</h3>
              <Card className="divide-y divide-slate-100 overflow-hidden">
                {hist.map(h => {
                  const s = STATUS[h.status] || STATUS.skip;
                  const Icon = s.icon;
                  return (
                    <button key={h.id} onClick={() => openReport(h.id)} className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50">
                      <Icon size={16} className={`${s.color} shrink-0`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-700">{when(h.at)}</p>
                        <p className="text-xs text-slate-400">{h.trigger === 'scheduled' ? 'Automatic' : 'Manual'} · {h.summary.passed}/{h.summary.total} passed{h.summary.failed ? ` · ${h.summary.failed} failed` : ''}</p>
                      </div>
                      <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${s.bg} ${s.color}`}>{s.label}</span>
                    </button>
                  );
                })}
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
