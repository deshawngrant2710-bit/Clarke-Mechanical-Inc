// Customer portal links ("magic links").
//
// For customers who can't or won't use an email + password (e.g. an elderly
// customer with no email). The office creates a link from the customer's page;
// the customer taps it and lands straight in their portal — invoices, quotes,
// jobs — with no sign-in. The link keeps working until the office turns it off
// or issues a new one.
//
// Security:
//   • The link is a long random token. Only its SHA-256 hash is stored, so the
//     raw link can't be recovered from the database — the office copies/texts it
//     once, and "New link" issues a fresh one (killing the old).
//   • One active link per customer. Turning it off takes effect immediately.
//   • A link only ever signs in a CUSTOMER account tied to that customer record —
//     never staff — and redemption is rate-limited.
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { list, getById, findOne, findWhere, create, update } = require('../lib/db');
const { JWT_SECRET, authMiddleware, requireRole } = require('../middleware/auth');
const { requestLimiter } = require('../middleware/rateLimit');
const { sendSms, smsConfigured } = require('../lib/sms');

const router = express.Router();

const APP_URL = () => (process.env.APP_URL || 'https://clarkemechanicalinc.org').replace(/\/+$/, '');
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const newToken = () => crypto.randomBytes(24).toString('base64url');   // 32 url-safe chars
const linkUrl = (token) => `${APP_URL()}/link/${token}`;
const tokenFromUrl = (u) => (String(u || '').match(/\/link\/([A-Za-z0-9_-]{20,})/) || [])[1] || null;

// Same token shape the normal login issues (see routes/auth.js issueToken).
function signIn(user) {
  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email || null, role: 'customer', customer_id: user.customer_id },
    JWT_SECRET, { expiresIn: '3650d' }
  );
  return { token, user: { id: user.id, name: user.name, email: user.email || null, role: 'customer', phone: user.phone || null } };
}

async function activeLink(customerId) {
  const links = await findWhere('portal_links', 'customer_id', customerId);
  return links.filter(l => !l.revoked).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0] || null;
}

// Find (or create) the customer-role login tied to this customer record.
async function ensureCustomerUser(cust) {
  const users = await list('users');
  let u = users.find(x => x.role === 'customer' && x.customer_id === cust.id);
  if (!u && cust.email) {
    u = users.find(x => (x.email || '').toLowerCase() === cust.email.toLowerCase());
    if (u && u.role !== 'customer') return { error: 'That email belongs to a staff login — portal links are for customers only.' };
    if (u && !u.customer_id) u = await update('users', u.id, { customer_id: cust.id });
  }
  if (!u) {
    const id = uuid();
    // No email/password on purpose: this login is only reachable through the link.
    u = await create('users', id, {
      name: cust.name || 'Customer', email: null, password: null, role: 'customer',
      phone: cust.phone || null, customer_id: cust.id, created_via: 'portal_link',
      created_at: new Date().toISOString(),
    });
  }
  return { user: u };
}

/* ============ PUBLIC: redeem a link ============ */
const redeemLimiter = requestLimiter({ windowMs: 15 * 60 * 1000, max: 30, keyPrefix: 'portal-link', message: 'Too many attempts. Please wait a few minutes and try again.' });

// POST /api/portal-links/redeem { token } → { token, user }
router.post('/redeem', redeemLimiter, async (req, res) => {
  try {
    const raw = String(req.body?.token || '').trim();
    if (raw.length < 20) return res.status(400).json({ error: 'This link is not valid.' });
    const link = await findOne('portal_links', 'token_hash', hash(raw));
    if (!link || link.revoked) return res.status(410).json({ error: 'This link no longer works. Please call Clarke Mechanical for a new one.' });
    const user = await getById('users', link.user_id);
    if (!user || user.role !== 'customer' || user.customer_id !== link.customer_id) {
      return res.status(410).json({ error: 'This link no longer works. Please call Clarke Mechanical for a new one.' });
    }
    await update('portal_links', link.id, { last_used_at: new Date().toISOString(), use_count: (link.use_count || 0) + 1 });
    res.json(signIn(user));
  } catch (e) {
    console.error('[portal-links] redeem:', e.message);
    res.status(500).json({ error: 'Could not open your account. Please try again.' });
  }
});

/* ============ STAFF: manage a customer's link ============ */
router.use(authMiddleware, requireRole('admin', 'office'));

// GET /api/portal-links/customer/:id — is there an active link?
router.get('/customer/:id', async (req, res) => {
  const link = await activeLink(req.params.id);
  res.json(link
    ? { active: true, created_at: link.created_at, created_by: link.created_by, last_used_at: link.last_used_at || null, use_count: link.use_count || 0 }
    : { active: false });
});

// POST /api/portal-links/customer/:id { sms?: boolean } — create a NEW link
// (turns off any previous one). Returns the URL once; optionally texts it.
router.post('/customer/:id', async (req, res) => {
  try {
    const cust = await getById('customers', req.params.id);
    if (!cust) return res.status(404).json({ error: 'Customer not found' });
    const { user, error } = await ensureCustomerUser(cust);
    if (error) return res.status(409).json({ error });

    // One active link per customer — retire the old one.
    for (const l of await findWhere('portal_links', 'customer_id', cust.id)) {
      if (!l.revoked) await update('portal_links', l.id, { revoked: true, revoked_at: new Date().toISOString(), revoked_reason: 'replaced' });
    }
    const token = newToken();
    const now = new Date().toISOString();
    await create('portal_links', uuid(), {
      customer_id: cust.id, user_id: user.id, token_hash: hash(token),
      revoked: false, created_at: now, created_by: req.user.name || 'Office', use_count: 0, last_used_at: null,
    });
    const url = linkUrl(token);

    let sms = null;
    if (req.body?.sms) sms = await textLink(cust, url);
    res.status(201).json({ url, created_at: now, sms });
  } catch (e) {
    console.error('[portal-links] create:', e.message);
    res.status(500).json({ error: 'Could not create the link' });
  }
});

// POST /api/portal-links/customer/:id/text { url } — text the CURRENT link.
router.post('/customer/:id/text', async (req, res) => {
  const cust = await getById('customers', req.params.id);
  if (!cust) return res.status(404).json({ error: 'Customer not found' });
  const token = tokenFromUrl(req.body?.url);
  const link = await activeLink(cust.id);
  if (!token || !link || link.token_hash !== hash(token)) return res.status(400).json({ error: 'That link is no longer active — create a new one.' });
  const sms = await textLink(cust, linkUrl(token));
  if (!sms.sent) return res.status(422).json({ error: sms.error });
  res.json({ ok: true });
});

// DELETE /api/portal-links/customer/:id — turn the link off right away.
router.delete('/customer/:id', async (req, res) => {
  let n = 0;
  for (const l of await findWhere('portal_links', 'customer_id', req.params.id)) {
    if (!l.revoked) { await update('portal_links', l.id, { revoked: true, revoked_at: new Date().toISOString(), revoked_reason: 'turned off', revoked_by: req.user.name || null }); n++; }
  }
  res.json({ ok: true, turned_off: n });
});

async function textLink(cust, url) {
  if (!smsConfigured()) return { sent: false, error: 'Texting isn’t set up yet — use Copy and send it yourself.' };
  if (!cust.phone) return { sent: false, error: 'This customer has no phone number on file — use Copy instead.' };
  const first = String(cust.name || '').trim().split(/\s+/)[0] || 'there';
  const body = `Hi ${first}, this is Clarke Mechanical. Tap this link any time to see your invoices, quotes and appointments — no password needed:\n${url}\nPlease keep it private; it opens your account.`;
  try { await sendSms(cust.phone, body); return { sent: true }; }
  catch (e) { console.error('[portal-links] sms:', e.message); return { sent: false, error: 'The text couldn’t be sent — use Copy and send it yourself.' }; }
}

module.exports = router;
