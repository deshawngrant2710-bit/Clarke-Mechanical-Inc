import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import api from '../api/client';

// Address field with autocomplete.
//   • Website: uses Google Places JS (browser key, VITE_GOOGLE_MAPS_API_KEY).
//   • Mobile app: uses the backend proxy /api/places (server key), since a
//     referrer-restricted browser key can't run from capacitor://localhost.
//   • If neither is available, it renders a plain input (no behavior change).
//
// Props: label, icon, placeholder, className, value, onChange(street),
//        onSelect({ address, city, state, zip, formatted })

const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const NATIVE = !!Capacitor?.isNativePlatform?.();
const MODE = NATIVE ? 'proxy' : (KEY ? 'gjs' : 'plain');

let loaderPromise = null;
function loadGoogle() {
  if (window.google?.maps?.places) return Promise.resolve(window.google);
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}&libraries=places&loading=async`;
    s.async = true;
    s.onerror = () => reject(new Error('Google Maps failed to load'));
    s.onload = () => (window.google?.maps?.places ? resolve(window.google) : reject(new Error('places unavailable')));
    document.head.appendChild(s);
  });
  return loaderPromise;
}

const newToken = () => (window.crypto?.randomUUID ? window.crypto.randomUUID() : String(Math.random()).slice(2));

const inputCls = (icon) =>
  `w-full ${icon ? 'pl-9' : 'pl-3'} pr-3 py-2.5 border rounded-lg text-sm outline-none transition-all duration-150 bg-white ` +
  `focus:ring-4 placeholder:text-slate-400 border-slate-300 focus:ring-blue-500/15 focus:border-blue-500 hover:border-slate-400`;

function parseComponents(components = []) {
  const get = (type) => components.find(c => c.types.includes(type));
  const streetNo = get('street_number')?.long_name || '';
  const route = get('route')?.long_name || '';
  const city = get('locality')?.long_name || get('sublocality_level_1')?.long_name || get('postal_town')?.long_name || '';
  const state = get('administrative_area_level_1')?.short_name || '';
  const zip = get('postal_code')?.long_name || '';
  return { address: `${streetNo} ${route}`.trim(), city, state, zip };
}

export default function AddressAutocomplete({ label, icon, placeholder, className = '', value = '', onChange, onSelect, ...rest }) {
  const [preds, setPreds] = useState([]); // normalized: { id, main, secondary, description }
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const gsvc = useRef(null);     // Google AutocompleteService (web)
  const gplaces = useRef(null);  // Google PlacesService (web)
  const token = useRef(null);
  const boxRef = useRef(null);
  const debounce = useRef(null);

  async function ensureGoogle() {
    if (MODE !== 'gjs' || gsvc.current) return;
    try {
      const g = await loadGoogle();
      gsvc.current = new g.maps.places.AutocompleteService();
      gplaces.current = new g.maps.places.PlacesService(document.createElement('div'));
      token.current = newToken();
    } catch { /* silently fall back to plain input */ }
  }

  useEffect(() => {
    function onDoc(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function runSearch(v) {
    if (MODE === 'gjs') {
      if (!gsvc.current) return;
      gsvc.current.getPlacePredictions(
        { input: v, componentRestrictions: { country: 'us' }, types: ['address'], sessionToken: token.current },
        (res, status) => {
          if (status === 'OK' && res) {
            setPreds(res.slice(0, 5).map(p => ({
              id: p.place_id, main: p.structured_formatting?.main_text || p.description,
              secondary: p.structured_formatting?.secondary_text || '', description: p.description,
            })));
            setOpen(true); setActive(-1);
          } else { setPreds([]); setOpen(false); }
        },
      );
    } else if (MODE === 'proxy') {
      if (!token.current) token.current = newToken();
      api.get('/places/autocomplete', { params: { q: v, token: token.current } })
        .then(r => {
          const list = (r.data.predictions || []).map(p => ({ id: p.place_id, main: p.main, secondary: p.secondary, description: p.description }));
          if (list.length) { setPreds(list); setOpen(true); setActive(-1); }
          else { setPreds([]); setOpen(false); }
        })
        .catch(() => { setPreds([]); setOpen(false); });
    }
  }

  function handleType(v) {
    onChange?.(v);
    if (MODE === 'plain') return;
    clearTimeout(debounce.current);
    if (!v || v.trim().length < 3) { setPreds([]); setOpen(false); return; }
    debounce.current = setTimeout(() => runSearch(v), 200);
  }

  function choose(pred) {
    setOpen(false); setPreds([]);
    if (MODE === 'gjs') {
      gplaces.current?.getDetails(
        { placeId: pred.id, fields: ['address_component', 'formatted_address'], sessionToken: token.current },
        (place, status) => {
          token.current = newToken();
          if (status !== 'OK' || !place) return;
          const parsed = parseComponents(place.address_components);
          onChange?.(parsed.address || pred.description);
          onSelect?.({ ...parsed, formatted: place.formatted_address || pred.description });
        },
      );
    } else if (MODE === 'proxy') {
      api.get('/places/details', { params: { place_id: pred.id, token: token.current } })
        .then(r => {
          token.current = newToken();
          const d = r.data || {};
          onChange?.(d.address || pred.description);
          onSelect?.({ address: d.address, city: d.city, state: d.state, zip: d.zip, formatted: d.formatted || pred.description });
        })
        .catch(() => {});
    }
  }

  function onKeyDown(e) {
    if (!open || !preds.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, preds.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(preds[active]); }
    else if (e.key === 'Escape') { setOpen(false); }
  }

  return (
    <div className={className} ref={boxRef}>
      {label && <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>}
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">{icon}</span>}
        <input
          {...rest}
          value={value}
          onFocus={ensureGoogle}
          onChange={e => handleType(e.target.value)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          placeholder={placeholder}
          className={inputCls(icon)}
        />
        {open && preds.length > 0 && (
          <ul className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
            {preds.map((p, i) => (
              <li key={p.id}>
                <button type="button"
                  onMouseDown={(e) => { e.preventDefault(); choose(p); }}
                  onMouseEnter={() => setActive(i)}
                  className={`w-full text-left px-3 py-2 text-sm flex items-start gap-2 ${i === active ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                  <span className="text-slate-400 mt-0.5 shrink-0">📍</span>
                  <span className="min-w-0">
                    <span className="block font-medium text-slate-800 truncate">{p.main}</span>
                    <span className="block text-xs text-slate-500 truncate">{p.secondary}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
