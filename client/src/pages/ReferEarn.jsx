import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, Gift, Copy, Check, Share2, Link2, Ticket, CheckCircle2, Clock } from 'lucide-react';

export default function ReferEarn() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState('');

  useEffect(() => { api.get('/portal/referrals').then(r => setData(r.data)).catch(() => setData({})); }, []);

  const name = user?.name || 'me';
  const code = data?.code || '';
  const link = data?.link || '';
  const reward = data?.reward || '';
  const referrals = data?.referrals || [];

  const message = `I use Clarke Mechanical for my HVAC and heating — reliable and easy to book. Referred by ${name}. Use my referral code ${code || ''}${link ? ` or sign up here: ${link}` : ''}`.trim();

  async function copy(text, key) {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 2000); } catch { /* ignore */ }
  }
  async function share() {
    if (navigator.share) { try { await navigator.share({ text: message }); return; } catch { /* ignore */ } }
    copy(message, 'msg');
  }

  return (
    <div className="max-w-xl mx-auto pb-4">
      <button onClick={() => navigate('/more')} className="flex items-center gap-1 text-sm text-slate-500 mb-4"><ArrowLeft size={16} /> Back</button>

      <div className="rounded-2xl p-6 text-white text-center shadow-md mb-4" style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}>
        <Gift size={36} className="mx-auto mb-2" />
        <h1 className="text-xl font-bold">Refer &amp; Earn</h1>
        <p className="text-white/85 text-sm mt-1">Share Clarke Mechanical with friends and neighbors.</p>
      </div>

      {/* Reward — clearly defined, no over-promising */}
      {reward && (
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4 mb-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-1"><Ticket size={16} className="text-blue-600" /> Your reward</p>
          <p className="text-sm text-slate-600">{reward}</p>
        </div>
      )}

      {/* Code + link */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4 mb-4 space-y-3">
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1">Your referral code</p>
          <div className="flex items-center gap-2">
            <span className="flex-1 font-mono font-bold text-lg text-slate-900 tracking-wider bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{code || '…'}</span>
            <button onClick={() => copy(code, 'code')} disabled={!code} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 disabled:opacity-50">
              {copied === 'code' ? <><Check size={15} className="text-emerald-600" /> Copied</> : <><Copy size={15} /> Copy</>}
            </button>
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1">Shareable link</p>
          <div className="flex items-center gap-2">
            <span className="flex-1 text-sm text-blue-700 truncate bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"><Link2 size={13} className="inline mr-1" />{link || '…'}</span>
            <button onClick={() => copy(link, 'link')} disabled={!link} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 disabled:opacity-50">
              {copied === 'link' ? <><Check size={15} className="text-emerald-600" /> Copied</> : <><Copy size={15} /> Copy</>}
            </button>
          </div>
        </div>
      </div>

      {/* Prewritten message */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4 mb-4">
        <p className="text-xs font-medium text-slate-500 mb-1">Message to share</p>
        <p className="text-sm text-slate-800 bg-slate-50 rounded-xl p-3 border border-slate-100">{message}</p>
        <div className="flex gap-2 mt-3">
          <button onClick={() => copy(message, 'msg')} className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 font-medium text-slate-700">
            {copied === 'msg' ? <><Check size={16} className="text-emerald-600" /> Copied</> : <><Copy size={16} /> Copy</>}
          </button>
          <button onClick={share} className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-white font-semibold" style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}>
            <Share2 size={16} /> Share
          </button>
        </div>
      </div>

      {/* Referral status */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <p className="px-4 py-3 text-sm font-semibold text-slate-800 border-b border-slate-100">Your referrals</p>
        {referrals.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-400 text-center">No referrals yet. People who sign up with your code or link will appear here.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {referrals.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{r.name}</p>
                  {r.created_at && <p className="text-xs text-slate-400">{new Date(r.created_at).toLocaleDateString()}</p>}
                </div>
                {r.status === 'completed'
                  ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full"><CheckCircle2 size={12} /> Completed</span>
                  : <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full"><Clock size={12} /> Pending</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
