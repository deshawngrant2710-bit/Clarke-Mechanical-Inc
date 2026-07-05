import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, Users, Briefcase, Calendar, FileText,
  Package, UserCog, LogOut, ClipboardList, Settings,
} from 'lucide-react';
import Logo from './Logo';

const groups = [
  {
    label: 'Overview',
    items: [{ to: '/', icon: LayoutDashboard, label: 'Dashboard' }],
  },
  {
    label: 'Operations',
    items: [
      { to: '/customers', icon: Users, label: 'Customers' },
      { to: '/jobs', icon: Briefcase, label: 'Jobs' },
      { to: '/schedule', icon: Calendar, label: 'Schedule' },
    ],
  },
  {
    label: 'Billing',
    items: [
      { to: '/invoices', icon: FileText, label: 'Invoices' },
      { to: '/quotes', icon: ClipboardList, label: 'Quotes' },
    ],
  },
  {
    label: 'Resources',
    items: [
      { to: '/inventory', icon: Package, label: 'Inventory' },
      { to: '/employees', icon: UserCog, label: 'Team' },
    ],
  },
];

const adminGroup = {
  label: 'System',
  items: [{ to: '/settings', icon: Settings, label: 'Settings' }],
};

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const navGroups = user?.role === 'admin' ? [...groups, adminGroup] : groups;

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <aside className="flex flex-col w-64 h-screen sticky top-0 bg-gradient-to-b from-slate-900 to-slate-950 text-white shrink-0 border-r border-slate-800">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-800/80">
        <Logo variant="icon" height={36} className="shrink-0" />
        <div className="min-w-0">
          <p className="font-bold text-sm leading-tight text-white">Clarke</p>
          <p className="text-[11px] text-slate-400 leading-tight tracking-wide">MECHANICAL INC.</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {navGroups.map(group => (
          <div key={group.label} className="mb-5">
            <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-[0_4px_14px_-4px_rgb(37_99_235_/_0.6)]'
                        : 'text-slate-400 hover:bg-slate-800/70 hover:text-white'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-blue-400" />}
                      <Icon size={18} className="shrink-0" />
                      {label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-slate-800/80">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-xs font-bold uppercase shadow-md">
            {user?.name?.[0] || 'U'}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{user?.name}</p>
            <p className="text-xs text-slate-400 capitalize">{user?.role}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </aside>
  );
}
