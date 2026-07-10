const express = require('express');
const { v4: uuid } = require('uuid');
const { list, create } = require('../lib/db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const settings = require('../lib/settings');

const router = express.Router();
router.use(authMiddleware, requireRole('admin', 'office'));

const withItemTotals = (items) => (Array.isArray(items) ? items : []).map(i => {
  const quantity = Number(i.quantity) || 1;
  const unit_price = Number(i.unit_price) || 0;
  return { description: String(i.description || ''), quantity, unit_price, total: Math.round(quantity * unit_price * 100) / 100 };
});
function calcTotals(items, rate) {
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const tax_amount = Math.round(subtotal * rate * 100) / 100;
  return { subtotal, tax_amount, total: Math.round((subtotal + tax_amount) * 100) / 100 };
}
async function nextNumber(collection, prefix) {
  const items = await list(collection);
  const field = collection === 'invoices' ? 'invoice_number' : 'quote_number';
  let max = 1000;
  items.forEach(it => { const m = String(it[field] || '').match(/(\d+)/); if (m) max = Math.max(max, Number(m[1])); });
  return `${prefix}-${max + 1}`;
}
async function resolveCustomer(name) {
  if (!name || !name.trim()) return { id: null, name: null };
  const customers = await list('customers');
  const found = customers.find(c => (c.name || '').trim().toLowerCase() === name.trim().toLowerCase());
  if (found) return { id: found.id, name: found.name };
  const id = uuid();
  await create('customers', id, { name: name.trim(), email: null, phone: null, address: null, city: null, state: null, zip: null, notes: 'Added by assistant' });
  return { id, name: name.trim() };
}

async function runAction(action) {
  const rate = Number(await settings.get('default_tax_rate')) || 0.0875;
  const now = new Date().toISOString();
  const t = now.slice(0, 10);

  if (action.type === 'create_customer') {
    const id = uuid();
    await create('customers', id, { name: action.name || 'New Customer', email: action.email || null, phone: action.phone || null, address: action.address || null, city: null, state: null, zip: null, notes: null });
    return { type: 'customer', id, label: action.name || 'New Customer', to: `/customers/${id}` };
  }
  if (action.type === 'create_job') {
    const cust = await resolveCustomer(action.customer_name);
    const id = uuid();
    await create('jobs', id, {
      title: action.title || 'New Job', description: action.description || null, customer_id: cust.id, technician_id: null,
      status: action.scheduled_date ? 'scheduled' : 'pending', priority: action.priority || 'normal', job_type: action.job_type || null,
      scheduled_date: action.scheduled_date || null, scheduled_time: action.scheduled_time || null, completed_date: null,
      address: action.address || null, notes: 'Created by assistant', created_at: now,
    });
    return { type: 'job', id, label: action.title || 'New Job', to: `/jobs/${id}`, customer: cust.name };
  }
  if (action.type === 'create_quote') {
    const cust = await resolveCustomer(action.customer_name);
    const items = withItemTotals(action.items);
    const { subtotal, tax_amount, total } = calcTotals(items, rate);
    const number = await nextNumber('quotes', 'QUO');
    const id = uuid();
    await create('quotes', id, { quote_number: number, customer_id: cust.id, status: 'draft', issue_date: t, expiry_date: action.expiry_date || null, subtotal, tax_rate: rate, tax_amount, total, notes: action.notes || null, items });
    return { type: 'estimate', id, label: number, to: '/quotes', customer: cust.name };
  }
  if (action.type === 'create_invoice') {
    const cust = await resolveCustomer(action.customer_name);
    const items = withItemTotals(action.items);
    const { subtotal, tax_amount, total } = calcTotals(items, rate);
    const number = await nextNumber('invoices', 'INV');
    const id = uuid();
    await create('invoices', id, { invoice_number: number, customer_id: cust.id, job_id: null, status: 'draft', issue_date: t, due_date: action.due_date || null, subtotal, tax_rate: rate, tax_amount, total, notes: action.notes || null, items });
    return { type: 'invoice', id, label: number, to: `/invoices/${id}`, customer: cust.name };
  }
  return null;
}

// POST /assistant — staff operations assistant. Can create jobs, quotes, invoices, customers.
router.post('/', async (req, res) => {
  const message = (req.body?.message || '').toString().trim();
  if (!message) return res.status(400).json({ error: 'Please type a message.' });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'The assistant isn’t set up yet.' });

  const systemPrompt = [
    'You are an operations assistant for Clarke Mechanical office staff (an HVAC company).',
    'You help them create records and answer questions about running the business.',
    'To create a record, end your reply with a single final line: ACTION: <json>.',
    'Supported actions:',
    '{"type":"create_job","title":"","customer_name":"","scheduled_date":"YYYY-MM-DD","priority":"normal|high|urgent","job_type":"","address":"","description":""}',
    '{"type":"create_quote","customer_name":"","items":[{"description":"","quantity":1,"unit_price":0}],"notes":""}',
    '{"type":"create_invoice","customer_name":"","due_date":"YYYY-MM-DD","items":[{"description":"","quantity":1,"unit_price":0}],"notes":""}',
    '{"type":"create_customer","name":"","email":"","phone":""}',
    'Only emit ACTION once you have the essentials: a job needs a title; a quote or invoice needs a customer and at least one item. If key details are missing, ask one short follow-up question instead of emitting ACTION.',
    'Interpret relative dates (e.g. "next Tuesday") into YYYY-MM-DD. Never invent prices — if a unit price is unknown, use 0 and note the office can fill it in.',
    'Keep replies short and friendly.',
  ].join(' ');

  try {
    const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
    const fallback = process.env.GEMINI_FALLBACK_MODEL || 'gemini-flash-lite-latest';
    const payload = (m) => ({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`,
    });
    const history = Array.isArray(req.body.history) ? req.body.history : [];
    const contents = [
      { role: 'user', parts: [{ text: `Today's date is ${new Date().toISOString().slice(0, 10)}.` }] },
      ...history.slice(-10).filter(m => m && m.text).map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.text) }] })),
      { role: 'user', parts: [{ text: message }] },
    ];
    const body = JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents, generationConfig: { temperature: 0.3, maxOutputTokens: 600 } });
    const callModel = (m) => fetch(payload(m).url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });

    let r = await callModel(model);
    if (!r.ok && [404, 429, 500, 503].includes(r.status)) r = await callModel(fallback);
    if (!r.ok) { console.error('[admin-assistant] gemini', r.status, await r.text()); return res.status(502).json({ error: 'The assistant is having trouble right now. Please try again.' }); }

    const data = await r.json();
    const rawText = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text).join('').trim();

    let action = null;
    let replyText = rawText;
    const idx = rawText.indexOf('ACTION:');
    if (idx !== -1) {
      replyText = rawText.slice(0, idx).trim();
      let jsonStr = rawText.slice(idx + 7).trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
      try { action = JSON.parse(jsonStr); } catch { action = null; }
    }

    let result = null;
    if (action) { try { result = await runAction(action); } catch (e) { console.error('[admin-assistant] action', e.message); } }

    let reply = replyText;
    if (result) reply = `${replyText ? replyText + '\n\n' : ''}✅ Created ${result.type} ${result.label}${result.customer ? ` for ${result.customer}` : ''}.`;
    else if (!reply) reply = "Sorry, I didn't quite catch that — could you rephrase?";

    res.json({ reply, action: result });
  } catch (e) {
    console.error('[admin-assistant] failed', e.message);
    res.status(502).json({ error: 'The assistant is unavailable right now. Please try again later.' });
  }
});

module.exports = router;
