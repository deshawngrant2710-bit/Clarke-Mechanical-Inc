import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, X, Search } from 'lucide-react';
import Logo from './Logo';
import NotificationBell from './NotificationBell';
import api from '../api/client';
import { navGroupsForRole } from '../lib/roles';

export default function Sidebar({ open = false, onClose = () => {} }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [waitingChats, setWaitingChats] = useState(0);

  const navGroups = navGroupsForRole(user?.role);

  // Poll the number of support chats waiting for a human (admin/office only).
  useEffect(() => {
    if (user?.role !== 'admin' && user?.role !== 'office') return;
    let active = true;
    const poll = async () => {
      if (typeof document !== 'undefined' && document.hidden) return; // skip hidden tab
      try {
        const r = await api.get('/support');
        // Count chats waiting for this person's team (or not yet assigned to a team).
        if (active) setWaitingChats(r.data.filter(c => c.status === 'waiting' && (!c.department || c.department === user.role)).length);
      } catch { /* ignore */ }
    };
    poll();
    const iv = setInterval(poll, 90000);
    return () => { active = false; clearInterval(iv); };
  }, [user?.role]);

  const [searchQ, setSearchQ] = useState('');
  function doSearch(e) {
    e.preventDefault();
    if (searchQ.trim()) { navigate(`/search?q=${encodeURIComponent(searchQ.trim())}`); setSearchQ(''); onClose(); }
  }

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
      <aside className={`fixed lg:sticky inset-y-0 left-0 top-0 z-40 flex flex-col w-64 h-dvh bg-[#0b1730] text-white shrink-0 border-r border-[#17213c] transform transition-transform duration-200 ease-out ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-[#17213c]">
          <Logo variant="icon" height={36} className="shrink-0" />
          <div className="min-w-0">
            <p className="font-bold text-sm leading-tight text-white">Clarke</p>
            <p className="text-[11px] text-slate-400 leading-tight tracking-wide">MECHANICAL INC.</p>
          </div>
          {(user?.role === 'admin' || user?.role === 'office') && (
            <div className="ml-auto"><NotificationBell variant="dark" /></div>
          )}
          <button onClick={onClose} aria-label="Close menu" className="lg:hidden p-1.5 -mr-1 rounded-lg text-slate-400 hover:bg-[#17233f] hover:text-white">
            <X size={20} />
          </button>
        </div>

        {user?.role !== 'customer' && (
          <form onSubmit={doSearch} className="px-3 pt-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search…"
                className="w-full pl-9 pr-2 py-2.5 rounded-xl bg-[#12213f] text-sm text-white placeholder:text-slate-500 outline-none focus:bg-[#17233f] border border-transparent focus:border-[#25315a] transition-colors" />
            </div>
          </form>
        )}

      {/* Nav */}
      <nav className="flex-1 min-h-0 px-3 pt-4 pb-6 overflow-y-auto overscroll-contain app-nav">
        {navGroups.map(group => (
          <div key={group.label} className="mb-5">
            <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors duration-150 ${
                      isActive
                        ? 'bg-[#0b2265] text-white font-semibold'
                        : 'text-slate-400 font-medium hover:bg-[#17233f] hover:text-white'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon size={18} className="shrink-0" />
                      {label}
                      {to === '/support' && waitingChats > 0 && (
                        <span className={`ml-auto min-w-5 h-5 px-1.5 flex items-center justify-center rounded-full text-[11px] font-bold ${isActive ? 'bg-white/20 text-white' : 'bg-red-500 text-white'}`}>{waitingChats}</span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User (hidden in the native app — replaced by the bottom bar + My Account panel) */}
      <div className="px-3 py-3 border-t border-[#17213c] safe-bottom sidebar-user">
        {/* Display only — not a link. Account is reached via the "My Account" nav item. */}
        <div className="flex items-center gap-3 px-2 py-1.5 rounded-xl">
          <div className="flex items-center justify-center w-9 h-9 rounded-full bg-[#22315a] text-[#cdd8f2] text-xs font-bold uppercase shrink-0">
            {user?.name?.[0] || 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate leading-tight">{user?.name}</p>
            <p className="text-xs text-slate-400 capitalize leading-tight">{user?.role}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            aria-label="Sign out"
            className="p-2 -mr-1 rounded-lg text-slate-400 hover:bg-[#17233f] hover:text-white transition-colors shrink-0"
          >
            <LogOut size={17} />
          </button>
        </div>
      </div>
      </aside>
    </>
  );
}
