import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import { User, Mail, Phone, Lock, LogOut, Trash2, ShieldCheck, Save, ChevronDown } from 'lucide-react';

const roleLabel = { admin: 'Administrator', office: 'Office', technician: 'Technician', customer: 'Customer' };

export default function Account() {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [showPw, setShowPw] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [savingPw, setSavingPw] = useState(false);

  // Pull the freshest account info on open (in case it changed elsewhere).
  useEffect(() => {
    api.get('/auth/me').then(r => {
      setName(r.data.name || '');
      setPhone(r.data.phone || '');
      updateUser({ name: r.data.name, phone: r.data.phone });
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty = name.trim() !== (user?.name || '') || (phone || '') !== (user?.phone || '');

  async function saveProfile(e) {
    e.preventDefault();
    if (!name.trim()) return toast.error('Name is required');
    setSavingProfile(true);
    try {
      const { data } = await api.put('/auth/me', { name: name.trim(), phone: phone.trim() });
      updateUser({ name: data.name, phone: data.phone });
      toast.success('Account updated');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save your changes');
    } finally { setSavingProfile(false); }
  }

  async function changePassword(e) {
    e.preventDefault();
    if (pw.next.length < 6) return toast.error('New password must be at least 6 characters');
    if (pw.next !== pw.confirm) return toast.error('New passwords do not match');
    setSavingPw(true);
    try {
      await api.post('/auth/change-password', { currentPassword: pw.current, newPassword: pw.next });
      toast.success('Password changed');
      setPw({ current: '', next: '', confirm: '' });
      setShowPw(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not change password');
    } finally { setSavingPw(false); }
  }

  function signOut() {
    logout();
    navigate('/login');
  }

  async function deleteAccount() {
    if (!window.confirm('Permanently delete your account? This removes your login and sign-in access. This cannot be undone.')) return;
    try {
      await api.delete('/portal/account');
      logout();
      navigate('/login');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not delete your account. Please contact us.');
    }
  }

  const inputCls = 'w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500 transition';

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-page-title mb-1">My Account</h1>
      <p className="text-sm text-slate-500 mb-6">Manage your contact details, password, and sign-in.</p>

      {/* Identity header */}
      <div className="flex items-center gap-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm mb-5">
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white text-xl font-bold uppercase shrink-0">
          {user?.name?.[0] || 'U'}
        </div>
        <div className="min-w-0">
          <p className="text-lg font-bold text-slate-900 truncate">{user?.name}</p>
          <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
            {roleLabel[user?.role] || user?.role}
          </span>
        </div>
      </div>

      {/* Contact details */}
      <form onSubmit={saveProfile} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm mb-5">
        <h2 className="text-card-title mb-4">Contact details</h2>

        <label className="block text-sm font-medium text-slate-700 mb-1.5">Full name</label>
        <div className="relative mb-4">
          <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="Your name" />
        </div>

        <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone number</label>
        <div className="relative mb-4">
          <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} placeholder="(555) 000-0000" type="tel" />
        </div>

        <label className="block text-sm font-medium text-slate-700 mb-1.5">Email address</label>
        <div className="relative mb-1">
          <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={user?.email || ''} disabled className={`${inputCls} bg-slate-50 text-slate-500 cursor-not-allowed`} />
        </div>
        <p className="text-xs text-slate-400 mb-4">To change your email, contact us at service@clarkemechanicalinc.org.</p>

        <button type="submit" disabled={!dirty || savingProfile}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition">
          <Save size={16} /> {savingProfile ? 'Saving…' : 'Save changes'}
        </button>
      </form>

      {/* Password */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm mb-5">
        <button type="button" onClick={() => setShowPw(v => !v)} className="w-full flex items-center justify-between">
          <span className="flex items-center gap-2 text-card-title"><Lock size={16} className="text-slate-500" /> Change password</span>
          <ChevronDown size={18} className={`text-slate-400 transition-transform ${showPw ? 'rotate-180' : ''}`} />
        </button>
        {showPw && (
          <form onSubmit={changePassword} className="mt-4 space-y-3">
            <input type="password" autoComplete="current-password" placeholder="Current password"
              value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500" />
            <input type="password" autoComplete="new-password" placeholder="New password (min 6 characters)"
              value={pw.next} onChange={e => setPw({ ...pw, next: e.target.value })}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500" />
            <input type="password" autoComplete="new-password" placeholder="Confirm new password"
              value={pw.confirm} onChange={e => setPw({ ...pw, confirm: e.target.value })}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500" />
            <button type="submit" disabled={savingPw}
              className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition">
              <ShieldCheck size={16} /> {savingPw ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
      </div>

      {/* Sign out */}
      <button onClick={signOut}
        className="w-full flex items-center justify-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-sm px-4 py-3 rounded-2xl shadow-sm transition mb-5">
        <LogOut size={16} /> Sign out
      </button>

      {/* Danger zone — customers can delete their own account (App Store requirement) */}
      {user?.role === 'customer' && (
        <div className="border border-red-200 bg-red-50/50 rounded-2xl p-5">
          <h2 className="text-card-title text-red-700 mb-1">Delete account</h2>
          <p className="text-xs text-slate-500 mb-3">Permanently removes your login and portal access. Service and billing records may be retained as required by law.</p>
          <button onClick={deleteAccount}
            className="inline-flex items-center gap-2 border border-red-300 text-red-700 hover:bg-red-100 text-sm font-semibold px-4 py-2.5 rounded-lg transition">
            <Trash2 size={16} /> Delete my account
          </button>
        </div>
      )}
    </div>
  );
}
