// Installation Projects — an internal (office-only) workspace that a won quote or
// job becomes during the install phase, BEFORE it turns into a service. It holds:
//   • a document vault (permits, receipts, material/spec sheets, photos),
//   • an equipment & warranty register (what was installed + which vendor it came
//     from, so a warranty claim years later can be traced), and
//   • the full start-up / commissioning report (stored as a JSON object).
// Never exposed to the customer portal.
const express = require('express');
const { v4: uuid } = require('uuid');
const { list, getById, create, update, remove, nameMap } = require('../lib/db');
const { authMiddleware, requireStaff } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireStaff);

const STATUSES = ['planning', 'installing', 'commissioning', 'ready_startup', 'completed', 'handed_to_service'];
const DOC_TYPES = ['permit', 'receipt', 'material_sheet', 'spec_manual', 'inspection', 'photo', 'other'];
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const nowISO = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

// Warranty expiry = purchase date + N months (returns YYYY-MM-DD or null).
function warrantyExpiry(purchase_date, warranty_months) {
  const m = Number(warranty_months);
  if (!purchase_date || !(m > 0)) return null;
  const d = new Date(String(purchase_date).length <= 10 ? purchase_date + 'T00:00:00' : purchase_date);
  if (isNaN(d)) return null;
  d.setMonth(d.getMonth() + m);
  return d.toISOString().slice(0, 10);
}

function cleanEquip(e) {
  const item = {
    id: e.id || uuid(),
    category: (e.category || '').toString().trim() || null,     // e.g. Boiler, Hot water tank
    manufacturer: (e.manufacturer || '').toString().trim() || null,
    model: (e.model || '').toString().trim() || null,
    serial: (e.serial || '').toString().trim() || null,
    vendor_id: e.vendor_id || null,
    vendor_name: (e.vendor_name || '').toString().trim() || null, // who we BOUGHT it from
    po_ref: (e.po_ref || '').toString().trim() || null,           // PO / receipt / invoice ref
    purchase_date: e.purchase_date || null,
    cost: e.cost != null && e.cost !== '' ? round2(e.cost) : null,
    warranty_months: e.warranty_months != null && e.warranty_months !== '' ? Number(e.warranty_months) : null,
    notes: (e.notes || '').toString().trim() || null,
  };
  item.warranty_expiry = warrantyExpiry(item.purchase_date, item.warranty_months);
  return item;
}

// Strip heavy base64 from documents before returning a project in a list/detail.
function slim(p) {
  return {
    ...p,
    documents: (p.documents || []).map(d => ({
      id: d.id, type: d.type, filename: d.filename, mimeType: d.mimeType,
      note: d.note || null, uploaded_by: d.uploaded_by, uploaded_at: d.uploaded_at,
      size: d.data ? Math.round((d.data.length * 3) / 4) : 0, has_data: !!d.data,
    })),
  };
}

async function nextNumber() {
  const all = await list('installations');
  let max = 0;
  for (const p of all) {
    const m = String(p.project_number || '').match(/(\d+)/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `INST-${String(max + 1).padStart(4, '0')}`;
}

// Build the starting fields from a quote or a job.
async function seedFrom({ quoteId, jobId }) {
  let customer = null, seed = {};
  if (quoteId) {
    const q = await getById('quotes', quoteId);
    if (q) {
      customer = q.customer_id ? await getById('customers', q.customer_id) : null;
      seed = { quote_id: q.id, wo_number: q.quote_number || null, job_id: q.converted_job_id || null,
        notes: q.notes || null, customer_id: q.customer_id || null };
    }
  } else if (jobId) {
    const j = await getById('jobs', jobId);
    if (j) {
      customer = j.customer_id ? await getById('customers', j.customer_id) : null;
      seed = { job_id: j.id, quote_id: j.quote_id || null, wo_number: j.quote_number || j.id?.slice(0, 8) || null,
        notes: j.description || null, customer_id: j.customer_id || null, address: j.address || null };
    }
  }
  if (customer) {
    seed.customer_name = customer.business_name || customer.name || null;
    seed.site_contact = customer.name || null;
    seed.site_phone = customer.phone || null;
    if (!seed.address) seed.address = [customer.address].filter(Boolean).join('');
    seed.city_state_zip = [customer.city, customer.state, customer.zip].filter(Boolean).join(', ') || null;
  }
  return seed;
}

// GET /api/installations — list (newest first, no file blobs).
router.get('/', async (req, res) => {
  let items = await list('installations');
  if (req.query.status) items = items.filter(p => p.status === req.query.status);
  items.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  res.json(items.map(slim));
});

// GET /api/installations/summary — counts + warranty snapshot for a dashboard card.
router.get('/summary', async (req, res) => {
  const items = await list('installations');
  const open = items.filter(p => !['completed', 'handed_to_service'].includes(p.status));
  res.json({
    total: items.length,
    open: open.length,
    by_status: STATUSES.reduce((m, s) => (m[s] = items.filter(p => p.status === s).length, m), {}),
  });
});

// GET /api/installations/warranty/expiring?days=90 — equipment whose warranty ends soon
// (or already lapsed within the window), across all projects. For warranty lookups.
router.get('/warranty/expiring', async (req, res) => {
  const days = Math.min(Number(req.query.days) || 90, 3650);
  const horizon = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const items = await list('installations');
  const rows = [];
  for (const p of items) {
    for (const e of (p.equipment || [])) {
      if (e.warranty_expiry && e.warranty_expiry <= horizon) {
        rows.push({ project_id: p.id, project_number: p.project_number, customer_name: p.customer_name,
          address: p.address, ...e, expired: e.warranty_expiry < today() });
      }
    }
  }
  rows.sort((a, b) => (a.warranty_expiry || '').localeCompare(b.warranty_expiry || ''));
  res.json(rows);
});

// GET /api/installations/:id — full project (file blobs stripped).
router.get('/:id', async (req, res) => {
  const p = await getById('installations', req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  res.json(slim(p));
});

// POST /api/installations — create. Body may carry { from_quote_id } or { from_job_id }
// to pre-fill from a quote/job, or plain fields for a from-scratch project.
router.post('/', async (req, res) => {
  const b = req.body || {};
  const seed = await seedFrom({ quoteId: b.from_quote_id, jobId: b.from_job_id });
  // Don't create a second project for the same quote/job.
  if (seed.quote_id || seed.job_id) {
    const existing = (await list('installations')).find(p =>
      (seed.quote_id && p.quote_id === seed.quote_id) || (seed.job_id && p.job_id === seed.job_id));
    if (existing) return res.json({ ...slim(existing), already: true });
  }
  const project_number = await nextNumber();
  const saved = await create('installations', uuid(), {
    project_number,
    customer_id: seed.customer_id || b.customer_id || null,
    customer_name: seed.customer_name || b.customer_name || null,
    address: seed.address || b.address || null,
    city_state_zip: seed.city_state_zip || b.city_state_zip || null,
    site_contact: seed.site_contact || b.site_contact || null,
    site_phone: seed.site_phone || b.site_phone || null,
    quote_id: seed.quote_id || null,
    job_id: seed.job_id || null,
    wo_number: seed.wo_number || b.wo_number || null,
    status: 'planning',
    property_class: b.property_class || null,
    equipment_types: Array.isArray(b.equipment_types) ? b.equipment_types : [],
    technician: b.technician || null,
    technician_license: b.technician_license || null,
    start_up_date: b.start_up_date || null,
    documents: [],
    equipment: [],
    report: b.report || {},        // free-form commissioning report object (frontend-driven)
    notes: seed.notes || b.notes || null,
    created_by: req.user.name,
    created_at: nowISO(),
    updated_at: nowISO(),
  });
  res.status(201).json(slim(saved));
});

// PUT /api/installations/:id — update header fields and/or the report object.
router.put('/:id', async (req, res) => {
  const p = await getById('installations', req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  const b = req.body || {};
  const patch = { updated_at: nowISO() };
  const fields = ['customer_name', 'address', 'city_state_zip', 'site_contact', 'site_phone',
    'wo_number', 'property_class', 'technician', 'technician_license', 'start_up_date', 'notes'];
  for (const f of fields) if (b[f] !== undefined) patch[f] = b[f] === '' ? null : b[f];
  if (b.status !== undefined) patch.status = STATUSES.includes(b.status) ? b.status : p.status;
  if (Array.isArray(b.equipment_types)) patch.equipment_types = b.equipment_types;
  if (b.report !== undefined && typeof b.report === 'object') patch.report = { ...(p.report || {}), ...b.report };
  res.json(slim(await update('installations', req.params.id, patch)));
});

// ---- Documents vault ----
// POST /api/installations/:id/documents  { type, filename, data(base64), note }
router.post('/:id/documents', async (req, res) => {
  const p = await getById('installations', req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  const b = req.body || {};
  if (!b.data) return res.status(400).json({ error: 'No file provided' });
  const data = String(b.data).replace(/^data:[^,]*,/, '');
  const doc = {
    id: uuid(),
    type: DOC_TYPES.includes(b.type) ? b.type : 'other',
    filename: (b.filename || 'document').toString().slice(0, 160),
    mimeType: b.mimeType || 'application/octet-stream',
    note: (b.note || '').toString().trim().slice(0, 300) || null,
    data,
    uploaded_by: req.user.name,
    uploaded_at: nowISO(),
  };
  const documents = [...(p.documents || []), doc];
  await update('installations', req.params.id, { documents, updated_at: nowISO() });
  const { data: _omit, ...meta } = doc;
  res.status(201).json({ ...meta, has_data: true });
});

// GET /api/installations/:id/documents/:docId — stream/inline a stored file.
router.get('/:id/documents/:docId', async (req, res) => {
  const p = await getById('installations', req.params.id);
  const doc = (p?.documents || []).find(d => d.id === req.params.docId);
  if (!doc || !doc.data) return res.status(404).json({ error: 'File not found' });
  const buf = Buffer.from(doc.data, 'base64');
  res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${(doc.filename || 'document').replace(/"/g, '')}"`);
  res.send(buf);
});

// DELETE /api/installations/:id/documents/:docId
router.delete('/:id/documents/:docId', async (req, res) => {
  const p = await getById('installations', req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  const documents = (p.documents || []).filter(d => d.id !== req.params.docId);
  await update('installations', req.params.id, { documents, updated_at: nowISO() });
  res.json({ success: true });
});

// ---- Equipment & warranty register ----
router.post('/:id/equipment', async (req, res) => {
  const p = await getById('installations', req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  const item = cleanEquip(req.body || {});
  const equipment = [...(p.equipment || []), item];
  await update('installations', req.params.id, { equipment, updated_at: nowISO() });
  res.status(201).json(item);
});

router.put('/:id/equipment/:eqId', async (req, res) => {
  const p = await getById('installations', req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  const equipment = (p.equipment || []).map(e => e.id === req.params.eqId ? cleanEquip({ ...e, ...req.body, id: e.id }) : e);
  await update('installations', req.params.id, { equipment, updated_at: nowISO() });
  res.json(equipment.find(e => e.id === req.params.eqId) || null);
});

router.delete('/:id/equipment/:eqId', async (req, res) => {
  const p = await getById('installations', req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  const equipment = (p.equipment || []).filter(e => e.id !== req.params.eqId);
  await update('installations', req.params.id, { equipment, updated_at: nowISO() });
  res.json({ success: true });
});

router.delete('/:id', async (req, res) => {
  await remove('installations', req.params.id);
  res.json({ success: true });
});

module.exports = router;
module.exports.STATUSES = STATUSES;
module.exports.DOC_TYPES = DOC_TYPES;
