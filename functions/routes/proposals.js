const express = require('express');
const { v4: uuid } = require('uuid');
const { list, getById, create, update, remove, nameMap, findWhere } = require('../lib/db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { render, sendMail } = require('../lib/email');
const { notifyCustomerBySms } = require('../lib/sms');
const { buildAttachment } = require('../lib/attachDoc');
const settings = require('../lib/settings');

const router = express.Router();
router.use(authMiddleware, requireRole('admin', 'office'));

const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const START_NUMBER = 4200;

async function nextNumber() {
  const all = await list('proposals');
  let max = START_NUMBER - 1;
  for (const p of all) {
    const m = String(p.proposal_number || '').match(/^[A-Za-z]+-(\d+)$/);
    if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
  }
  return `PROP-${String(max + 1).padStart(4, '0')}`;
}

// Normalize line items + totals. A proposal can be written-terms-only (no items),
// so everything degrades to zero gracefully.
function computeTotals(body) {
  const items = (Array.isArray(body.items) ? body.items : []).map(i => {
    const quantity = Number(i.quantity) || 0;
    const unit_price = Number(i.unit_price) || 0;
    return {
      id: i.id || uuid(), description: String(i.description || ''),
      note: i.note ? String(i.note).trim() || null : null,
      quantity, unit_price, total: Math.round(quantity * unit_price * 100) / 100,
    };
  });
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const discount = Math.min(Math.max(Number(body.discount) || 0, 0), subtotal);
  const rate = body.tax_rate != null ? Number(body.tax_rate) : 0;
  const tax_amount = Math.round((subtotal - discount) * rate * 100) / 100;
  const total = Math.round((subtotal - discount + tax_amount) * 100) / 100;

  // Milestones: each has a label and either a fixed amount or a percent of total.
  const milestones = (Array.isArray(body.milestones) ? body.milestones : []).map(m => {
    const percent = m.percent != null && m.percent !== '' ? Number(m.percent) : null;
    const amount = percent != null ? Math.round(total * percent) / 100 : (Number(m.amount) || 0);
    return { label: String(m.label || ''), percent, amount: Math.round(amount * 100) / 100, due: m.due || null };
  });

  return { items, subtotal, discount, tax_rate: rate, tax_amount, total, milestones };
}

/* ---------------- Proposals ---------------- */
router.get('/', async (req, res) => {
  const [proposals, customers] = await Promise.all([list('proposals'), nameMap('customers')]);
  const rows = proposals
    .map(p => ({
      id: p.id, proposal_number: p.proposal_number, title: p.title, status: p.status,
      customer_id: p.customer_id, customer_name: customers[p.customer_id] || null,
      total: p.total, issue_date: p.issue_date, expiry_date: p.expiry_date,
      signed_at: p.signature?.signed_at || null, created_at: p.created_at,
    }))
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const p = await getById('proposals', req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposal not found' });
  const customer = p.customer_id ? await getById('customers', p.customer_id) : null;
  res.json({ ...p, customer_name: customer?.name || null, customer_email: customer?.email || null, customer_phone: customer?.phone || null, customer_address: customer?.address || null });
});

function shape(body) {
  const t = computeTotals(body);
  return {
    proposal_number: undefined, // set by caller on create
    customer_id: body.customer_id || null,
    title: String(body.title || 'Proposal'),
    status: body.status || 'draft',
    issue_date: body.issue_date || new Date().toISOString().slice(0, 10),
    expiry_date: body.expiry_date || null,
    prepared_by: body.prepared_by || null,
    service_address: body.service_address || null,
    body: body.body || '',       // long rich-text HTML (scope, terms, stipulations)
    ...t,
    deposit: Number(body.deposit) || 0,
  };
}

router.post('/', async (req, res) => {
  const data = shape(req.body);
  data.proposal_number = await nextNumber();
  const saved = await create('proposals', uuid(), data);
  res.status(201).json(saved);
});

router.put('/:id', async (req, res) => {
  const existing = await getById('proposals', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Proposal not found' });
  const data = shape(req.body);
  delete data.proposal_number; // never renumber
  const saved = await update('proposals', req.params.id, data);
  res.json(saved);
});

router.delete('/:id', async (req, res) => {
  await remove('proposals', req.params.id);
  res.json({ success: true });
});

// Email the proposal to the customer (with the branded PDF attached) + SMS notice.
router.post('/:id/send', async (req, res) => {
  const p = await getById('proposals', req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposal not found' });
  const customer = p.customer_id ? await getById('customers', p.customer_id) : null;
  if (!customer?.email) return res.status(422).json({ error: 'This customer has no email address on file' });

  const entity = { ...p, customer_name: customer.name };
  const { subject, html } = await render('proposal', entity);
  const attachments = await buildAttachment('proposal', entity);
  const result = await sendMail({
    type: 'proposal', to: customer.email, toName: customer.name, subject, html,
    relatedId: p.id, customerId: p.customer_id, sentBy: req.user?.name, attachments,
  });
  if (result.status === 'failed') return res.status(502).json({ error: result.error || 'Email failed to send' });

  if (p.status === 'draft') await update('proposals', p.id, { status: 'sent' });
  try {
    const biz = (await settings.get('business_name')) || 'Clarke Mechanical';
    await notifyCustomerBySms(customer, `${biz}: your proposal ${p.proposal_number} (${money(p.total)}) is ready to review and sign in your account. Reply STOP to opt out.`);
  } catch (e) { console.error('[proposals] sms failed:', e.message); }
  res.json({ ...result, to: customer.email });
});

// Turn an accepted proposal into an invoice.
router.post('/:id/convert-to-invoice', async (req, res) => {
  const p = await getById('proposals', req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposal not found' });
  const { subtotal, discount, tax_rate, tax_amount, total } = p;
  // Next invoice number (same continuous CL-#### sequence billing uses).
  const invoices = await list('invoices');
  let max = START_NUMBER - 1;
  for (const inv of invoices) {
    const m = String(inv.invoice_number || '').match(/^[A-Za-z]+-(?:\d{4}-)?(\d+)$/);
    if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
  }
  const num = `CL-${String(max + 1).padStart(4, '0')}`;
  const saved = await create('invoices', uuid(), {
    invoice_number: num, customer_id: p.customer_id, job_id: null, status: 'draft',
    issue_date: new Date().toISOString().slice(0, 10), due_date: null,
    subtotal, discount, tax_rate, tax_amount, total, deposit: p.deposit || 0,
    notes: `Created from proposal ${p.proposal_number}`, items: p.items || [],
    from_proposal: p.id,
  });
  await update('proposals', p.id, { converted_invoice_id: saved.id });
  res.status(201).json(saved);
});

/* ---------------- Templates (reusable terms) ---------------- */
router.get('/templates/all', async (req, res) => {
  const rows = (await list('proposal_templates')).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  res.json(rows);
});
router.post('/templates', async (req, res) => {
  const saved = await create('proposal_templates', uuid(), {
    name: String(req.body.name || 'Untitled template'),
    body: req.body.body || '',
    items: Array.isArray(req.body.items) ? req.body.items : [],
    milestones: Array.isArray(req.body.milestones) ? req.body.milestones : [],
  });
  res.status(201).json(saved);
});
router.put('/templates/:id', async (req, res) => {
  const existing = await getById('proposal_templates', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Template not found' });
  const saved = await update('proposal_templates', req.params.id, {
    name: String(req.body.name || existing.name),
    body: req.body.body != null ? req.body.body : existing.body,
    items: Array.isArray(req.body.items) ? req.body.items : existing.items,
    milestones: Array.isArray(req.body.milestones) ? req.body.milestones : existing.milestones,
  });
  res.json(saved);
});
router.delete('/templates/:id', async (req, res) => {
  await remove('proposal_templates', req.params.id);
  res.json({ success: true });
});

module.exports = router;
