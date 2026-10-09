// Business bank account (Plaid) — connect Bank of America, read balance +
// transactions, and (approval-gated) pay vendors by ACH.
//
// The encrypted Plaid access token lives in the 'bank_connection' doc and never
// leaves the server. Reading is admin/office; connecting, disconnecting and
// paying vendors are admin-only (real money / credentials).
const express = require('express');
const { v4: uuid } = require('uuid');
const { getById, create, update, remove, list } = require('../lib/db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const plaid = require('../lib/plaid');

let notify; try { ({ notify } = require('../lib/notify')); } catch { notify = async () => {}; }

const router = express.Router();
router.use(authMiddleware, requireRole('admin', 'office'));

const DOC = 'default';
const getConn = () => getById('bank_connection', DOC);

// GET /api/banking/status — what's configured + whether an account is linked.
router.get('/status', async (req, res) => {
  const conn = await getConn().catch(() => null);
  res.json({
    configured: plaid.configured(),
    environment: plaid.plaidEnv(),
    transfer_enabled: plaid.transferEnabled(),
    connected: !!conn,
    institution: conn?.institution_name || null,
    connected_at: conn?.connected_at || null,
    connected_by: conn?.connected_by || null,
    accounts: conn?.accounts || [],
  });
});

// POST /api/banking/link-token — start the Plaid Link flow (admin only).
router.post('/link-token', requireRole('admin'), async (req, res) => {
  if (!plaid.configured()) return res.status(400).json({ error: 'Plaid is not set up yet. Add the Plaid keys in Render first.' });
  try {
    const link_token = await plaid.createLinkToken(req.user.id || 'clarke-mechanical');
    res.json({ link_token });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// POST /api/banking/connect — exchange the public_token from Plaid Link and
// store the (encrypted) access token + a snapshot of the accounts (admin only).
router.post('/connect', requireRole('admin'), async (req, res) => {
  const { public_token, institution } = req.body || {};
  if (!public_token) return res.status(400).json({ error: 'Missing public_token' });
  try {
    const { access_token_enc, item_id } = await plaid.exchangePublicToken(public_token);
    let accounts = [];
    try { accounts = await plaid.getBalances(access_token_enc); } catch { /* balances fetched later */ }
    const payload = {
      access_token_enc, item_id,
      institution_name: institution?.name || 'Bank',
      accounts,
      connected_by: req.user.name,
      connected_at: new Date().toISOString(),
    };
    const existing = await getConn().catch(() => null);
    if (existing) await update('bank_connection', DOC, payload);
    else await create('bank_connection', DOC, payload);
    res.json({ ok: true, institution: payload.institution_name, accounts });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// GET /api/banking/accounts — live balances.
router.get('/accounts', async (req, res) => {
  const conn = await getConn().catch(() => null);
  if (!conn) return res.status(404).json({ error: 'No bank account connected' });
  try {
    const accounts = await plaid.getBalances(conn.access_token_enc);
    await update('bank_connection', DOC, { accounts }); // refresh snapshot
    res.json({ accounts });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// GET /api/banking/transactions?start=&end=
router.get('/transactions', async (req, res) => {
  const conn = await getConn().catch(() => null);
  if (!conn) return res.status(404).json({ error: 'No bank account connected' });
  try {
    const out = await plaid.getTransactions(conn.access_token_enc, { start_date: req.query.start, end_date: req.query.end });
    res.json(out);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// DELETE /api/banking/disconnect — remove the stored connection (admin only).
router.delete('/disconnect', requireRole('admin'), async (req, res) => {
  await remove('bank_connection', DOC).catch(() => {});
  res.json({ ok: true });
});

// POST /api/banking/pay — pay a vendor by ACH (admin only, explicit, one at a
// time). Only works once PLAID_TRANSFER=on and Plaid has approved Transfer.
router.post('/pay', requireRole('admin'), async (req, res) => {
  if (!plaid.transferEnabled()) {
    return res.status(400).json({ error: 'Vendor payments are not enabled yet. They turn on after Plaid approves your Transfer product.' });
  }
  const conn = await getConn().catch(() => null);
  if (!conn) return res.status(404).json({ error: 'No bank account connected' });
  const { account_id, amount, vendor_id, vendor_name, description } = req.body || {};
  const amt = Math.round((Number(amount) || 0) * 100) / 100;
  if (!account_id) return res.status(400).json({ error: 'Choose which account to pay from' });
  if (!(amt > 0)) return res.status(400).json({ error: 'Enter an amount greater than zero' });
  let name = vendor_name;
  if (!name && vendor_id) { const v = await getById('vendors', vendor_id).catch(() => null); name = v?.name; }
  try {
    const result = await plaid.createVendorPayment({
      accessTokenEnc: conn.access_token_enc, account_id, amount: amt, vendor_name: name, description,
    });
    const rec = await create('bank_payments', uuid(), {
      vendor_id: vendor_id || null, vendor_name: name || null, amount: amt,
      account_id, description: description || null,
      transfer_id: result.transfer_id, status: result.status,
      paid_by: req.user.name, created_at: new Date().toISOString(),
    });
    try { await notify(['admin', 'office'], { title: 'Vendor payment sent', body: `${name || 'Vendor'} — $${amt.toFixed(2)} (${result.status})`, link: '/banking' }); } catch {}
    res.status(201).json(rec);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// GET /api/banking/payments — history of ACH vendor payments made here.
router.get('/payments', async (req, res) => {
  const items = await list('bank_payments').catch(() => []);
  items.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  res.json(items);
});

module.exports = router;
