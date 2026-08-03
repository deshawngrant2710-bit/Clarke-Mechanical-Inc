import { useOffline } from '../context/OfflineContext';
import { WifiOff, RefreshCw, AlertTriangle, UploadCloud, CheckCircle2 } from 'lucide-react';

// Thin status strip. Hidden when everything is online and synced.
export default function OfflineBanner() {
  const o = useOffline();
  if (!o) return null;
  const { online, pending, failed, syncing } = o;
  if (online && pending === 0 && failed === 0 && !syncing) return null;

  let cls, icon, text, showRetry = false;
  if (!online) {
    cls = 'bg-slate-800 text-white';
    icon = <WifiOff size={14} />;
    text = pending > 0
      ? `Offline — ${pending} change${pending === 1 ? '' : 's'} saved on this device`
      : 'Offline — your work is saved on this device';
  } else if (syncing) {
    cls = 'bg-blue-600 text-white';
    icon = <UploadCloud size={14} className="animate-pulse" />;
    text = `Syncing${pending ? ` ${pending} change${pending === 1 ? '' : 's'}` : ''}…`;
  } else if (failed > 0) {
    cls = 'bg-red-600 text-white';
    icon = <AlertTriangle size={14} />;
    text = `${failed} change${failed === 1 ? '' : 's'} didn't sync`;
    showRetry = true;
  } else if (pending > 0) {
    cls = 'bg-amber-500 text-white';
    icon = <RefreshCw size={14} />;
    text = `${pending} change${pending === 1 ? '' : 's'} waiting to sync`;
    showRetry = true;
  } else {
    cls = 'bg-emerald-600 text-white';
    icon = <CheckCircle2 size={14} />;
    text = 'All changes synced';
  }

  return (
    <div className={`${cls} text-xs sm:text-sm font-medium px-4 py-1.5 flex items-center justify-center gap-2`}>
      {icon}<span>{text}</span>
      {showRetry && <button onClick={o.retryFailed} className="underline underline-offset-2 ml-1">Tap to retry</button>}
    </div>
  );
}
