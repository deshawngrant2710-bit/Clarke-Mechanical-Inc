const express = require('express');
const { v4: uuid } = require('uuid');
const { list, create } = require('../lib/db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const settings = require('../lib/settings');
const { buildServiceAgreementBody } = require('../lib/serviceAgreement');

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
  let max = 4199; // documents start at 4200
  items.forEach(it => { const m = String(it[field] || '').match(/(\d+)/); if (m) max = Math.max(max, Number(m[1])); });
  return `${prefix}-${max + 1}`;
}
// Proposals use a zero-padded PROP-#### sequence (matches routes/proposals.js).
async function nextProposalNumber() {
  const all = await list('proposals');
  let max = 4199; // documents start at 4200
  all.forEach(p => { const m = String(p.proposal_number || '').match(/^[A-Za-z]+-(\d+)$/); if (m) max = Math.max(max, Number(m[1])); });
  return `PROP-${String(max + 1).padStart(4, '0')}`;
}

// Pulls current business data relevant to the question so the assistant can
// answer about existing customers, invoices, estimates, and jobs.
async function buildContext(message) {
  try {
    const [customers, invoices, quotes, jobs, payments] = await Promise.all([
      list('customers'), list('invoices'), list('quotes'), list('jobs'), list('payments'),
    ]);
    const paidBy = {};
    for (const p of payments) { if (p.invoice_id) paidBy[p.invoice_id] = (paidBy[p.invoice_id] || 0) + (Number(p.amount) || 0); }
    const balOf = (i) => Math.max(0, (Number(i.total) || 0) - (paidBy[i.id] || 0));
    const nameOf = Object.fromEntries(customers.map(c => [c.id, c.name || 'Unknown']));
    const today = new Date().toISOString().slice(0, 10);
    const m = (v) => `$${(Number(v) || 0).toFixed(2)}`;
    const unpaid = invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled');
    const outstanding = unpaid.reduce((s, i) => s + balOf(i), 0);
    const overdue = unpaid.filter(i => i.due_date && i.due_date < today);
    const openJobs = jobs.filter(j => !['completed', 'cancelled'].includes(j.status));
    const openQuotes = quotes.filter(q => ['sent', 'draft'].includes(q.status));

    const low = message.toLowerCase();
    const digits = message.match(/\d{3,}/g) || [];
    const hit = (n) => { n = String(n || '').toLowerCase(); return !!n && (low.includes(n) || digits.some(d => n.includes(d))); };
    const invLine = (i) => { const bal = balOf(i); return `Invoice ${i.invoice_number} — ${nameOf[i.customer_id]}, ${i.status}, total ${m(i.total)}${bal > 0 && bal < (Number(i.total) || 0) ? `, ${m((paidBy[i.id] || 0))} paid, ${m(bal)} outstanding` : ''}${i.due_date ? `, due ${i.due_date}` : ''}`; };
    const quoteLine = (q) => `Estimate ${q.quote_number} — ${nameOf[q.customer_id]}, ${q.status}, ${m(q.total)}`;

    const matchedInv = invoices.filter(i => hit(i.invoice_number));
    const matchedQuote = quotes.filter(q => hit(q.quote_number));
    const matchedCust = customers.filter(c => c.name && low.includes(c.name.toLowerCase()));

    const out = [`Snapshot: ${customers.length} customers, ${openJobs.length} open jobs, ${unpaid.length} unpaid invoices totaling ${m(outstanding)} (${overdue.length} overdue), ${openQuotes.length} open estimates.`];
    if (matchedInv.length) out.push('Matching invoices:\n' + matchedInv.slice(0, 8).map(invLine).join('\n'));
    if (matchedQuote.length) out.push('Matching estimates:\n' + matchedQuote.slice(0, 8).map(quoteLine).join('\n'));
    for (const c of matchedCust.slice(0, 3)) {
      const theirs = invoices.filter(i => i.customer_id === c.id);
      const theirJobs = jobs.filter(j => j.customer_id === c.id).length;
      out.push(`Customer ${c.name} (${c.email || 'no email'}, ${c.phone || 'no phone'}): ${theirs.length} invoices, ${theirJobs} jobs.` + (theirs.length ? '\n' + theirs.slice(0, 6).map(invLine).join('\n') : ''));
    }
    if (!matchedInv.length && !matchedQuote.length && !matchedCust.length && overdue.length) {
      out.push('Overdue invoices:\n' + overdue.slice(0, 10).map(invLine).join('\n'));
    }
    return out.join('\n\n').slice(0, 6000);
  } catch (e) { console.error('[admin-assistant] context failed:', e.message); return ''; }
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
    const number = await nextNumber('quotes', 'EST');
    const id = uuid();
    await create('quotes', id, { quote_number: number, customer_id: cust.id, status: 'draft', issue_date: t, expiry_date: action.expiry_date || null, subtotal, tax_rate: rate, tax_amount, total, notes: action.notes || null, items });
    return { type: 'estimate', id, label: number, to: '/quotes', customer: cust.name };
  }
  if (action.type === 'create_invoice') {
    const cust = await resolveCustomer(action.customer_name);
    const items = withItemTotals(action.items);
    const { subtotal, tax_amount, total } = calcTotals(items, rate);
    const number = await nextNumber('invoices', 'CL');
    const id = uuid();
    await create('invoices', id, { invoice_number: number, customer_id: cust.id, job_id: null, status: 'draft', issue_date: t, due_date: action.due_date || null, subtotal, tax_rate: rate, tax_amount, total, notes: action.notes || null, items });
    return { type: 'invoice', id, label: number, to: `/invoices/${id}`, customer: cust.name };
  }
  if (action.type === 'create_service_agreement') {
    const cust = await resolveCustomer(action.customer_name || action.owner);
    // The contract price is one line item; Clarke's clauses are added by the builder.
    const price = Number(action.contract_price) || 0;
    const items = withItemTotals([{ description: action.title || 'Full Burner Service Agreement', quantity: 1, unit_price: price }]);
    const { subtotal, tax_amount, total } = calcTotals(items, rate);
    const body = buildServiceAgreementBody({
      owner: action.owner || cust.name,
      equipment: action.equipment,
      service_type: action.service_type,
      service_address: action.service_address,
      period_from: action.period_from,
      period_to: action.period_to,
      term_label: action.term_label,
      response_window: action.response_window,
      max_response: action.max_response,
      annual_visits: action.annual_visits,
      included: action.included,
      not_covered: action.not_covered,
      contract_price: price,
      package_note: action.package_note,
    });
    const number = await nextProposalNumber();
    const id = uuid();
    await create('proposals', id, {
      proposal_number: number, customer_id: cust.id, title: action.title || 'Full Burner Service Agreement',
      status: 'draft', issue_date: t, expiry_date: action.expiry_date || null,
      prepared_by: action.prepared_by || null, service_address: action.service_address || null,
      body, items, subtotal, discount: 0, tax_rate: rate, tax_amount, total, milestones: [], deposit: 0,
      created_at: now,
    });
    return { type: 'service agreement', id, label: number, to: '/proposals', customer: cust.name };
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
    'You help them create records AND answer questions about existing ones.',
    'You are given CURRENT BUSINESS DATA in the conversation (customers, invoices, estimates, jobs). Use it to answer look-up questions like "do you see invoice CL-4201" or "who owes money". If something is not in the provided data, say you could not find it — do not make it up.',
    'To create a record, end your reply with a single final line: ACTION: <json>.',
    'Supported actions:',
    '{"type":"create_job","title":"","customer_name":"","scheduled_date":"YYYY-MM-DD","priority":"normal|high|urgent","job_type":"","address":"","description":""}',
    '{"type":"create_quote","customer_name":"","items":[{"description":"","quantity":1,"unit_price":0}],"notes":""}',
    '{"type":"create_invoice","customer_name":"","due_date":"YYYY-MM-DD","items":[{"description":"","quantity":1,"unit_price":0}],"notes":""}',
    '{"type":"create_customer","name":"","email":"","phone":""}',
    '{"type":"create_service_agreement","customer_name":"","owner":"","equipment":"","service_type":"","service_address":"","period_from":"","period_to":"","term_label":"","contract_price":0,"annual_visits":4,"included":[],"not_covered":[],"expiry_date":"YYYY-MM-DD","package_note":""}',
    'Use create_service_agreement when the user asks to draft a service agreement, service contract, maintenance agreement, or burner/boiler contract. This creates a Proposal draft they can review, price, e-sign and send.',
    'IMPORTANT for service agreements: DO NOT write the legal terms yourself. Clarke Mechanical has standard, vetted clauses (limitation of liability, act of God, asbestos exclusion, parts & payment, terms, etc.) that the system adds automatically and verbatim. Your job is only to capture the variables: owner/customer name, the equipment (e.g. "GAS FIRED CONDENSING BOILERS"), what service is rendered (e.g. "oil burner service"), the premises/service address, the coverage period (period_from and period_to as readable dates like "October 1st, 2024"), the term_label (e.g. "TWELVE (12) months"), and the contract_price. Leave included/not_covered empty unless the user gives a custom scope — the system fills in Clarke\'s standard lists.',
    'A service agreement needs at minimum: a customer/owner and a contract_price. If the premises address, coverage period, or equipment are missing, you may still emit ACTION (the draft leaves blanks the office can fill), but prefer to ask one short follow-up if the customer or price is missing.',
    'Only emit ACTION once you have the essentials: a job needs a title; a quote or invoice needs a customer and at least one item; a service agreement needs a customer and a price. If key details are missing, ask one short follow-up question instead of emitting ACTION.',
    'Interpret relative dates (e.g. "next Tuesday") into YYYY-MM-DD.',
    'PRICING: when asked what to charge or what a part/service costs, give a helpful ESTIMATE — a fair US contractor price or a sensible range — and label it clearly as an estimate to confirm. Use the price book context if provided. However, when you EMIT an ACTION that creates a record, do not silently bake in a guessed unit price: use the price the user stated, or 0 with a note the office can fill it in.',
    'Keep replies short and friendly.',
  ].join(' ');

  try {
    const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
    const fallback = process.env.GEMINI_FALLBACK_MODEL || 'gemini-flash-lite-latest';
    const payload = (m) => ({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`,
    });
    const history = Array.isArray(req.body.history) ? req.body.history : [];
    const context = await buildContext(message);
    const contents = [
      { role: 'user', parts: [{ text: `Today's date is ${new Date().toISOString().slice(0, 10)}.` }] },
      ...(context ? [{ role: 'user', parts: [{ text: `CURRENT BUSINESS DATA (use to answer; do not invent):\n${context}` }] }] : []),
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
