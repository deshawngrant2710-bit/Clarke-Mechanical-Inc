import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { homeForRole } from '../lib/roles';

// Pages that already render their own top-of-page "Back" control.
const HAS_OWN_BACK = [
  /^\/about$/, /^\/notifications$/, /^\/refer$/, /^\/security$/, /^\/addresses$/,
  /^\/customers\/[^/]+$/, /^\/jobs\/[^/]+$/, /^\/invoices\/[^/]+$/,
  /^\/inspections\/[^/]+$/, /^\/installations\/[^/]+$/,
];

// One consistent Back control on every page except the role's home screen.
// Goes to the previous in-app page when there is one; otherwise to home, so a
// deep link (e.g. a texted portal link) never "backs" out of the site.
export default function BackBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const home = homeForRole(user?.role);
  if (pathname === home || HAS_OWN_BACK.some(r => r.test(pathname))) return null;

  function back() {
    const idx = typeof window !== 'undefined' ? window.history.state?.idx : 0;
    if (typeof idx === 'number' && idx > 0) navigate(-1);
    else navigate(home, { replace: true });
  }

  return (
    <button type="button" onClick={back} aria-label="Go back"
      className="mb-3 -ml-1 inline-flex items-center gap-1.5 min-h-[44px] px-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200">
      <ArrowLeft size={18} /> Back
    </button>
  );
}
