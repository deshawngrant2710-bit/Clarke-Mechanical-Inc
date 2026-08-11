// Address autocomplete proxy (Google Places Web Service). Used by the mobile app,
// which can't use a browser/referrer-restricted key. Keeps the key server-side.
// Configure env GOOGLE_PLACES_API_KEY on the server (a key with API restriction
// "Places API", no website restriction). Authenticated: any signed-in user.
const express = require('express');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const keyOf = () => process.env.GOOGLE_PLACES_API_KEY;

// GET /api/places/autocomplete?q=...&token=...
router.get('/autocomplete', async (req, res) => {
  try {
    const key = keyOf();
    const q = (req.query.q || '').trim();
    if (!key || q.length < 3) return res.json({ predictions: [] });
    const token = req.query.token ? `&sessiontoken=${encodeURIComponent(req.query.token)}` : '';
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(q)}&components=country:us&types=address&key=${key}${token}`;
    const r = await fetch(url);
    const d = await r.json();
    const predictions = (d.predictions || []).slice(0, 5).map(p => ({
      place_id: p.place_id,
      description: p.description,
      main: p.structured_formatting?.main_text || p.description,
      secondary: p.structured_formatting?.secondary_text || '',
    }));
    res.json({ predictions });
  } catch (e) {
    console.error('[places] autocomplete failed:', e.message);
    res.json({ predictions: [] });
  }
});

function parseComponents(components = []) {
  const get = (type) => components.find(c => (c.types || []).includes(type));
  const streetNo = get('street_number')?.long_name || '';
  const route = get('route')?.long_name || '';
  const city = get('locality')?.long_name || get('sublocality_level_1')?.long_name || get('postal_town')?.long_name || '';
  const state = get('administrative_area_level_1')?.short_name || '';
  const zip = get('postal_code')?.long_name || '';
  return { address: `${streetNo} ${route}`.trim(), city, state, zip };
}

// GET /api/places/details?place_id=...&token=...
router.get('/details', async (req, res) => {
  try {
    const key = keyOf();
    const placeId = req.query.place_id;
    if (!key) return res.status(400).json({ error: 'not_configured' });
    if (!placeId) return res.status(400).json({ error: 'place_id required' });
    const token = req.query.token ? `&sessiontoken=${encodeURIComponent(req.query.token)}` : '';
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=address_component,formatted_address&key=${key}${token}`;
    const r = await fetch(url);
    const d = await r.json();
    const parsed = parseComponents(d.result?.address_components);
    res.json({ ...parsed, formatted: d.result?.formatted_address || '' });
  } catch (e) {
    console.error('[places] details failed:', e.message);
    res.status(502).json({ error: 'lookup_failed' });
  }
});

module.exports = router;
