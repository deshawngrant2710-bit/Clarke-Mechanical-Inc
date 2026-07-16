const express = require('express');
const { v4: uuid } = require('uuid');
const { db, getById, create, update, list, findWhere } = require('../lib/db');
const { authMiddleware, requireStaff } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireStaff);

// The caller's currently-open shift (clocked in, not yet out), or null.
async function openEntry(userId) {
  const entries = await findWhere('time_entries', 'technician_id', userId);
  return entries.find(e => !e.clock_out) || null;
}

router.get('/active', async (req, res) => {
  res.json(await openEntry(req.user.id));
});

// Keep only {lat,lng,accuracy} from a location payload (or null).
function cleanLoc(loc) {
  if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return null;
  return { lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy || null };
}

router.post('/clock-in', async (req, res) => {
  if (await openEntry(req.user.id)) return res.status(409).json({ error: "You're already clocked in" });
  const { job_id, location } = req.body;
  // Technicians must clock in against a specific job.
  if (req.user.role === 'technician' && !job_id) {
    return res.status(400).json({ error: "Please select the job you're clocking in for" });
  }
  let job_title = null;
  if (job_id) {
    const job = await getById('jobs', job_id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    job_title = job.title;
  }
  const entry = await create('time_entries', uuid(), {
    technician_id: req.user.id, technician_name: req.user.name,
    job_id: job_id || null, job_title,
    clock_in: new Date().toISOString(), clock_in_location: cleanLoc(location),
    clock_out: null, clock_out_location: null, proof: null, proof_type: null, hours: null,
  });
  res.status(201).json({ ...entry, proof: undefined });
});

router.post('/clock-out', async (req, res) => {
  const e = await openEntry(req.user.id);
  if (!e) return res.status(400).json({ error: "You're not clocked in" });
  // Can't clock out mid-job — the job must be finished first. "Finished" means the
  // tech has marked the work done (awaiting sign-off), or it's completed/cancelled,
  // since the customer's sign-off happens after the tech leaves.
  if (e.job_id) {
    const job = await getById('jobs', e.job_id);
    if (job && !['awaiting-signoff', 'completed', 'cancelled'].includes(job.status)) {
      return res.status(409).json({ error: `Please finish the job "${job.title}" (mark the work done) before clocking out.` });
    }
  }
  const { proof, proof_type, location } = req.body;
  if (!proof) return res.status(400).json({ error: 'A photo of the work is required before clocking out' });
  const clockOut = new Date().toISOString();
  const hours = Math.round(((new Date(clockOut) - new Date(e.clock_in)) / 3600000) * 100) / 100;
  await update('time_entries', e.id, {
    clock_out: clockOut, clock_out_location: cleanLoc(location), proof, proof_type: proof_type || 'image', hours,
  });
  const saved = await getById('time_entries', e.id);
  res.json({ ...saved, proof: undefined });
});

// Timesheet list. Admins see everyone; other staff see their own. Proof stripped (fetch on demand).
router.get('/', async (req, res) => {
  const entries = req.user.role === 'admin'
    ? await list('time_entries')
    : await findWhere('time_entries', 'technician_id', req.user.id);
  entries.sort((a, b) => (b.clock_in || '').localeCompare(a.clock_in || ''));
  res.json(entries.slice(0, 100).map(e => ({
    id: e.id, technician_id: e.technician_id, technician_name: e.technician_name,
    job_id: e.job_id || null, job_title: e.job_title || null,
    clock_in: e.clock_in, clock_out: e.clock_out, hours: e.hours, proof_type: e.proof_type, has_proof: !!e.proof,
    clock_in_location: e.clock_in_location || null, clock_out_location: e.clock_out_location || null,
  })));
});

// PUT /time/:id — admin corrects a past entry's clock-in/out times; recomputes hours.
router.put('/:id', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only an admin can edit timesheets' });
  const e = await getById('time_entries', req.params.id);
  if (!e) return res.status(404).json({ error: 'Not found' });
  const patch = {};
  if (req.body.clock_in) patch.clock_in = new Date(req.body.clock_in).toISOString();
  if (req.body.clock_out !== undefined) patch.clock_out = req.body.clock_out ? new Date(req.body.clock_out).toISOString() : null;
  const clockIn = patch.clock_in || e.clock_in;
  const clockOut = patch.clock_out !== undefined ? patch.clock_out : e.clock_out;
  if (clockOut && new Date(clockOut) <= new Date(clockIn)) return res.status(400).json({ error: 'Clock-out must be after clock-in' });
  patch.hours = clockOut ? Math.round(((new Date(clockOut) - new Date(clockIn)) / 3600000) * 100) / 100 : null;
  const saved = await update('time_entries', req.params.id, patch);
  res.json({ ...saved, proof: undefined });
});

// The proof image/PDF for one entry (own, or admin).
router.get('/:id/proof', async (req, res) => {
  const e = await getById('time_entries', req.params.id);
  if (!e) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin' && e.technician_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  res.json({ proof: e.proof || null, proof_type: e.proof_type || null });
});

module.exports = router;
