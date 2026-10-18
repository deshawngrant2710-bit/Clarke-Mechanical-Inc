// Vendor bills / accounts payable — what Clarke owes its vendors. Phase 1 is
// manual + status tracking; Phase 2 adds auto-import from email (status
// 'pending_review' until approved).
const express = require('express');
const { v4: uuid } = require('uuid');
const { list, getById, create, update, remove } = require('../lib/db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { extractInvoice } = require('../lib/invoiceExtract');
let notify; try { ({ notify } = require('../lib/notify')); } catch { notify = async () => {}; }

const router = express.Router();
router.use(authMiddleware, requireRole('admin', 'office'));

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
const OWED = ['open', 'pending_review']; // counts as outstanding
// Estimates (quotes) and statements are NOT money owed — they're separate
// documents, so they never count toward A/P totals or the P&L.
const PAYABLE = (b) => b.type !== 'estimate' && b.type !== 'statement';

function clean(b) {
  return {
    vendor_id: b.vendor_id || null,
    vendor_name: (b.vendor_name || '').trim() || null,
    invoice_number: (b.invoice_number || '').trim() || null,
    amount: round2(b.amount),
    bill_date: b.bill_date || today(),
    due_date: b.due_date || null,
    notes: (b.notes || '').trim() || null,
    line_items: Array.isArray(b.line_items) ? b.line_items : [],
  };
}

// GET /api/vendor-bills?status=  — list (newest first). The heavy PDF base64 is
// stripped here; fetch it via /:id/attachment only when viewing.
router.get('/', async (req, res) => {
  let items = await list('vendor_bills');
  if (req.query.status) items = items.filter(b => b.status === req.query.status);
  items.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  res.json(items.map(b => ({ ...b, attachment: b.attachment ? { filename: b.attachment.filename, has_data: !!b.attachment.data } : null })));
});

// GET /api/vendor-bills/summary — totals for dashboard + reports.
router.get('/summary', async (req, res) => {
  const bills = (await list('vendor_bills')).filter(PAYABLE);
  const t = today();
  const owed = bills.filter(b => OWED.includes(b.status));
  res.json({
    outstanding: round2(owed.reduce((s, b) => s + (b.amount || 0), 0)),
    overdue: round2(owed.filter(b => b.due_date && b.due_date < t).reduce((s, b) => s + (b.amount || 0), 0)),
    to_review: bills.filter(b => b.status === 'pending_review').length,
    open_count: owed.length,
  });
});

// POST /api/vendor-bills/upload — upload an invoice PDF; AI extracts the details
// and files it as a pending-review bill with the PDF attached.
router.post('/upload', async (req, res) => {
  const { filename, data, vendor_id } = req.body || {};
  if (!data) return res.status(400).json({ error: 'No PDF provided' });
  const b64 = String(data).replace(/^data:[^,]*,/, ''); // strip any data: URL prefix
  let ex = {};
  try { ex = await extractInvoice(b64); } catch (e) { console.error('[vendor-bills] extract:', e.message); }

  let vendor = null;
  const vendors = await list('vendors');
  if (vendor_id) vendor = vendors.find(v => v.id === vendor_id);
  if (!vendor && ex.vendor_name) {
    const n = ex.vendor_name.toLowerCase();
    vendor = vendors.find(v => v.name && (v.name.toLowerCase() === n || v.name.toLowerCase().includes(n) || n.includes(v.name.toLowerCase())));
  }

  const saved = await create('vendor_bills', uuid(), {
    vendor_id: vendor?.id || null, vendor_name: vendor?.name || ex.vendor_name || null,
    invoice_number: ex.invoice_number || null, amount: round2(ex.amount),
    bill_date: ex.bill_date || today(), due_date: ex.due_date || null,
    line_items: ex.line_items || [], notes: 'Uploaded invoice',
    status: 'pending_review', source: 'upload',
    attachment: { filename: filename || 'invoice.pdf', mimeType: 'application/pdf', data: b64 },
    created_by: req.user.name, created_at: new Date().toISOString(),
  });
  res.status(201).json(saved);
});

router.post('/', async (req, res) => {
  const data = clean(req.body);
  const isRefund = req.body.type === 'refund';
  if (!(Math.abs(data.amount) > 0)) return res.status(400).json({ error: 'Enter an amount greater than zero' });
  if (!data.vendor_name && !data.vendor_id) return res.status(400).json({ error: 'Choose or name a vendor' });
  // A refund/credit from a vendor is stored as a negative, already-settled bill so
  // it nets against expenses and isn't shown as money we owe.
  if (isRefund) { data.amount = -Math.abs(data.amount); }
  const saved = await create('vendor_bills', uuid(), {
    ...data, type: isRefund ? 'refund' : 'bill',
    status: isRefund ? 'paid' : 'open', source: 'manual',
    paid_at: isRefund ? new Date().toISOString() : undefined,
    created_by: req.user.name, created_at: new Date().toISOString(),
  });
  res.status(201).json(saved);
});

router.put('/:id', async (req, res) => {
  const existing = await getById('vendor_bills', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Bill not found' });
  res.json(await update('vendor_bills', req.params.id, clean(req.body)));
});

// Approve an imported (pending_review) bill → it now counts as owed.
router.post('/:id/approve', async (req, res) => {
  const b = await getById('vendor_bills', req.params.id);
  if (!b) return res.status(404).json({ error: 'Bill not found' });
  const patch = {
    status: 'open', approved_at: new Date().toISOString(),
    approved_by: (req.body?.signer || '').trim() || req.user.name,
    approval_signature: req.body?.signature || null,
  };
  if (req.body?.amount != null) patch.amount = round2(req.body.amount); // let them fix the amount on approve
  res.json(await update('vendor_bills', req.params.id, patch));
});

// Mark a bill paid (records how/when; actual money movement is separate).
router.post('/:id/mark-paid', async (req, res) => {
  const b = await getById('vendor_bills', req.params.id);
  if (!b) return res.status(404).json({ error: 'Bill not found' });
  res.json(await update('vendor_bills', req.params.id, {
    status: 'paid', paid_at: req.body?.paid_at || new Date().toISOString(),
    paid_method: (req.body?.method || '').trim() || null, paid_by: req.user.name,
    ...((Number(b.amount) || 0) < 0 || req.body?.method === 'refund' ? { type: 'refund' } : {}),
    ...(req.body?.signature ? { approval_signature: req.body.signature, approved_by: (req.body?.signer || '').trim() || req.user.name, approved_at: new Date().toISOString() } : {}),
  }));
});

router.post('/:id/void', async (req, res) => {
  const b = await getById('vendor_bills', req.params.id);
  if (!b) return res.status(404).json({ error: 'Bill not found' });
  res.json(await update('vendor_bills', req.params.id, {
    status: 'void', prev_status: b.status !== 'void' ? b.status : (b.prev_status || 'open'),
    voided_by: req.user.name, voided_at: new Date().toISOString(),
  }));
});

// Un-void — bring a voided record back so it can be reviewed again. Restores the
// status it had before it was voided (falls back to open / to-review).
router.post('/:id/unvoid', async (req, res) => {
  const b = await getById('vendor_bills', req.params.id);
  if (!b) return res.status(404).json({ error: 'Bill not found' });
  const restored = b.prev_status || (b.source && b.source !== 'manual' && !b.approved_at ? 'pending_review' : 'open');
  res.json(await update('vendor_bills', req.params.id, {
    status: restored, prev_status: null, unvoided_by: req.user.name, unvoided_at: new Date().toISOString(),
  }));
});

// Reclassify a record as a bill, estimate (quote) or statement. Used from the
// review screen when an imported PDF turns out to be a quote or a statement
// rather than an invoice we owe.
router.post('/:id/reclassify', async (req, res) => {
  const b = await getById('vendor_bills', req.params.id);
  if (!b) return res.status(404).json({ error: 'Bill not found' });
  const type = ['bill', 'estimate', 'statement', 'refund'].includes(req.body?.type) ? req.body.type : 'bill';
  // Estimates await an approve/decline; statements await reconciliation; a plain
  // bill goes back to open (or stays to-review if it was imported & unapproved).
  let status = b.status;
  if (type === 'estimate') status = 'pending_review';
  else if (type === 'statement') status = 'pending_review';
  else if (type === 'bill') status = b.approved_at ? 'open' : (b.source && b.source !== 'manual' ? 'pending_review' : 'open');
  const patch = { type, status };
  if (type === 'refund') { patch.amount = -Math.abs(Number(b.amount) || 0); patch.status = 'paid'; patch.paid_at = b.paid_at || new Date().toISOString(); }
  res.json(await update('vendor_bills', req.params.id, patch));
});

// Approve or decline a vendor estimate (quote). Stores who decided + signature.
router.post('/:id/estimate-decision', async (req, res) => {
  const b = await getById('vendor_bills', req.params.id);
  if (!b) return res.status(404).json({ error: 'Bill not found' });
  const decision = req.body?.decision === 'declined' ? 'declined' : 'approved';
  res.json(await update('vendor_bills', req.params.id, {
    type: 'estimate', status: decision, decided_at: new Date().toISOString(),
    approved_by: (req.body?.signer || '').trim() || req.user.name,
    approval_signature: req.body?.signature || null, approved_at: new Date().toISOString(),
    ...(req.body?.amount != null ? { amount: round2(req.body.amount) } : {}),
  }));
});

// Mark a vendor statement cleared (reconciled) or back to open. Optionally records
// the balance the statement showed + who confirmed it.
router.post('/:id/statement-clear', async (req, res) => {
  const b = await getById('vendor_bills', req.params.id);
  if (!b) return res.status(404).json({ error: 'Bill not found' });
  const cleared = req.body?.cleared !== false;
  res.json(await update('vendor_bills', req.params.id, {
    type: 'statement', status: cleared ? 'cleared' : 'pending_review',
    ...(cleared ? { cleared_at: new Date().toISOString(), cleared_by: (req.body?.signer || '').trim() || req.user.name } : { cleared_at: null }),
    ...(req.body?.statement_balance != null ? { statement_balance: round2(req.body.statement_balance) } : {}),
    ...(req.body?.signature ? { approval_signature: req.body.signature, approved_by: (req.body?.signer || '').trim() || req.user.name } : {}),
  }));
});

// GET /api/vendor-bills/:id/attachment — the imported invoice PDF (inline view).
router.get('/:id/attachment', async (req, res) => {
  const b = await getById('vendor_bills', req.params.id);
  if (!b || !b.attachment?.data) return res.status(404).json({ error: 'No attachment' });
  const buf = Buffer.from(b.attachment.data, 'base64');
  res.setHeader('Content-Type', b.attachment.mimeType || 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${(b.attachment.filename || 'invoice.pdf').replace(/"/g, '')}"`);
  res.send(buf);
});

router.delete('/:id', async (req, res) => {
  await remove('vendor_bills', req.params.id);
  res.json({ success: true });
});

module.exports = router;
module.exports.OWED = OWED;
