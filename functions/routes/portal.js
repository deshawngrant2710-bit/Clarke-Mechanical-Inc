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

module.exports = router;
