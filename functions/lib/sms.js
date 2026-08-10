// Text messaging via the Quo API (formerly OpenPhone).
// Configure with env vars on the server:
//   QUO_API_KEY  – API key from Quo → Settings → Integrations → API
//   QUO_FROM     – your Quo phone number in E.164 (e.g. +15555550123)
//   QUO_USER_ID  – (optional) send as a specific Quo member
// Texting US numbers via the API also requires completing Quo US carrier
// (10DLC) registration, or messages will be rejected by carriers.

const QUO_URL = 'https://api.quo.com/v1/messages';

function smsConfigured() {
  return !!(process.env.QUO_API_KEY && process.env.QUO_FROM);
}

// Normalize a phone number to E.164. Assumes US/Canada when no country code.
function toE164(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (s.startsWith('+')) {
    const d = s.slice(1).replace(/\D/g, '');
    return d ? `+${d}` : null;
  }
  const digits = s.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits ? `+${digits}` : null;
}

// Low-level send. Throws on failure. `to` may be a raw or E.164 number.
async function sendSms(to, body) {
  if (!smsConfigured()) throw new Error('SMS not configured');
  const dest = toE164(to);
  if (!dest) throw new Error('Invalid destination number');
  const payload = { content: body, from: process.env.QUO_FROM, to: [dest] };
  if (process.env.QUO_USER_ID) payload.userId = process.env.QUO_USER_ID;
  const r = await fetch(QUO_URL, {
    method: 'POST',
    headers: { Authorization: process.env.QUO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    throw new Error(`Quo ${r.status} ${detail}`.trim());
  }
  return true;
}

// Best-effort notification to a customer record. Returns true if a text was sent.
// Never throws — safe to call without awaiting a result you depend on.
// Skips silently when: not configured, no phone, or the customer opted out.
async function notifyCustomerBySms(customer, body) {
  try {
    if (!smsConfigured()) return false;
    if (!customer || !customer.phone) return false;
    if (customer.sms_opt_in === false) return false; // respect opt-out
    await sendSms(customer.phone, body);
    return true;
  } catch (e) {
    console.error('[sms] send failed:', e.message);
    return false;
  }
}

module.exports = { smsConfigured, sendSms, notifyCustomerBySms, toE164 };
