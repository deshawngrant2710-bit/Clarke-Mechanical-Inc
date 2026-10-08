// Flat-rate Service Price Book (from the NYC HVAC workbook).
// - Admins see internal cost inputs, loaded cost, gross profit & margin and manage
//   pricing settings. Office + technicians see the catalog with the four customer
//   price tiers (standard / member / after-hours / emergency) but NOT internal
//   costs or margins. Customers never reach this route; their estimates/invoices
//   only ever carry the snapshotted description + quoted price.
const express = require('express');
const { v4: uuid } = require('uuid');
const { list, getById, create, update, remove } = require('../lib/db');
const { authMiddleware, requireStaff, requireRole } = require('../middleware/auth');
const { computePrices, CONDITIONS, DEFAULT_PRICING_SETTINGS } = require('../lib/servicePricing');
const { SERVICE_SEED } = require('../data/servicePricebookSeed');

const router = express.Router();
// Pricing is an office/admin tool — technicians don't see the service catalog.
router.use(authMiddleware, requireRole('admin', 'office'));

const isAdmin = (req) => req.user?.role === 'admin';
const SETTINGS_DOC = 'settings';

async function getSettings() {
  const s = await getById('service_pricing', SETTINGS_DOC);
  return { ...DEFAULT_PRICING_SETTINGS, ...(s ? s.values : {}) };
}

// Shape an item for the response, hiding internal costs/margins from non-admins.
function viewItem(it, settings, admin) {
  const p = computePrices(it, settings);
  const base = {
    id: it.id, code: it.code, category: it.category, name: it.name,
    customer_desc: it.customer_desc || null, quote_required: !!it.quote_required,
    active: it.active !== false,
    prices: { standard: p.standard, member: p.member, after_hours: p.after_hours, emergency: p.emergency },
  };
  if (admin) {
    base.material = Number(it.material) || 0;
    base.hours = Number(it.hours) || 0;
    base.parts = Number(it.parts) || 0;
    base.loaded = p.loaded;
    base.gross_profit = p.gross_profit;
    base.gross_margin = p.gross_margin;
  }
  return base;
}

// GET /api/service-pricebook — the catalog (role-scoped). ?all=1 includes inactive (admin).
router.get('/', async (req, res) => {
  const [items, settings] = await Promise.all([list('service_pricebook', { orderBy: 'code' }), getSettings()]);
  const admin = isAdmin(req);
  const includeInactive = admin && (req.query.all === '1' || req.query.all === 'true');
  const out = items
    .filter(it => includeInactive || it.active !== false)
    .map(it => viewItem(it, settings, admin));
  res.json({ items: out, conditions: CONDITIONS, is_admin: admin });
});

// GET /api/service-pricebook/settings — admin only (internal pricing inputs).
router.get('/settings', requireRole('admin'), async (req, res) => {
  res.json(await getSettings());
});

// PUT /api/service-pricebook/settings — admin only. Updates recompute prices live.
router.put('/settings', requireRole('admin'), async (req, res) => {
  const keys = Object.keys(DEFAULT_PRICING_SETTINGS);
  const values = {};
  for (const k of keys) if (req.body[k] !== undefined && req.body[k] !== '') values[k] = Number(req.body[k]);
  const existing = await getById('service_pricing', SETTINGS_DOC);
  const merged = { ...(existing ? existing.values : {}), ...values };
  if (existing) await update('service_pricing', SETTINGS_DOC, { values: merged });
  else await create('service_pricing', SETTINGS_DOC, { values: merged });
  res.json({ ...DEFAULT_PRICING_SETTINGS, ...merged });
});

// POST /api/service-pricebook/import — idempotent load from the baked-in workbook
// seed (or a provided list). Matches on `code`: updates cost inputs for existing
// items, adds new ones, never duplicates. Preserves active flag + customer_desc.
router.post('/import', requireRole('admin', 'office'), async (req, res) => {
  const rows = Array.isArray(req.body?.items) && req.body.items.length ? req.body.items : SERVICE_SEED;
  const existing = await list('service_pricebook');
  const byCode = new Map(existing.map(it => [String(it.code), it]));
  let added = 0, updated = 0;
  for (const r of rows) {
    const code = String(r.code || '').trim();
    if (!code) continue;
    const fields = {
      code, category: r.category || '', name: r.name || '',
      material: Number(r.material) || 0, hours: Number(r.hours) || 0, parts: Number(r.parts) || 0,
      quote_required: !!r.quote_required,
    };
    const found = byCode.get(code);
    if (found) { await update('service_pricebook', found.id, fields); updated++; }
    else { await create('service_pricebook', uuid(), { ...fields, customer_desc: null, active: true, created_at: new Date().toISOString() }); added++; }
  }
  res.json({ ok: true, added, updated, total: added + updated });
});

// POST /api/service-pricebook — add a service (admin/office).
router.post('/', requireRole('admin', 'office'), async (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'Service name is required' });
  const code = String(b.code || '').trim() || `X-${Date.now().toString().slice(-6)}`;
  const saved = await create('service_pricebook', uuid(), {
    code, category: b.category || 'Other', name: b.name,
    customer_desc: b.customer_desc || null,
    material: Number(b.material) || 0, hours: Number(b.hours) || 0, parts: Number(b.parts) || 0,
    quote_required: !!b.quote_required, active: true, created_at: new Date().toISOString(),
  });
  res.status(201).json(saved);
});

// PUT /api/service-pricebook/:id — edit / deactivate (admin/office).
router.put('/:id', requireRole('admin', 'office'), async (req, res) => {
  const existing = await getById('service_pricebook', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Service not found' });
  const b = req.body || {};
  const patch = {};
  for (const f of ['code', 'category', 'name', 'customer_desc']) if (b[f] !== undefined) patch[f] = b[f];
  for (const f of ['material', 'hours', 'parts']) if (b[f] !== undefined) patch[f] = Number(b[f]) || 0;
  if (b.quote_required !== undefined) patch.quote_required = !!b.quote_required;
  if (b.active !== undefined) patch.active = !!b.active;
  const saved = await update('service_pricebook', req.params.id, patch);
  res.json(saved);
});

// DELETE /api/service-pricebook/:id — hard delete (admin only; deactivating is preferred).
router.delete('/:id', requireRole('admin'), async (req, res) => {
  await remove('service_pricebook', req.params.id);
  res.json({ success: true });
});

module.exports = router;
