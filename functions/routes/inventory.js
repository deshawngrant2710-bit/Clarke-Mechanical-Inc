const express = require('express');
const { v4: uuid } = require('uuid');
const { list, getById, create, update, remove } = require('../lib/db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireRole ('admin', 'office'));

const FIELDS = ['name', 'sku', 'description', 'category', 'quantity', 'min_quantity', 'unit_price', 'supplier', 'location'];

router.get('/', async (req, res) => {
  const items = await list('inventory', { orderBy: 'name' });
  res.json(items);
});

router.post('/', async (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'Name is required' });
  const data = {};
  for (const f of FIELDS) data[f] = req.body[f] ?? (['quantity', 'min_quantity', 'unit_price'].includes(f) ? 0 : null);
  const saved = await create('inventory', uuid(), data);
  res.status(201).json(saved);
});

router.put('/:id', async (req, res) => {
  const existing = await getById('inventory', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item not found' });
  const patch = {};
  for (const f of FIELDS) if (f in req.body) patch[f] = req.body[f];
  const saved = await update('inventory', req.params.id, patch);
  res.json(saved);
});

router.delete('/:id', async (req, res) => {
  await remove('inventory', req.params.id);
  res.json({ success: true });
});
// POST /portal/assistant — customer-facing AI helper. Proxies Google Gemini so the
// API key stays on the server and is never exposed in the browser.
router.post('/assistant', async (req, res) => {
  const message = (req.body?.message || '').toString().trim();
  if (!message) return res.status(400).json({ error: 'Please type a message.' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'The assistant isn’t set up yet. Please contact the office.' });

  let biz = {};
  try { biz = (await settings.emailConfig()).business || {}; } catch { /* fall back to blanks */ }

  const systemPrompt = [
    `You are a friendly customer-support assistant for ${biz.name || 'a home HVAC company'}.`,
    'Help customers with questions about HVAC services, scheduling, invoices, and general heating and cooling advice.',
    'Keep answers short, clear, and polite.',
    'You cannot actually book, reschedule, or change appointments, view invoices, or access account details.',
    `For those, tell the customer to use the "Request Service" button or contact the office${biz.phone ? ` at ${biz.phone}` : ''}${biz.email ? ` (${biz.email})` : ''}.`,
    'Never invent specific appointment times, prices, or account information.',
  ].join(' ');

  try {
    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const history = Array.isArray(req.body.history) ? req.body.history : [];
    const contents = [
      ...history.slice(-10)
        .filter(m => m && m.text)
        .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.text) }] })),
      { role: 'user', parts: [{ text: message }] },
    ];

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.4, maxOutputTokens: 500 },
      }),
    });

    if (!r.ok) {
      console.error('[assistant] Gemini error:', r.status, await r.text());
      return res.status(502).json({ error: 'The assistant is having trouble right now. Please try again in a moment.' });
    }

    const data = await r.json();
    const reply = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text).join('').trim();
    res.json({ reply: reply || "Sorry, I didn't quite catch that — could you rephrase?" });
  } catch (e) {
    console.error('[assistant] failed:', e.message);
    res.status(502).json({ error: 'The assistant is unavailable right now. Please try again later.' });
  }
});
module.exports = router;
