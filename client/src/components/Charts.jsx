import { useState } from 'react';

/* ================================================================== */
/*  Donut chart — pure SVG, animated, interactive legend              */
/* ================================================================== */
export function DonutChart({ data, size = 168, thickness = 22 }) {
  const [active, setActive] = useState(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  const radius = (size - thickness) / 2;
  const circ = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={thickness} />
          {total > 0 && data.map((d, i) => {
            const frac = d.value / total;
            const dash = frac * circ;
            const seg = (
              <circle
                key={i}
                cx={size / 2} cy={size / 2} r={radius} fill="none"
                stroke={d.color} strokeWidth={active === i ? thickness + 4 : thickness}
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
                className="transition-all duration-300"
                style={{ opacity: active === null || active === i ? 1 : 0.35, cursor: 'pointer' }}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
              />
            );
            offset += dash;
            return seg;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-slate-800 leading-none">
            {active !== null ? data[active].value : total}
          </span>
          <span className="text-xs text-slate-400 mt-1">{active !== null ? data[active].label : 'Total Jobs'}</span>
        </div>
      </div>
      <div className="flex-1 space-y-2 min-w-0">
        {data.map((d, i) => (
          <div key={i}
            onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
            className="flex items-center justify-between gap-3 cursor-pointer group">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
              <span className="text-sm text-slate-600 capitalize truncate group-hover:text-slate-900">{d.label}</span>
            </div>
            <span className="text-sm font-semibold text-slate-800">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Area/line chart — pure SVG, gradient fill, hover tooltip           */
/* ================================================================== */
export function AreaChart({ data, height = 220, format = (v) => `$${v.toLocaleString()}` }) {
  const [hover, setHover] = useState(null);
  const w = 640, h = height, padX = 12, padY = 24;
  const max = Math.max(...data.map(d => d.total), 1);
  const stepX = (w - padX * 2) / Math.max(data.length - 1, 1);
  const x = (i) => padX + i * stepX;
  const y = (v) => h - padY - (v / max) * (h - padY * 2);

  const pts = data.map((d, i) => [x(i), y(d.total)]);
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
  const area = `${line} L ${x(data.length - 1)} ${h - padY} L ${x(0)} ${h - padY} Z`;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* gridlines */}
        {[0.25, 0.5, 0.75, 1].map((f, i) => (
          <line key={i} x1={padX} x2={w - padX} y1={y(max * f)} y2={y(max * f)} stroke="#f1f5f9" strokeWidth="1" />
        ))}
        <path d={area} fill="url(#areaFill)" className="animate-fade-in" />
        <path d={line} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <g key={i}>
            <rect x={x(i) - stepX / 2} y={0} width={stepX} height={h} fill="transparent"
              onMouseEnter={() => setHover(i)} style={{ cursor: 'pointer' }} />
            <circle cx={p[0]} cy={p[1]} r={hover === i ? 5 : 3.5}
              fill="#fff" stroke="#2563eb" strokeWidth="2.5" className="transition-all" />
          </g>
        ))}
        {hover !== null && (
          <line x1={pts[hover][0]} x2={pts[hover][0]} y1={padY} y2={h - padY} stroke="#93c5fd" strokeWidth="1" strokeDasharray="3 3" />
        )}
      </svg>
      {/* x labels */}
      <div className="flex justify-between px-2 mt-1">
        {data.map((d, i) => (
          <span key={i} className={`text-xs ${hover === i ? 'text-blue-600 font-semibold' : 'text-slate-400'}`}>{d.label}</span>
        ))}
      </div>
      {/* tooltip */}
      {hover !== null && (
        <div className="absolute -top-2 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold shadow-lg pointer-events-none animate-fade-in-scale"
          style={{ left: `${(x(hover) / w) * 100}%`, transform: 'translate(-50%, -100%)' }}>
          {format(data[hover].total)}
          <div className="text-[10px] text-slate-300 font-normal">{data[hover].label}</div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Mini sparkline bars                                                */
/* ================================================================== */
export function MiniBars({ data, color = '#3b82f6', height = 40 }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((v, i) => (
        <div key={i} className="flex-1 rounded-t transition-all duration-500"
          style={{ height: `${(v / max) * 100}%`, background: color, opacity: 0.35 + 0.65 * (v / max) }} />
      ))}
    </div>
  );
}
