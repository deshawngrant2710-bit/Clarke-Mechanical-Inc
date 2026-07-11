import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import PageHeader from '../components/PageHeader';
import { Card, Badge, Btn, Spinner, Empty } from '../components/UI';
import { Map as MapIcon, MapPin, Clock, Phone, Navigation, ChevronLeft, ChevronRight, User } from 'lucide-react';

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

// Load Leaflet from CDN once and resolve with window.L (no npm dependency needed).
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

export default function RouteMap() {
  const navigate = useNavigate();
  const [date, setDate] = useState(today());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mapError, setMapError] = useState(false);
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
      drawMarkers();
    }).catch(() => setMapError(true));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw markers whenever the day's jobs change.
  useEffect(() => { drawMarkers(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [data]);

  function drawMarkers() {
    const L = window.L;
    if (!L || !mapRef.current || !layerRef.current) return;
    layerRef.current.clearLayers();
    const mapped = (data?.jobs || []).filter(j => j.lat != null && j.lng != null);
    if (!mapped.length) return;
    const bounds = [];
    mapped.forEach((j, i) => {
      const n = i + 1;
      const icon = L.divIcon({
        className: 'route-pin',
        html: `<div style="background:#2563eb;color:#fff;width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.4);border:2px solid #fff"><span style="transform:rotate(45deg);font-size:12px;font-weight:700">${n}</span></div>`,
        iconSize: [26, 26], iconAnchor: [13, 26],
      });
      const marker = L.marker([j.lat, j.lng], { icon }).addTo(layerRef.current);
      marker.bindPopup(`<strong>${n}. ${j.customer_name || j.title}</strong><br/>${j.address || ''}${j.scheduled_time ? `<br/>${j.scheduled_time}` : ''}`);
      bounds.push([j.lat, j.lng]);
    });
    if (bounds.length) mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }

  const jobs = data?.jobs || [];
  const mappedJobs = jobs.filter(j => j.lat != null && j.lng != null);

  // Build a Google Maps directions URL through all stops (works on any device).
  function openFullRoute() {
    const stops = mappedJobs.map(j => encodeURIComponent(j.address)).join('/');
    if (!stops) return;
    window.open(`https://www.google.com/maps/dir/${stops}`, '_blank');
  }
  const directionsUrl = (addr) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Route" subtitle="The day's stops on a map" icon={<MapIcon size={20} />}>
        {mappedJobs.length > 1 && <Btn onClick={openFullRoute}><Navigation size={15} /> Open full route</Btn>}
      </PageHeader>

      <div className="flex items-center gap-2 mb-4">
        <Btn variant="outline" size="sm" onClick={() => setDate(shiftDate(date, -1))}><ChevronLeft size={15} /></Btn>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500" />
        <Btn variant="outline" size="sm" onClick={() => setDate(shiftDate(date, 1))}><ChevronRight size={15} /></Btn>
        <Btn variant="outline" size="sm" onClick={() => setDate(today())}>Today</Btn>
        <span className="text-sm text-slate-500 ml-1">{prettyDate(date)}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Map */}
        <Card className="lg:col-span-2 overflow-hidden p-0">
          {mapError ? (
            <div className="h-[420px] flex items-center justify-center text-sm text-slate-400">Map could not be loaded. The stop list still works.</div>
          ) : (
            <div ref={mapEl} className="h-[420px] w-full bg-slate-100" style={{ zIndex: 0 }} />
          )}
        </Card>

        {/* Stop list */}
        <Card className="p-0 overflow-hidden">
          {loading ? (
            <div className="h-40 flex items-center justify-center"><Spinner /></div>
          ) : jobs.length === 0 ? (
            <Empty icon={<MapPin size={26} />} title="No stops" message="Nothing is scheduled for this day." />
          ) : (
            <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
              {jobs.map((j, i) => (
                <div key={j.id} className="p-3.5 hover:bg-slate-50">
                  <div className="flex items-start gap-2.5">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${j.lat != null ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <button onClick={() => navigate(`/jobs/${j.id}`)} className="text-sm font-semibold text-slate-800 hover:text-blue-600 text-left truncate block w-full">
                        {j.customer_name || j.title}
                      </button>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><Clock size={11} /> {j.scheduled_time || 'No time set'} · {j.title}</p>
                      {j.address ? (
                        <p className="text-xs text-slate-500 flex items-start gap-1 mt-0.5"><MapPin size={11} className="mt-0.5 shrink-0" /> {j.address}</p>
                      ) : <p className="text-xs text-amber-600 mt-0.5">No address on file — not mapped</p>}
                      {j.technician_name && <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><User size={11} /> {j.technician_name}</p>}
                      <div className="flex items-center gap-2 mt-1.5">
                        <Badge status={j.status} />
                        {j.address && <a href={directionsUrl(j.address)} target="_blank" rel="noreferrer" className="text-xs font-medium text-blue-600 inline-flex items-center gap-1"><Navigation size={11} /> Directions</a>}
                        {j.customer_phone && <a href={`tel:${j.customer_phone}`} className="text-xs font-medium text-slate-500 inline-flex items-center gap-1"><Phone size={11} /> Call</a>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
