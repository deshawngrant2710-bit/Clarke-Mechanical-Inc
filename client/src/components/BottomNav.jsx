import { NavLink } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../context/AuthContext';
import { bottomNavForRole } from '../lib/roles';

// App-only bottom tab bar for the most-used areas. Renders only inside the
// native app (never on the website) and only on phone-sized screens (lg:hidden).
export default function BottomNav({ onOpenMenu = () => {} }) {
  const { user } = useAuth();

  if (!Capacitor?.isNativePlatform?.()) return null; // website: nothing
  const items = bottomNavForRole(user?.role);
  if (!items.length) return null;

  const itemCls = ({ isActive }) =>
    `flex flex-col items-center justify-center flex-1 gap-0.5 py-2 text-[11px] font-medium transition-colors ${
      isActive ? 'text-blue-600' : 'text-slate-500'
    }`;

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex items-stretch justify-around bg-white/95 backdrop-blur border-t border-slate-200 bottom-nav-safe">
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} end={to === '/'} className={itemCls}>
          <Icon size={22} className="shrink-0" />
          <span>{label}</span>
        </NavLink>
      ))}
      <button type="button" onClick={onOpenMenu} className="flex flex-col items-center justify-center flex-1 gap-0.5 py-2 text-[11px] font-medium text-slate-500 transition-colors hover:text-slate-700">
        <Menu size={22} className="shrink-0" />
        <span>More</span>
      </button>
    </nav>
  );
}
