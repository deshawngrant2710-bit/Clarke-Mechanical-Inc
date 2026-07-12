const express = require('express');
const { v4: uuid } = require('uuid');
const { db, list, getById, create, update, remove, findWhere, nameMap } = require('../lib/db');
const { authMiddleware, requireStaff } = require('../middleware/auth');
const { render, sendMail } = require('../lib/email');

const router = express.Router();
router.use(authMiddleware, requireStaff);

// Auto-email the customer when a job crosses into "scheduled" or "completed".
async function notifyOnStatusChange(job, prevStatus) {
  try {
    if (!job.customer_id || job.status === prevStatus) return;
    const map = { scheduled: 'job_confirmation', completed: 'job_completed' };
    const type = map[job.status];
    if (!type) return;
    const customer = await getById('customers', job.customer_id);
    if (!customer?.email) return;
    const tech = job.technician_id ? await getById('users', job.technician_id) : null;
    const entity = { ...job, customer_name: customer.name, technician_name: tech?.name };
    const { subject, html } = await render(type, entity);
    await sendMail({ type, to: customer.email, toName: customer.name, subject, html, relatedId: job.id, customerId: job.customer_id, sentBy: 'Automated' });
  } catch (e) { console.error('[jobs] notify failed:', e.message); }
}

// List jobs with customer_name + technician_name attached.
router.get('/', async (req, res) => {
  const [jobs, customers, users] = await Promise.all([list('jobs'), nameMap('customers'), nameMap('users')]);
  const rows = jobs
    .map(j => ({ ...j, customer_name: customers[j.customer_id] || null, technician_name: users[j.technician_id] || null }))
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  res.json(rows);
});

// Build a single-line address string for a customer/job.
function fullAddress(job, customer) {
  const parts = [job.address || customer?.address, customer?.city, customer?.state, customer?.zip].filter(Boolean);
  return parts.join(', ');
}

// Geocode via OpenStreetMap Nominatim (free, no key). Results cached on the customer
// record so we only ever look up each address once. Rate-limited to be a good citizen.
async function geocode(address) {
  if (!address) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'ClarkeMechanicalCRM/1.0 (dispatch route map)' } });
    if (!r.ok) return null;
    const data = await r.json();
    if (!data?.length) return null;
    return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
  } catch (e) { console.error('[jobs] geocode failed:', e.message); return null; }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// GET /jobs/route/list?date=YYYY-MM-DD — the day's route with map coordinates.
router.get('/route/list', async (req, res) => {
  const date = req.body?.date || req.query.date || new Date().toISOString().slice(0, 10);
  const [allJobs, customers, users] = await Promise.all([list('jobs'), list('customers'), nameMap('users')]);
  const custById = Object.fromEntries(customers.map(c => [c.id, c]));
  let dayJobs = allJobs.filter(j => j.scheduled_date === date && j.status !== 'cancelled');
  // Technicians only see their own stops.
  if (req.user.role === 'technician') dayJobs = dayJobs.filter(j => j.technician_id === req.user.id);
  dayJobs.sort((a, b) => (a.scheduled_time || '99').localeCompare(b.scheduled_time || '99'));

  const out = [];
  for (const j of dayJobs) {
    const customer = custById[j.customer_id];
    const address = fullAddress(j, customer);
    let lat = null, lng = null;
    if (address && customer) {
      if (customer.geo_address === address && customer.geo_lat != null) {
        lat = customer.geo_lat; lng = customer.geo_lng;
      } else {
        const g = await geocode(address);
        if (g) {
          lat = g.lat; lng = g.lng;
          try { await update('customers', customer.id, { geo_address: address, geo_lat: g.lat, geo_lng: g.lng }); } catch {}
          await sleep(1100); // Nominatim asks for <=1 req/sec
        }
      }
    }
    out.push({
      id: j.id, title: j.title, status: j.status, priority: j.priority,
      scheduled_time: j.scheduled_time || null, job_type: j.job_type || null,
      customer_name: customer?.name || null, customer_phone: customer?.phone || null,
      technician_name: users[j.technician_id] || null, address, lat, lng,
    });
  }
  res.json({ date, jobs: out });
});

router.get('/:id', async (req, res) => {
  const job = await getById('jobs', req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const [customer, tech, photos, parts, allUsers] = await Promise.all([
    job.customer_id ? getById('customers', job.customer_id) : null,
    job.technician_id ? getById('users', job.technician_id) : null,
    findWhere('job_photos', 'job_id', req.params.id),
    findWhere('job_parts', 'job_id', req.params.id),
    list('users'),
  ]);
  const userName = Object.fromEntries(allUsers.map(u => [u.id, u.name]));
  const addlIds = Array.isArray(job.additional_technician_ids) ? job.additional_technician_ids : [];
  res.json({
    ...job,
    customer_name: customer?.name || null,
    customer_phone: customer?.phone || null,
    customer_email: customer?.email || null,
    technician_name: tech?.name || null,
    additional_technician_ids: addlIds,
    additional_technician_names: addlIds.map(id => userName[id]).filter(Boolean),
    photos,
    parts: parts.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')),
  });
});

router.post('/', async (req, res) => {
  const b = req.body;
  if (!b.title) return res.status(400).json({ error: 'Title is required' });
  const saved = await create('jobs', uuid(), {
    title: b.title, description: b.description || null,
    customer_id: b.customer_id || null, technician_id: b.technician_id || null,
    additional_technician_ids: Array.isArray(b.additional_technician_ids) ? b.additional_technician_ids : [],
    status: b.status || 'pending', priority: b.priority || 'normal', job_type: b.job_type || null,
    scheduled_date: b.scheduled_date || null, scheduled_time: b.scheduled_time || null,
    completed_date: b.completed_date || null, address: b.address || null, notes: b.notes || null,
  });
  res.status(201).json(saved);
});

router.put('/:id', async (req, res) => {
  const existing = await getById('jobs', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Job not found' });
  const fields = ['title', 'description', 'customer_id', 'technician_id', 'additional_technician_ids', 'status', 'priority',
    'job_type', 'scheduled_date', 'scheduled_time', 'completed_date', 'address', 'notes'];
  const patch = {};
  for (const f of fields) if (f in req.body) patch[f] = req.body[f] ?? null;
  if ('additional_technician_ids' in patch) patch.additional_technician_ids = Array.isArray(patch.additional_technician_ids) ? patch.additional_technician_ids : [];
  // Lock the assigned technician(s) once a job is completed — they can't be reassigned.
  if (existing.status === 'completed') {
    delete patch.technician_id;
    delete patch.additional_technician_ids;
  }
  const saved = await update('jobs', req.params.id, patch);
  res.json(saved);
  notifyOnStatusChange(saved, existing.status); // best-effort, after response
});

// POST /jobs/:id/confirm-booking — office confirms a customer's held appointment:
// sets it to scheduled (optionally with an exact time + technician) and emails the customer.
router.post('/:id/confirm-booking', async (req, res) => {
  const job = await getById('jobs', req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const { scheduled_time, technician_id } = req.body;
  const patch = { status: 'scheduled' };
  if (scheduled_time !== undefined) patch.scheduled_time = scheduled_time || null;
  if (technician_id !== undefined) patch.technician_id = technician_id || null;
  const saved = await update('jobs', req.params.id, patch);
  // Email the customer a confirmation (reuses the job_confirmation template).
  try {
    if (saved.customer_id) {
      const customer = await getById('customers', saved.customer_id);
      if (customer?.email) {
        const tech = saved.technician_id ? await getById('users', saved.technician_id) : null;
        const { subject, html } = await render('job_confirmation', { ...saved, customer_name: customer.name, technician_name: tech?.name });
        await sendMail({ type: 'job_confirmation', to: customer.email, toName: customer.name, subject, html, relatedId: saved.id, customerId: saved.customer_id, sentBy: req.user.name });
      }
    }
  } catch (e) { console.error('[jobs] confirm email failed:', e.message); }
  res.json(saved);
});

// POST /jobs/:id/suggest-time — office proposes a different date/window and emails the customer.
router.post('/:id/suggest-time', async (req, res) => {
  const job = await getById('jobs', req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const { scheduled_date, booking_window } = req.body;
  if (!scheduled_date || !booking_window) return res.status(400).json({ error: 'A date and arrival window are required' });
  const saved = await update('jobs', req.params.id, {
    scheduled_date, booking_window, scheduled_time: null, status: 'pending',
  });
  try {
    if (saved.customer_id) {
      const customer = await getById('customers', saved.customer_id);
      if (customer?.email) {
        const { subject, html } = await render('suggest_time', { ...saved, customer_name: customer.name });
        await sendMail({ type: 'suggest_time', to: customer.email, toName: customer.name, subject, html, relatedId: saved.id, customerId: saved.customer_id, sentBy: req.user.name });
      }
    }
  } catch (e) { console.error('[jobs] suggest email failed:', e.message); }
  res.json(saved);
});

// POST /jobs/:id/decline-booking — office declines a request; cancels it and emails the customer.
router.post('/:id/decline-booking', async (req, res) => {
  const job = await getById('jobs', req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const saved = await update('jobs', req.params.id, { status: 'cancelled' });
  try {
    if (saved.customer_id) {
      const customer = await getById('customers', saved.customer_id);
      if (customer?.email) {
        const { subject, html } = await render('decline', { ...saved, customer_name: customer.name, scheduled_date: job.scheduled_date });
        await sendMail({ type: 'decline', to: customer.email, toName: customer.name, subject, html, relatedId: saved.id, customerId: saved.customer_id, sentBy: req.user.name });
      }
    }
  } catch (e) { console.error('[jobs] decline email failed:', e.message); }
  res.json(saved);
});

// POST /jobs/:id/signoff — staff captures the customer's signature on-site.
router.post('/:id/signoff', async (req, res) => {
  const job = await getById('jobs', req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const { signature, signed_by } = req.body;
  if (!signature) return res.status(400).json({ error: 'Signature is required' });
  const extra = job.status === 'awaiting-signoff'
    ? { status: 'completed', completed_date: job.completed_date || new Date().toISOString().slice(0, 10) }
    : {};
  const saved = await update('jobs', req.params.id, {
    signature, signed_by: signed_by || 'Customer', signed_at: new Date().toISOString(), ...extra,
  });
  res.json(saved);
});

router.delete('/:id', async (req, res) => {
  const photos = await findWhere('job_photos', 'job_id', req.params.id);
  await Promise.all(photos.map(p => db.collection('job_photos').doc(p.id).delete()));
  await remove('jobs', req.params.id);
  res.json({ success: true });
});

// GET /jobs/:id/photos/:photoId — the base64 image/PDF for a job photo (staff).
router.get('/:id/photos/:photoId', async (req, res) => {
  const photo = await getById('job_photos', req.params.photoId);
  if (!photo || photo.job_id !== req.params.id) return res.status(404).json({ error: 'Photo not found' });
  res.json({ proof: photo.proof || null, proof_type: photo.proof_type || 'image', caption: photo.caption || null });
});

// POST /jobs/:id/photos — attach a photo or PDF (base64, same pattern as inspections).
router.post('/:id/photos', async (req, res) => {
  const job = await getById('jobs', req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const { proof, proof_type, caption } = req.body || {};
  if (!proof) return res.status(400).json({ error: 'A photo or PDF is required' });
  const saved = await create('job_photos', uuid(), {
    job_id: req.params.id, proof, proof_type: proof_type || 'image',
    caption: caption || null, source: 'staff', created_at: new Date().toISOString(),
  });
  res.status(201).json({ id: saved.id, caption: saved.caption, proof_type: saved.proof_type, created_at: saved.created_at });
});

// DELETE /jobs/:id/photos/:photoId — remove a job photo.
router.delete('/:id/photos/:photoId', async (req, res) => {
  await db.collection('job_photos').doc(req.params.photoId).delete();
  res.json({ ok: true });
});

// POST /jobs/:id/en-route — the technician taps "on my way"; the customer is emailed.
router.post('/:id/en-route', async (req, res) => {
  const job = await getById('jobs', req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const now = new Date().toISOString();
  await update('jobs', job.id, { en_route_at: now });
  try {
    const customer = job.customer_id ? await getById('customers', job.customer_id) : null;
    if (customer?.email) {
      const tech = job.technician_id ? await getById('users', job.technician_id) : null;
      const html = `<div style="font-family:sans-serif;font-size:15px;color:#334155;line-height:1.6">
        <p>Good news${customer.name ? `, ${customer.name}` : ''} — your technician${tech?.name ? ` ${tech.name}` : ''} is on the way for <strong>${job.title}</strong>.</p>
        ${job.address ? `<p><strong>Location:</strong> ${job.address}</p>` : ''}
        <p>See you soon!</p></div>`;
      await sendMail({ type: 'job_en_route', to: customer.email, toName: customer.name, subject: `Your technician is on the way — ${job.title}`, html, relatedId: job.id, customerId: job.customer_id, sentBy: tech?.name || 'Automated' });
    }
  } catch (e) { console.error('[jobs] en-route notify failed:', e.message); }
  res.json({ ok: true, en_route_at: now });
});

// Parts / materials used on a job.
router.post('/:id/parts', async (req, res) => {
  const job = await getById('jobs', req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const name = (req.body?.name || '').toString().trim();
  if (!name) return res.status(400).json({ error: 'Part name is required' });
  const qty = Number(req.body.quantity) || 1;
  const saved = await create('job_parts', uuid(), {
    job_id: req.params.id,
    name,
    quantity: qty,
    unit_price: (req.body.unit_price != null && req.body.unit_price !== '') ? Number(req.body.unit_price) : null,
    note: req.body.note || null,
    added_by: req.user.name,
    created_at: new Date().toISOString(),
  });
  // Auto-deduct from inventory if the part matches a stock item (by name or SKU).
  try {
    const inv = await list('inventory');
    const match = inv.find(it =>
      (it.name && it.name.trim().toLowerCase() === name.toLowerCase()) ||
      (it.sku && req.body.sku && it.sku === req.body.sku));
    if (match) await update('inventory', match.id, { quantity: Math.max(0, (match.quantity || 0) - qty) });
  } catch (e) { console.error('[jobs] inventory deduct:', e.message); }
  res.status(201).json(saved);
});

router.delete('/:id/parts/:partId', async (req, res) => {
  await db.collection('job_parts').doc(req.params.partId).delete();
  res.json({ ok: true });
});

module.exports = router;
