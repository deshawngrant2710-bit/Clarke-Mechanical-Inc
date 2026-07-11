import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/client';
import { Lock, AlertCircle, CheckCircle2, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import Logo from '../components/Logo';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!token) return setError('This reset link is missing its token. Please use the link from your email.');
    if (password.length < 6) return setError('Password must be at least 6 characters');
    if (password !== confirm) return setError('The passwords do not match');
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not reset your password');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="flex justify-center mb-8">
          <div className="bg-white rounded-2xl shadow-lg px-6 py-4"><Logo variant="full" height={48} /></div>
        </div>

        {done ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center mx-auto mb-4"><CheckCircle2 size={28} /></div>
            <h2 className="text-xl font-bold text-slate-900">Password updated</h2>
            <p className="text-sm text-slate-500 mt-1">You can now sign in with your new password. Redirecting you to sign in…</p>
            <Link to="/login" className="inline-block mt-4 text-sm font-semibold text-blue-600 hover:text-blue-700">Go to sign in</Link>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-slate-900">Choose a new password</h2>
            <p className="text-sm text-slate-500 mt-1 mb-6">Enter a new password for your account.</p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2 animate-slide-down">
                <AlertCircle size={16} className="shrink-0" /> {error}
              </div>
            )}

            <form onSubmit={submit} className="space-y-4" noValidate>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">New password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    autoComplete="new-password" placeholder="At least 6 characters"
                    className="w-full pl-9 pr-10 py-2.5 border border-slate-300 rounded-lg text-sm bg-white outline-none transition-all focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500 hover:border-slate-400" />
                  <button type="button" onClick={() => setShow(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5">
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type={show ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)}
                    autoComplete="new-password" placeholder="Re-enter password"
                    className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white outline-none transition-all focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500 hover:border-slate-400" />
                </div>
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-semibold py-2.5 rounded-lg text-sm transition-all shadow-sm disabled:opacity-50">
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </form>

            <p className="text-sm text-slate-500 text-center mt-6">
              <Link to="/login" className="font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"><ArrowLeft size={14} /> Back to sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
