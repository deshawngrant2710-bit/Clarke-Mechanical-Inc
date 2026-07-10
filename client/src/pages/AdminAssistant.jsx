import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card } from '../components/UI';
import { Sparkles, Send, ExternalLink } from 'lucide-react';

const SUGGESTIONS = [
  'Create a job for Jane Doe — AC not cooling — next Tuesday',
  'Draft an estimate for a new furnace install',
  'Add a new customer named Rivera Plumbing',
];

export default function AdminAssistant() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);

  async function send(override) {
    const text = (typeof override === 'string' ? override : input).trim();
    if (!text || sending) return;
    const outgoing = [...messages, { role: 'user', text }];
    setMessages(outgoing); setInput(''); setSending(true);
    try {
      const r = await api.post('/assistant', { message: text, history: messages.filter(m => m.role === 'user' || m.role === 'assistant') });
      setMessages([...outgoing, { role: 'assistant', text: r.data.reply, action: r.data.action || null }]);
    } catch (e) {
      setMessages([...outgoing, { role: 'assistant', text: e.response?.data?.error || 'Sorry, something went wrong. Please try again.' }]);
    } finally { setSending(false); }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title="Assistant" subtitle="Ask me to create jobs, estimates, invoices, and more" icon={<Sparkles size={20} />} />
      <Card className="overflow-hidden max-w-3xl">
        <div className="flex flex-col h-[32rem] bg-slate-50/60">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center mt-8 px-4">
                <div className="mx-auto mb-3 flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-100 text-blue-600"><Sparkles size={24} /></div>
                <p className="text-sm font-semibold text-slate-700">What can I set up for you?</p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">I can create jobs, estimates, invoices, and customers — just describe it in plain English.</p>
                <div className="flex flex-wrap justify-center gap-2 mt-4">
                  {SUGGESTIONS.map(s => (
                    <button key={s} onClick={() => send(s)} disabled={sending} className="px-3 py-1.5 rounded-full border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors disabled:opacity-50">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => {
              const isUser = m.role === 'user';
              return (
                <div key={i} className={`flex items-end gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
                  {!isUser && <div className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-600 shrink-0"><Sparkles size={14} /></div>}
                  <div className="max-w-[80%]">
                    <div className={`px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-wrap shadow-sm ${isUser ? 'bg-blue-600 text-white rounded-br-md' : 'bg-white text-slate-700 border border-slate-100 rounded-bl-md'}`}>{m.text}</div>
                    {m.action && (
                      <button onClick={() => navigate(m.action.to)} className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700">
                        <ExternalLink size={12} /> Open {m.action.type} {m.action.label}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {sending && (
              <div className="flex items-end gap-2">
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-600 shrink-0"><Sparkles size={14} /></div>
                <div className="bg-white border border-slate-100 rounded-2xl rounded-bl-md px-3.5 py-3 shadow-sm">
                  <span className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          <div className="border-t border-slate-100 bg-white p-3">
            <div className="flex items-center gap-2 bg-slate-100 rounded-full pl-4 pr-1.5 py-1 focus-within:ring-2 focus-within:ring-blue-500/30">
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="e.g. Create an invoice for Jane Doe: 2 hours labor at $110"
                className="flex-1 bg-transparent text-sm outline-none py-1.5" />
              <button onClick={() => send()} disabled={!input.trim() || sending} className="flex items-center justify-center w-9 h-9 rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"><Send size={16} /></button>
            </div>
            <p className="text-[10px] text-slate-400 text-center mt-2">Creates drafts you can review and edit. Double-check details before sending anything to customers.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
