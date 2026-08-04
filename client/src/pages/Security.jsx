import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { ArrowLeft, ShieldCheck, Lock } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Security() {
  const navigate = useNavigate();
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);

  async function changePassword(e) {
    e.preventDefault();
    if (pw.next.length < 6) return toast.error('New password must be at least 6 characters');
    if (pw.next !== pw.confirm) return toast.error('New passwords do not match');
    setSaving(true);
    try {
      await api.post('/auth/change-password', { currentPassword: pw.current, newPassword: pw.next });
      toast.success('Password changed');
      setPw({ current: '', next: '', confirm: '' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not change password');
    } finally { setSaving(false); }
  }

  const field = 'w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500';

  return (
    <div className="max-w-xl mx-auto pb-4">
      <button onClick={() => navigate('/more')} className="flex items-center gap-1 text-sm text-slate-500 mb-4"><ArrowLeft size={16} /> Back</button>
      <h1 className="text-2xl font-bold text-slate-900 mb-1 flex items-center gap-2"><Lock size={20} className="text-blue-600" /> Security</h1>
      <p className="text-sm text-slate-500 mb-5">Change your password.</p>

      <form onSubmit={changePassword} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
        <input type="password" autoComplete="current-password" placeholder="Current password"
          value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} className={field} />
        <input type="password" autoComplete="new-password" placeholder="New password (min 6 characters)"
          value={pw.next} onChange={e => setPw({ ...pw, next: e.target.value })} className={field} />
        <input type="password" autoComplete="new-password" placeholder="Confirm new password"
          value={pw.confirm} onChange={e => setPw({ ...pw, confirm: e.target.value })} className={field} />
        <button type="submit" disabled={saving}
          className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-lg">
          <ShieldCheck size={16} /> {saving ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </div>
  );
}
