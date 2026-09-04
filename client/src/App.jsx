import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, NavLink, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Menu, LogOut } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { OfflineProvider } from './context/OfflineContext';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import NotificationBell from './components/NotificationBell';
import OfflineBanner from './components/OfflineBanner';
import Logo from './components/Logo';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Privacy from './pages/Privacy';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import Jobs from './pages/Jobs';
import JobDetail from './pages/JobDetail';
import Schedule from './pages/Schedule';
import Invoices from './pages/Invoices';
import InvoiceDetail from './pages/InvoiceDetail';
import Quotes from './pages/Quotes';
import Inventory from './pages/Inventory';
import Inspections from './pages/Inspections';
import InspectionDetail from './pages/InspectionDetail';
import Employees from './pages/Employees';
import Settings from './pages/Settings';
import Portal from './pages/Portal';
import CustomerInvoices from './pages/CustomerInvoices';
import Appointments from './pages/Appointments';
import PayLink from './pages/PayLink';
import Account from './pages/Account';
import MoreCustomer from './pages/MoreCustomer';
import AboutClarke from './pages/AboutClarke';
import ReferEarn from './pages/ReferEarn';
import ServiceAddresses from './pages/ServiceAddresses';
import NotificationSettings from './pages/NotificationSettings';
import Security from './pages/Security';
import Support from './pages/Support';
import Reports from './pages/Reports';
import Dispatch from './pages/Dispatch';
import Pipeline from './pages/Pipeline';
import RouteMap from './pages/RouteMap';
import Payments from './pages/Payments';
import Receipts from './pages/Receipts';
import PriceBook from './pages/PriceBook';
import Payroll from './pages/Payroll';
import Purchasing from './pages/Purchasing';
import Tasks from './pages/Tasks';
import SearchResults from './pages/SearchResults';
import AdminAssistant from './pages/AdminAssistant';
import TimeClock from './pages/TimeClock';
import FieldMode from './pages/FieldMode';
import SyncQueue from './pages/SyncQueue';
import { canAccess, homeForRole } from './lib/roles';
import { initPush } from './lib/push';
import SetInitialPassword from './pages/SetInitialPassword';

function Layout() {
  const { user } = useAuth();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setNavOpen(false); }, [location.pathname]);

  // Remember each route's scroll position in the main content area, and restore
  // it when returning (so switching tabs doesn't jump you back to the top).
  const mainRef = useRef(null);
  const scrollPositions = useRef({});
  const isRestoring = useRef(false);
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => { if (!isRestoring.current) scrollPositions.current[location.pathname] = el.scrollTop; };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [location.pathname]);
  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    isRestoring.current = true;
    el.scrollTop = scrollPositions.current[location.pathname] ?? 0;
    requestAnimationFrame(() => { isRestoring.current = false; });
  }, [location.pathname]);
  const navigate = useNavigate();
  // Register for push notifications (native app, staff only).
  useEffect(() => {
    if (!user || (user.role !== 'admin' && user.role !== 'office')) return;
    let cleanup;
    initPush((link) => navigate(link)).then(c => { cleanup = c; });
    return () => { cleanup && cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  if (!user) return <Navigate to="/login" replace />;
  // One-time password: force the user to set their own before using the app.
  if (user.must_change_password) return <SetInitialPassword />;
  // Role guard: send users to their home if they hit a page they can't access.
  if (!canAccess(user.role, location.pathname)) {
    return <Navigate to={homeForRole(user.role)} replace />;
  }
  const isCustomer = user.role === 'customer';
  return (
    <div className="app-root flex min-h-dvh bg-slate-50">
      {/* Customers get a clean top bar (no sidebar); staff keep the sidebar. */}
      {!isCustomer && <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />}
      <div className="app-shell flex flex-col flex-1 min-w-0">
        <OfflineBanner />
        {isCustomer ? (
          <CustomerTopBar name={user.name} />
        ) : (
          /* Mobile top bar — fixed in the shell (never scrolls under the Dynamic Island) */
          <header className="app-header lg:hidden shrink-0 bg-white border-b border-slate-200">
            <div className="flex items-center gap-3 h-14 px-4">
              <button onClick={() => setNavOpen(true)} aria-label="Open menu" className="app-hamburger p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100 active:scale-95 transition">
                <Menu size={22} />
              </button>
              <Logo variant="icon" height={26} />
              <span className="font-bold text-sm text-slate-800">Clarke Mechanical</span>
              {(user.role === 'admin' || user.role === 'office') && (
                <div className="ml-auto"><NotificationBell /></div>
              )}
            </div>
          </header>
        )}
        <main ref={mainRef} className="app-content flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1400px]">
            <Outlet />
          </div>
        </main>
        <BottomNav onOpenMenu={() => setNavOpen(true)} />
      </div>
    </div>
  );
}

// Top navigation bar shown to customers in place of the staff sidebar.
function CustomerTopBar({ name }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const linkCls = ({ isActive }) =>
    `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'text-blue-600 bg-blue-50' : 'text-slate-600 hover:bg-slate-100'}`;
  function signOut() { logout(); navigate('/login'); }
  return (
    <header className="customer-topbar shrink-0 bg-white border-b border-slate-200 z-30">
      <div className="mx-auto max-w-[1400px] flex items-center gap-2 h-16 px-4 sm:px-6">
        <NavLink to="/portal" className="flex items-center gap-2.5 shrink-0">
          <Logo variant="icon" height={30} />
          <span className="leading-tight">
            <span className="block font-bold text-sm text-slate-900">Clarke</span>
            <span className="block text-[10px] text-slate-500 tracking-wide">MECHANICAL INC.</span>
          </span>
        </NavLink>
        <nav className="hidden sm:flex items-center gap-1 ml-4">
          <NavLink to="/portal" end className={linkCls}>Home</NavLink>
          <NavLink to="/appointments" className={linkCls}>Appointments</NavLink>
          <NavLink to="/billing" className={linkCls}>Billing</NavLink>
          <NavLink to="/refer" className={linkCls}>Refer &amp; Earn</NavLink>
          <button onClick={signOut}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors">
            <LogOut size={15} /> Sign out
          </button>
        </nav>
        <NavLink to="/account" title="My Profile"
          className="ml-auto flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-full hover:bg-slate-100 transition-colors">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white text-xs font-bold uppercase shrink-0">{name?.[0] || 'U'}</span>
          <span className="hidden sm:block text-sm font-medium text-slate-700 max-w-[120px] truncate">{name?.split(' ')[0]}</span>
        </NavLink>
        {/* Always-visible sign out for phones (nav links are hidden there) */}
        <button onClick={signOut} title="Sign out"
          className="sm:hidden flex items-center justify-center w-9 h-9 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}

function PublicRoute() {
  const { user } = useAuth();
  if (user) return <Navigate to={homeForRole(user.role)} replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <AuthProvider>
      <OfflineProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          containerStyle={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
          toastOptions={{ duration: 3000 }}
        />
        <Routes>
          <Route element={<PublicRoute />}>
            <Route path="/login" element={<Login />} />
          </Route>
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/pay/:token" element={<PayLink />} />
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/:id" element={<CustomerDetail />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/jobs/:id" element={<JobDetail />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/invoices/:id" element={<InvoiceDetail />} />
            <Route path="/quotes" element={<Quotes />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/inspections" element={<Inspections />} />
            <Route path="/inspections/:id" element={<InspectionDetail />} />
            <Route path="/employees" element={<Employees />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/support" element={<Support />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/dispatch" element={<Dispatch />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/route" element={<RouteMap />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/receipts" element={<Receipts />} />
            <Route path="/price-book" element={<PriceBook />} />
            <Route path="/payroll" element={<Payroll />} />
            <Route path="/purchasing" element={<Purchasing />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/search" element={<SearchResults />} />
            <Route path="/assistant" element={<AdminAssistant />} />
            <Route path="/portal" element={<Portal />} />
            <Route path="/billing" element={<CustomerInvoices />} />
            <Route path="/appointments" element={<Appointments />} />
            <Route path="/account" element={<Account />} />
            <Route path="/more" element={<MoreCustomer />} />
            <Route path="/about" element={<AboutClarke />} />
            <Route path="/refer" element={<ReferEarn />} />
            <Route path="/addresses" element={<ServiceAddresses />} />
            <Route path="/notifications" element={<NotificationSettings />} />
            <Route path="/security" element={<Security />} />
            <Route path="/time-clock" element={<TimeClock />} />
            <Route path="/field" element={<FieldMode />} />
            <Route path="/sync" element={<SyncQueue />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </OfflineProvider>
    </AuthProvider>
  );
}
