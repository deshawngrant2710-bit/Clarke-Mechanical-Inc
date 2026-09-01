import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Bell, Check } from 'lucide-react';
import api from '../api/client';

function timeAgo(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function NotificationBell({ variant = 'light' }) {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 60, left: 12 });
  const btnRef = useRef(null);
  const navigate = useNavigate();

  async function load() {
    if (typeof document !== 'undefined' && document.hidden) return; // don't poll a hidden tab
    try {
      const { data } = await api.get('/notifications');
      setItems(data.items || []);
      setUnread(data.unread || 0);
    } catch { /* ignore (e.g. role without access) */ }
  }
  useEffect(() => {
    load();
    const iv = setInterval(load, 120000); // every 2 min (keeps DB reads low)
    return () => clearInterval(iv);
  }, []);

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const width = Math.min(360, window.innerWidth - 24);
      setPos({ top: r.bottom + 6, left: Math.max(12, Math.min(r.left, window.innerWidth - width - 12)) });
      load();
    }
    setOpen(o => !o);
  }

  async function openItem(n) {
    setOpen(false);
    if (!n.read) {
      setItems(is => is.map(i => (i.id === n.id ? { ...i, read: true } : i)));
      setUnread(u => Math.max(0, u - 1));
      try { await api.post(`/notifications/${n.id}/read`); } catch { /* ignore */ }
    }
    if (n.link) navigate(n.link);
  }
  async function markAll() {
    setItems(is => is.map(i => ({ ...i, read: true })));
    setUnread(0);
    try { await api.post('/notifications/read-all'); } catch { /* ignore */ }
  }

  const btnColor = variant === 'dark' ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-slate-600 hover:bg-slate-100';

  return (
    <>
      <button ref={btnRef} onClick={toggle} className={`relative p-2 rounded-lg transition-colors ${btnColor}`} aria-label="Notifications">
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[998]" onClick={() => setOpen(false)} />
          <div className="fixed z-[999] w-[min(92vw,360px)] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-fade-in"
            style={{ top: pos.top, left: pos.left }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <p className="font-semibold text-slate-800 text-sm">Notifications</p>
              {unread > 0 && (
                <button onClick={markAll} className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"><Check size={13} /> Mark all read</button>
              )}
            </div>
            <div className="max-h-[70vh] overflow-y-auto divide-y divide-slate-100">
              {items.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-slate-400">You're all caught up 🎉</p>
              ) : items.map(n => (
                <button key={n.id} onClick={() => openItem(n)} className={`w-full text-left px-4 py-3 hover:bg-slate-50 flex gap-3 ${n.read ? '' : 'bg-blue-50/40'}`}>
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.read ? 'bg-transparent' : 'bg-blue-500'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-800">{n.title}</span>
                    {n.body && <span className="block text-xs text-slate-500 mt-0.5">{n.body}</span>}
                    <span className="block text-[11px] text-slate-400 mt-0.5">{timeAgo(n.created_at)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>, document.body)}
    </>
  );
}
