import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { Mail, Lock, AlertCircle, User, Phone, Eye, EyeOff, CheckCircle2, ArrowLeft } from 'lucide-react';
import Logo from '../components/Logo';

// Simple password strength: 0–4 based on length + character variety.
function passwordScore(pw) {
  let s = 0;
  if (pw.length >= 6) s++;
  if (pw.length >= 10) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}
const STRENGTH = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];
const STRENGTH_COLOR = ['bg-red-400', 'bg-red-400', 'bg-amber-400', 'bg-blue-400', 'bg-emerald-500'];

const emptyForm = { firstName: '', lastName: '', email: '', phone: '', password: '' };

function Field({ label, icon: Icon, error, trailing, ...props }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      <div className="relative">
        <Icon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          {...props}
          className={`w-full pl-9 ${trailing ? 'pr-10' : 'pr-3'} py-2.5 border rounded-lg text-sm bg-white outline-none transition-all focus:ring-4 hover:border-slate-400
            ${error ? 'border-red-400 focus:ring-red-500/15 focus:border-red-500' : 'border-slate-300 focus:ring-blue-500/15 focus:border-blue-500'}`}
        />
        {trailing}
      </div>
    </div>
  );
}

export default function Login() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'forgot'
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [biz, setBiz] = useState(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  const isSignup = mode === 'signup';
  const isForgot = mode === 'forgot';
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  useEffect(() => { api.get('/auth/public-info').then(r => setBiz(r.data)).catch(() => {}); }, []);

  function switchMode(next) {
    setMode(next);
    setError('');
    setNotice('');
    setForm(emptyForm);
  }

  function onPasswordKey(e) { setCapsOn(e.getModifierState && e.getModifierState('CapsLock')); }
  const strength = passwordScore(form.password);

  function validate() {
    if (!isSignup) return null;
    if (!form.firstName.trim()) return 'First name is required';
    if (!form.lastName.trim()) return 'Last name is required';
    if (!form.email.trim()) return 'Email address is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Please enter a valid email address';
    if (!form.phone.trim()) return 'Phone number is required';
    if (form.password.length < 6) return 'Password must be at least 6 characters';
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    if (isForgot) {
      if (!form.email.trim()) return setError('Please enter your email address');
      setLoading(true);
      try {
        await api.post('/auth/forgot-password', { email: form.email.trim().toLowerCase() });
        setNotice("If an account exists for that email, we've sent a password reset link. Check your inbox.");
      } catch (err) {
        setError(err.response?.data?.error || 'Could not send the reset email');
      } finally { setLoading(false); }
      return;
    }
    const v = validate();
    if (v) return setError(v);
    setLoading(true);
    try {
      if (isSignup) {
        const { data } = await api.post('/auth/register', {
          name: `${form.firstName.trim()} ${form.lastName.trim()}`,
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim(),
          password: form.password,
        });
        login(data.token, data.user);
      } else {
        const { data } = await api.post('/auth/login', { email: form.email.trim().toLowerCase(), password: form.password });
        login(data.token, data.user);
      }
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || (isSignup ? 'Could not create account' : 'Login failed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left brand panel */}
      <div className="hidden lg:flex items-center justify-center w-[45%] bg-white p-12 border-r border-slate-200">
        <Logo variant="full" height={96} />
      </div>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="lg:hidden flex justify-center mb-8">
            <div className="bg-white rounded-2xl shadow-lg px-6 py-4"><Logo variant="full" height={48} /></div>
          </div>

          {/* Mode toggle */}
          {!isForgot && (
            <div className="flex p-1 mb-8 bg-slate-100 rounded-xl">
              <button type="button" onClick={() => switchMode('signin')}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${!isSignup ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                Sign In
              </button>
              <button type="button" onClick={() => switchMode('signup')}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${isSignup ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                Sign Up
              </button>
            </div>
          )}

          <h2 className="text-2xl font-bold text-slate-900">{isForgot ? 'Reset your password' : isSignup ? 'Create your account' : 'Welcome back'}</h2>
          <p className="text-sm text-slate-500 mt-1 mb-6">
            {isForgot ? "Enter your email and we'll send you a link to reset your password."
              : isSignup ? 'Enter your details to get started with Clarke Mechanical.' : 'Sign in to your Clarke Mechanical account.'}
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2 animate-slide-down">
              <AlertCircle size={16} className="shrink-0" /> {error}
            </div>
          )}
          {notice && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm flex items-center gap-2 animate-slide-down">
              <CheckCircle2 size={16} className="shrink-0" /> {notice}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {isSignup && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="First name" icon={User} type="text" autoComplete="given-name"
                  value={form.firstName} onChange={set('firstName')} placeholder="Jane" />
                <Field label="Last name" icon={User} type="text" autoComplete="family-name"
                  value={form.lastName} onChange={set('lastName')} placeholder="Doe" />
              </div>
            )}

            <Field label="Email address" icon={Mail} type="email" autoComplete="email" autoFocus
              autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="email"
              value={form.email} onChange={set('email')} placeholder="you@clarkemechanical.com" />

            {isSignup && (
              <Field label="Phone number" icon={Phone} type="tel" autoComplete="tel"
                value={form.phone} onChange={set('phone')} placeholder="(555) 000-0000" />
            )}

            {!isForgot && (
              <div>
                <Field label="Password" icon={Lock} type={showPassword ? 'text' : 'password'}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  value={form.password} onChange={set('password')} onKeyUp={onPasswordKey} onKeyDown={onPasswordKey}
                  placeholder={isSignup ? 'At least 6 characters' : '••••••••'}
                  trailing={
                    <button type="button" onClick={() => setShowPassword(v => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      title={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  } />
                {capsOn && (
                  <p className="mt-1.5 text-xs text-amber-600 flex items-center gap-1"><AlertCircle size={12} /> Caps Lock is on</p>
                )}
                {isSignup && form.password && (
                  <div className="mt-2">
                    <div className="flex gap-1">
                      {[0, 1, 2, 3].map(i => (
                        <div key={i} className={`h-1 flex-1 rounded-full ${i < strength ? STRENGTH_COLOR[strength] : 'bg-slate-200'}`} />
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Password strength: <span className="font-medium text-slate-500">{STRENGTH[strength]}</span></p>
                  </div>
                )}
                {!isSignup && (
                  <div className="text-right mt-1.5">
                    <button type="button" onClick={() => switchMode('forgot')} className="text-xs font-medium text-blue-600 hover:text-blue-700">Forgot password?</button>
                  </div>
                )}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-semibold py-2.5 rounded-lg text-sm transition-all shadow-sm hover:shadow-[0_6px_18px_-4px_rgb(37_99_235_/_0.4)] disabled:opacity-50"
            >
              {loading ? (isForgot ? 'Sending…' : isSignup ? 'Creating account…' : 'Signing in…') : (isForgot ? 'Send reset link' : isSignup ? 'Create Account' : 'Sign In')}
            </button>
          </form>

          {isForgot ? (
            <p className="text-sm text-slate-500 text-center mt-6">
              <button type="button" onClick={() => switchMode('signin')} className="font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1">
                <ArrowLeft size={14} /> Back to sign in
              </button>
            </p>
          ) : (
            <p className="text-sm text-slate-500 text-center mt-6">
              {isSignup ? 'Already have an account? ' : "Don't have an account? "}
              <button type="button" onClick={() => switchMode(isSignup ? 'signin' : 'signup')}
                className="font-semibold text-blue-600 hover:text-blue-700">
                {isSignup ? 'Sign in' : 'Sign up'}
              </button>
            </p>
          )}

          {biz?.business_phone && (
            <p className="text-xs text-slate-400 text-center mt-4 pt-4 border-t border-slate-100">
              Trouble signing in? Call us at <a href={`tel:${biz.business_phone}`} className="font-medium text-slate-500 hover:text-slate-700">{biz.business_phone}</a>
            </p>
          )}

        </div>
      </div>
    </div>
  );
}
