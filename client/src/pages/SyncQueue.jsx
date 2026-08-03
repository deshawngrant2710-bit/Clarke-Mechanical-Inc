import { useOffline } from '../context/OfflineContext';
import PageHeader from '../components/PageHeader';
import { RefreshCw, WifiOff, CheckCircle2, AlertTriangle, Clock, Trash2, UploadCloud } from 'lucide-react';

function describe(it) {
  const u = it.url || '';
  const d = it.data || {};
  const m = (it.method || '').toLowerCase();
  if (/\/jobs\/[^/]+\/parts$/.test(u)) return `Add part${d.name ? `: ${d.name}` : ''}`;
  if (/\/jobs\/[^/]+\/photos$/.test(u)) return 'Upload photo';
  if (/\/jobs\/[^/]+\/signoff$/.test(u)) return 'Customer signature';
  if (/\/jobs\/[^/]+$/.test(u) && m === 'put') {
    if ('status' in d) return `Status → ${d.status}`;
    if ('notes' in d) return 'Update notes';
    if ('work_started_at' in d) return 'Start job';
    if ('work_ended_at' in d) return 'Mark work done';
    return 'Update job';
  }
  if (/\/inspections/.test(u)) return 'Inspection';
  if (/\/time\//.test(u)) return 'Time entry';
  return `${it.method} ${u}`;
}
const jobId = (u) => (u.match(/\/jobs\/([^/]+)/) || [])[1];

const CHIP = {
  pending: { cls: 'bg-amber-100 text-amber-700', icon: <Clock size={12} />, label: 'Waiting' },
  syncing: { cls: 'bg-blue-100 text-blue-700', icon: <UploadCloud size={12} />, label: 'Syncing' },
  failed: { cls: 'bg-red-100 text-red-700', icon: <AlertTriangle size={12} />, label: 'Failed' },
  conflict: { cls: 'bg-purple-100 text-purple-700', icon: <AlertTriangle size={12} />, label: 'Conflict' },
};

export default function SyncQueue() {
  const o = useOffline();
  const items = o?.items || [];

  return (
    <div className="animate-fade-in max-w-2xl mx-auto">
      <PageHeader title="Sync" subtitle="Changes waiting to reach the server" icon={<RefreshCw size={20} />} />

      <div className={`mb-4 flex items-center gap-2 text-sm px-3 py-2 rounded-xl ${o?.online ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
        {o?.online ? <CheckCircle2 size={16} /> : <WifiOff size={16} />}
        {o?.online ? 'Connected' : 'Offline — changes are saved on this device'}
        <span className="ml-auto flex gap-2">
          {o?.failed > 0 && <button onClick={o.retryFailed} className="text-blue-600 font-medium">Retry all</button>}
          {o?.pending > 0 && o?.online && <button onClick={o.sync} className="text-blue-600 font-medium">Sync now</button>}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-500" />
          <p className="font-medium text-slate-600">Everything is synced</p>
          <p className="text-sm">No pending changes on this device.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(it => {
            const chip = CHIP[it.status] || CHIP.pending;
            const jid = jobId(it.url || '');
            return (
              <div key={it.opId} className="bg-white border border-slate-200 rounded-xl p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">{describe(it)}</p>
                    <p className="text-xs text-slate-400">
                      {jid ? `Job ${jid.slice(0, 8).toUpperCase()} · ` : ''}{new Date(it.createdAt).toLocaleString()}
                    </p>
                    {it.error && <p className="text-xs text-red-600 mt-0.5">{it.error}</p>}
                  </div>
                  <span className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${chip.cls}`}>
                    {chip.icon} {chip.label}
                  </span>
                </div>

                {(it.status === 'failed' || it.status === 'conflict') && (
                  <div className="flex items-center gap-2 mt-3">
                    {it.status === 'conflict' ? (
                      <>
                        <button onClick={() => o.forceItem(it.opId)} className="text-xs font-semibold text-white bg-purple-600 px-3 py-1.5 rounded-lg">Keep mine</button>
                        <button onClick={() => o.discardItem(it.opId)} className="text-xs font-medium text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg">Keep server version</button>
                      </>
                    ) : (
                      <>
                        <button onClick={o.retryFailed} className="text-xs font-semibold text-white bg-blue-600 px-3 py-1.5 rounded-lg">Retry</button>
                        <button onClick={() => o.discardItem(it.opId)} className="inline-flex items-center gap-1 text-xs font-medium text-red-600 border border-red-200 px-3 py-1.5 rounded-lg"><Trash2 size={13} /> Discard</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
