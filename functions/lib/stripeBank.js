// Bank connection via Stripe Financial Connections — connect the business bank
// account and read balances + transactions. (Viewing only; Stripe FC does not
// move money to vendors — that's a separate rail handled elsewhere.)
//
// Env (Render, backend only):
//   STRIPE_SECRET_KEY        — sk_test_... (sandbox) or sk_live_...
//   STRIPE_PUBLISHABLE_KEY   — pk_test_... / pk_live_... (safe to expose to the browser)
const API = 'https://api.stripe.com/v1';

const secret = () => process.env.STRIPE_SECRET_KEY || '';
const publishable = () => process.env.STRIPE_PUBLISHABLE_KEY || '';
const configured = () => !!secret();
// Live for standard (sk_live_…) and restricted (rk_live_…) keys alike.
const isLive = () => /_live_/.test(secret());

// Flatten a params object into Stripe's form encoding (a[b]=c, arr[]=x).
function toForm(params) {
  const sp = new URLSearchParams();
  const add = (key, val) => {
    if (val == null) return;
    if (Array.isArray(val)) val.forEach(v => add(`${key}[]`, v));
    else if (typeof val === 'object') Object.entries(val).forEach(([k, v]) => add(`${key}[${k}]`, v));
    else sp.append(key, String(val));
  };
  Object.entries(params || {}).forEach(([k, v]) => add(k, v));
  return sp.toString();
}

async function call(path, params, method = 'POST') {
  if (!configured()) throw new Error('Stripe is not configured');
  let url = API + path;
  const opts = { method, headers: { Authorization: `Bearer ${secret()}` } };
  if (method === 'GET') {
    const q = toForm(params);
    if (q) url += '?' + q;
  } else {
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    opts.body = toForm(params);
  }
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error?.message || `Stripe error (${res.status})`);
    err.stripe = data.error; throw err;
  }
  return data;
}

// A reusable Customer is the "account holder" for the connection session.
async function createCustomer(name) {
  const c = await call('/customers', { name: name || 'Clarke Mechanical Inc.' });
  return c.id;
}

// Start a Financial Connections session; the browser uses client_secret to open
// the bank-login window via Stripe.js.
async function createSession(customerId) {
  const s = await call('/financial_connections/sessions', {
    account_holder: { type: 'customer', customer: customerId },
    permissions: ['balances', 'transactions'],
  });
  return { id: s.id, client_secret: s.client_secret };
}

// --- reading ---------------------------------------------------------------
function normalizeAccount(a) {
  // Stripe balances are in the smallest unit (cents), keyed by currency.
  const cur = (a.balance?.current && Object.keys(a.balance.current)[0]) || 'usd';
  const current = a.balance?.current?.[cur];
  const avail = a.balance?.cash?.available?.[cur];
  return {
    account_id: a.id,
    name: [a.institution_name, a.display_name || a.subcategory].filter(Boolean).join(' · '),
    mask: a.last4 || null,
    type: a.category || null,
    subtype: a.subcategory || null,
    available: avail != null ? avail / 100 : null,
    current: current != null ? current / 100 : null,
    currency: (cur || 'usd').toUpperCase(),
  };
}

async function refreshAndGetAccount(accountId) {
  try { await call(`/financial_connections/accounts/${accountId}/refresh`, { features: ['balance'] }); } catch { /* best effort */ }
  const a = await call(`/financial_connections/accounts/${accountId}`, {}, 'GET');
  return normalizeAccount(a);
}

// Ask Stripe to (re)fetch the latest balance for an account. Fetch is async on
// Stripe's side — the balance appears once balance_refresh.status is 'succeeded'.
async function requestBalanceRefresh(accountId) {
  return call(`/financial_connections/accounts/${accountId}/refresh`, { features: ['balance'] });
}
async function getAccountRaw(accountId) {
  return call(`/financial_connections/accounts/${accountId}`, {}, 'GET');
}

async function listTransactions(accountId, limit = 100) {
  // Transactions must be subscribed before they can be listed.
  try { await call(`/financial_connections/accounts/${accountId}/subscribe`, { features: ['transactions'] }); } catch { /* may already be subscribed, or feature not available */ }
  let data;
  try {
    data = await call('/financial_connections/transactions', { account: accountId, limit: Math.min(limit, 100) }, 'GET');
  } catch { return []; } // feature not available for this account — degrade gracefully
  return (data.data || []).map(t => ({
    id: t.id,
    account_id: accountId,
    date: t.transacted_at ? new Date(t.transacted_at * 1000).toISOString().slice(0, 10) : (t.transacted_date || null),
    name: t.description || 'Transaction',
    // Stripe FC: negative = money out of the account. Normalize to the app's
    // convention (positive = money out) so the UI colors match.
    amount: t.amount != null ? -t.amount / 100 : 0,
    pending: t.status === 'pending',
    category: null,
  }));
}

module.exports = {
  configured, isLive, publishable,
  createCustomer, createSession, refreshAndGetAccount, requestBalanceRefresh, getAccountRaw,
  listTransactions, normalizeAccount,
};
