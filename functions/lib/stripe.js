// Stripe payments core — one-time invoice payments (and, later, subscriptions).
// Uses the same Stripe account/keys as Financial Connections:
//   STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY
//   STRIPE_WEBHOOK_SECRET  — the signing secret for the payment webhook
//   BUSINESS_URL           — public site base for success/cancel redirects
//
// Raw REST (no SDK), matching how Helcim/other integrations are done here.
const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const { getById, findWhere, create, update } = require('./db');
let receipts; try { receipts = require('./receipts'); } catch { receipts = null; }

const API = 'https://api.stripe.com/v1';
const secret = () => process.env.STRIPE_SECRET_KEY || '';
const publishable = () => process.env.STRIPE_PUBLISHABLE_KEY || '';
const webhookSecret = () => process.env.STRIPE_WEBHOOK_SECRET || '';
const configured = () => !!secret();
// Card payments require the webhook secret too (otherwise a completed payment
// would never be recorded). Lets the bank-viewing keys be added on their own
// without turning on invoice payments.
const paymentsEnabled = () => !!secret() && !!webhookSecret();
const isLive = () => /_live_/.test(secret()); // standard sk_live_… or restricted rk_live_…
const siteBase = () => (process.env.BUSINESS_URL || 'https://clarkemechanicalinc.org').replace(/\/$/, '');

function toForm(params) {
  const sp = new URLSearchParams();
  const add = (key, val) => {
    if (val == null) return;
    if (Array.isArray(val)) val.forEach((v, i) => add(`${key}[${i}]`, v));
    else if (typeof val === 'object') Object.entries(val).forEach(([k, v]) => add(`${key}[${k}]`, v));
    else sp.append(key, String(val));
  };
  Object.entries(params || {}).forEach(([k, v]) => add(k, v));
  return sp.toString();
}

async function call(path, params, method = 'POST', { idempotencyKey } = {}) {
  if (!configured()) throw new Error('Stripe is not configured');
  let url = API + path;
  const headers = { Authorization: `Bearer ${secret()}` };
  const opts = { method, headers };
  if (method === 'GET') { const q = toForm(params); if (q) url += '?' + q; }
  else { headers['Content-Type'] = 'application/x-www-form-urlencoded'; opts.body = toForm(params); }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error?.message || `Stripe error (${res.status})`); e.stripe = data.error; throw e; }
  return data;
}

// Verify a Stripe webhook signature (replaces the SDK's constructEvent).
// Throws if the signature is missing/invalid or outside the 5-minute tolerance.
function verifyWebhook(rawBody, sigHeader) {
  const whsec = webhookSecret();
  if (!whsec) throw new Error('Webhook secret not set');
  const parts = Object.fromEntries(String(sigHeader || '').split(',').map(kv => kv.split('=')));
  const t = parts.t; const v1 = parts.v1;
  if (!t || !v1) throw new Error('Bad signature header');
  const payload = `${t}.${rawBody.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', whsec).update(payload, 'utf8').digest('hex');
  const a = Buffer.from(expected); const b = Buffer.from(v1);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('Signature mismatch');
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) throw new Error('Timestamp outside tolerance');
  return JSON.parse(rawBody.toString('utf8'));
}

async function balanceDollars(invoice) {
  const pays = await findWhere('payments', 'invoice_id', invoice.id);
  const paid = pays.reduce((s, p) => s + (p.amount || 0), 0);
  return Math.max(0, Math.round(((invoice.total || 0) - paid) * 100) / 100);
}

// Create a Checkout Session (card payment) for an invoice balance.
// embedded:true → returns a client_secret to mount Stripe's embedded checkout on
// our own branded page (no redirect). Otherwise returns a hosted-page url.
async function createInvoiceCheckout(invoice, { customer, successUrl, cancelUrl, embedded, returnUrl } = {}) {
  const amount = await balanceDollars(invoice);
  if (!(amount > 0)) { const e = new Error('Nothing left to pay.'); e.code = 'NO_BALANCE'; throw e; }
  const label = `Invoice ${invoice.invoice_number || invoice.id} — Clarke Mechanical`;
  const params = {
    mode: 'payment',
    client_reference_id: invoice.id,
    customer_email: customer?.email || undefined,
    line_items: [{
      quantity: 1,
      price_data: { currency: 'usd', unit_amount: Math.round(amount * 100), product_data: { name: label } },
    }],
    payment_intent_data: { description: label },
    metadata: { invoice_id: invoice.id, invoice_number: invoice.invoice_number || '' },
  };
  if (embedded) {
    params.ui_mode = 'embedded_page'; // Stripe renamed 'embedded' → 'embedded_page'
    params.return_url = returnUrl || `${siteBase()}/billing?stripe=success&session_id={CHECKOUT_SESSION_ID}`;
  } else {
    params.success_url = successUrl || `${siteBase()}/billing?stripe=success`;
    params.cancel_url = cancelUrl || `${siteBase()}/billing?stripe=cancel`;
  }
  // No idempotency key: a fresh Checkout Session per attempt is fine (unpaid
  // sessions expire), and real payments are de-duped by the webhook. An
  // idempotency key would otherwise lock this invoice+amount to one param set.
  const session = await call('/checkout/sessions', params, 'POST');
  return { id: session.id, url: session.url, client_secret: session.client_secret, amount };
}

// Record a successful Stripe payment against an invoice (idempotent on reference),
// mark the invoice paid/partial, and issue a numbered receipt. Safe to call twice.
async function recordStripePayment(invoiceId, { amount, reference, note }) {
  const invoice = await getById('invoices', invoiceId);
  if (!invoice) return null;
  const existing = await findWhere('payments', 'invoice_id', invoiceId);
  if (existing.some(p => p.reference === reference)) return invoice; // already recorded
  const id = uuid();
  await create('payments', id, {
    invoice_id: invoiceId, amount: Number(amount) || 0, method: 'card',
    reference, notes: note || 'Paid online via Stripe', paid_at: new Date().toISOString(),
  });
  const paid = (await findWhere('payments', 'invoice_id', invoiceId)).reduce((s, p) => s + (p.amount || 0), 0);
  if (paid >= (invoice.total || 0)) await update('invoices', invoiceId, { status: 'paid' });
  else if (paid > 0 && invoice.status !== 'cancelled') await update('invoices', invoiceId, { status: 'partial' });
  if (receipts) {
    try {
      const payment = await getById('payments', id);
      await receipts.createForPayment({ invoice: { ...invoice, id: invoiceId }, payment, balanceAfter: (Number(invoice.total) || 0) - paid });
    } catch (e) { console.error('[stripe] receipt failed:', e.message); }
  }
  return invoice;
}

module.exports = {
  configured, paymentsEnabled, publishable, isLive, webhookSecret, siteBase,
  call, verifyWebhook, balanceDollars, createInvoiceCheckout, recordStripePayment,
};
