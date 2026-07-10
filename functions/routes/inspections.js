const express = require('express');
const { v4: uuid } = require('uuid');
const { db, getById, list, findWhere, create, update, remove } = require('../lib/db');
const { authMiddleware, requireStaff, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireStaff);

// Fields a technician may set/patch on an inspection.
const FIELDS = ['property_type', 'equipment_type', 'job_id', 'customer_id', 'info', 'checklist', 'notes', 'recommendations', 'status'];

function canView(user, insp) {
  return user.role !== 'technician' || insp.technician_id === user.id;
}

// List — admins/office see all inspections; technicians see only their own.
router.get('/', async (req, res) => {
  const all = await list('inspections');
  const rows = (req.user.role === 'technician' ? all.filter(i => i.technician_id === req.user.id) : all)
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  res.json(rows);
});

// One inspection + its photo metadata (base64 blobs fetched separately, on demand).
router.get('/:id', async (req, res) => {
  const insp = await getById('inspections', req.params.id);
  if (!insp) return res.status(404).json({ error: 'Inspection not found' });
  if (!canView(req.user, insp)) return res.status(403).json({ error: 'Forbidden' });
  const photos = (await findWhere('inspection_photos', 'inspection_id', req.params.id))
    .map(p => ({ id: p.id, caption: p.caption || null, proof_type: p.proof_type || 'image', created_at: p.created_at }))
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  res.json({ ...insp, photos });
});

// The base64 blob for a single photo/PDF.
router.get('/:id/photos/:photoId', async (req, res) => {
  const insp = await getById('inspections', req.params.id);
  if (!insp) return res.status(404).json({ error: 'Inspection not found' });
  if (!canView(req.user, insp)) return res.status(403).json({ error: 'Forbidden' });
  const photo = await getById('inspection_photos', req.params.photoId);
  if (!photo || photo.inspection_id !== req.params.id) return res.status(404).json({ error: 'Photo not found' });
  res.json({ proof: photo.proof || null, proof_type: photo.proof_type || 'image', caption: photo.caption || null });
});

// Create a new inspection (belongs to the technician creating it).
router.post('/', async (req, res) => {
  const b = req.body || {};
  if (!b.property_type) return res.status(400).json({ error: 'Property type is required' });
  const now = new Date().toISOString();
  const saved = await create('inspections', uuid(), {
    property_type: b.property_type,
    equipment_type: b.equipment_type || 'boiler',
    job_id: b.job_id || null,
    customer_id: b.customer_id || null,
    info: b.info || {},
    checklist: b.checklist || {},
    notes: b.notes || null,
    recommendations: b.recommendations || null,
    status: b.status || 'draft',
    technician_id: req.user.id,
    technician_name: req.user.name,
    created_at: now,
    updated_at: now,
    submitted_at: b.status === 'submitted' ? now : null,
  });
  res.status(201).json(saved);
});

// Update — save progress, edit answers, or submit.
router.put('/:id', async (req, res) => {
  const insp = await getById('inspections', req.params.id);
  if (!insp) return res.status(404).json({ error: 'Inspection not found' });
  if (!canView(req.user, insp)) return res.status(403).json({ error: 'Forbidden' });
  const b = req.body || {};
  const patch = { updated_at: new Date().toISOString() };
  for (const f of FIELDS) if (f in b) patch[f] = b[f];
  if (b.status === 'submitted' && insp.status !== 'submitted') patch.submitted_at = new Date().toISOString();
  const saved = await update('inspections', req.params.id, patch);
  res.json(saved);
});

// Delete an inspection and its photos (admin/office only).
router.delete('/:id', requireRole('admin', 'office'), async (req, res) => {
  const photos = await findWhere('inspection_photos', 'inspection_id', req.params.id);
  await Promise.all(photos.map(p => db.collection('inspection_photos').doc(p.id).delete()));
  await remove('inspections', req.params.id);
  res.json({ ok: true });
});

// Attach a photo or PDF (base64 data URL — same pattern as time-clock proof).
router.post('/:id/photos', async (req, res) => {
  const insp = await getById('inspections', req.params.id);
  if (!insp) return res.status(404).json({ error: 'Inspection not found' });
  if (!canView(req.user, insp)) return res.status(403).json({ error: 'Forbidden' });
  const { proof, proof_type, caption } = req.body || {};
  if (!proof) return res.status(400).json({ error: 'A photo or PDF is required' });
  const saved = await create('inspection_photos', uuid(), {
    inspection_id: req.params.id,
    proof,
    proof_type: proof_type || 'image',
    caption: caption || null,
    created_at: new Date().toISOString(),
  });
  res.status(201).json({ id: saved.id, caption: saved.caption, proof_type: saved.proof_type, created_at: saved.created_at });
});

// Remove one photo.
router.delete('/:id/photos/:photoId', async (req, res) => {
  const insp = await getById('inspections', req.params.id);
  if (!insp) return res.status(404).json({ error: 'Inspection not found' });
  if (!canView(req.user, insp)) return res.status(403).json({ error: 'Forbidden' });
  await db.collection('inspection_photos').doc(req.params.photoId).delete();
  res.json({ ok: true });
});

module.exports = router;
