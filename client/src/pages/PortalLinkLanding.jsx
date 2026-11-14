import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';

// Where a customer lands when they tap their portal link. Swaps the link for a
// login and sends them straight to their portal — no email or password.
export default function PortalLinkLanding() {
  const { token } = useParams();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;          // guard against double-run in dev StrictMode
    ran.current = true;
    api.post('/portal-links/redeem', { token })
      .then(({ data }) => {
        login(data.token, data.user);
        navigate('/portal', { replace: true });
      })
      .catch(e => setError(e.response?.data?.error || 'This link no longer works. Please call Clarke Mechanical for a new one.'));
  }, [token, login, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-sm w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
        <div className="flex justify-center mb-4"><Logo /></div>
        {error ? (
          <>
            <h1 className="text-lg font-bold text-slate-900 mb-2">We couldn’t open your account</h1>
            <p className="text-sm text-slate-500 mb-5">{error}</p>
            <a href="tel:+15162066256" className="inline-block w-full bg-blue-600 text-white rounded-xl py-3 font-semibold">Call (516) 206-6256</a>
          </>
        ) : (
          <>
            <div className="w-8 h-8 mx-auto mb-3 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
            <p className="text-slate-600">Opening your account…</p>
          </>
        )}
      </div>
    </div>
  );
}
