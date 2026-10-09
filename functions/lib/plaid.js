// Plaid integration — connect the business bank account (Bank of America),
// read balances + transactions, and (Phase 2, approval-gated) initiate vendor
// ACH payments via Plaid Transfer.
//
// Secrets come from Render env vars (never the frontend bundle):
//   PLAID_CLIENT_ID   — from the Plaid dashboard
//   PLAID_SECRET      — the secret for the chosen environment
//   PLAID_ENV         — 'sandbox' (default) | 'production'
//   PLAID_TOKEN_KEY   — 32+ char random string; encrypts the stored access token
//   PLAID_TRANSFER    — 'on' to enable vendor payments (only after Plaid approves Transfer)
//
// The long-lived Plaid access_token grants access to the bank, so we NEVER store
// it in plaintext or send it to the browser — it is AES-256-GCM encrypted at rest
// and only ever used server-side.
const crypto = require('crypto');

const ENV_HOST = {
  sandbox: 'https://sandbox.plaid.com',
  production: 'https://production.plaid.com',
};

const plaidEnv = () => (process.env.PLAID_ENV || 'sandbox').toLowerCase();
const host = () => ENV_HOST[plaidEnv()] || ENV_HOST.sandbox;

// Is Plaid configured enough to connect + read?
const configured = () => !!(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
// Is vendor-payment (Transfer) turned on? Requires Plaid production Transfer approval.
const transferEnabled = () => configured() && String(process.env.PLAID_TRANSFER || '').toLowerCase() === 'on';

// --- token encryption (AES-256-GCM) ---------------------------------------
function keyBuf() {
  const raw = process.env.PLAID_TOKEN_KEY || '';
  if (!raw) throw new Error('PLAID_TOKEN_KEY is not set');
  return crypto.createHash('sha256').update(raw).digest(); // 32 bytes
}
function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}
function decrypt(blob) {
  const [ivB, tagB, dataB] = String(blob || '').split(':');
  if (!ivB || !tagB || !dataB) throw new Error('Bad encrypted token');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf(), Buffer.from(ivB, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB, 'base64')), decipher.final()]).toString('utf8');
}

// --- raw API call ----------------------------------------------------------
async function call(path, body) {
  if (!configured()) throw new Error('Plaid is not configured');
  const res = await fetch(host() + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: process.env.PLAID_CLIENT_ID, secret: process.env.PLAID_SECRET, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error_message || data.error_code || `Plaid error (${res.status})`;
    const err = new Error(msg);
    err.plaid = data;
    throw err;
  }
  return data;
}

// --- connect flow ----------------------------------------------------------
// products: what we ask the bank to grant. Transactions+balance always; auth+
// transfer only when payments are enabled (and the account is Transfer-approved).
async function createLinkToken(clientUserId) {
  const products = ['transactions'];
  if (transferEnabled()) products.push('auth', 'transfer');
  const data = await call('/link/token/create', {
    user: { client_user_id: String(clientUserId || 'clarke-mechanical') },
    client_name: 'Clarke Mechanical Inc.',
    products,
    country_codes: ['US'],
    language: 'en',
  });
  return data.link_token;
}

// Exchange the short-lived public_token from Plaid Link for the long-lived
// access_token (encrypted before it is handed back to the caller to store).
async function exchangePublicToken(publicToken) {
  const data = await call('/item/public_token/exchange', { public_token: publicToken });
  return { access_token_enc: encrypt(data.access_token), item_id: data.item_id };
}

async function getBalances(accessTokenEnc) {
  const data = await call('/accounts/balance/get', { access_token: decrypt(accessTokenEnc) });
  return (data.accounts || []).map(a => ({
    account_id: a.account_id,
    name: a.official_name || a.name,
    mask: a.mask,
    type: a.type,
    subtype: a.subtype,
    available: a.balances?.available,
    current: a.balances?.current,
    currency: a.balances?.iso_currency_code || 'USD',
  }));
}

async function getTransactions(accessTokenEnc, { start_date, end_date, count = 100 } = {}) {
  const end = end_date || new Date().toISOString().slice(0, 10);
  const start = start_date || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const data = await call('/transactions/get', {
    access_token: decrypt(accessTokenEnc),
    start_date: start, end_date: end,
    options: { count: Math.min(count, 500), offset: 0 },
  });
  return {
    total: data.total_transactions || 0,
    accounts: data.accounts || [],
    transactions: (data.transactions || []).map(t => ({
      id: t.transaction_id,
      account_id: t.account_id,
      date: t.date,
      name: t.merchant_name || t.name,
      amount: t.amount,                 // Plaid: positive = money out of the account
      pending: !!t.pending,
      category: Array.isArray(t.category) ? t.category.join(' › ') : (t.personal_finance_category?.primary || null),
    })),
  };
}

// --- Phase 2: vendor payments (Plaid Transfer) -----------------------------
// Real money movement. Only callable when PLAID_TRANSFER=on AND the Plaid
// account has Transfer approved for production. Each call is one explicit,
// admin-authorized payment — nothing here runs on its own.
async function createVendorPayment({ accessTokenEnc, account_id, amount, vendor_name, description }) {
  if (!transferEnabled()) {
    const e = new Error('Vendor payments are not enabled yet. Turn on PLAID_TRANSFER after Plaid approves your Transfer product.');
    e.code = 'TRANSFER_DISABLED';
    throw e;
  }
  const access_token = decrypt(accessTokenEnc);
  // 1) Authorize (Plaid risk-checks the debit before it is created).
  const auth = await call('/transfer/authorization/create', {
    access_token, account_id,
    type: 'debit', network: 'ach', amount: Number(amount).toFixed(2),
    ach_class: 'ccd',
    user: { legal_name: vendor_name || 'Vendor' },
  });
  if (auth.authorization?.decision !== 'approved') {
    const e = new Error(`Payment not approved by Plaid: ${auth.authorization?.decision_rationale?.description || auth.authorization?.decision}`);
    e.plaid = auth; throw e;
  }
  // 2) Create the transfer against that authorization.
  const tr = await call('/transfer/create', {
    access_token, account_id,
    authorization_id: auth.authorization.id,
    amount: Number(amount).toFixed(2),
    description: (description || `Clarke pay ${vendor_name || ''}`).slice(0, 15), // Plaid: max 15 chars
  });
  return { transfer_id: tr.transfer?.id, status: tr.transfer?.status };
}

module.exports = {
  plaidEnv, configured, transferEnabled,
  createLinkToken, exchangePublicToken, getBalances, getTransactions, createVendorPayment,
  _enc: encrypt, _dec: decrypt,
};
