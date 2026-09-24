// AI part-pricing — identify an HVAC/boiler part from a photo and/or description,
// estimate a fair contractor price, and match it against the company Price Book.
//
// Uses the same Gemini setup as the assistant (GEMINI_API_KEY). Vision-capable
// Flash models accept an inline image. Prices are AI ESTIMATES the office confirms
// — never presented as live supplier quotes.
const express = require('express');
const { list } = require('../lib/db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireRole('admin', 'office'));

// Pull the base64 payload + mime type out of a data URL or raw base64 string.
function parseImage(image) {
  if (!image || typeof image !== 'string') return null;
  const m = image.match(/^data:([^;]+);base64,(.*)$/);
  if (m) return { mimeType: m[1], data: m[2] };
  // Raw base64 with no header — assume JPEG.
  return { mimeType: 'image/jpeg', data: image.replace(/\s/g, '') };
}

// Keyword-match the identified part against the price book (name + category).
function matchPriceBook(name, book) {
  const words = String(name || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2);
  if (!words.length) return [];
  return book
    .map(it => {
      const hay = `${it.name || ''} ${it.category || ''}`.toLowerCase();
      const score = words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0);
      return { it, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(x => ({ id: x.it.id, name: x.it.name, unit_price: Number(x.it.unit_price) || 0, category: x.it.category || null }));
}

function extractJson(text) {
  if (!text) return null;
  let s = text.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a !== -1 && b !== -1) s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch { return null; }
}

// POST /api/ai/price-part  { description?, image? (data URL / base64), notes? }
router.post('/price-part', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI pricing isn’t set up yet (missing Gemini API key).' });

  const description = String(req.body?.description || '').trim();
  const notes = String(req.body?.notes || '').trim();
  const img = parseImage(req.body?.image);
  if (!description && !img) return res.status(400).json({ error: 'Add a photo or a description of the part.' });

  const systemPrompt = [
    'You are a parts estimator for Clarke Mechanical, an HVAC / boiler service company in the New York area.',
    'Identify the heating/cooling part shown in the photo and/or described, then estimate a fair CONTRACTOR PARTS price in USD (the part only, not labor).',
    'Base the estimate on typical US wholesale/retail pricing for that part. If you are unsure of the exact model, give your best identification and a sensible price range.',
    'Respond with ONLY a JSON object, no prose, in exactly this shape:',
    '{"name":"short part name","category":"e.g. Controls, Pumps, Valves, Ignition, Motors, Fittings, Other","description":"1-2 sentence what it is / where it is used","unit_price":<number>,"price_low":<number>,"price_high":<number>,"confidence":"low|medium|high"}',
    'unit_price is your single best estimate; price_low/price_high bound a reasonable range. Use numbers only (no $ signs).',
    'If you truly cannot tell what the part is, set name to "Unclear" and confidence to "low".',
  ].join(' ');

  const userParts = [];
  const ask = [];
  if (description) ask.push(`Described part: ${description}`);
  if (notes) ask.push(`Notes: ${notes}`);
  ask.push(img ? 'Identify the part in the attached photo and price it.' : 'Identify and price this part.');
  userParts.push({ text: ask.join('\n') });
  if (img) userParts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });

  try {
    const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
    const fallback = process.env.GEMINI_FALLBACK_MODEL || 'gemini-flash-lite-latest';
    const url = (m) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: userParts }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 500, responseMimeType: 'application/json' },
    });
    const call = (m) => fetch(url(m), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });

    let r = await call(model);
    if (!r.ok && [404, 429, 500, 503].includes(r.status)) r = await call(fallback);
    if (!r.ok) { console.error('[ai] gemini', r.status, await r.text()); return res.status(502).json({ error: 'The AI is having trouble right now. Please try again.' }); }

    const data = await r.json();
    const rawText = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text).join('').trim();
    const parsed = extractJson(rawText);
    if (!parsed || !parsed.name) return res.status(502).json({ error: 'Could not read the part. Try a clearer photo or add a description.' });

    const book = await list('pricebook').catch(() => []);
    const matches = matchPriceBook(parsed.name, book);

    res.json({
      name: String(parsed.name).slice(0, 120),
      category: parsed.category || null,
      description: parsed.description ? String(parsed.description).slice(0, 400) : '',
      unit_price: Math.max(0, Number(parsed.unit_price) || 0),
      price_low: Math.max(0, Number(parsed.price_low) || 0),
      price_high: Math.max(0, Number(parsed.price_high) || 0),
      confidence: ['low', 'medium', 'high'].includes(parsed.confidence) ? parsed.confidence : 'low',
      matches,
      note: 'AI estimate — confirm before quoting.',
    });
  } catch (e) {
    console.error('[ai] price-part failed:', e.message);
    res.status(502).json({ error: 'The AI is unavailable right now. Please try again later.' });
  }
});

module.exports = router;
