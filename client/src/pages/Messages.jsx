import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, Btn, Spinner, Empty } from '../components/UI';
import {
  MessageSquare, Phone, PhoneMissed, PhoneIncoming, PhoneOutgoing, Voicemail,
  Send, Search, User, CheckCheck, CornerUpLeft,
} from 'lucide-react';
import toast from 'react-hot-toast';

const fmtTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(d)) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};
const prettyPhone = (p) => {
  const d = String(p || '').replace(/[^\d]/g, '').slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : (p || '—');
};
const dur = (s) => { s = Number(s) || 0; if (!s) return ''; const m = Math.floor(s / 60), r = s % 60; return m ? `${m}m ${r}s` : `${r}s`; };

export default function Messages() {
  const nav = useNavigate();
  const [tab, setTab] = useState('messages');
  const [threads, setThreads] = useState(null);
  const [calls, setCalls] = useState([]);
  const [summary, setSummary] = useState({ configured: true });
  const [active, setActive] = useState(null);   // contact string
  const [msgs, setMsgs] = useState([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [q, setQ] = useState('');
  const bottomRef = useRef(null);

  const loadLists = () => {
    api.get('/comms/threads').then(r => setThreads(r.data)).catch(() => setThreads([]));
    api.get('/comms/calls').then(r => setCalls(r.data)).catch(() => {});
    api.get('/comms/summary').then(r => setSummary(r.data)).catch(() => {});
  };
  useEffect(() => { loadLists(); const t = setInterval(loadLists, 20000); return () => clearInterval(t); }, []);

  const openThread = (contact) => {
    setActive(contact);
    api.get(`/comms/threads/${encodeURIComponent(contact)}/messages`).then(r => { setMsgs(r.data); setTimeout(() => bottomRef.current?.scrollIntoView(), 50); })
      .catch(() => setMsgs([]));
    // refresh unread counts shortly after (they get marked read on open)
    setTimeout(loadLists, 600);
  };
  const sendReply = async () => {
    const body = reply.trim(); if (!body || !active) return;
    setSending(true);
    try {
      const { data } = await api.post(`/comms/threads/${encodeURIComponent(active)}/reply`, { body });
      setMsgs(m => [...m, data]); setReply(''); setTimeout(() => bottomRef.current?.scrollIntoView(), 50); loadLists();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not send'); } finally { setSending(false); }
  };

  const shownThreads = useMemo(() => {
    const t = (threads || []); const n = q.trim().toLowerCase();
    if (!n) return t;
    return t.filter(x => [x.customer_name, x.contact, x.last_body].some(v => String(v || '').toLowerCase().includes(n)));
  }, [threads, q]);

  const activeThread = (threads || []).find(t => t.contact === active);

  if (threads === null) return <Spinner />;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Messages & Calls" subtitle="Your Quo texts and call activity, in one place" icon={<MessageSquare size={20} />} />

      {summary.configured === false && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Quo isn't connected yet — ask your admin to add the Quo webhook (see DEPLOY notes). Texts and calls will appear here once it's set up.
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {[['messages', `Messages${summary.unread ? ` (${summary.unread})` : ''}`, MessageSquare], ['calls', `Calls${summary.missed ? ` · ${summary.missed} missed` : ''}`, Phone]].map(([k, l, Icon]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3.5 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-1.5 ${tab === k ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}><Icon size={14} /> {l}</button>
        ))}
      </div>

      {tab === 'messages' ? (
        threads.length === 0 ? (
          <Empty icon={<MessageSquare size={22} />} title="No messages yet" message="Incoming and outgoing texts through your Quo number will show up here." />
        ) : (
          <div className="grid md:grid-cols-[320px_1fr] gap-4">
            {/* Thread list */}
            <Card className="overflow-hidden">
              <div className="p-3 border-b border-slate-100">
                <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search texts…" className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-400" /></div>
              </div>
              <div className="max-h-[62vh] overflow-y-auto divide-y divide-slate-100">
                {shownThreads.map(t => (
                  <button key={t.contact} onClick={() => openThread(t.contact)} className={`w-full text-left px-4 py-3 hover:bg-slate-50 ${active === t.contact ? 'bg-blue-50' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-800 text-sm truncate">{t.customer_name || prettyPhone(t.contact)}</span>
                      <span className="text-[10px] text-slate-400 shrink-0">{fmtTime(t.last_at)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="text-xs text-slate-500 truncate">{t.last_dir === 'out' ? 'You: ' : ''}{t.last_body}</span>
                      {t.unread > 0 && <span className="shrink-0 text-[10px] font-bold text-white bg-blue-600 rounded-full px-1.5 py-0.5 min-w-[18px] text-center">{t.unread}</span>}
                    </div>
                  </button>
                ))}
              </div>
            </Card>

            {/* Conversation */}
            <Card className="flex flex-col min-h-[62vh] max-h-[72vh]">
              {!active ? (
                <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Select a conversation</div>
              ) : (
                <>
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-800">{activeThread?.customer_name || prettyPhone(active)}</div>
                      <div className="text-[11px] text-slate-400">{prettyPhone(active)}</div>
                    </div>
                    {activeThread?.customer_id && <Btn size="sm" variant="outline" onClick={() => nav(`/customers/${activeThread.customer_id}`)}><User size={13} /> Customer</Btn>}
                  </div>
                  <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5 bg-slate-50/50">
                    {msgs.map(m => (
                      <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${m.direction === 'out' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'}`}>
                          <div className="whitespace-pre-wrap break-words">{m.body}</div>
                          <div className={`text-[10px] mt-1 ${m.direction === 'out' ? 'text-blue-100' : 'text-slate-400'}`}>{fmtTime(m.at)}{m.direction === 'out' && <CheckCheck size={11} className="inline ml-1 -mt-0.5" />}</div>
                        </div>
                      </div>
                    ))}
                    <div ref={bottomRef} />
                  </div>
                  <div className="p-3 border-t border-slate-100 flex items-end gap-2">
                    <textarea value={reply} onChange={e => setReply(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                      rows={1} placeholder="Type a reply…" className="flex-1 resize-none text-sm border border-slate-300 rounded-xl px-3 py-2.5 outline-none focus:border-blue-400 max-h-28" />
                    <Btn onClick={sendReply} loading={sending} disabled={!reply.trim()}><Send size={15} /></Btn>
                  </div>
                </>
              )}
            </Card>
          </div>
        )
      ) : (
        calls.length === 0 ? (
          <Empty icon={<Phone size={22} />} title="No calls yet" message="Calls through your Quo number — answered, missed, and voicemail — will show up here." />
        ) : (
          <Card>
            <div className="divide-y divide-slate-100">
              {calls.map(c => {
                const inbound = c.direction === 'in';
                const Icon = c.status === 'voicemail' ? Voicemail : c.status === 'missed' ? PhoneMissed : inbound ? PhoneIncoming : PhoneOutgoing;
                const color = c.status === 'missed' ? 'text-red-500' : c.status === 'voicemail' ? 'text-violet-500' : inbound ? 'text-emerald-500' : 'text-blue-500';
                return (
                  <div key={c.id} className="flex items-center gap-3 px-5 py-3">
                    <Icon size={18} className={`${color} shrink-0`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-800">{c.customer_name || prettyPhone(c.contact)}</div>
                      <div className="text-[11px] text-slate-500">
                        {c.status === 'missed' ? 'Missed' : c.status === 'voicemail' ? 'Voicemail' : inbound ? 'Incoming' : 'Outgoing'}
                        {c.duration ? ` · ${dur(c.duration)}` : ''} · {fmtTime(c.at)}
                      </div>
                    </div>
                    {c.status === 'missed' && (c.returned
                      ? <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full inline-flex items-center gap-1"><CornerUpLeft size={11} /> Returned</span>
                      : <span className="text-[10px] font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">Needs callback</span>)}
                    {(c.recording_url || c.voicemail_url) && (
                      <a href={c.voicemail_url || c.recording_url} target="_blank" rel="noopener" className="text-[11px] text-blue-600 hover:text-blue-700 font-medium">Listen</a>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )
      )}
    </div>
  );
}
