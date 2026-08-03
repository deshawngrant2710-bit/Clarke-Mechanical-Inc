import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Gift, Copy, Check, Share2 } from 'lucide-react';

export default function ReferEarn() {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const message = 'I use Clarke Mechanical for my HVAC and heating service — reliable and easy to book. Mention my name when you call and we both get taken care of! clarkemechanicalinc.org';

  async function copy() {
    try { await navigator.clipboard.writeText(message); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  }
  async function share() {
    if (navigator.share) { try { await navigator.share({ text: message }); } catch { /* ignore */ } }
    else copy();
  }

  return (
    <div className="max-w-xl mx-auto pb-4">
      <button onClick={() => navigate('/more')} className="flex items-center gap-1 text-sm text-slate-500 mb-4"><ArrowLeft size={16} /> Back</button>

      <div className="rounded-2xl p-6 text-white text-center shadow-md mb-4" style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}>
        <Gift size={36} className="mx-auto mb-2" />
        <h1 className="text-xl font-bold">Refer &amp; Earn</h1>
        <p className="text-white/85 text-sm mt-1">Tell friends and neighbors about Clarke Mechanical.</p>
      </div>

      <div className="rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] p-4">
        <p className="text-sm text-slate-600 mb-3">Share this message:</p>
        <p className="text-sm text-slate-800 bg-slate-50 rounded-xl p-3 border border-slate-100">{message}</p>
        <div className="flex gap-2 mt-4">
          <button onClick={copy} className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 font-medium text-slate-700">
            {copied ? <><Check size={16} className="text-emerald-600" /> Copied</> : <><Copy size={16} /> Copy</>}
          </button>
          <button onClick={share} className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-white font-semibold" style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}>
            <Share2 size={16} /> Share
          </button>
        </div>
      </div>

      <p className="text-center text-xs text-slate-400 mt-6">Questions about referrals? Contact us at service@clarkemechanicalinc.org.</p>
    </div>
  );
}
