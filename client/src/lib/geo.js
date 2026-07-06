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
