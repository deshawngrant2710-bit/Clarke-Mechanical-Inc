import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import Logo from '../components/Logo';
import { KeyRound, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';

// Shown after someone signs in with a one-time password — they must set their own.
export default function SetInitialPassword() {
  const { user, updateUser, logout } = useAuth();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(e) {
    e.preventDefault();
    if (pw.length < 6) return toast.error('Use at least 6 characters');
    if (pw !== confirm) return toast.error('Passwords do not match');
    setSaving(true);
    try {
      await api.post('/auth/set-initial-password', { newPassword: pw });
      updateUser({ must_change_password: false });
      toast.success('Password set — welcome!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not set your password');
    } finally { setSaving(false); }
  }

  const inputCls = 'w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500';

  return (
    <div className="min-h-dvh flex items-center justify-center bg-slate-50 p-4 native-safe-y">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <div className="flex flex-col items-center text-center mb-5">
          <Logo variant="icon" height={40} />
          <div className="mt-3 flex items-center gap-2 text-blue-600"><KeyRound size={18} /><h1 className="text-lg font-bold text-slate-900">Set your password</h1></div>
          <p className="text-sm text-slate-500 mt-1">Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}! Choose a password to finish setting up your account.</p>
        </div>
        <form onSubmit={save} className="space-y-3">
          <input type="password" autoComplete="new-password" placeholder="New password (min 6 characters)" value={pw} onChange={e => setPw(e.target.value)} className={inputCls} />
          <input type="password" autoComplete="new-password" placeholder="Confirm new password" value={confirm} onChange={e => setConfirm(e.target.value)} className={inputCls} />
          <button type="submit" disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg transition">
            {saving ? 'Saving…' : 'Set password & continue'}
          </button>
        </form>
        <button onClick={logout} className="mt-4 w-full flex items-center justify-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-600">
          <LogOut size={13} /> Sign out
        </button>
      </div>
    </div>
  );
}
