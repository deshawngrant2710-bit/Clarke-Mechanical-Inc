import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { navGroupsForRole, bottomNavForRole } from '../lib/roles';
import {
  User, MapPin, CreditCard, Bell, HelpCircle, FileText, Gift, Info, ChevronRight, LogOut, Lock,
} from 'lucide-react';

// Customer menu — one clear destination each (no duplicated settings).
const CUSTOMER_MENU = [
  { label: 'My Profile', icon: User, to: '/account' },
  { label: 'Service Addresses', icon: MapPin, to: '/addresses' },
  { label: 'Notification Settings', icon: Bell, to: '/notifications' },
  { label: 'Security', icon: Lock, to: '/security' },
  { label: 'Invoices & Billing', icon: FileText, to: '/billing' },
  { label: 'Payment Methods', icon: CreditCard, to: '/billing' },
  { label: 'Help & Support', icon: HelpCircle, to: '/portal?tab=help' },
  { label: 'Refer & Earn', icon: Gift, to: '/refer' },
  { label: 'About Clarke Mechanical', icon: Info, to: '/about' },
];

const roleLabel = { admin: 'Administrator', office: 'Office', technician: 'Technician', customer: 'Customer' };

export default function MoreCustomer() {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);

  // The menu is fully static + the profile comes from the already-stored user,
  // so this renders instantly. Refresh the profile silently in the background —
  // never block the page on a request.
  useEffect(() => {
    api.get('/auth/me')
      .then(r => updateUser({ name: r.data.name, email: r.data.email, phone: r.data.phone }))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isCustomer = user?.role === 'customer';
  // Customers get the account menu. Staff get the rest of their sections — minus
  // the pages that already have a dedicated bottom tab, and minus My Account
  // (the purple profile card above already opens it), so nothing is duplicated.
  const bottomPaths = bottomNavForRole(user?.role).map(i => i.to);
  const menu = isCustomer
    ? CUSTOMER_MENU
    : navGroupsForRole(user?.role)
        .flatMap(g => g.items)
        .filter(i => !bottomPaths.includes(i.to) && i.to !== '/account')
        .map(i => ({ label: i.label, icon: i.icon, to: i.to }));

  const initials = (user?.name || '?').trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase() || '?';
  function doLogout() { logout(); navigate('/login'); }

  return (
    <div className="max-w-xl mx-auto pb-4">
      <h1 className="text-2xl font-bold text-slate-900 mb-4">More</h1>

      {/* Profile card — whole card opens the account page */}
      <button onClick={() => navigate('/account')}
        className="w-full flex items-center gap-3 text-left rounded-2xl p-4 text-white shadow-md active:opacity-95"
        style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}>
        <span className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center font-bold text-lg shrink-0">{initials}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold truncate">{user?.name || 'Your account'}</span>
          {(isCustomer ? user?.email : (roleLabel[user?.role] || user?.email))
            ? <span className="block text-white/80 text-sm truncate">{isCustomer ? user?.email : (roleLabel[user?.role] || user?.email)}</span>
            : <span className="block mt-1 h-3 w-32 rounded bg-white/25 animate-pulse" />}
        </span>
        <ChevronRight size={20} className="text-white/80 shrink-0" />
      </button>

      {/* Menu */}
      <div className="mt-4 rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-hidden">
        {menu.map((m, i) => (
          <button key={`${m.to}-${m.label}`} onClick={() => navigate(m.to)}
            className={`w-full flex items-center gap-3 px-4 min-h-[56px] text-left active:bg-slate-50 ${i < menu.length - 1 ? 'border-b border-slate-100' : ''}`}>
            {m.icon ? <m.icon size={20} className="text-slate-500 shrink-0" /> : <span className="w-5 shrink-0" />}
            <span className="flex-1 font-semibold text-slate-800 truncate">{m.label}</span>
            <ChevronRight size={18} className="text-slate-300 shrink-0" />
          </button>
        ))}
      </div>

      {/* Logout */}
      <div className="mt-4 rounded-2xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] p-2">
        <button onClick={() => setConfirm(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-red-600 font-semibold active:bg-red-50">
          <LogOut size={18} /> Log Out
        </button>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setConfirm(false)} />
          <div className="relative bg-white rounded-2xl p-5 w-full max-w-xs text-center shadow-xl">
            <p className="font-semibold text-slate-900 mb-1">Log out?</p>
            <p className="text-sm text-slate-500 mb-4">Are you sure you want to log out?</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirm(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 font-medium text-slate-700">Cancel</button>
              <button onClick={doLogout} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-semibold">Log Out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
