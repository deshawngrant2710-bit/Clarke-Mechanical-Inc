// Helcim payments (HelcimPay.js + Payment API). Replaces Stripe.
// Configure env HELCIM_API_TOKEN (from an API Access Configuration in Helcim,
// with your website domain registered). Amounts are in dollars (not cents).
const crypto = require('crypto');

const API = 'https://api.helcim.com/v2';
const CURRENCY = process.env.HELCIM_CURRENCY || 'USD';

const configured = () => !!process.env.HELCIM_API_TOKEN;

function headers(extra = {}) {
  return {
    'api-token': process.env.HELCIM_API_TOKEN,
    'content-type': 'application/json',
    accept: 'application/json',
    ...extra,
  };
}

// Start a HelcimPay.js checkout session. Returns { checkoutToken, secretToken }.
async function initialize({ amount, invoiceNumber, customerCode }) {
  const body = { paymentType: 'purchase', amount: Number(amount), currency: CURRENCY };
  if (invoiceNumber) body.invoiceNumber = String(invoiceNumber);
  if (customerCode) body.customerCode = String(customerCode);
  const r = await fetch(`${API}/helcim-pay/initialize`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.checkoutToken) throw new Error(`Helcim initialize failed (${r.status}): ${JSON.stringify(d)}`);
  return d;
}

// Charge a saved card token via the Payment API. Returns the transaction object.
async function purchaseWithToken({ amount, cardToken, customerCode, invoiceNumber, ipAddress = '0.0.0.0' }) {
  const body = { ipAddress, amount: Number(amount), currency: CURRENCY, cardData: { cardToken } };
  if (customerCode) body.customerCode = String(customerCode);
  if (invoiceNumber) body.invoiceNumber = String(invoiceNumber);
  const idempotencyKey = crypto.randomBytes(16).toString('hex'); // unique per charge
  const r = await fetch(`${API}/payment/purchase`, {
    method: 'POST', headers: headers({ 'idempotency-key': idempotencyKey }), body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.status !== 'APPROVED') throw new Error(`Helcim purchase failed (${r.status}): ${JSON.stringify(d)}`);
  return d;
}

// Validate a HelcimPay.js transaction response: sha256(compactJSON(data) + secretToken)
// must equal the hash Helcim returned. secretToken stays server-side, so a browser
// cannot forge a valid hash.
function validateHash(data, hash, secretToken) {
  if (!data || !hash || !secretToken) return false;
  try {
    const json = typeof data === 'string' ? JSON.stringify(JSON.parse(data)) : JSON.stringify(data);
    const computed = crypto.createHash('sha256').update(json + secretToken).digest('hex');
    return computed === hash;
  } catch { return false; }
}

module.exports = { configured, initialize, purchaseWithToken, validateHash, CURRENCY };
