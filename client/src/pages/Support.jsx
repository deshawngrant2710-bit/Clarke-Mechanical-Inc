import { useEffect, useRef, useState } from 'react';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, Btn, Empty, Spinner } from '../components/UI';
import { MessagesSquare, Send, CheckCircle2, ArrowRightLeft } from 'lucide-react';
import toast from 'react-hot-toast';

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

const STATUS_PILL = {
  waiting: 'bg-amber-100 text-amber-700',
  live: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-slate-100 text-slate-500',
};

const DEPT_LABEL = { office: 'Office', admin: 'Admin' };

export default function Support() {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [active, setActive] = useState(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  async function loadList() {
    try { const r = await api.get('/support'); setChats(r.data); } catch { /* ignore */ }
    finally { setLoading(false); }
  }
  useEffect(() => {
    loadList();
    const iv = setInterval(loadList, 5000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!activeId) { setActive(null); return; }
    let on = true;
    const load = async () => {
      try { const r = await api.get(`/support/${activeId}`); if (on) setActive(r.data); } catch { /* ignore */ }
    };
    load();
    const iv = setInterval(load, 4000);
    return () => { on = false; clearInterval(iv); };
  }, [activeId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [active?.messages?.length]);

  async function sendReply() {
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await api.post(`/support/${activeId}/messages`, { text });
      setReply('');
      const r = await api.get(`/support/${activeId}`);
      setActive(r.data);
      loadList();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not send'); }
    finally { setSending(false); }
  }

  async function closeChat() {
    if (!confirm('Close this chat?')) return;
    try {
      await api.post(`/support/${activeId}/close`);
      const r = await api.get(`/support/${activeId}`);
      setActive(r.data);
      loadList();
    } catch { toast.error('Could not close'); }
  }

  async function transferChat() {
    const target = active?.department === 'admin' ? 'office' : 'admin';
    if (!confirm(`Transfer this chat to the ${DEPT_LABEL[target]} team?`)) return;
    try {
      await api.post(`/support/${activeId}/transfer`, { department: target });
      const r = await api.get(`/support/${activeId}`);
      setActive(r.data);
      loadList();
      toast.success(`Transferred to ${DEPT_LABEL[target]} team`);
    } catch { toast.error('Could not transfer'); }
  }

  if (loading) return <Spinner />;

  const waitingCount = chats.filter(c => c.status === 'waiting').length;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Support" subtitle={waitingCount ? `${waitingCount} waiting` : 'Live customer chats'} icon={<MessagesSquare size={20} />} />
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Chat list */}
        <Card className="lg:col-span-1 overflow-hidden">
          <div className="divide-y divide-slate-100 max-h-[32rem] overflow-y-auto">
            {chats.length === 0 ? (
              <Empty icon={<MessagesSquare size={24} />} title="No chats yet" message="When a customer asks to talk to a person, their chat shows up here." />
            ) : chats.map(c => (
              <button key={c.id} onClick={() => setActiveId(c.id)}
                className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${activeId === c.id ? 'bg-blue-50/60' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-800 truncate">{c.customer_name}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    {c.department && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">{DEPT_LABEL[c.department]}</span>}
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_PILL[c.status] || 'bg-slate-100 text-slate-500'}`}>{c.status}</span>
                  </span>
                </div>
                <p className="text-xs text-slate-500 truncate mt-0.5">{c.last_message_preview || '—'}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{fmtTime(c.last_message_at)}</p>
              </button>
            ))}
          </div>
        </Card>

        {/* Conversation */}
        <Card className="lg:col-span-2 flex flex-col h-[32rem]">
          {!active ? (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-400">Select a chat to view the conversation.</div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{active.customer_name}</p>
                  <p className="text-xs text-slate-500 truncate">{active.customer_email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  {active.department && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{DEPT_LABEL[active.department]}</span>}
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_PILL[active.status] || ''}`}>{active.status}</span>
                  {active.department && active.status !== 'closed' && (
                    <Btn size="sm" variant="outline" onClick={transferChat}><ArrowRightLeft size={14} /> To {active.department === 'admin' ? 'Office' : 'Admin'}</Btn>
                  )}
                  {active.status !== 'closed' && <Btn size="sm" variant="outline" onClick={closeChat}><CheckCircle2 size={14} /> Close</Btn>}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {active.messages?.map(m => {
                  if (m.sender === 'system') return <p key={m.id} className="text-center text-xs text-slate-400 py-1">{m.text}</p>;
                  const isAgent = m.sender === 'agent';
                  const isBot = m.sender === 'bot';
                  return (
                    <div key={m.id} className={`max-w-[80%] ${isAgent ? 'ml-auto' : 'mr-auto'}`}>
                      <p className={`text-[10px] font-semibold mb-0.5 ${isAgent ? 'text-right text-blue-600 mr-1' : 'text-slate-400 ml-1'}`}>{isBot ? 'Assistant' : m.sender_name}</p>
                      <div className={`px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${isAgent ? 'bg-blue-600 text-white rounded-br-sm' : isBot ? 'bg-slate-50 text-slate-500 border border-slate-100 rounded-bl-sm' : 'bg-slate-100 text-slate-700 rounded-bl-sm'}`}>
                        {m.text}
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
              {active.status !== 'closed' ? (
                <div className="border-t border-slate-100 p-3 flex items-center gap-2">
                  <input value={reply} onChange={e => setReply(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                    placeholder="Type your reply…"
                    className="flex-1 px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500" />
                  <Btn onClick={sendReply} loading={sending} disabled={!reply.trim()}><Send size={15} /> Send</Btn>
                </div>
              ) : (
                <p className="text-center text-xs text-slate-400 py-3 border-t border-slate-100">This chat is closed.</p>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
