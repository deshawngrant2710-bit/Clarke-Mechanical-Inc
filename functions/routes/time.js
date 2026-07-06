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

router.post('/clock-in', async (req, res) => {
  if (await openEntry(req.user.id)) return res.status(409).json({ error: "You're already clocked in" });
  const entry = await create('time_entries', uuid(), {
    technician_id: req.user.id, technician_name: req.user.name,
    clock_in: new Date().toISOString(), clock_out: null, proof: null, proof_type: null, hours: null,
  });
  res.status(201).json({ ...entry, proof: undefined });
});

router.post('/clock-out', async (req, res) => {
  const e = await openEntry(req.user.id);
  if (!e) return res.status(400).json({ error: "You're not clocked in" });
  const { proof, proof_type } = req.body;
  if (!proof) return res.status(400).json({ error: 'A photo of the work is required before clocking out' });
  const clockOut = new Date().toISOString();
  const hours = Math.round(((new Date(clockOut) - new Date(e.clock_in)) / 3600000) * 100) / 100;
  await update('time_entries', e.id, { clock_out: clockOut, proof, proof_type: proof_type || 'image', hours });
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
    clock_in: e.clock_in, clock_out: e.clock_out, hours: e.hours, proof_type: e.proof_type, has_proof: !!e.proof,
  })));
});

// The proof image/PDF for one entry (own, or admin).
router.get('/:id/proof', async (req, res) => {
  const e = await getById('time_entries', req.params.id);
  if (!e) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin' && e.technician_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  res.json({ proof: e.proof || null, proof_type: e.proof_type || null });
});

module.exports = router;
