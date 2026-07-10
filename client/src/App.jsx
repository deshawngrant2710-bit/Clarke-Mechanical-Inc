import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Menu } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import Logo from './components/Logo';
import Login from './pages/Login';
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
import Support from './pages/Support';
import Reports from './pages/Reports';
import Dispatch from './pages/Dispatch';
import Payments from './pages/Payments';
import SearchResults from './pages/SearchResults';
import TimeClock from './pages/TimeClock';
import { canAccess, homeForRole } from './lib/roles';

function Layout() {
  const { user } = useAuth();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setNavOpen(false); }, [location.pathname]);
  if (!user) return <Navigate to="/login" replace />;
  // Role guard: send users to their home if they hit a page they can't access.
  if (!canAccess(user.role, location.pathname)) {
    return <Navigate to={homeForRole(user.role)} replace />;
  }
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex flex-col flex-1 min-w-0">
        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 h-14 px-4 bg-white border-b border-slate-200">
          <button onClick={() => setNavOpen(true)} aria-label="Open menu" className="p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100 active:scale-95 transition">
            <Menu size={22} />
          </button>
          <Logo variant="icon" height={26} />
          <span className="font-bold text-sm text-slate-800">Clarke Mechanical</span>
        </header>
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1400px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
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
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <Routes>
          <Route element={<PublicRoute />}>
            <Route path="/login" element={<Login />} />
          </Route>
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
            <Route path="/payments" element={<Payments />} />
            <Route path="/search" element={<SearchResults />} />
            <Route path="/portal" element={<Portal />} />
            <Route path="/time-clock" element={<TimeClock />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
