// Commercial Boiler Preventive Maintenance & Service Contracts.
// Reuses customers, PDF engine, email and notifications — no duplicate systems.
const express = require('express');
const { v4: uuid } = require('uuid');
const { list, getById, create, update, remove, nameMap } = require('../lib/db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { render, sendMail } = require('../lib/email');
const settings = require('../lib/settings');
const { PACKAGES, PRICING_GUIDE, packageFor, buildContractBody, RESIDENTIAL_PLANS, RESIDENTIAL_ADDONS, residentialPlanFor, residentialTotals } = require('../lib/boilerContract');
const { pdfBuffer } = require('../lib/pdfDoc');

const router = express.Router();
router.use(authMiddleware, requireRole('admin', 'office'));

const START = 4200;
async function nextNumber() {
  const all = await list('boiler_contracts');
  let max = START - 1;
  for (const c of all) { const m = String(c.contract_number || '').match(/(\d+)/); if (m) max = Math.max(max, Number(m[1])); }
  return `BC-${String(max + 1).padStart(4, '0')}`;
}

// Derive a live status: an "active" contract flips to expiring_soon / expired by date.
function liveStatus(c) {
  if (!['active', 'expiring_soon'].includes(c.status)) return c.status;
  if (!c.expiry_date) return c.status;
  const days = Math.ceil((new Date(c.expiry_date).getTime() - Date.now()) / 86400000);
  if (days < 0) return 'expired';
  if (days <= 60) return 'expiring_soon';
  return 'active';
}

async function shape(body) {
  const rate = Number(await settings.get('default_tax_rate')) || 0.08875;
  const taxable = body.taxable !== false;

  // ── Residential maintenance agreement ──────────────────────────────────
  if (body.contract_type === 'residential') {
    const plan = residentialPlanFor(body.plan) || RESIDENTIAL_PLANS.essential;
    const billing = body.billing === 'monthly' ? 'monthly' : 'annual';
    // Normalize the add-ons map to known ids + non-negative integer quantities.
    const addons = {};
    for (const a of RESIDENTIAL_ADDONS) {
      const qty = Math.max(0, Math.floor(Number(body.addons?.[a.id]) || 0));
      if (qty > 0) addons[a.id] = qty;
    }
    const t = residentialTotals({ plan: plan.id, billing, addons });
    const tax_amount = taxable ? Math.round(t.subtotal * rate * 100) / 100 : 0;
    return {
      contract_type: 'residential',
      customer_id: body.customer_id || null,
      property_name: body.property_name || null,
      property_address: body.property_address || null,
      boilers: Array.isArray(body.boilers) ? body.boilers : [],
      plan: plan.id,
      billing,
      addons,
      annual_price: t.subtotal,           // 12-month total before tax (for list/revenue)
      labor_discount: plan.labor_discount,
      parts_discount: 0,
      service_frequency: billing === 'monthly' ? 'Annual plan, billed monthly' : 'Annual plan, billed yearly',
      scope_items: Array.isArray(body.scope_items) ? body.scope_items : null,
      exclusions: Array.isArray(body.exclusions) ? body.exclusions : null,
      payment_schedule: billing === 'monthly' ? `${t.plan.monthly ? '$' + t.plan.monthly : ''}/month for 12 months` : 'Annual in advance',
      start_date: body.start_date || null,
      expiry_date: body.expiry_date || null,
      renewal_date: body.renewal_date || null,
      status: body.status || 'draft',
      notes: body.notes || null,
      taxable, tax_rate: rate, tax_amount,
      total: t.subtotal + tax_amount,
    };
  }

  // ── Commercial boiler agreement (unchanged) ────────────────────────────
  const pkg = packageFor(body.package);
  const annual = Number(body.annual_price) || (pkg ? pkg.default_price : 0);
  const tax_amount = taxable ? Math.round(annual * rate * 100) / 100 : 0;
  return {
    contract_type: 'commercial',
    customer_id: body.customer_id || null,
    property_name: body.property_name || null,
    property_address: body.property_address || null,
    boilers: Array.isArray(body.boilers) ? body.boilers : [],
    package: body.package || 'custom',
    annual_price: annual,
    labor_discount: body.labor_discount != null ? Number(body.labor_discount) : (pkg ? pkg.labor_discount : 0),
    parts_discount: body.parts_discount != null ? Number(body.parts_discount) : (pkg ? pkg.parts_discount : 0),
    visits: body.visits != null ? Number(body.visits) : (pkg ? pkg.visits : 0),
    service_frequency: body.service_frequency || (pkg ? pkg.frequency : ''),
    normal_hours: body.normal_hours || null,
    emergency_availability: body.emergency_availability || null,
    emergency_rate: body.emergency_rate != null ? Number(body.emergency_rate) : null,
    after_hours_rate: body.after_hours_rate != null ? Number(body.after_hours_rate) : null,
    min_charge: body.min_charge != null ? Number(body.min_charge) : null,
    response_time: body.response_time || null,
    scope_items: Array.isArray(body.scope_items) ? body.scope_items : null,
    exclusions: Array.isArray(body.exclusions) ? body.exclusions : null,
    payment_schedule: body.payment_schedule || 'Annual in advance',
    start_date: body.start_date || null,
    expiry_date: body.expiry_date || null,
    renewal_date: body.renewal_date || null,
    status: body.status || 'draft',
    notes: body.notes || null,
    taxable,
    tax_rate: rate,
    tax_amount,
    total: annual + tax_amount,
  };
}

// Package catalog + admin-editable default prices + large-boiler pricing guidance.
router.get('/packages', async (req, res) => {
  const prices = {
    essential: Number(await settings.get('boiler_price_essential')) || PACKAGES.essential.default_price,
    professional: Number(await settings.get('boiler_price_professional')) || PACKAGES.professional.default_price,
    premium: Number(await settings.get('boiler_price_premium')) || PACKAGES.premium.default_price,
  };
  const defaults = {
    emergency_rate: Number(await settings.get('boiler_emergency_rate')) || null,
    after_hours_rate: Number(await settings.get('boiler_after_hours_rate')) || null,
    min_charge: Number(await settings.get('boiler_min_charge')) || null,
  };
  res.json({ packages: PACKAGES, prices, defaults, pricing_guide: PRICING_GUIDE, residential_plans: RESIDENTIAL_PLANS, residential_addons: RESIDENTIAL_ADDONS });
});

router.get('/', async (req, res) => {
  const [rows, customers] = await Promise.all([list('boiler_contracts'), nameMap('customers')]);
  const out = rows
    .map(c => ({
      id: c.id, contract_number: c.contract_number, customer_id: c.customer_id,
      customer_name: customers[c.customer_id] || null, property_name: c.property_name,
      property_address: c.property_address,
      contract_type: c.contract_type || 'commercial', package: c.package, plan: c.plan || null,
      annual_price: c.annual_price,
      total: c.total, start_date: c.start_date, expiry_date: c.expiry_date, status: liveStatus(c),
      boilers: (c.boilers || []).length, created_at: c.created_at,
    }))
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  res.json(out);
});

router.get('/:id', async (req, res) => {
  const c = await getById('boiler_contracts', req.params.id);
  if (!c) return res.status(404).json({ error: 'Contract not found' });
  const cust = c.customer_id ? await getById('customers', c.customer_id) : null;
  res.json({ ...c, status: liveStatus(c), customer_name: cust?.name || null, customer_email: cust?.email || null });
});

router.post('/', async (req, res) => {
  const data = await shape(req.body);
  data.contract_number = await nextNumber();
  data.created_at = new Date().toISOString();
  const saved = await create('boiler_contracts', uuid(), data);
  res.status(201).json(saved);
});

router.put('/:id', async (req, res) => {
  const existing = await getById('boiler_contracts', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Contract not found' });
  const data = await shape(req.body);
  const saved = await update('boiler_contracts', req.params.id, data);
  res.json(saved);
});

router.delete('/:id', async (req, res) => {
  await remove('boiler_contracts', req.params.id);
  res.json({ success: true });
});

// Build the proposal-style PDF payload for a contract (reuses the branded renderer).
async function pdfOpts(c) {
  const cfg = await settings.emailConfig();
  const b = cfg.business;
  const cust = c.customer_id ? await getById('customers', c.customer_id) : null;
  const body = buildContractBody({ ...c, customer_name: cust?.name }, { name: b.name });
  let items, docTitle;
  if (c.contract_type === 'residential') {
    const t = residentialTotals(c);
    docTitle = 'MAINTENANCE AGREEMENT';
    items = [
      { description: `${t.plan.name} — residential maintenance plan (${t.billing === 'monthly' ? `$${t.plan.monthly}/mo × 12` : 'annual'})`, quantity: 1, unit_price: t.planCharge, total: t.planCharge },
      ...t.addonLines.map(a => ({ description: `Add-on: ${a.label}`, quantity: a.qty, unit_price: a.price, total: a.total })),
    ];
  } else {
    const pkg = packageFor(c.package);
    docTitle = 'SERVICE AGREEMENT';
    items = [{
      description: `Annual boiler service agreement — ${pkg ? pkg.name : 'Custom'} package`,
      quantity: 1, unit_price: Number(c.annual_price) || 0, total: Number(c.annual_price) || 0,
    }];
  }
  return {
    kind: 'proposal',
    doc: {
      doc_title: docTitle,
      proposal_number: c.contract_number,
      issue_date: c.start_date || new Date().toISOString().slice(0, 10),
      expiry_date: c.expiry_date,
      body, items,
      subtotal: Number(c.annual_price) || 0, discount: 0,
      tax_rate: c.tax_rate, tax_amount: c.tax_amount || 0, total: c.total || c.annual_price || 0,
      service_address: c.property_address,
    },
    business: { name: b.name, phone: b.phone, email: b.email, address: b.address, website: b.website },
    customer: cust ? { name: cust.name, email: cust.email, phone: cust.phone, address: cust.address, city: cust.city, state: cust.state, zip: cust.zip } : { name: c.customer_name || '' },
  };
}

// Email the contract PDF to the customer and mark it sent.
router.post('/:id/send', async (req, res) => {
  const c = await getById('boiler_contracts', req.params.id);
  if (!c) return res.status(404).json({ error: 'Contract not found' });
  const cust = c.customer_id ? await getById('customers', c.customer_id) : null;
  if (!cust?.email) return res.status(422).json({ error: 'This customer has no email address on file' });
  try {
    const buf = await pdfBuffer(await pdfOpts(c));
    const agreementTitle = c.contract_type === 'residential' ? 'Residential Maintenance Agreement' : 'Commercial Boiler Service Agreement';
    const { subject, html } = await render('proposal', { ...c, proposal_number: c.contract_number, title: agreementTitle, customer_name: cust.name });
    const result = await sendMail({
      type: 'boiler_contract', to: cust.email, toName: cust.name, subject, html,
      relatedId: c.id, customerId: c.customer_id, sentBy: req.user?.name,
      attachments: [{ filename: `${c.contract_type === 'residential' ? 'Maintenance' : 'Service'}-Agreement-${c.contract_number}.pdf`, content: buf }],
    });
    if (result.status === 'failed') return res.status(502).json({ error: result.error || 'Email failed to send' });
    if (['draft', 'proposal_sent'].includes(c.status)) await update('boiler_contracts', c.id, { status: 'awaiting_signature' });
    res.json({ ok: true, to: cust.email });
  } catch (e) {
    console.error('[boiler-contracts] send failed:', e.message);
    res.status(502).json({ error: 'Could not send the contract' });
  }
});

module.exports = router;
