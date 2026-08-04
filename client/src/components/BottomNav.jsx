import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Menu, Home, CalendarDays, FileText, MoreHorizontal } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../context/AuthContext';
import { bottomNavForRole } from '../lib/roles';

// App-only bottom tab bar. Renders only inside the native app (never on the
// website) and only on phone-sized screens (lg:hidden).
const CUSTOMER_TABS = [
  { label: 'Home', icon: Home, to: '/portal', tab: null },
  { label: 'Appointments', icon: CalendarDays, to: '/portal?tab=jobs', tab: 'jobs' },
  { label: 'Invoices', icon: FileText, to: '/portal?tab=invoices', tab: 'invoices' },
  { label: 'More', icon: MoreHorizontal, to: '/more', tab: 'more' },
];

export default function BottomNav({ onOpenMenu = () => {} }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (!Capacitor?.isNativePlatform?.()) return null; // website: nothing
  if (!user) return null;

  // Customers get the 4-tab layout with a purple accent on the active tab.
  if (user.role === 'customer') {
    const curTab = new URLSearchParams(location.search).get('tab');
    const activeOf = (t) =>
      t.tab === 'more'
        ? location.pathname.startsWith('/more') || location.pathname.startsWith('/about') || location.pathname.startsWith('/refer') || location.pathname.startsWith('/account')
        : location.pathname === '/portal' && (t.tab ? curTab === t.tab : !curTab);
    return (
      <nav className="bottom-nav-bar lg:hidden shrink-0 flex items-stretch justify-around bg-white/95 backdrop-blur border-t border-slate-200">
        {CUSTOMER_TABS.map(t => {
          const active = activeOf(t);
          return (
            <button key={t.label} onClick={() => navigate(t.to)}
              className={`flex flex-col items-center justify-center flex-1 gap-0.5 py-2 text-[11px] font-medium transition-colors ${active ? 'text-blue-600' : 'text-slate-500'}`}>
              <t.icon size={22} className="shrink-0" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>
    );
  }

  // Staff: most-used areas + a "More" button that opens the full menu drawer.
  const items = bottomNavForRole(user?.role);
  if (!items.length) return null;
  const itemCls = ({ isActive }) =>
    `flex flex-col items-center justify-center flex-1 gap-0.5 py-2 text-[11px] font-medium transition-colors ${isActive ? 'text-blue-600' : 'text-slate-500'}`;

  return (
    <nav className="bottom-nav-bar lg:hidden shrink-0 flex items-stretch justify-around bg-white/95 backdrop-blur border-t border-slate-200">
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} end={to === '/'} className={itemCls}>
          <Icon size={22} className="shrink-0" />
          <span>{label}</span>
        </NavLink>
      ))}
      <button type="button" onClick={() => navigate('/more')}
        className={`flex flex-col items-center justify-center flex-1 gap-0.5 py-2 text-[11px] font-medium transition-colors ${location.pathname.startsWith('/more') ? 'text-blue-600' : 'text-slate-500'}`}>
        <Menu size={22} className="shrink-0" />
        <span>More</span>
      </button>
    </nav>
  );
}
