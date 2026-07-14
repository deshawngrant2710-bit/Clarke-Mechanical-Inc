import { useState, useRef, useEffect } from 'react';
import { Navigation, Car, Truck, ExternalLink } from 'lucide-react';
import { directionsLink, TRUCK_GPS_URL } from '../lib/geo';

// "Directions" button that lets the tech pick Personal vs Commercial vehicle.
// Commercial opens Google Maps in "avoid highways" mode so a truck stays off
// parkways (Belt, Grand Central, etc.), plus a link to a real truck GPS.
export default function DirectionsButton({ address, className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  if (!address) return null;

  const go = (mode) => { window.open(directionsLink(address, mode), '_blank', 'noopener'); setOpen(false); };

  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className={className || 'inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700'}>
        <Navigation size={12} /> Directions
      </button>
      {open && (
        <div className="absolute z-40 mt-1 left-0 w-56 bg-white border border-slate-200 rounded-lg shadow-xl py-1 text-left" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => go('car')} className="w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
            <Car size={15} className="text-slate-400 shrink-0" /> Personal vehicle
          </button>
          <button onClick={() => go('truck')} className="w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-start gap-2">
            <Truck size={15} className="text-slate-400 shrink-0 mt-0.5" />
            <span>Commercial vehicle<br /><span className="text-[11px] text-slate-400">Avoids parkways</span></span>
          </button>
          <a href={TRUCK_GPS_URL} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}
            className="w-full px-3 py-2 text-[11px] text-slate-400 hover:bg-slate-50 flex items-center gap-2 border-t border-slate-100">
            <ExternalLink size={12} className="shrink-0" /> Open a truck GPS app
          </a>
        </div>
      )}
    </div>
  );
}
