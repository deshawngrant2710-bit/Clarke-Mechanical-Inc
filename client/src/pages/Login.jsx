import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { Mail, Lock, AlertCircle, User, Phone, Eye, EyeOff } from 'lucide-react';
import Logo from '../components/Logo';

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
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const isSignup = mode === 'signup';
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  function switchMode(next) {
    setMode(next);
    setError('');
    setForm(emptyForm);
  }

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

          <h2 className="text-2xl font-bold text-slate-900">{isSignup ? 'Create your account' : 'Welcome back'}</h2>
          <p className="text-sm text-slate-500 mt-1 mb-6">
            {isSignup ? 'Enter your details to get started with Clarke Mechanical.' : 'Sign in to your Clarke Mechanical account.'}
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2 animate-slide-down">
              <AlertCircle size={16} className="shrink-0" /> {error}
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

            <Field label="Email address" icon={Mail} type="email" autoComplete="email"
              autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="email"
              value={form.email} onChange={set('email')} placeholder="you@clarkemechanical.com" />

            {isSignup && (
              <Field label="Phone number" icon={Phone} type="tel" autoComplete="tel"
                value={form.phone} onChange={set('phone')} placeholder="(555) 000-0000" />
            )}

            <Field label="Password" icon={Lock} type={showPassword ? 'text' : 'password'}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              value={form.password} onChange={set('password')}
              placeholder={isSignup ? 'At least 6 characters' : '••••••••'}
              trailing={
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              } />

            <button
              type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-semibold py-2.5 rounded-lg text-sm transition-all shadow-sm hover:shadow-[0_6px_18px_-4px_rgb(37_99_235_/_0.4)] disabled:opacity-50"
            >
              {loading ? (isSignup ? 'Creating account…' : 'Signing in…') : (isSignup ? 'Create Account' : 'Sign In')}
            </button>
          </form>

          <p className="text-sm text-slate-500 text-center mt-6">
            {isSignup ? 'Already have an account? ' : "Don't have an account? "}
            <button type="button" onClick={() => switchMode(isSignup ? 'signin' : 'signup')}
              className="font-semibold text-blue-600 hover:text-blue-700">
              {isSignup ? 'Sign in' : 'Sign up'}
            </button>
          </p>

        </div>
      </div>
    </div>
  );
}
