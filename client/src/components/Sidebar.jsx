import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, X } from 'lucide-react';
import Logo from './Logo';
import { navGroupsForRole } from '../lib/roles';

export default function Sidebar({ open = false, onClose = () => {} }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const navGroups = navGroupsForRole(user?.role);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <>
      {/* Mobile backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-slate-900/50 lg:hidden transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />
      <aside className={`fixed lg:sticky inset-y-0 left-0 top-0 z-40 flex flex-col w-64 h-screen bg-gradient-to-b from-slate-900 to-slate-950 text-white shrink-0 border-r border-slate-800 transform transition-transform duration-200 ease-out ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-800/80">
          <Logo variant="icon" height={36} className="shrink-0" />
          <div className="min-w-0">
            <p className="font-bold text-sm leading-tight text-white">Clarke</p>
            <p className="text-[11px] text-slate-400 leading-tight tracking-wide">MECHANICAL INC.</p>
          </div>
          <button onClick={onClose} aria-label="Close menu" className="lg:hidden ml-auto p-1.5 -mr-1 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white">
            <X size={20} />
          </button>
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
                  onClick={onClose}
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
    </>
  );
}
