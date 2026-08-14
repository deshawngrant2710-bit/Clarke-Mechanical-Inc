const express = require('express');
const { v4: uuid } = require('uuid');
const { db, list, getById, findWhere, create, update, remove, nameMap } = require('../lib/db');
const { authMiddleware } = require('../middleware/auth');
const { sendMail, render } = require('../lib/email');
const settings = require('../lib/settings');
const { referralCode } = require('../lib/referral');
const { smsConfigured, sendSms } = require('../lib/sms');
const helcim = require('../lib/helcim');

const router = express.Router();
router.use(authMiddleware);
// The customer portal is only for customer accounts. If this user has since been
// given a staff role, block portal access (their token may still say "customer").
router.use(async (req, res, next) => {
  try {
    const u = await getById('users', req.user.id);
    if (u && u.role && u.role !== 'customer') {
      return res.status(403).json({ error: 'staff_account', message: 'This account is now a staff account and can no longer use the customer portal. Please sign out and sign back in.' });
    }
  } catch { /* on lookup failure, fall through */ }
  next();
});

// Find the customer record(s) linked to the logged-in user by email → their ids.
async function myCustomerIds(req) {
  const email = (req.user?.email || '').toLowerCase();
  if (!email) return { ids: [], records: [] };
  const records = await findWhere('customers', 'email', email);
  return { ids: records.map(r => r.id), records };
}

const byCreated = (a, b) => (b.created_at || '').localeCompare(a.created_at || '');

// ---- Online booking: arrival windows ----
// Each window has a label (shown to customers) and a 24h start/end used to work out
// which existing jobs already occupy it. Capacity per window comes from settings.
const BOOKING_WINDOWS = [
  { label: '8:00–10:00 AM', start: '08:00', end: '10:00' },
  { label: '10:00 AM–12:00 PM', start: '10:00', end: '12:00' },
  { label: '12:00–2:00 PM', start: '12:00', end: '14:00' },
  { label: '2:00–4:00 PM', start: '14:00', end: '16:00' },
  { label: '4:00–6:00 PM', start: '16:00', end: '18:00' },
];
const tomorrowISO = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };

// How many non-cancelled jobs already occupy each window on a given date.
// A job counts if it was booked into the window (booking_window) OR its scheduled_time
// falls inside the window's time range — so office-scheduled work consumes capacity too.
function occupancyForDate(jobs, date, excludeId = null) {
  const day = jobs.filter(j => j.scheduled_date === date && j.status !== 'cancelled' && j.id !== excludeId);
  const counts = {};
  for (const w of BOOKING_WINDOWS) {
    counts[w.label] = day.filter(j =>
      j.booking_window === w.label ||
      (j.scheduled_time && j.scheduled_time >= w.start && j.scheduled_time < w.end)
    ).length;
  }
  return counts;
}

// GET /portal/availability?date=YYYY-MM-DD — open arrival windows for a day.
router.get('/availability', async (req, res) => {
  const date = req.query.date;
  if (!date) return res.status(400).json({ error: 'A date is required' });
  if (date < tomorrowISO()) return res.json({ date, capacity: 0, windows: [], reason: 'Bookings start tomorrow.' });
  const capacity = Math.max(1, Number(await settings.get('booking_slot_capacity')) || 2);
  const jobs = await list('jobs');
  const counts = occupancyForDate(jobs, date);
  const windows = BOOKING_WINDOWS.map(w => {
    const remaining = Math.max(0, capacity - (counts[w.label] || 0));
    return { label: w.label, remaining, full: remaining <= 0 };
  });
  res.json({ date, capacity, windows });
});

router.get('/me', async (req, res) => {
  const { ids, records } = await myCustomerIds(req);

  // Single source of truth: the customer edits their phone in My Account (the users
  // record). Mirror it onto their customer record(s) so the whole portal, the office,
  // and SMS verification all use the same current number. Self-heals any old drift.
  try {
    const authUser = await getById('users', req.user.id);
    const authPhone = authUser?.phone ? String(authUser.phone).trim() : '';
    if (authPhone) {
      for (const c of records) {
        if ((c.phone || '') !== authPhone) {
          await update('customers', c.id, { phone: authPhone, phone_verified: false, phone_verify_code: null, phone_verify_expires: null });
          c.phone = authPhone; c.phone_verified = false; c.phone_verify_code = null;
        }
      }
    }
  } catch (e) { console.error('[portal] phone reconcile:', e.message); }

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
  const flat = jobsNested.flat();
  const photosNested = await Promise.all(flat.map(j => findWhere('job_photos', 'job_id', j.id)));
  const photosByJob = {};
  flat.forEach((j, i) => { photosByJob[j.id] = (photosNested[i] || []).map(p => ({ id: p.id, caption: p.caption || null, proof_type: p.proof_type || 'image' })); });
  const jobs = flat
    .map(j => ({
      id: j.id, title: j.title, status: j.status, priority: j.priority, job_type: j.job_type,
      scheduled_date: j.scheduled_date, scheduled_time: j.scheduled_time, address: j.address,
      description: j.description, technician_name: techs[j.technician_id] || null, created_at: j.created_at,
      additional_technician_names: (Array.isArray(j.additional_technician_ids) ? j.additional_technician_ids : []).map(id => techs[id]).filter(Boolean),
      review: reviewByJob[j.id] || null,
      signed_by: j.signed_by || null, signed_at: j.signed_at || null, signature: j.signature || null,
      en_route_at: j.en_route_at || null,
      photos: photosByJob[j.id] || [],
    }))
    .sort(byCreated);
  res.json(jobs);
});

// GET /portal/jobs/:jobId/photos/:photoId — the base64 image/PDF for a job photo the customer owns.
router.get('/jobs/:jobId/photos/:photoId', async (req, res) => {
  const { ids } = await myCustomerIds(req);
  const job = await getById('jobs', req.params.jobId);
  if (!job || !ids.includes(job.customer_id)) return res.status(404).json({ error: 'Not found' });
  const photo = await getById('job_photos', req.params.photoId);
  if (!photo || photo.job_id !== req.params.jobId) return res.status(404).json({ error: 'Photo not found' });
  res.json({ proof: photo.proof || null, proof_type: photo.proof_type || 'image' });
});

router.get('/invoices', async (req, res) => {
  const { ids } = await myCustomerIds(req);
  if (!ids.length) return res.json([]);
  const invoices = (await Promise.all(ids.map(id => findWhere('invoices', 'customer_id', id)))).flat();
  const paymentsByInvoice = await Promise.all(invoices.map(inv => findWhere('payments', 'invoice_id', inv.id)));
  invoices.forEach((inv, i) => {
    inv.payments = (paymentsByInvoice[i] || [])
      .map(p => ({ amount: p.amount, method: p.method, reference: p.reference || null, paid_at: p.paid_at }))
      .sort((a, b) => (a.paid_at || '').localeCompare(b.paid_at || ''));
  });
  res.json(invoices.sort(byCreated));
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
  const { title, description, preferred_date, booking_window } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Please describe the service you need' });
  if (!preferred_date) return res.status(400).json({ error: 'Please pick a date for your appointment.' });
  if (preferred_date < tomorrowISO()) return res.status(400).json({ error: 'Please choose a date starting tomorrow.' });

  // Validate the chosen arrival window and re-check capacity server-side so two
  // customers can't book the same slot past its limit (the client view may be stale).
  const window = BOOKING_WINDOWS.find(w => w.label === booking_window);
  if (!window) return res.status(400).json({ error: 'Please choose an arrival window.' });
  const capacity = Math.max(1, Number(await settings.get('booking_slot_capacity')) || 2);
  const allJobs = await list('jobs');
  const occupied = (occupancyForDate(allJobs, preferred_date)[window.label] || 0);
  if (occupied >= capacity) return res.status(409).json({ error: 'Sorry, that time slot just filled up. Please pick another window.' });

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
    scheduled_date: preferred_date,
    scheduled_time: null,
    booking_window: window.label,
    completed_date: null,
    address: customer.address || null,
    notes: `Booked via customer portal by ${req.user.name} · Arrival window: ${window.label} (awaiting office confirmation)`,
  });

  // Optional photos the customer attached to show the problem.
  // Accepts an array (`photos`) or a single legacy `photo`.
  const incoming = Array.isArray(req.body.photos) && req.body.photos.length
    ? req.body.photos
    : (req.body.photo ? [{ proof: req.body.photo, proof_type: req.body.photo_type || 'image' }] : []);
  for (const p of incoming) {
    if (!p?.proof) continue;
    try {
      await create('job_photos', uuid(), {
        job_id: id, proof: p.proof, proof_type: p.proof_type || 'image',
        caption: 'Submitted by customer', source: 'customer', created_at: new Date().toISOString(),
      });
    } catch (e) { console.error('[portal] request photo failed:', e.message); }
  }

  // Best-effort: notify the business a new request came in.
  try {
    const to = await settings.get('business_email');
    if (to) {
      const html = `<div style="font-family:sans-serif;font-size:15px;color:#334155;line-height:1.6">
        <p><strong>New appointment request from ${customer.name}</strong></p>
        <p><strong>Service:</strong> ${job.title}<br/>
        ${job.description ? `<strong>Details:</strong> ${job.description}<br/>` : ''}
        <strong>Requested date:</strong> ${preferred_date}<br/>
        <strong>Arrival window:</strong> ${job.booking_window}<br/>
        <strong>Contact:</strong> ${customer.email || ''} ${customer.phone || ''}<br/>
        ${customer.address ? `<strong>Address:</strong> ${customer.address}` : ''}</p>
        <p><strong>This slot is held pending your confirmation.</strong> Open the Jobs tab in Clarke Mechanical to confirm and assign a technician.</p></div>`;
      await sendMail({ type: 'service_request', to, toName: 'Clarke Mechanical', subject: `New appointment request — ${customer.name}`, html, customerId: customer.id, sentBy: 'Customer Portal' });
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
  if (!['awaiting-signoff', 'completed'].includes(job.status)) return res.status(400).json({ error: 'This service is not ready for sign-off yet' });
  if (job.signed_at) return res.status(409).json({ error: 'This service has already been signed off' });
  const { signature, signed_by } = req.body;
  if (!signature) return res.status(400).json({ error: 'Please provide your signature' });
  // Signing off completes the job.
  await update('jobs', req.params.id, {
    signature, signed_by: (signed_by || records[0]?.name || req.user.name), signed_at: new Date().toISOString(),
    status: 'completed', completed_date: job.completed_date || new Date().toISOString().slice(0, 10),
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

// PUT /portal/jobs/:id/reschedule — move an unstarted service to a new open slot.
router.put('/jobs/:id/reschedule', async (req, res) => {
  const { ids } = await myCustomerIds(req);
  const job = await getById('jobs', req.params.id);
  if (!job || !ids.includes(job.customer_id)) return res.status(404).json({ error: 'Service not found' });
  if (!['pending', 'scheduled'].includes(job.status)) return res.status(400).json({ error: 'This service can no longer be rescheduled' });

  const { preferred_date, booking_window } = req.body;
  if (!preferred_date) return res.status(400).json({ error: 'Please pick a new date.' });
  if (preferred_date < tomorrowISO()) return res.status(400).json({ error: 'Please choose a date starting tomorrow.' });
  const window = BOOKING_WINDOWS.find(w => w.label === booking_window);
  if (!window) return res.status(400).json({ error: 'Please choose an arrival window.' });

  const capacity = Math.max(1, Number(await settings.get('booking_slot_capacity')) || 2);
  const allJobs = await list('jobs');
  const occupied = occupancyForDate(allJobs, preferred_date, job.id)[window.label] || 0; // don't count this job against itself
  if (occupied >= capacity) return res.status(409).json({ error: 'Sorry, that time slot just filled up. Please pick another window.' });

  // Moving the appointment sends it back to pending so the office re-confirms the new time.
  const saved = await update('jobs', req.params.id, {
    scheduled_date: preferred_date, booking_window: window.label, scheduled_time: null, status: 'pending',
  });

  // Let the office know the customer moved their appointment.
  try {
    const to = await settings.get('business_email');
    const customer = await getById('customers', job.customer_id);
    if (to) {
      const html = `<div style="font-family:sans-serif;font-size:15px;color:#334155;line-height:1.6">
        <p><strong>${customer?.name || 'A customer'} rescheduled their appointment.</strong></p>
        <p><strong>Service:</strong> ${job.title}<br/>
        <strong>New date:</strong> ${preferred_date}<br/>
        <strong>New arrival window:</strong> ${window.label}</p>
        <p>This slot is held pending your confirmation.</p></div>`;
      await sendMail({ type: 'reschedule', to, toName: 'Clarke Mechanical', subject: `Appointment rescheduled — ${customer?.name || ''}`, html, relatedId: job.id, customerId: job.customer_id, sentBy: 'Customer Portal' });
    }
  } catch (e) { console.error('[portal] reschedule notify failed:', e.message); }

  res.json(saved);
});

// PUT /portal/profile — customer updates their own contact details.
router.put('/profile', async (req, res) => {
  const { ids } = await myCustomerIds(req);
  if (!ids.length) return res.status(422).json({ error: "Your account isn't linked to a customer record yet." });
  const { phone, address, city, state, zip, email_opt_in, sms_opt_in } = req.body;
  const current = await getById('customers', ids[0]);
  const patch = {
    phone: phone || null, address: address || null, city: city || null, state: state || null, zip: zip || null,
    email_opt_in: email_opt_in !== false, sms_opt_in: !!sms_opt_in,
  };
  // Changing the phone number invalidates a prior phone verification.
  if ((phone || null) !== (current?.phone || null)) { patch.phone_verified = false; patch.phone_verify_code = null; }
  const saved = await update('customers', ids[0], patch);
  res.json({ id: saved.id, name: saved.name, email: saved.email, phone: saved.phone, address: saved.address, city: saved.city, state: saved.state, zip: saved.zip, email_opt_in: saved.email_opt_in, sms_opt_in: saved.sms_opt_in, email_verified: !!saved.email_verified, phone_verified: !!saved.phone_verified });
});

// DELETE /portal/account — the customer permanently deletes their own login/account.
// Business/service records are retained as required for accounting, but the login and
// portal access are removed. (Required by the App Store for apps with sign-up.)
router.delete('/account', async (req, res) => {
  try {
    await remove('users', req.user.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('[portal] account delete failed:', e.message);
    res.status(500).json({ error: 'Could not delete your account. Please contact us.' });
  }
});

// GET /portal/referrals — the customer's referral code, share link, reward text,
// and the people they've referred (with status).
router.get('/referrals', async (req, res) => {
  const me = await getById('users', req.user.id);
  const code = referralCode(me || req.user);
  const site = (await settings.get('business_website')) || 'https://clarkemechanicalinc.org';
  const link = `${site.replace(/\/+$/, '')}/?ref=${encodeURIComponent(code)}`;
  const reward = (await settings.get('referral_reward'))
    || "When a friend you refer completes their first service with us, we'll add a thank-you credit to your account. Contact our office for current reward details.";
  const referrals = (await findWhere('referrals', 'referrer_user_id', req.user.id))
    .map(r => ({ id: r.id, name: r.new_name || r.new_email || 'A friend', status: r.status || 'pending', created_at: r.created_at }))
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  res.json({ code, link, reward, referrals });
});

// ---- Contact verification ----
const genCode = () => String(Math.floor(100000 + Math.random() * 900000));

// Email a 6-digit verification code.
router.post('/verify/email/send', async (req, res) => {
  const { records } = await myCustomerIds(req);
  const customer = records[0];
  if (!customer?.email) return res.status(400).json({ error: 'There is no email address on file.' });
  if (customer.email_verified) return res.json({ ok: true, already: true });
  const code = genCode();
  await update('customers', customer.id, { email_verify_code: code, email_verify_expires: new Date(Date.now() + 15 * 60 * 1000).toISOString() });
  try {
    const { subject, html } = await render('verify_code', { name: customer.name, code });
    await sendMail({ type: 'verify_email', to: customer.email, toName: customer.name, subject, html, customerId: customer.id, sentBy: 'Automated' });
  } catch (e) { console.error('[portal] verify email failed:', e.message); return res.status(502).json({ error: 'Could not send the code. Please try again.' }); }
  res.json({ ok: true });
});

router.post('/verify/email/confirm', async (req, res) => {
  const { records } = await myCustomerIds(req);
  const customer = records[0];
  const code = (req.body.code || '').trim();
  if (!customer?.email_verify_code || customer.email_verify_code !== code) return res.status(400).json({ error: 'That code is incorrect.' });
  if (new Date(customer.email_verify_expires || 0).getTime() < Date.now()) return res.status(400).json({ error: 'That code has expired. Please request a new one.' });
  await update('customers', customer.id, { email_verified: true, email_verify_code: null, email_verify_expires: null });
  res.json({ ok: true });
});

// Text a 6-digit verification code (needs an SMS provider configured).
router.post('/verify/phone/send', async (req, res) => {
  const { records } = await myCustomerIds(req);
  const customer = records[0];
  if (!customer?.phone) return res.status(400).json({ error: 'There is no phone number on file.' });
  if (customer.phone_verified) return res.json({ ok: true, already: true });
  if (!smsConfigured()) return res.status(503).json({ error: 'not_configured', message: 'Text verification isn’t enabled yet.' });
  const code = genCode();
  await update('customers', customer.id, { phone_verify_code: code, phone_verify_expires: new Date(Date.now() + 15 * 60 * 1000).toISOString() });
  try { await sendSms(customer.phone, `Clarke Mechanical verification code: ${code}`); }
  catch (e) { console.error('[portal] verify sms failed:', e.message); return res.status(502).json({ error: 'Could not send the text. Please try again later.' }); }
  res.json({ ok: true });
});

router.post('/verify/phone/confirm', async (req, res) => {
  const { records } = await myCustomerIds(req);
  const customer = records[0];
  const code = (req.body.code || '').trim();
  if (!customer?.phone_verify_code || customer.phone_verify_code !== code) return res.status(400).json({ error: 'That code is incorrect.' });
  if (new Date(customer.phone_verify_expires || 0).getTime() < Date.now()) return res.status(400).json({ error: 'That code has expired. Please request a new one.' });
  await update('customers', customer.id, { phone_verified: true, phone_verify_code: null, phone_verify_expires: null });
  res.json({ ok: true });
});

// GET /portal/payment-config — whether online card payments are available.
router.get('/payment-config', async (req, res) => {
  res.json({ enabled: helcim.configured(), provider: 'helcim' });
});

// Remaining balance on an invoice, in dollars (Helcim charges in dollars).
async function invoiceBalanceDollars(invoice) {
  const existing = await findWhere('payments', 'invoice_id', invoice.id);
  const alreadyPaid = existing.reduce((s, p) => s + (p.amount || 0), 0);
  return Math.max(0, Math.round(((invoice.total || 0) - alreadyPaid) * 100) / 100);
}

// Record a successful card payment + mark the invoice paid if fully covered.
async function recordCardPayment(invoice, { amount, reference, note }) {
  const existing = await findWhere('payments', 'invoice_id', invoice.id);
  if (!existing.some(p => p.reference === reference)) {
    await create('payments', uuid(), {
      invoice_id: invoice.id, amount: Number(amount) || 0, method: 'card',
      reference, notes: note || 'Paid online via Helcim', paid_at: new Date().toISOString(),
    });
  }
  const total = (await findWhere('payments', 'invoice_id', invoice.id)).reduce((s, p) => s + (p.amount || 0), 0);
  const paid = total >= (invoice.total || 0);
  if (paid && invoice.status !== 'paid') await update('invoices', invoice.id, { status: 'paid' });
  return paid ? 'paid' : 'partial';
}

// POST /portal/invoices/:id/helcim-initialize — start a HelcimPay.js checkout session.
router.post('/invoices/:id/helcim-initialize', async (req, res) => {
  const { ids, records } = await myCustomerIds(req);
  const invoice = await getById('invoices', req.params.id);
  if (!invoice || !ids.includes(invoice.customer_id)) return res.status(404).json({ error: 'Invoice not found' });
  if (invoice.status === 'paid') return res.status(400).json({ error: 'This invoice is already paid.' });
  if (!helcim.configured()) return res.status(503).json({ error: 'Online payments are not set up yet.' });

  const amount = await invoiceBalanceDollars(invoice);
  if (amount <= 0) return res.status(400).json({ error: 'Nothing left to pay on this invoice.' });

  const customer = records.find(c => c.id === invoice.customer_id) || records[0];
  try {
    const session = await helcim.initialize({
      amount,
      invoiceNumber: invoice.invoice_number || invoice.id,
      customerCode: customer?.helcim_customer_code || undefined,
    });
    // Stash the secretToken + expected amount server-side (keyed by checkoutToken),
    // so the browser never sees it and can't forge the confirmation hash.
    await create('helcim_sessions', session.checkoutToken, {
      invoice_id: invoice.id, customer_id: customer?.id || null,
      amount, secret_token: session.secretToken, created_at: new Date().toISOString(),
    });
    res.json({ checkoutToken: session.checkoutToken, amount });
  } catch (e) {
    console.error('[helcim] initialize:', e.message);
    res.status(502).json({ error: 'Could not start the payment. Please try again.' });
  }
});

// POST /portal/invoices/:id/helcim-confirm — validate a HelcimPay.js result server-side
// (via the response hash + the server-held secret token), then record the payment.
router.post('/invoices/:id/helcim-confirm', async (req, res) => {
  const { ids, records } = await myCustomerIds(req);
  const invoice = await getById('invoices', req.params.id);
  if (!invoice || !ids.includes(invoice.customer_id)) return res.status(404).json({ error: 'Invoice not found' });

  const { checkoutToken, data, hash } = req.body || {};
  if (!checkoutToken || !data) return res.status(400).json({ error: 'Missing payment result.' });

  const session = await getById('helcim_sessions', checkoutToken);
  if (!session || session.invoice_id !== invoice.id) return res.status(400).json({ error: 'Payment session not found or expired.' });

  if (!helcim.validateHash(data, hash, session.secret_token)) {
    return res.status(400).json({ error: 'Could not verify the payment. If you were charged, contact the office.' });
  }
  if (String(data.status || '').toUpperCase() !== 'APPROVED') return res.status(402).json({ error: 'That payment did not go through.' });

  // Save the Helcim customer code + card token so the customer can reuse the card.
  const customer = records.find(c => c.id === invoice.customer_id) || records[0];
  try {
    if (customer && data.customerCode && !customer.helcim_customer_code) {
      await update('customers', customer.id, { helcim_customer_code: data.customerCode });
    }
    if (customer && data.cardToken) {
      const cards = await findWhere('payment_methods', 'customer_id', customer.id);
      if (!cards.some(c => c.card_token === data.cardToken)) {
        await create('payment_methods', uuid(), {
          customer_id: customer.id, card_token: data.cardToken,
          brand: data.cardType || 'card', last4: String(data.cardNumber || '').slice(-4),
          customer_code: data.customerCode || customer.helcim_customer_code || null,
          created_at: new Date().toISOString(),
        });
      }
    }
  } catch (e) { console.error('[helcim] save card:', e.message); }

  await remove('helcim_sessions', checkoutToken).catch(() => {});
  const status = await recordCardPayment(invoice, {
    amount: Number(data.amount) || session.amount, reference: String(data.transactionId || checkoutToken), note: 'Paid online via Helcim',
  });
  res.json({ ok: true, status });
});

// POST /portal/invoices/:id/pay-link — a one-time link to pay this invoice in a browser
// (used by the mobile app, where HelcimPay.js can't render inside capacitor://localhost).
router.post('/invoices/:id/pay-link', async (req, res) => {
  const { ids } = await myCustomerIds(req);
  const invoice = await getById('invoices', req.params.id);
  if (!invoice || !ids.includes(invoice.customer_id)) return res.status(404).json({ error: 'Invoice not found' });
  const token = uuid() + uuid().replace(/-/g, '');
  await create('pay_tokens', token, {
    invoice_id: invoice.id, customer_id: invoice.customer_id, used: false,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), created_at: new Date().toISOString(),
  });
  const site = (await settings.get('business_website')) || 'https://clarkemechanicalinc.org';
  res.json({ url: `${site.replace(/\/+$/, '')}/pay/${token}` });
});

// GET /portal/invoices/:id/payment-status — poll after a browser payment.
router.get('/invoices/:id/payment-status', async (req, res) => {
  const { ids } = await myCustomerIds(req);
  const invoice = await getById('invoices', req.params.id);
  if (!invoice || !ids.includes(invoice.customer_id)) return res.status(404).json({ error: 'Invoice not found' });
  res.json({ paid: invoice.status === 'paid' });
});

// GET /portal/payment-methods — the customer's saved cards (Helcim vault tokens).
router.get('/payment-methods', async (req, res) => {
  if (!helcim.configured()) return res.json([]);
  const { records } = await myCustomerIds(req);
  const customer = records[0];
  if (!customer) return res.json([]);
  const cards = await findWhere('payment_methods', 'customer_id', customer.id);
  res.json(cards.map(c => ({ id: c.id, brand: c.brand || 'card', last4: c.last4 || '' })));
});

// POST /portal/invoices/:id/pay-saved — charge a saved Helcim card token.
router.post('/invoices/:id/pay-saved', async (req, res) => {
  const { ids, records } = await myCustomerIds(req);
  const invoice = await getById('invoices', req.params.id);
  if (!invoice || !ids.includes(invoice.customer_id)) return res.status(404).json({ error: 'Invoice not found' });
  if (invoice.status === 'paid') return res.status(400).json({ error: 'This invoice is already paid.' });
  if (!helcim.configured()) return res.status(503).json({ error: 'Online payments are not set up yet.' });
  const { paymentMethodId } = req.body || {};
  if (!paymentMethodId) return res.status(400).json({ error: 'Choose a saved card.' });
  const customer = records.find(c => c.id === invoice.customer_id) || records[0];
  const card = (await findWhere('payment_methods', 'customer_id', customer?.id)).find(c => c.id === paymentMethodId);
  if (!card) return res.status(400).json({ error: 'No saved card on file.' });
  const amount = await invoiceBalanceDollars(invoice);
  if (amount <= 0) return res.status(400).json({ error: 'Nothing left to pay on this invoice.' });
  try {
    const txn = await helcim.purchaseWithToken({
      amount, cardToken: card.card_token,
      customerCode: card.customer_code || customer?.helcim_customer_code || undefined,
      invoiceNumber: invoice.invoice_number || invoice.id,
    });
    const status = await recordCardPayment(invoice, {
      amount: Number(txn.amount) || amount, reference: String(txn.transactionId), note: 'Paid online via Helcim (saved card)',
    });
    res.json({ ok: true, status });
  } catch (e) {
    console.error('[helcim] saved pay:', e.message);
    res.status(402).json({ error: 'That card could not be charged — please enter your card details below to pay.' });
  }
});

// DELETE /portal/payment-methods/:pmId — remove a saved card from the vault list.
router.delete('/payment-methods/:pmId', async (req, res) => {
  const { records } = await myCustomerIds(req);
  const customer = records[0];
  if (!customer) return res.status(404).json({ error: 'Not found' });
  const card = (await findWhere('payment_methods', 'customer_id', customer.id)).find(c => c.id === req.params.pmId);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  await remove('payment_methods', card.id).catch(() => {});
  res.json({ ok: true });
});

// POST /portal/invoices/:id/pay-cash — customer signals they've paid (or will pay)
// by a manual method: Zelle, bank transfer, check, or cash. Emails/alerts the office.
router.post('/invoices/:id/pay-cash', async (req, res) => {
  const { ids, records } = await myCustomerIds(req);
  const invoice = await getById('invoices', req.params.id);
  if (!invoice || !ids.includes(invoice.customer_id)) return res.status(404).json({ error: 'Invoice not found' });
  const customer = records[0];
  const method = (req.body?.method ? String(req.body.method) : 'cash').slice(0, 40);

  // In-app alert for the office (shows in the dashboard "Needs attention").
  try {
    await create('payment_requests', uuid(), {
      invoice_id: invoice.id, invoice_number: invoice.invoice_number || null,
      customer_id: invoice.customer_id, customer_name: customer?.name || null,
      amount: invoice.total || 0, method, status: 'pending', created_at: new Date().toISOString(),
    });
  } catch (e) { console.error('[portal] payment request record failed:', e.message); }

  try {
    const to = await settings.get('business_email');
    if (to) {
      const html = `<div style="font-family:sans-serif;font-size:15px;color:#334155;line-height:1.6">
        <p><strong>${customer?.name || 'A customer'} says they've paid invoice ${invoice.invoice_number || ''} by ${method}.</strong></p>
        <p><strong>Amount:</strong> $${Number(invoice.total || 0).toFixed(2)}<br/>
        <strong>Method:</strong> ${method}<br/>
        <strong>Contact:</strong> ${customer?.email || ''} ${customer?.phone || ''}</p>
        <p>Please confirm the payment was received and record it in Clarke Mechanical.</p></div>`;
      await sendMail({ type: 'cash_payment_request', to, toName: 'Clarke Mechanical', subject: `Payment notice (${method}) — ${customer?.name || ''}`, html, customerId: invoice.customer_id, sentBy: 'Customer Portal' });
    }
  } catch (e) { console.error('[portal] payment notify failed:', e.message); }
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
    'If the customer asks to speak to a person, a human, a live agent, or a representative, OR if you genuinely cannot help with their request, reply briefly that you are connecting them with the office, then place the exact tag [[HANDOFF]] on its own at the very end of your reply.',
  ].join(' ');

  try {
    const primary = process.env.GEMINI_MODEL || 'gemini-flash-latest';
    const fallback = process.env.GEMINI_FALLBACK_MODEL || 'gemini-flash-lite-latest';
    const history = Array.isArray(req.body.history) ? req.body.history : [];
    const contents = [
      ...history.slice(-10)
        .filter(m => m && m.text)
        .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.text) }] })),
      { role: 'user', parts: [{ text: message }] },
    ];
    const payload = JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.4, maxOutputTokens: 500 },
    });
    const callModel = (model) => fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload },
    );
    const sleep = (ms) => new Promise(res2 => setTimeout(res2, ms));

    // Try a model, retrying once on transient overload (429/500/503).
    const tryModel = async (model) => {
      let resp = await callModel(model);
      if (!resp.ok && [429, 500, 503].includes(resp.status)) { await sleep(700); resp = await callModel(model); }
      return resp;
    };

    // Primary first; if it fails for ANY reason (busy or unavailable), fall back.
    let r = await tryModel(primary);
    if (!r.ok && fallback && fallback !== primary) r = await tryModel(fallback);

    if (!r.ok) {
      console.error('[assistant] Gemini error:', r.status, await r.text());
      return res.status(502).json({ error: 'Our assistant is briefly overloaded. Please try again in a moment — or ask for a person and we’ll connect you.' });
    }

    const data = await r.json();
    const raw = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text).join('').trim();
    const handoff = /\[\[HANDOFF\]\]/i.test(raw);
    const reply = raw.replace(/\[\[HANDOFF\]\]/ig, '').trim();
    res.json({
      reply: reply || (handoff ? 'Let me connect you with our team — one moment.' : "Sorry, I didn't quite catch that — could you rephrase?"),
      handoff,
    });
  } catch (e) {
    console.error('[assistant] failed:', e.message);
    res.status(502).json({ error: 'The assistant is unavailable right now. Please try again later.' });
  }
});

// POST /portal/support/escalate — hand the conversation off to a human. Creates a
// support chat, stores the prior bot conversation for context, and emails the office.
router.post('/support/escalate', async (req, res) => {
  const { records } = await myCustomerIds(req);
  const customer = records[0] || null;
  const history = Array.isArray(req.body.history) ? req.body.history : [];
  const now = new Date().toISOString();
  const chatId = uuid();
  const lastCustomer = [...history].reverse().find(m => m && m.role === 'user' && m.text);

  await create('support_chats', chatId, {
    customer_id: customer?.id || null,
    customer_name: req.user.name,
    customer_email: req.user.email,
    status: 'waiting',
    assigned_to: null,
    department: null,
    created_at: now, updated_at: now, last_message_at: now,
    last_message_preview: (lastCustomer?.text || '').slice(0, 120),
  });

  for (const m of history.slice(-20)) {
    if (!m || !m.text) continue;
    await create('support_messages', uuid(), {
      chat_id: chatId,
      sender: m.role === 'user' ? 'customer' : 'bot',
      sender_name: m.role === 'user' ? req.user.name : 'Assistant',
      text: String(m.text),
      created_at: now,
    });
  }
  await create('support_messages', uuid(), {
    chat_id: chatId, sender: 'system', sender_name: 'System',
    text: `${req.user.name} asked to speak with a person.`, created_at: now,
  });

  try {
    const to = await settings.get('business_email');
    if (to) {
      const html = `<div style="font-family:sans-serif;font-size:15px;color:#334155;line-height:1.6">
        <p><strong>${req.user.name} is waiting to chat with a live agent.</strong></p>
        <p><strong>Contact:</strong> ${req.user.email}${customer?.phone ? ` · ${customer.phone}` : ''}</p>
        ${lastCustomer?.text ? `<p><strong>They said:</strong> ${lastCustomer.text}</p>` : ''}
        <p>Open <strong>Support</strong> in Clarke Mechanical to reply.</p></div>`;
      await sendMail({ type: 'live_chat_request', to, toName: 'Clarke Mechanical', subject: `Live chat request — ${req.user.name}`, html, customerId: customer?.id || null, sentBy: 'Customer Portal' });
    }
  } catch (e) { console.error('[support] notify failed:', e.message); }

  res.status(201).json({ chatId });
});

// GET /portal/support/:chatId — the customer polls their own chat for new messages.
router.get('/support/:chatId', async (req, res) => {
  const chat = await getById('support_chats', req.params.chatId);
  if (!chat || chat.customer_email !== req.user.email) return res.status(404).json({ error: 'Chat not found' });
  const messages = (await findWhere('support_messages', 'chat_id', req.params.chatId))
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  res.json({ id: chat.id, status: chat.status, assigned_to: chat.assigned_to || null, messages });
});

// POST /portal/support/:chatId/messages — the customer sends a message to the agent.
router.post('/support/:chatId/messages', async (req, res) => {
  const chat = await getById('support_chats', req.params.chatId);
  if (!chat || chat.customer_email !== req.user.email) return res.status(404).json({ error: 'Chat not found' });
  if (chat.status === 'closed') return res.status(400).json({ error: 'This chat has been closed.' });
  const text = (req.body?.text || '').toString().trim();
  if (!text) return res.status(400).json({ error: 'Message is required' });
  const now = new Date().toISOString();
  const saved = await create('support_messages', uuid(), {
    chat_id: chat.id, sender: 'customer', sender_name: req.user.name, text, created_at: now,
  });
  await update('support_chats', chat.id, { updated_at: now, last_message_at: now, last_message_preview: text.slice(0, 120) });
  res.status(201).json(saved);
});

// POST /portal/support/:chatId/leave — the customer ends the chat.
router.post('/support/:chatId/leave', async (req, res) => {
  const chat = await getById('support_chats', req.params.chatId);
  if (!chat || chat.customer_email !== req.user.email) return res.status(404).json({ error: 'Chat not found' });
  const now = new Date().toISOString();
  await update('support_chats', chat.id, { status: 'closed', updated_at: now, last_message_at: now });
  await create('support_messages', uuid(), {
    chat_id: chat.id, sender: 'system', sender_name: 'System',
    text: `${req.user.name} left the chat.`, created_at: now,
  });
  res.json({ ok: true });
});

module.exports = router;
