import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, Badge, Btn, Spinner, Empty } from '../components/UI';
import {
  Map as MapIcon, MapPin, Clock, Phone, Navigation, ChevronLeft, ChevronRight, User,
  Crosshair, Wand2, AlertTriangle, Send, ChevronDown,
} from 'lucide-react';
import DirectionsButton from '../components/DirectionsButton';
import { estimateTravelMinutes, haversineMiles, minToLabel, hmToMin } from '../lib/dispatch';
import toast from 'react-hot-toast';

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

let leafletPromise = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.src = LEAFLET_JS; script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error('Could not load the map library'));
    document.body.appendChild(script);
  });
  return leafletPromise;
}

const today = () => new Date().toISOString().slice(0, 10);
const shiftDate = (d, days) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + days); return x.toISOString().slice(0, 10); };
const prettyDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const loc = (j) => (j && j.lat != null && j.lng != null ? { lat: j.lat, lng: j.lng } : null);

// Greedy nearest-neighbour ordering from a start point (or the first stop).
function optimizeOrder(stops, start) {
  const withCoords = stops.filter(loc);
  const without = stops.filter(s => !loc(s));
  const remaining = withCoords.slice();
  const out = [];
  let cur = start || (remaining[0] ? loc(remaining[0]) : null);
  while (remaining.length) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = cur ? haversineMiles(cur, loc(remaining[i])) : 0;
      if (d < bd) { bd = d; bi = i; }
    }
    const next = remaining.splice(bi, 1)[0];
    out.push(next); cur = loc(next);
  }
  return [...out, ...without];
}

// Arrival time per stop: start + travel + job duration, chained.
function itineraryFor(stops, start, dateStr) {
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const base = dateStr === today() ? nowMin : 8 * 60;
  let cursor = null, prev = start || null;
  return stops.map(s => {
    const here = loc(s);
    const travel = estimateTravelMinutes(prev, here);
    const sched = hmToMin(s.scheduled_time);
    let arrive;
    if (cursor == null) arrive = sched != null ? Math.max(sched, base) : base;
    else arrive = sched != null ? Math.max(sched, cursor + (travel || 0)) : cursor + (travel || 0);
    cursor = arrive + 90; // assume ~90 min on site
    prev = here || prev;
    return { eta: arrive, travel };
  });
}

export default function RouteMap() {
  const navigate = useNavigate();
  const [date, setDate] = useState(today());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mapError, setMapError] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [optimized, setOptimized] = useState(false);
  const [myLoc, setMyLoc] = useState(null);
  const [listOpen, setListOpen] = useState(false);
  const [enRouting, setEnRouting] = useState(null);
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  function load(d) {
    setLoading(true);
    api.get(`/jobs/route/list?date=${d}`)
      .then(r => setData(r.data))
      .catch(() => setData({ date: d, jobs: [] }))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(date); }, [date]);

  const jobs = data?.jobs || [];
  const orderedJobs = useMemo(() => (optimized ? optimizeOrder(jobs, myLoc) : jobs), [jobs, optimized, myLoc]);
  const itinerary = useMemo(() => itineraryFor(orderedJobs, myLoc, date), [orderedJobs, myLoc, date]);
  const mappedCount = orderedJobs.filter(loc).length;
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  // Init map once.
  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then(L => {
      if (cancelled || mapRef.current || !mapEl.current) return;
      mapRef.current = L.map(mapEl.current).setView([40.73, -73.94], 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors', maxZoom: 19,
      }).addTo(mapRef.current);
      layerRef.current = L.layerGroup().addTo(mapRef.current);
      setMapReady(true);
    }).catch(() => setMapError(true));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { if (mapReady) drawAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [mapReady, orderedJobs, myLoc]);

  function drawAll() {
    const L = window.L;
    if (!L || !mapRef.current || !layerRef.current) return;
    layerRef.current.clearLayers();
    const bounds = [];
    const line = [];
    if (myLoc) {
      bounds.push([myLoc.lat, myLoc.lng]); line.push([myLoc.lat, myLoc.lng]);
      L.marker([myLoc.lat, myLoc.lng], { icon: L.divIcon({ className: '', html: '<div style="width:16px;height:16px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 2px #2563eb"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }) })
        .addTo(layerRef.current).bindPopup('You are here');
    }
    orderedJobs.filter(loc).forEach((j, i) => {
      const n = i + 1;
      const color = j.technician_name ? '#2563eb' : '#f59e0b';
      const icon = L.divIcon({
        className: 'route-pin',
        html: `<div style="background:${color};color:#fff;width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.4);border:2px solid #fff"><span style="transform:rotate(45deg);font-size:12px;font-weight:700">${n}</span></div>`,
        iconSize: [26, 26], iconAnchor: [13, 26],
      });
      L.marker([j.lat, j.lng], { icon }).addTo(layerRef.current)
        .bindPopup(`<strong>${n}. ${j.customer_name || j.title}</strong><br/>${j.address || ''}${j.scheduled_time ? `<br/>${j.scheduled_time}` : ''}`);
      bounds.push([j.lat, j.lng]); line.push([j.lat, j.lng]);
    });
    if (line.length > 1) L.polyline(line, { color: '#2563eb', weight: 3, opacity: 0.5, dashArray: '6,6' }).addTo(layerRef.current);
    if (bounds.length) mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }

  function locateMe() {
    if (!navigator.geolocation) return toast.error('Location not available on this device');
    navigator.geolocation.getCurrentPosition(
      pos => { setMyLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }); toast.success('Location found'); },
      () => toast.error('Could not get your location — check permissions'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }
  function startNav(j) {
    if (!j.address) return;
    const dest = encodeURIComponent(j.address);
    const origin = myLoc ? `&origin=${myLoc.lat},${myLoc.lng}` : '';
    window.open(`https://www.google.com/maps/dir/?api=1${origin}&destination=${dest}`, '_blank');
  }
  async function notifyEnRoute(j) {
    setEnRouting(j.id);
    try { await api.post(`/jobs/${j.id}/en-route`); toast.success(`${j.customer_name || 'Customer'} notified you're on the way`); }
    catch { toast.error('Could not send notification'); }
    finally { setEnRouting(null); }
  }
  function openFullRoute() {
    const stops = orderedJobs.filter(loc).map(j => encodeURIComponent(j.address)).join('/');
    if (!stops) return;
    const origin = myLoc ? `${myLoc.lat},${myLoc.lng}/` : '';
    window.open(`https://www.google.com/maps/dir/${origin}${stops}`, '_blank');
  }

  const StopList = () => (
    <div className="divide-y divide-slate-100 max-h-[60vh] lg:max-h-[460px] overflow-y-auto overscroll-contain">
      {orderedJobs.map((j, i) => {
        const it = itinerary[i] || {};
        const late = date === today() && it.eta != null && nowMin > it.eta && !['completed', 'cancelled'].includes(j.status);
        return (
          <div key={j.id} className="p-3.5 hover:bg-slate-50">
            <div className="flex items-start gap-2.5">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${loc(j) ? (j.technician_name ? 'bg-blue-600 text-white' : 'bg-amber-500 text-white') : 'bg-slate-200 text-slate-500'}`}>{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => navigate(`/jobs/${j.id}`)} className="text-sm font-semibold text-slate-800 hover:text-blue-600 text-left truncate">{j.customer_name || j.title}</button>
                  {it.eta != null && <span className="text-[11px] font-semibold text-slate-500">ETA {minToLabel(it.eta)}</span>}
                  {late && <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full inline-flex items-center gap-1"><AlertTriangle size={10} /> Running late</span>}
                </div>
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><Clock size={11} /> {j.scheduled_time || 'No time set'} · {j.title}{it.travel != null && i > 0 ? ` · ~${it.travel}m drive` : ''}</p>
                {j.address
                  ? <p className="text-xs text-slate-500 flex items-start gap-1 mt-0.5"><MapPin size={11} className="mt-0.5 shrink-0" /> {j.address}</p>
                  : <p className="text-xs text-amber-600 mt-0.5">No address on file — not mapped</p>}
                <p className={`text-xs flex items-center gap-1 mt-0.5 ${j.technician_name ? 'text-slate-400' : 'text-amber-600 font-medium'}`}><User size={11} /> {j.technician_name || 'Unassigned'}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <Badge status={j.status} />
                  {j.address && <button onClick={() => startNav(j)} className="text-xs font-semibold text-blue-600 inline-flex items-center gap-1"><Navigation size={11} /> Navigate</button>}
                  <button onClick={() => notifyEnRoute(j)} disabled={enRouting === j.id} className="text-xs font-medium text-slate-500 inline-flex items-center gap-1 disabled:opacity-50"><Send size={11} /> {enRouting === j.id ? 'Sending…' : "On my way"}</button>
                  {j.customer_phone && <a href={`tel:${j.customer_phone}`} className="text-xs font-medium text-slate-500 inline-flex items-center gap-1"><Phone size={11} /> Call</a>}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const unassignedNearby = orderedJobs.filter(j => loc(j) && !j.technician_name).length;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Route" subtitle="The day's stops on a map" icon={<MapIcon size={20} />}>
        {mappedCount > 1 && <Btn onClick={openFullRoute}><Navigation size={15} /> Open full route</Btn>}
      </PageHeader>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Btn variant="outline" size="sm" onClick={() => setDate(shiftDate(date, -1))}><ChevronLeft size={15} /></Btn>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500" />
        <Btn variant="outline" size="sm" onClick={() => setDate(shiftDate(date, 1))}><ChevronRight size={15} /></Btn>
        <Btn variant="outline" size="sm" onClick={() => setDate(today())}>Today</Btn>
        <div className="flex gap-2 ml-auto">
          <button onClick={locateMe} className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border ${myLoc ? 'border-blue-300 text-blue-700 bg-blue-50' : 'border-slate-200 text-slate-600'}`}><Crosshair size={15} /> My location</button>
          <button onClick={() => setOptimized(v => !v)} className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border ${optimized ? 'border-emerald-300 text-emerald-700 bg-emerald-50' : 'border-slate-200 text-slate-600'}`}><Wand2 size={15} /> {optimized ? 'Optimized' : 'Optimize'}</button>
        </div>
      </div>

      {unassignedNearby > 0 && (
        <div className="mb-4 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm inline-flex items-center gap-2">
          <MapPin size={15} /> {unassignedNearby} unassigned stop{unassignedNearby === 1 ? '' : 's'} on this route (amber pins)
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 overflow-hidden p-0">
          {mapError ? (
            <div className="h-[420px] flex items-center justify-center text-sm text-slate-400">Map could not be loaded. The stop list still works.</div>
          ) : (
            <div ref={mapEl} className="h-[380px] lg:h-[460px] w-full bg-slate-100" style={{ zIndex: 0 }} />
          )}
        </Card>

        {/* Stop list — collapsible on mobile, always open on desktop */}
        <Card className="p-0 overflow-hidden">
          <button onClick={() => setListOpen(o => !o)} className="lg:hidden w-full flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="font-semibold text-slate-800">{jobs.length} stop{jobs.length === 1 ? '' : 's'}{orderedJobs[0] ? ` · next ${orderedJobs[0].customer_name || orderedJobs[0].title}` : ''}</span>
            <ChevronDown size={18} className={`text-slate-400 transition-transform ${listOpen ? 'rotate-180' : ''}`} />
          </button>
          <div className={`${listOpen ? 'block' : 'hidden'} lg:block`}>
            {loading ? (
              <div className="h-40 flex items-center justify-center"><Spinner /></div>
            ) : jobs.length === 0 ? (
              <Empty icon={<MapPin size={26} />} title="No stops" message="Nothing is scheduled for this day." />
            ) : <StopList />}
          </div>
        </Card>
      </div>
    </div>
  );
}
