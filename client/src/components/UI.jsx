import { useEffect, useRef, useState } from 'react';
import { Loader2, Check } from 'lucide-react';

/* ================================================================== */
/*  Status system                                                      */
/* ================================================================== */
export const STATUS_COLORS = {
  // Jobs
  pending:        'bg-amber-100 text-amber-800 ring-amber-600/20',
  scheduled:      'bg-blue-100 text-blue-800 ring-blue-600/20',
  'in-progress':  'bg-violet-100 text-violet-800 ring-violet-600/20',
  completed:      'bg-emerald-100 text-emerald-800 ring-emerald-600/20',
  cancelled:      'bg-slate-100 text-slate-600 ring-slate-500/20',
  emergency:      'bg-red-100 text-red-700 ring-red-600/20',
  'awaiting-parts': 'bg-orange-100 text-orange-700 ring-orange-600/20',
  'awaiting-signoff': 'bg-teal-100 text-teal-800 ring-teal-600/20',
  'waiting-customer': 'bg-yellow-100 text-yellow-800 ring-yellow-600/20',
  // Invoices / Quotes
  draft:      'bg-slate-100 text-slate-600 ring-slate-500/20',
  sent:       'bg-blue-100 text-blue-800 ring-blue-600/20',
  viewed:     'bg-indigo-100 text-indigo-800 ring-indigo-600/20',
  paid:       'bg-emerald-100 text-emerald-800 ring-emerald-600/20',
  overdue:    'bg-red-100 text-red-700 ring-red-600/20',
  accepted:   'bg-emerald-100 text-emerald-800 ring-emerald-600/20',
  declined:   'bg-red-100 text-red-700 ring-red-600/20',
  // Priority
  low:        'bg-slate-100 text-slate-600 ring-slate-500/20',
  normal:     'bg-blue-100 text-blue-800 ring-blue-600/20',
  high:       'bg-orange-100 text-orange-700 ring-orange-600/20',
  urgent:     'bg-red-100 text-red-700 ring-red-600/20',
};

export function Badge({ status, className = '' }) {
  const cls = STATUS_COLORS[status] || 'bg-slate-100 text-slate-600 ring-slate-500/20';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ring-1 ring-inset ${cls} ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {status?.replace(/-/g, ' ')}
    </span>
  );
}

/* ================================================================== */
/*  Button — one system, ripple + loading + variants                   */
/* ================================================================== */
export function Btn({
  children, onClick, variant = 'primary', size = 'md', className = '',
  type = 'button', disabled, loading = false, ...rest
}) {
  const [ripples, setRipples] = useState([]);
  const base = 'ripple-host relative inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-all duration-150 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-500';
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2 text-sm', lg: 'px-5 py-2.5 text-[15px]' };
  const variants = {
    primary:  'bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-[0_6px_18px_-4px_rgb(37_99_235_/_0.4)]',
    secondary:'bg-white border border-slate-300 hover:border-slate-400 hover:bg-slate-50 text-slate-700 shadow-xs',
    outline:  'bg-white border border-slate-300 hover:border-slate-400 hover:bg-slate-50 text-slate-700 shadow-xs',
    danger:   'bg-red-600 hover:bg-red-700 text-white shadow-sm hover:shadow-[0_6px_18px_-4px_rgb(220_38_38_/_0.4)]',
    success:  'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm',
    ghost:    'hover:bg-slate-100 text-slate-700',
    orange:   'bg-orange-500 hover:bg-orange-600 text-white shadow-sm',
  };
  function handleClick(e) {
    if (disabled || loading) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const id = Date.now();
    setRipples(r => [...r, { id, size, x: e.clientX - rect.left - size / 2, y: e.clientY - rect.top - size / 2 }]);
    setTimeout(() => setRipples(r => r.filter(x => x.id !== id)), 600);
    onClick?.(e);
  }
  return (
    <button type={type} onClick={handleClick} disabled={disabled || loading}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest}>
      {ripples.map(r => (
        <span key={r.id} className="ripple-dot" style={{ width: r.size, height: r.size, left: r.x, top: r.y }} />
      ))}
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

/* ================================================================== */
/*  Card — premium, optional hover lift                                */
/* ================================================================== */
export function Card({ children, className = '', hover = false, onClick, ...rest }) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl border border-slate-200/80 shadow-[var(--shadow-sm)] transition-all duration-200 ${
        hover ? 'hover:shadow-[var(--shadow-lg)] hover:-translate-y-0.5 hover:border-slate-300 cursor-pointer' : ''
      } ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, action, icon, className = '' }) {
  return (
    <div className={`flex items-center justify-between px-5 py-4 border-b border-slate-100 ${className}`}>
      <div className="flex items-center gap-2.5">
        {icon && <span className="text-slate-400">{icon}</span>}
        <h2 className="text-card-title text-slate-800">{title}</h2>
      </div>
      {action}
    </div>
  );
}

/* ================================================================== */
/*  Inputs — icon slot, focus ring, validation check                   */
/* ================================================================== */
export function Input({ label, error, valid, icon, className = '', hint, ...props }) {
  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>}
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">{icon}</span>}
        <input
          className={`w-full ${icon ? 'pl-9' : 'pl-3'} ${valid ? 'pr-9' : 'pr-3'} py-2.5 border rounded-lg text-sm outline-none transition-all duration-150 bg-white
            focus:ring-4 placeholder:text-slate-400
            ${error
              ? 'border-red-400 focus:ring-red-500/15 focus:border-red-500'
              : 'border-slate-300 focus:ring-blue-500/15 focus:border-blue-500 hover:border-slate-400'}`}
          {...props}
        />
        {valid && !error && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 animate-pop"><Check size={16} strokeWidth={3} /></span>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-600 font-medium animate-slide-down">{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function Select({ label, error, children, className = '', ...props }) {
  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>}
      <select
        className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all duration-150 bg-white cursor-pointer
          focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500 hover:border-slate-400
          ${error ? 'border-red-400' : 'border-slate-300'}`}
        {...props}
      >
        {children}
      </select>
      {error && <p className="mt-1 text-xs text-red-600 font-medium">{error}</p>}
    </div>
  );
}

export function Textarea({ label, className = '', ...props }) {
  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>}
      <textarea
        rows={3}
        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none transition-all duration-150 resize-none bg-white focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500 hover:border-slate-400 placeholder:text-slate-400"
        {...props}
      />
    </div>
  );
}

/* ================================================================== */
/*  Search input                                                       */
/* ================================================================== */
export function SearchInput({ value, onChange, placeholder = 'Search…', icon, className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">{icon}</span>
      <input
        value={value} onChange={onChange} placeholder={placeholder}
        className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm bg-white outline-none transition-all duration-150 focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500 hover:border-slate-400 placeholder:text-slate-400"
      />
    </div>
  );
}

/* ================================================================== */
/*  Modal — animated                                                   */
/* ================================================================== */
export function Modal({ open, onClose, title, subtitle, children, size = 'lg' }) {
  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${sizes[size]} my-8 animate-fade-in-scale`}>
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{title}</h2>
            {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg w-8 h-8 flex items-center justify-center text-xl leading-none transition-colors">×</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Loading                                                            */
/* ================================================================== */
export function Spinner() {
  return (
    <div className="flex items-center justify-center p-12">
      <div className="w-8 h-8 border-[3px] border-blue-100 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`skeleton ${className}`} />;
}

/* Skeleton for the common stat-cards + table list layout */
export function SkeletonPage({ stats = 4, rows = 6 }) {
  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: stats }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 p-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-3 py-4">
            <Skeleton className="w-10 h-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Empty state — premium with illustration + CTA                      */
/* ================================================================== */
export function Empty({ title = 'Nothing here yet', message, icon, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center animate-fade-in">
      {icon && (
        <div className="mb-4 w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center text-blue-500 ring-1 ring-slate-200">
          {icon}
        </div>
      )}
      <p className="text-slate-800 font-semibold">{title}</p>
      {message && <p className="text-sm text-slate-500 mt-1 max-w-sm">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ================================================================== */
/*  Animated number counter                                            */
/* ================================================================== */
export function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(0);
  const raf = useRef();
  useEffect(() => {
    const num = Number(target) || 0;
    const start = performance.now();
    cancelAnimationFrame(raf.current);
    function tick(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(num * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else setValue(num);
    }
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return value;
}

export function AnimatedNumber({ value, prefix = '', decimals = 0 }) {
  const v = useCountUp(value);
  return <>{prefix}{v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</>;
}

/* ================================================================== */
/*  Stat card — animated, trend, hover lift                            */
/* ================================================================== */
export function StatCard({ label, value, icon, color = 'blue', sub, trend, prefix = '', decimals = 0, animate = true, onClick }) {
  const colors = {
    blue:   { bg: 'bg-blue-50',   text: 'text-blue-600',   glow: 'from-blue-500/10' },
    green:  { bg: 'bg-emerald-50', text: 'text-emerald-600', glow: 'from-emerald-500/10' },
    orange: { bg: 'bg-orange-50', text: 'text-orange-600', glow: 'from-orange-500/10' },
    red:    { bg: 'bg-red-50',    text: 'text-red-600',    glow: 'from-red-500/10' },
    purple: { bg: 'bg-violet-50', text: 'text-violet-600', glow: 'from-violet-500/10' },
    slate:  { bg: 'bg-slate-100', text: 'text-slate-600',  glow: 'from-slate-500/10' },
  };
  const c = colors[color] || colors.blue;
  const isNumeric = animate && (typeof value === 'number' || (typeof value === 'string' && /^[\d.,]+$/.test(value)));
  return (
    <Card hover={!!onClick} onClick={onClick}
      className={`relative overflow-hidden p-5 ${onClick ? '' : 'hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5'}`}>
      <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full bg-gradient-to-br ${c.glow} to-transparent blur-xl`} />
      <div className="relative flex items-center justify-between mb-3">
        <p className="text-sm text-slate-500 font-medium">{label}</p>
        <div className={`p-2 rounded-xl ${c.bg} ${c.text}`}>{icon}</div>
      </div>
      <p className="relative text-[26px] font-bold text-slate-800 leading-none tracking-tight">
        {isNumeric ? <AnimatedNumber value={typeof value === 'string' ? Number(value.replace(/,/g, '')) : value} prefix={prefix} decimals={decimals} /> : value}
      </p>
      <div className="relative flex items-center gap-2 mt-2">
        {trend != null && (
          <span className={`text-xs font-semibold ${trend >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}%
          </span>
        )}
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
    </Card>
  );
}

/* ================================================================== */
/*  Table primitives                                                   */
/* ================================================================== */
export function Table({ head, children, className = '' }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/60">
            {head.map((h, i) => (
              <th key={i} className={`px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider ${h.align === 'right' ? 'text-right' : 'text-left'}`}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Row({ children, onClick, className = '' }) {
  return (
    <tr onClick={onClick}
      className={`transition-colors ${onClick ? 'cursor-pointer hover:bg-blue-50/40' : ''} ${className}`}>
      {children}
    </tr>
  );
}

export function Cell({ children, align = 'left', className = '' }) {
  return <td className={`px-5 py-3.5 ${align === 'right' ? 'text-right' : ''} ${className}`}>{children}</td>;
}

/* Avatar bubble */
export function Avatar({ name, className = '' }) {
  const initials = (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const hues = ['from-blue-500 to-blue-600', 'from-violet-500 to-violet-600', 'from-emerald-500 to-emerald-600', 'from-orange-500 to-orange-600', 'from-rose-500 to-rose-600', 'from-cyan-500 to-cyan-600'];
  const hue = hues[(name?.charCodeAt(0) || 0) % hues.length];
  return (
    <div className={`shrink-0 rounded-full bg-gradient-to-br ${hue} text-white flex items-center justify-center font-semibold ${className}`}>
      {initials}
    </div>
  );
}
