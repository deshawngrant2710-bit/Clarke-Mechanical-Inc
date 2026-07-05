export default function PageHeader({ title, subtitle, icon, children }) {
  return (
    <div className="flex items-end justify-between mb-6 gap-4 flex-wrap animate-fade-in">
      <div className="flex items-center gap-3.5 min-w-0">
        {icon && (
          <div className="shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center shadow-[var(--shadow-brand)]">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-page-title text-slate-900 truncate">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}
