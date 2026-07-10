const express = require('express');
const { v4: uuid } = require('uuid');
const { db, getById, findWhere, create, update, nameMap } = require('../lib/db');
const { authMiddleware } = require('../middleware/auth');
const { sendMail, render } = require('../lib/email');
const settings = require('../lib/settings');

const router = express.Router();
router.use(authMiddleware);

// Find the customer record(s) linked to the logged-in user by email → their ids.
async function myCustomerIds(req) {
  const email = (req.user?.email || '').toLowerCase();
  if (!email) return { ids: [], records: [] };
  const records = await findWhere('customers', 'email', email);
  return { ids: records.map(r => r.id), records };
}

const byCreated = (a, b) => (b.created_at || '').localeCompare(a.created_at || '');

router.get('/me', async (req, res) => {
  const { ids, records } = await myCustomerIds(req);
  let openJobs = 0, balanceDue = 0, invoiceCount = 0;
  if (ids.length) {
    const [jobs, invoices] = await Promise.all([
      Promise.all(ids.map(id => findWhere('jobs', 'customer_id', id))).then(a => a.flat()),
      Promise.all(ids.map(id => findWhere('invoices', 'customer_id', id))).then(a => a.flat()),
    ]);
    openJobs = jobs.filter(j => !['completed', 'cancelled'].includes(j.status)).length;
    invoiceCount = invoices.length;
    balanceDue = invoices.filter(i => !['paid', 'cancelled'].includes(i.status)).reduce((s, i) => s + (i.total || 0), 0);
  }
  const cfg = await settings.emailConfig();
  res.json({
    name: req.user.name, email: req.user.email, role: req.user.role,
    linked: records.length > 0,
    profile: records[0] || null,
    stats: { openJobs, invoiceCount, balanceDue },
    business: cfg.business,
  });
});

router.get('/jobs', async (req, res) => {
  const { ids } = await myCustomerIds(req);
  if (!ids.length) return res.json([]);
  const [jobsNested, techs, reviewsNested] = await Promise.all([
    Promise.all(ids.map(id => findWhere('jobs', 'customer_id', id))),
    nameMap('users'),
    Promise.all(ids.map(id => findWhere('reviews', 'customer_id', id))),
  ]);
  const reviewByJob = {};
  reviewsNested.flat().forEach(r => { reviewByJob[r.job_id] = { rating: r.rating, comment: r.comment }; });
  const jobs = jobsNested.flat()
    .map(j => ({
      id: j.id, title: j.title, status: j.status, priority: j.priority, job_type: j.job_type,
      scheduled_date: j.scheduled_date, scheduled_time: j.scheduled_time, address: j.address,
      description: j.description, technician_name: techs[j.technician_id] || null, created_at: j.created_at,
      review: reviewByJob[j.id] || null,
      signed_by: j.signed_by || null, signed_at: j.signed_at || null, signature: j.signature || null,
    }))
    .sort(byCreated);
  res.json(jobs);
});

router.get('/invoices', async (req, res) => {
  const { ids } = await myCustomerIds(req);
  if (!ids.length) return res.json([]);
  const invNested = await Promise.all(ids.map(id => findWhere('invoices', 'customer_id', id)));
  res.json(invNested.flat().sort(byCreated));
});

router.get('/quotes', async (req, res) => {
  const { ids } = await myCustomerIds(req);
  if (!ids.length) return res.json([]);
  const qNested = await Promise.all(ids.map(id => findWhere('quotes', 'customer_id', id)));
  res.json(qNested.flat().sort(byCreated));
});

// POST /portal/service-request — customer books a new service (creates a pending job).
router.post('/service-request', async (req, res) => {
  const { ids, records } = await myCustomerIds(req);
  if (!ids.length) return res.status(422).json({ error: "Your account isn't linked to a customer record yet." });
  const { title, description, preferred_date } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Please describe the service you need' });

  const customer = records[0];
  const id = uuid();
  const job = await create('jobs', id, {
    title: title.trim(),
    description: description ? description.trim() : null,
    customer_id: customer.id,
    technician_id: null,
    status: 'pending',
    priority: 'normal',
    job_type: 'Service Request',
    scheduled_date: preferred_date || null,
    scheduled_time: null,
    completed_date: null,
    address: customer.address || null,
    notes: `Requested via customer portal by ${req.user.name}`,
  });

  // Best-effort: notify the business a new request came in.
  try {
    const to = await settings.get('business_email');
    if (to) {
      const html = `<div style="font-family:sans-serif;font-size:15px;color:#334155;line-height:1.6">
        <p><strong>New service request from ${customer.name}</strong></p>
        <p><strong>Service:</strong> ${job.title}<br/>
        ${job.description ? `<strong>Details:</strong> ${job.description}<br/>` : ''}
        ${preferred_date ? `<strong>Preferred date:</strong> ${preferred_date}<br/>` : ''}
        <strong>Contact:</strong> ${customer.email || ''} ${customer.phone || ''}<br/>
        ${customer.address ? `<strong>Address:</strong> ${customer.address}` : ''}</p>
        <p>Open the Jobs tab in Clarke Mechanical to schedule it.</p></div>`;
      await sendMail({ type: 'service_request', to, toName: 'Clarke Mechanical', subject: `New service request — ${customer.name}`, html, customerId: customer.id, sentBy: 'Customer Portal' });
    }
  } catch (e) { console.error('[portal] notify failed:', e.message); }

  // Confirmation email to the customer.
  try {
    if (customer.email) {
      const { subject, html } = await render('service_confirmation', { ...job, customer_name: customer.name });
      await sendMail({ type: 'service_confirmation', to: customer.email, toName: customer.name, subject, html, relatedId: job.id, customerId: customer.id, sentBy: 'Automated' });
    }
  } catch (e) { console.error('[portal] confirmation failed:', e.message); }

  res.status(201).json(job);
});

// POST /portal/jobs/:id/signoff — customer signs off on completed work.
router.post('/jobs/:id/signoff', async (req, res) => {
  const { ids, records } = await myCustomerIds(req);
  const job = await getById('jobs', req.params.id);
  if (!job || !ids.includes(job.customer_id)) return res.status(404).json({ error: 'Service not found' });
  if (job.status !== 'completed') return res.status(400).json({ error: 'You can only sign off on completed services' });
  if (job.signed_at) return res.status(409).json({ error: 'This service has already been signed off' });
  const { signature, signed_by } = req.body;
  if (!signature) return res.status(400).json({ error: 'Please provide your signature' });
  await update('jobs', req.params.id, {
    signature, signed_by: (signed_by || records[0]?.name || req.user.name), signed_at: new Date().toISOString(),
  });
  const saved = await getById('jobs', req.params.id);
  res.json({ id: saved.id, signed_by: saved.signed_by, signed_at: saved.signed_at });
});

// GET /portal/reviews — the customer's own reviews.
router.get('/reviews', async (req, res) => {
  const { ids } = await myCustomerIds(req);
  if (!ids.length) return res.json([]);
  const nested = await Promise.all(ids.map(id => findWhere('reviews', 'customer_id', id)));
  res.json(nested.flat().sort(byCreated));
});

// POST /portal/reviews — leave a review for one of your completed jobs.
router.post('/reviews', async (req, res) => {
  const { ids, records } = await myCustomerIds(req);
  if (!ids.length) return res.status(422).json({ error: "Your account isn't linked yet." });
  const { job_id, rating, comment } = req.body;
  const r = Number(rating);
  if (!(r >= 1 && r <= 5)) return res.status(400).json({ error: 'Please choose a rating from 1 to 5' });
  const job = await getById('jobs', job_id);
  if (!job || !ids.includes(job.customer_id)) return res.status(404).json({ error: 'Service not found' });
  if (job.status !== 'completed') return res.status(400).json({ error: 'You can only review completed services' });
  const existing = await findWhere('reviews', 'job_id', job_id);
  if (existing.length) return res.status(409).json({ error: "You've already reviewed this service" });
  const saved = await create('reviews', uuid(), {
    job_id, customer_id: job.customer_id, customer_name: records[0]?.name || req.user.name,
    job_title: job.title, rating: r, comment: (comment || '').trim() || null,
  });
  res.status(201).json(saved);
});

// POST /portal/quotes/:id/respond — accept or decline an estimate.
router.post('/quotes/:id/respond', async (req, res) => {
  const { ids } = await myCustomerIds(req);
  const quote = await getById('quotes', req.params.id);
  if (!quote || !ids.includes(quote.customer_id)) return res.status(404).json({ error: 'Quote not found' });
  const decision = req.body.decision;
  if (!['accepted', 'declined'].includes(decision)) return res.status(400).json({ error: 'Invalid decision' });
  if (!['sent', 'draft'].includes(quote.status)) return res.status(400).json({ error: 'This estimate can no longer be changed' });
  const saved = await update('quotes', req.params.id, { status: decision });
  res.json(saved);
});

// POST /portal/jobs/:id/cancel — cancel an unstarted service request.
router.post('/jobs/:id/cancel', async (req, res) => {
  const { ids } = await myCustomerIds(req);
  const job = await getById('jobs', req.params.id);
  if (!job || !ids.includes(job.customer_id)) return res.status(404).json({ error: 'Service not found' });
  if (!['pending', 'scheduled'].includes(job.status)) return res.status(400).json({ error: 'This service can no longer be cancelled' });
  const saved = await update('jobs', req.params.id, { status: 'cancelled' });
  res.json(saved);
});

// PUT /portal/jobs/:id/reschedule — change the preferred date of an unstarted service.
router.put('/jobs/:id/reschedule', async (req, res) => {
  const { ids } = await myCustomerIds(req);
  const job = await getById('jobs', req.params.id);
  if (!job || !ids.includes(job.customer_id)) return res.status(404).json({ error: 'Service not found' });
  if (!['pending', 'scheduled'].includes(job.status)) return res.status(400).json({ error: 'This service can no longer be rescheduled' });
  const saved = await update('jobs', req.params.id, { scheduled_date: req.body.preferred_date || null });
  res.json(saved);
});

// PUT /portal/profile — customer updates their own contact details.
router.put('/profile', async (req, res) => {
  const { ids } = await myCustomerIds(req);
  if (!ids.length) return res.status(422).json({ error: "Your account isn't linked to a customer record yet." });
  const { phone, address, city, state, zip } = req.body;
  const saved = await update('customers', ids[0], {
    phone: phone || null, address: address || null, city: city || null, state: state || null, zip: zip || null,
  });
  res.json({ id: saved.id, name: saved.name, email: saved.email, phone: saved.phone, address: saved.address, city: saved.city, state: saved.state, zip: saved.zip });
});

// GET /portal/payment-config — the publishable Stripe key for the browser.
// (The secret key stays server-side and is never sent to the client.)
router.get('/payment-config', async (req, res) => {
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || null;
  const enabled = !!(process.env.STRIPE_SECRET_KEY && publishableKey);
  res.json({ enabled, publishableKey });
});

// Remaining balance on an invoice, in cents.
async function invoiceBalanceCents(invoice) {
  const existing = await findWhere('payments', 'invoice_id', invoice.id);
  const alreadyPaid = existing.reduce((s, p) => s + (p.amount || 0), 0);
  const balance = Math.max(0, (invoice.total || 0) - alreadyPaid);
  return Math.round(balance * 100);
}

// POST /portal/invoices/:id/create-intent — start a Stripe PaymentIntent for the balance.
router.post('/invoices/:id/create-intent', async (req, res) => {
  const { ids } = await myCustomerIds(req);
  const invoice = await getById('invoices', req.params.id);
  if (!invoice || !ids.includes(invoice.customer_id)) return res.status(404).json({ error: 'Invoice not found' });
  if (invoice.status === 'paid') return res.status(400).json({ error: 'This invoice is already paid.' });

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return res.status(503).json({ error: 'Online payments are not set up yet.' });

  const amountCents = await invoiceBalanceCents(invoice);
  if (amountCents <= 0) return res.status(400).json({ error: 'Nothing left to pay on this invoice.' });

  try {
    const body = new URLSearchParams();
    body.set('amount', String(amountCents));
    body.set('currency', 'usd');
    body.set('payment_method_types[]', 'card');
    body.set('metadata[invoice_id]', invoice.id);
    body.set('description', `Invoice ${invoice.invoice_number || invoice.id} — customer portal`);

    const r = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const pi = await r.json();
    if (!r.ok || !pi.client_secret) {
      console.error('[stripe] create intent failed:', r.status, JSON.stringify(pi.error || pi));
      return res.status(502).json({ error: 'Could not start the payment. Please try again.' });
    }
    res.json({ clientSecret: pi.client_secret, paymentIntentId: pi.id, amount: amountCents });
  } catch (e) {
    console.error('[stripe] create intent error:', e.message);
    res.status(502).json({ error: 'The payment service is unavailable right now. Please try again shortly.' });
  }
});

// POST /portal/invoices/:id/confirm-payment — verify a PaymentIntent with Stripe, then record it.
// The server confirms status directly with Stripe rather than trusting the browser.
router.post('/invoices/:id/confirm-payment', async (req, res) => {
  const { ids } = await myCustomerIds(req);
  const invoice = await getById('invoices', req.params.id);
  if (!invoice || !ids.includes(invoice.customer_id)) return res.status(404).json({ error: 'Invoice not found' });

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return res.status(503).json({ error: 'Online payments are not set up yet.' });

  const { paymentIntentId } = req.body || {};
  if (!paymentIntentId) return res.status(400).json({ error: 'Missing payment reference.' });

  try {
    const r = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const pi = await r.json();
    if (!r.ok || !pi.id) return res.status(502).json({ error: 'Could not verify the payment.' });
    if (pi.status !== 'succeeded') return res.status(402).json({ error: 'That payment has not completed.' });
    if (pi.metadata?.invoice_id && pi.metadata.invoice_id !== invoice.id) return res.status(400).json({ error: 'Payment does not match this invoice.' });

    // Record it once (guard against double-submits recording the same PaymentIntent twice).
    const existing = await findWhere('payments', 'invoice_id', invoice.id);
    if (!existing.some(p => p.reference === pi.id)) {
      await create('payments', uuid(), {
        invoice_id: invoice.id, amount: (pi.amount_received || pi.amount || 0) / 100, method: 'card',
        reference: pi.id, notes: 'Paid online via Stripe', paid_at: new Date().toISOString(),
      });
    }
    const total = (await findWhere('payments', 'invoice_id', invoice.id)).reduce((s, p) => s + (p.amount || 0), 0);
    const paid = total >= (invoice.total || 0);
    if (paid && invoice.status !== 'paid') await update('invoices', invoice.id, { status: 'paid' });
    res.json({ ok: true, status: paid ? 'paid' : 'partial' });
  } catch (e) {
    console.error('[stripe] confirm error:', e.message);
    res.status(502).json({ error: 'Could not verify the payment. If you were charged, please contact the office.' });
  }
});

// POST /portal/invoices/:id/pay-cash — customer signals they'll pay in cash; email the office.
router.post('/invoices/:id/pay-cash', async (req, res) => {
  const { ids, records } = await myCustomerIds(req);
  const invoice = await getById('invoices', req.params.id);
  if (!invoice || !ids.includes(invoice.customer_id)) return res.status(404).json({ error: 'Invoice not found' });
  const customer = records[0];
  try {
    const to = await settings.get('business_email');
    if (to) {
      const html = `<div style="font-family:sans-serif;font-size:15px;color:#334155;line-height:1.6">
        <p><strong>${customer?.name || 'A customer'} would like to pay invoice ${invoice.invoice_number || ''} in cash.</strong></p>
        <p><strong>Amount:</strong> $${Number(invoice.total || 0).toFixed(2)}<br/>
        <strong>Contact:</strong> ${customer?.email || ''} ${customer?.phone || ''}</p>
        <p>Please arrange collection and record the payment in Clarke Mechanical.</p></div>`;
      await sendMail({ type: 'cash_payment_request', to, toName: 'Clarke Mechanical', subject: `Cash payment request — ${customer?.name || ''}`, html, customerId: invoice.customer_id, sentBy: 'Customer Portal' });
    }
  } catch (e) { console.error('[portal] cash notify failed:', e.message); }
  res.json({ ok: true });
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
