// Best-effort current location. Resolves {lat,lng,accuracy} or null (never rejects),
// so a denied/failed GPS never blocks clocking in or out.
export function getLocation(timeout = 8000) {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), accuracy: Math.round(p.coords.accuracy) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 0 }
    );
  });
}

export const mapsLink = (loc) => (loc ? `https://www.google.com/maps?q=${loc.lat},${loc.lng}` : null);

// Turn-by-turn directions to a job address. Opens the device's default maps app
// (Google Maps in-browser, Apple Maps on iOS) with the address as destination.
//  - mode 'car'   → standard driving directions
//  - mode 'truck' → commercial: keeps off parkways by avoiding highways (dirflg=h).
//    Consumer maps can't do true truck routing, so drivers should confirm with a
//    truck GPS for low bridges / weight limits (see TRUCK_GPS_URL).
export const directionsLink = (address, mode = 'car') => {
  if (!address) return null;
  const dest = encodeURIComponent(address);
  if (mode === 'truck') return `https://www.google.com/maps?daddr=${dest}&dirflg=h`;
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
};

// A dedicated truck GPS for guaranteed commercial-legal routing.
export const TRUCK_GPS_URL = 'https://smarttruckroute.com/';
