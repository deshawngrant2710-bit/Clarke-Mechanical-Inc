// Business bank account via Stripe Financial Connections — connect the account,
// read balance + transactions. (Viewing only; moving money to vendors is a
// separate rail and is intentionally not enabled here.)
//
// Stored connection lives in the 'bank_connection' doc. We only keep Stripe
// Financial Connections account IDs + a reusable customer ID — no bank
// credentials ever touch this server.
const express = require('express');
const { getById, create, update, remove } = require('../lib/db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const bank = require('../lib/stripeBank');

const router = express.Router();
router.use(authMiddleware, requireRole('admin', 'office'));

const DOC = 'default';
// Test and live are separate Stripe environments, so keep their stored customer
// and connection apart — switching keys must not reuse test-mode data in live.
const envName = () => (bank.isLive() ? 'production' : 'sandbox');
const envMeta = () => `meta_${envName()}`;
const getConn = async () => {
  const conn = await getById('bank_connection', DOC).catch(() => null);
  // A connection made in a different environment (e.g. test data after switching
  // to live keys) is treated as not connected — the user reconnects the real bank.
  if (conn && conn.environment && conn.environment !== envName()) return null;
  return conn;
};

async function getOrCreateCustomer(name) {
  const key = envMeta();
  const meta = await getById('bank_connection', key).catch(() => null);
  if (meta?.stripe_customer_id) return meta.stripe_customer_id;
  const id = await bank.createCustomer(name);
  if (meta) await update('bank_connection', key, { stripe_customer_id: id });
  else await create('bank_connection', key, { stripe_customer_id: id });
  return id;
}

// GET /api/banking/status
router.get('/status', async (req, res) => {
  const conn = await getConn();
  res.json({
    provider: 'stripe',
    configured: bank.configured(),
    environment: envName(),
    publishable_key: bank.publishable(),
    transfer_enabled: false, // vendor payments are a separate rail, not enabled here
    connected: !!conn,
    institution: conn?.institution_name || null,
    connected_at: conn?.connected_at || null,
    connected_by: conn?.connected_by || null,
    accounts: conn?.accounts || [],
  });
});

// POST /api/banking/session — start a Financial Connections session (admin).
router.post('/session', requireRole('admin'), async (req, res) => {
  if (!bank.configured()) return res.status(400).json({ error: 'Stripe is not set up yet. Add the Stripe keys in Render first.' });
  try {
    const customer = await getOrCreateCustomer(req.user.name);
    const session = await bank.createSession(customer);
    res.json({ client_secret: session.client_secret, publishable_key: bank.publishable() });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// POST /api/banking/connect — store the accounts the user linked (admin).
// Body: { accounts: [{ id, institution_name, last4, category, subcategory, display_name }] }
router.post('/connect', requireRole('admin'), async (req, res) => {
  const linked = Array.isArray(req.body?.accounts) ? req.body.accounts : [];
  if (!linked.length) return res.status(400).json({ error: 'No accounts were selected' });
  const account_ids = linked.map(a => a.id).filter(Boolean);
  try {
    // Pull fresh balances for each linked account.
    const accounts = [];
    for (const id of account_ids) {
      try { accounts.push(await bank.refreshAndGetAccount(id)); }
      catch { accounts.push(bank.normalizeAccount(linked.find(a => a.id === id) || { id })); }
    }
    const institution_name = linked[0]?.institution_name || accounts[0]?.name || 'Bank';
    const payload = {
      provider: 'stripe', environment: envName(), account_ids, accounts, institution_name,
      connected_by: req.user.name, connected_at: new Date().toISOString(),
    };
    const existing = await getById('bank_connection', DOC).catch(() => null);
    if (existing) await update('bank_connection', DOC, payload);
    else await create('bank_connection', DOC, payload);
    res.json({ ok: true, institution: institution_name, accounts });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// GET /api/banking/accounts — ask Stripe to refresh balances, then poll briefly
// until they settle (Stripe fetches balances asynchronously after connect).
router.get('/accounts', async (req, res) => {
  const conn = await getConn();
  if (!conn) return res.status(404).json({ error: 'No bank account connected' });
  const ids = conn.account_ids || [];
  if (!ids.length) return res.json({ accounts: conn.accounts || [] });
  try {
    await Promise.all(ids.map(id => bank.requestBalanceRefresh(id).catch(() => {})));
    let raws = {};
    for (let i = 0; i < 6; i++) {
      const got = await Promise.all(ids.map(id => bank.getAccountRaw(id).catch(() => null)));
      got.forEach(a => { if (a) raws[a.id] = a; });
      const stillPending = got.some(a => a && a.balance_refresh && a.balance_refresh.status === 'pending');
      if (!stillPending) break;
      await sleep(1000);
    }
    const accounts = ids.map(id => (raws[id] ? bank.normalizeAccount(raws[id]) : null)).filter(Boolean);
    if (accounts.length) await update('bank_connection', DOC, { accounts });
    res.json({ accounts: accounts.length ? accounts : (conn.accounts || []) });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// GET /api/banking/transactions
router.get('/transactions', async (req, res) => {
  const conn = await getConn();
  if (!conn) return res.status(404).json({ error: 'No bank account connected' });
  try {
    let txns = [];
    for (const id of (conn.account_ids || [])) {
      const t = await bank.listTransactions(id, 100);
      txns = txns.concat(t);
    }
    txns.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    res.json({ transactions: txns });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// DELETE /api/banking/disconnect (admin)
router.delete('/disconnect', requireRole('admin'), async (req, res) => {
  await remove('bank_connection', DOC).catch(() => {});
  res.json({ ok: true });
});

// Vendor payments are not available through this provider.
router.post('/pay', requireRole('admin'), (req, res) => {
  res.status(400).json({ error: 'Vendor payments are not available with the current bank connection.' });
});
router.get('/payments', (req, res) => res.json([]));

module.exports = router;
