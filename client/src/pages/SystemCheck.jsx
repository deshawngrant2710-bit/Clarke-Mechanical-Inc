import { useEffect, useState } from 'react';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, Btn, Empty, SkeletonPage } from '../components/UI';
import {
  Bot, Play, CheckCircle2, XCircle, AlertTriangle, MinusCircle,
  RefreshCw, Clock, ShieldCheck, Database, Image as ImageIcon, Plug, ListChecks,
  Briefcase, ShieldAlert, Smartphone, Sparkles, Download,
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
  'Job walkthrough': Briefcase,
  Portals: ShieldCheck,
  Cleanup: Sparkles,
  Security: ShieldAlert,
  'Screens & buttons': Smartphone,
  Integrations: Plug,
  Integrity: ListChecks,
};

function when(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Save a text log: share sheet on phones (Files, Mail, AirDrop…), normal download on computers.
async function saveText(text, filename) {
  const blob = new Blob([text], { type: 'text/plain' });
  try {
    const file = new File([blob], filename, { type: 'text/plain' });
    const touch = typeof navigator !== 'undefined' && /iPhone|iPad|Android/i.test(navigator.userAgent || '');
    if (touch && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return;
    }
  } catch (e) { if (e?.name === 'AbortError') return; }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const fileFrom = (res, fallback) => (/filename="([^"]+)"/.exec(res.headers?.['content-disposition'] || '') || [])[1] || fallback;

export default function SystemCheck() {
  const [report, setReport] = useState(null);
  const [hist, setHist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(null);

  function loadHistory() { api.get('/diagnostics/history', { params: { limit: 168 } }).then(r => setHist(r.data || [])).catch(() => {}); }
  useEffect(() => {
    Promise.all([
      api.get('/diagnostics/latest').then(r => setReport(r.data)).catch(() => {}),
      api.get('/diagnostics/history', { params: { limit: 168 } }).then(r => setHist(r.data || [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  // Download one run's log, or every stored run (optionally only failed / all-good).
  async function downloadLog(id) {
    setSaving(id);
    try {
      const res = await api.get(`/diagnostics/report/${id}/log`, { responseType: 'text', transformResponse: x => x });
      await saveText(res.data, fileFrom(res, 'clarke-health-log.txt'));
    } catch { toast.error('Could not download that log'); }
    finally { setSaving(null); }
  }
  async function downloadAll(status) {
    setSaving('all-' + (status || ''));
    try {
      const res = await api.get('/diagnostics/logs', { params: { days: 14, ...(status ? { status } : {}) }, responseType: 'text', transformResponse: x => x });
      await saveText(res.data, fileFrom(res, 'clarke-health-logs.txt'));
    } catch { toast.error('Could not download the logs'); }
    finally { setSaving(null); }
  }

  async function runSweep() {
    setRunning(true);
    const t = toast.loading('Clarke Mechanical Bot is going through the app — this takes a minute or two…');
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
      <PageHeader title="Clarke Mechanical Bot" subtitle="Checks the whole app every 2 hours — screens, buttons, jobs, photos, portals and security" icon={<Bot size={20} />}>
        <Btn onClick={runSweep} loading={running} disabled={running}>
          {running ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
          {running ? 'Sweeping…' : 'Run sweep now'}
        </Btn>
      </PageHeader>

      {!report ? (
        <Card className="p-8">
          <Empty icon={<Bot size={28} />} title="No sweep has run yet"
            message="Tap “Run sweep now” and the bot will check the database, uploads, every portal, and more — then tell you if anything is wrong. It also runs on its own every 2 hours and alerts you if anything breaks."
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
                <span>{report.trigger === 'scheduled' ? 'Automatic 2-hour run' : 'Manual run'}</span>
                <span>{(report.durationMs / 1000).toFixed(1)}s</span>
              </div>
            </div>
            <Btn size="sm" variant="outline" className="shrink-0 whitespace-nowrap" loading={saving === report.id} onClick={() => downloadLog(report.id)}>
              <Download size={14} /> <span className="sm:hidden">Log</span><span className="hidden sm:inline">Download log</span>
            </Btn>
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

          {/* History — every run (failed or all good) can be downloaded as a log */}
          {hist.length > 0 && (
            <div className="mt-8">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2 px-1">
                <h3 className="text-sm font-bold text-slate-700">Recent sweeps <span className="font-normal text-slate-400">· last 2 weeks</span></h3>
                <div className="flex flex-wrap gap-2">
                  <Btn size="sm" variant="outline" className="whitespace-nowrap" loading={saving === 'all-'} onClick={() => downloadAll()}><Download size={14} /> All logs</Btn>
                  <Btn size="sm" variant="outline" className="whitespace-nowrap" loading={saving === 'all-fail'} onClick={() => downloadAll('fail')}><Download size={14} /> Failed only</Btn>
                  <Btn size="sm" variant="outline" className="whitespace-nowrap" loading={saving === 'all-pass'} onClick={() => downloadAll('pass')}><Download size={14} /> All good only</Btn>
                </div>
              </div>
              <Card className="divide-y divide-slate-100 overflow-hidden">
                {(showAll ? hist : hist.slice(0, 20)).map(h => {
                  const s = STATUS[h.status] || STATUS.skip;
                  const Icon = s.icon;
                  return (
                    <div key={h.id} className={`flex items-center gap-1 ${report?.id === h.id ? 'bg-slate-50' : ''}`}>
                      <button onClick={() => openReport(h.id)} className="min-w-0 flex-1 flex items-center gap-3 p-3 text-left hover:bg-slate-50">
                        <Icon size={16} className={`${s.color} shrink-0`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-slate-700">{when(h.at)}</p>
                          <p className="text-xs text-slate-400">{h.trigger === 'scheduled' ? 'Automatic' : 'Manual'} · {h.summary.passed}/{h.summary.total} passed{h.summary.failed ? ` · ${h.summary.failed} failed` : ''}</p>
                        </div>
                        <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${s.bg} ${s.color} shrink-0`}>{s.label}</span>
                      </button>
                      <button onClick={() => downloadLog(h.id)} disabled={saving === h.id} aria-label={`Download log for ${when(h.at)}`}
                        className="shrink-0 w-11 h-11 mr-1 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40">
                        {saving === h.id ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
                      </button>
                    </div>
                  );
                })}
              </Card>
              {hist.length > 20 && (
                <button onClick={() => setShowAll(v => !v)} className="mt-2 w-full min-h-[44px] text-sm font-medium text-slate-600 hover:text-slate-900">
                  {showAll ? 'Show fewer' : `Show all ${hist.length} runs`}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
