import { useEffect, useState } from 'react';
import api from '../api/client';
import { Card, CardHeader } from './UI';
import { Link2, Copy, MessageSquare, RefreshCw, Ban } from 'lucide-react';
import toast from 'react-hot-toast';

const when = (iso) => iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;

// Office tool on the Customer page: give a customer a link that opens their
// portal with no email or password. The raw link is only shown right after it's
// created (it's stored hashed); "New link" issues a fresh one and kills the old.
export default function PortalLinkCard({ customer }) {
  const [status, setStatus] = useState(null);   // { active, created_at, last_used_at, ... }
  const [url, setUrl] = useState('');           // only known right after creating
  const [busy, setBusy] = useState(false);

  const load = () => api.get(`/portal-links/customer/${customer.id}`).then(r => setStatus(r.data)).catch(() => setStatus({ active: false }));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [customer.id]);

  async function create(sms) {
    if (status?.active && !window.confirm('This turns off the customer’s current link and makes a new one. Continue?')) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/portal-links/customer/${customer.id}`, { sms });
      setUrl(data.url);
      if (sms) data.sms?.sent ? toast.success(`Link texted to ${customer.phone}`) : toast.error(data.sms?.error || 'Link created, but the text didn’t send — use Copy.');
      else toast.success('Link created');
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not create the link'); }
    finally { setBusy(false); }
  }

  async function textIt() {
    setBusy(true);
    try { await api.post(`/portal-links/customer/${customer.id}/text`, { url }); toast.success(`Link texted to ${customer.phone}`); }
    catch (e) { toast.error(e.response?.data?.error || 'Could not send the text'); }
    finally { setBusy(false); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(url); toast.success('Link copied'); }
    catch { window.prompt('Copy this link:', url); }
  }

  async function turnOff() {
    if (!window.confirm('Turn off this customer’s portal link? It will stop working immediately.')) return;
    setBusy(true);
    try { await api.delete(`/portal-links/customer/${customer.id}`); setUrl(''); toast.success('Link turned off'); load(); }
    catch { toast.error('Could not turn it off'); }
    finally { setBusy(false); }
  }

  const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50';
  return (
    <Card>
      <CardHeader title="Portal link (no password)" icon={<Link2 size={15} />} />
      <div className="p-5 space-y-3 text-sm">
        <p className="text-slate-500 text-xs">Lets this customer open their portal — invoices, quotes and jobs — by tapping a link. No email or password needed.</p>

        {status === null ? <p className="text-slate-400 text-xs">Checking…</p> : status.active ? (
          <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs text-emerald-800">
            <p className="font-semibold">Link is active</p>
            <p>Created {when(status.created_at)}{status.created_by ? ` by ${status.created_by}` : ''}</p>
            <p>{status.last_used_at ? `Last opened ${when(status.last_used_at)} · ${status.use_count} time${status.use_count === 1 ? '' : 's'}` : 'Not opened yet'}</p>
          </div>
        ) : (
          <p className="text-xs text-slate-400">No active link.</p>
        )}

        {url && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
            <p className="text-[11px] text-slate-400 mb-1">New link — copy or text it now (it won’t be shown again):</p>
            <p className="text-xs font-mono text-slate-700 break-all">{url}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <button disabled={busy} onClick={copy} className={`${btn} bg-slate-800 text-white`}><Copy size={13} /> Copy</button>
              {customer.phone && <button disabled={busy} onClick={textIt} className={`${btn} bg-blue-600 text-white`}><MessageSquare size={13} /> Text it</button>}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {customer.phone && (
            <button disabled={busy} onClick={() => create(true)} className={`${btn} bg-blue-600 text-white`}>
              <MessageSquare size={13} /> {status?.active ? 'New link & text it' : 'Create & text link'}
            </button>
          )}
          <button disabled={busy} onClick={() => create(false)} className={`${btn} border border-slate-300 text-slate-700`}>
            <RefreshCw size={13} /> {status?.active ? 'New link' : 'Create link'}
          </button>
          {status?.active && (
            <button disabled={busy} onClick={turnOff} className={`${btn} border border-red-200 text-red-600`}><Ban size={13} /> Turn off</button>
          )}
        </div>
        {!customer.phone && <p className="text-[11px] text-slate-400">Add a phone number to text the link directly.</p>}
      </div>
    </Card>
  );
}
