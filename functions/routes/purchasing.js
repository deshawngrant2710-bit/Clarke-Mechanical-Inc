const express = require('express');
const { v4: uuid } = require('uuid');
const { list, getById, create, update, remove } = require('../lib/db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { render, sendMail } = require('../lib/email');

const router = express.Router();
router.use(authMiddleware, requireRole('admin', 'office'));

/* ------------------------------ Vendors ------------------------------ */
const cleanVendor = (b) => ({
  name: (b.name || '').trim(), email: b.email || null, phone: b.phone || null,
  address: b.address || null, notes: b.notes || null,
});

router.get('/vendors', async (req, res) => {
  res.json(await list('vendors', { orderBy: 'name' }));
});
router.post('/vendors', async (req, res) => {
  const data = cleanVendor(req.body);
  if (!data.name) return res.status(400).json({ error: 'Vendor name is required' });
  const saved = await create('vendors', uuid(), { ...data, created_at: new Date().toISOString() });
  res.status(201).json(saved);
});
router.put('/vendors/:id', async (req, res) => {
  const existing = await getById('vendors', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Vendor not found' });
  const data = cleanVendor(req.body);
  if (!data.name) return res.status(400).json({ error: 'Vendor name is required' });
  res.json(await update('vendors', req.params.id, data));
});
router.delete('/vendors/:id', async (req, res) => {
  await remove('vendors', req.params.id);
  res.json({ success: true });
});

/* --------------------------- Purchase orders --------------------------- */
const cleanItems = (items = []) => items.map(i => ({
  id: i.id || uuid(), description: (i.description || '').trim(),
  quantity: Number(i.quantity) || 0, unit_cost: Number(i.unit_cost) || 0,
  total: (Number(i.quantity) || 0) * (Number(i.unit_cost) || 0),
  inventory_id: i.inventory_id || null,
}));
const totalOf = (items) => items.reduce((s, i) => s + i.total, 0);

async function nextPO() {
  const all = await list('purchase_orders');
  const n = all.filter(x => (x.po_number || '').startsWith('PO-')).length + 1;
  return `PO-${String(n).padStart(4, '0')}`;
}

router.get('/orders', async (req, res) => {
  const orders = (await list('purchase_orders')).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  res.json(orders);
});
router.get('/orders/:id', async (req, res) => {
  const po = await getById('purchase_orders', req.params.id);
  if (!po) return res.status(404).json({ error: 'Purchase order not found' });
  res.json(po);
});

router.post('/orders', async (req, res) => {
  const { vendor_id, order_date, expected_date, notes, items = [] } = req.body;
  const vendor = vendor_id ? await getById('vendors', vendor_id) : null;
  const lineItems = cleanItems(items);
  const total = totalOf(lineItems);
  const po_number = await nextPO();
  const saved = await create('purchase_orders', uuid(), {
    po_number, vendor_id: vendor_id || null,
    vendor_name: vendor?.name || req.body.vendor_name || null,
    vendor_email: vendor?.email || req.body.vendor_email || null,
    status: 'draft', order_date: order_date || new Date().toISOString().slice(0, 10),
    expected_date: expected_date || null, items: lineItems, subtotal: total, total,
    notes: notes || null, received_at: null, created_at: new Date().toISOString(),
  });
  res.status(201).json(saved);
});

router.put('/orders/:id', async (req, res) => {
  const existing = await getById('purchase_orders', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Purchase order not found' });
  const { vendor_id, order_date, expected_date, notes, items, status } = req.body;
  const patch = {};
  if (items) { const li = cleanItems(items); patch.items = li; patch.subtotal = totalOf(li); patch.total = totalOf(li); }
  if (vendor_id !== undefined) {
    const v = vendor_id ? await getById('vendors', vendor_id) : null;
    patch.vendor_id = vendor_id || null;
    patch.vendor_name = v?.name || req.body.vendor_name || existing.vendor_name;
    patch.vendor_email = v?.email || req.body.vendor_email || existing.vendor_email;
  }
  if (order_date !== undefined) patch.order_date = order_date || null;
  if (expected_date !== undefined) patch.expected_date = expected_date || null;
  if (notes !== undefined) patch.notes = notes || null;
  if (status !== undefined) patch.status = status;
  res.json(await update('purchase_orders', req.params.id, patch));
});

router.delete('/orders/:id', async (req, res) => {
  await remove('purchase_orders', req.params.id);
  res.json({ success: true });
});

// Email the PO to the vendor (also flips draft -> ordered).
router.post('/orders/:id/email', async (req, res) => {
  const po = await getById('purchase_orders', req.params.id);
  if (!po) return res.status(404).json({ error: 'Purchase order not found' });
  const to = req.body.to || po.vendor_email;
  if (!to) return res.status(400).json({ error: 'No vendor email on file. Add one to the vendor or type it in.' });
  try {
    const { subject, html } = await render('purchase_order', po);
    await sendMail({ type: 'purchase_order', to, toName: po.vendor_name, subject, html, relatedId: po.id, sentBy: req.user.name });
    if (po.status === 'draft') await update('purchase_orders', po.id, { status: 'ordered' });
    res.json({ ok: true });
  } catch (e) { console.error('[purchasing] email failed:', e.message); res.status(502).json({ error: 'Could not send the PO' }); }
});

// Mark received — adds the items to Inventory once (increment existing, or create new).
router.post('/orders/:id/receive', async (req, res) => {
  const po = await getById('purchase_orders', req.params.id);
  if (!po) return res.status(404).json({ error: 'Purchase order not found' });
  if (po.status === 'received') return res.status(409).json({ error: 'This purchase order is already received' });
  for (const it of (po.items || [])) {
    const qty = Number(it.quantity) || 0;
    if (qty <= 0) continue;
    if (it.inventory_id) {
      const inv = await getById('inventory', it.inventory_id);
      if (inv) await update('inventory', it.inventory_id, { quantity: (Number(inv.quantity) || 0) + qty });
    } else if (it.description) {
      await create('inventory', uuid(), {
        name: it.description, sku: null, description: null, category: 'Purchased',
        quantity: qty, min_quantity: 0, unit_price: Number(it.unit_cost) || 0,
        supplier: po.vendor_name || null, location: null,
      });
    }
  }
  res.json(await update('purchase_orders', po.id, { status: 'received', received_at: new Date().toISOString() }));
});

module.exports = router;
