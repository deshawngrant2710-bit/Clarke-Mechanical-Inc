// Public, token-authenticated invoice payment (used by the mobile app, which opens
// this in the device browser on your registered domain so HelcimPay.js can render).
// The one-time token IS the auth — no login required. Mounted at /api/pay.
const express = require('express');
const { v4: uuid } = require('uuid');
const { getById, findWhere, create, update, remove } = require('../lib/db');
const helcim = require('../lib/helcim');
const settings = require('../lib/settings');

const router = express.Router();

async function balanceDollars(invoice) {
  const pays = await findWhere('payments', 'invoice_id', invoice.id);
  const paid = pays.reduce((s, p) => s + (p.amount || 0), 0);
  return Math.max(0, Math.round(((invoice.total || 0) - paid) * 100) / 100);
}

async function recordPayment(invoice, { amount, reference, note }) {
  const existing = await findWhere('payments', 'invoice_id', invoice.id);
  if (!existing.some(p => p.reference === reference)) {
    await create('payments', uuid(), {
      invoice_id: invoice.id, amount: Number(amount) || 0, method: 'card',
      reference, notes: note || 'Paid online via Helcim', paid_at: new Date().toISOString(),
    });
  }
  const total = (await findWhere('payments', 'invoice_id', invoice.id)).reduce((s, p) => s + (p.amount || 0), 0);
  const paid = total >= (invoice.total || 0);
  if (paid && invoice.status !== 'paid') await update('invoices', invoice.id, { status: 'paid' });
  return paid ? 'paid' : 'partial';
}

// Resolve a valid, unused, unexpired token → its invoice.
async function loadToken(token) {
  const rec = await getById('pay_tokens', token);
  if (!rec || rec.used) return null;
  if (rec.expires_at && new Date(rec.expires_at).getTime() < Date.now()) return null;
  const invoice = await getById('invoices', rec.invoice_id);
  if (!invoice) return null;
  return { rec, invoice };
}

// GET /api/pay/:token — details to render the payment page.
router.get('/:token', async (req, res) => {
  const ctx = await loadToken(req.params.token);
  if (!ctx) return res.status(404).json({ error: 'This payment link is invalid or has expired.' });
  const business = (await settings.get('business_name')) || 'Clarke Mechanical';
  res.json({
    valid: true, business, enabled: helcim.configured(),
    invoice_number: ctx.invoice.invoice_number || '', amount: await balanceDollars(ctx.invoice),
    paid: ctx.invoice.status === 'paid',
  });
});

// POST /api/pay/:token/initialize — start a HelcimPay.js session for this invoice.
router.post('/:token/initialize', async (req, res) => {
  const ctx = await loadToken(req.params.token);
  if (!ctx) return res.status(404).json({ error: 'This payment link is invalid or has expired.' });
  if (ctx.invoice.status === 'paid') return res.status(400).json({ error: 'This invoice is already paid.' });
  if (!helcim.configured()) return res.status(503).json({ error: 'Online payments are not set up yet.' });
  const amount = await balanceDollars(ctx.invoice);
  if (amount <= 0) return res.status(400).json({ error: 'Nothing left to pay.' });
  try {
    const customer = ctx.invoice.customer_id ? await getById('customers', ctx.invoice.customer_id) : null;
    const session = await helcim.initialize({ amount, invoiceNumber: ctx.invoice.invoice_number || ctx.invoice.id, customerCode: customer?.helcim_customer_code || undefined });
    await create('helcim_sessions', session.checkoutToken, { invoice_id: ctx.invoice.id, customer_id: customer?.id || null, amount, secret_token: session.secretToken, created_at: new Date().toISOString() });
    res.json({ checkoutToken: session.checkoutToken, amount });
  } catch (e) { console.error('[pay] init:', e.message); res.status(502).json({ error: 'Could not start the payment.' }); }
});

// POST /api/pay/:token/confirm — validate the HelcimPay.js result + record it.
router.post('/:token/confirm', async (req, res) => {
  const ctx = await loadToken(req.params.token);
  if (!ctx) return res.status(404).json({ error: 'This payment link is invalid or has expired.' });
  const { checkoutToken, data, hash } = req.body || {};
  if (!checkoutToken || !data) return res.status(400).json({ error: 'Missing payment result.' });
  const session = await getById('helcim_sessions', checkoutToken);
  if (!session || session.invoice_id !== ctx.invoice.id) return res.status(400).json({ error: 'Payment session not found.' });
  if (!helcim.validateHash(data, hash, session.secret_token)) return res.status(400).json({ error: 'Could not verify the payment.' });
  if (String(data.status || '').toUpperCase() !== 'APPROVED') return res.status(402).json({ error: 'That payment did not go through.' });

  try {
    const customer = ctx.invoice.customer_id ? await getById('customers', ctx.invoice.customer_id) : null;
    if (customer && data.customerCode && !customer.helcim_customer_code) await update('customers', customer.id, { helcim_customer_code: data.customerCode });
    if (customer && data.cardToken) {
      const cards = await findWhere('payment_methods', 'customer_id', customer.id);
      if (!cards.some(c => c.card_token === data.cardToken)) {
        await create('payment_methods', uuid(), { customer_id: customer.id, card_token: data.cardToken, brand: data.cardType || 'card', last4: String(data.cardNumber || '').slice(-4), customer_code: data.customerCode || customer.helcim_customer_code || null, created_at: new Date().toISOString() });
      }
    }
  } catch (e) { console.error('[pay] save card:', e.message); }

  await remove('helcim_sessions', checkoutToken).catch(() => {});
  await update('pay_tokens', req.params.token, { used: true }).catch(() => {});
  const status = await recordPayment(ctx.invoice, { amount: Number(data.amount) || session.amount, reference: String(data.transactionId || checkoutToken) });
  res.json({ ok: true, status });
});

module.exports = router;
