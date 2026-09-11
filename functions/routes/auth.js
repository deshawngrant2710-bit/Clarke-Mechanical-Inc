const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { db, list, findOne, findWhere, create, getById, update, remove } = require('../lib/db');
const { JWT_SECRET, authMiddleware, adminOnly } = require('../middleware/auth');
const { genTempPassword } = require('../lib/passwords');
const { referralCode } = require('../lib/referral');
const { sendMail, render } = require('../lib/email');
const { sendSms, smsConfigured } = require('../lib/sms');
const settings = require('../lib/settings');
const { createFailureGuard, requestLimiter } = require('../middleware/rateLimit');
const twofa = require('../lib/twofa');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Brute-force protection for login: lock out after repeated FAILED attempts,
// per account (ip+email) and per IP. A correct login clears the counter.
const loginGuard = createFailureGuard({ windowMs: 15 * 60 * 1000, perAccountMax: 8, perIpMax: 30 });
// Cap password-reset emails so the endpoint can't be used to spam an inbox.
const forgotLimiter = requestLimiter({ windowMs: 15 * 60 * 1000, max: 5, keyPrefix: 'forgot', message: 'Too many reset requests. Please wait a few minutes and try again.' });

// Sign the session token + shape the user object returned to the client.
function issueToken(user) {
  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET, { expiresIn: '7d' }
  );
  return { token, user: {
    id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone,
    also_technician: !!user.also_technician, must_change_password: !!user.must_change_password,
    twofa_enabled: !!(user.twofa && user.twofa.enabled), twofa_method: user.twofa?.method || null,
  } };
}
const maskEmail = (e) => String(e || '').replace(/^(.).*(@.*)$/, (_, a, b) => `${a}•••${b}`);
const maskPhone = (p) => { const d = String(p || '').replace(/\D/g, ''); return d ? `•••••${d.slice(-4)}` : ''; };
const TWOFA_CHALLENGE_MIN = 5;   // sign-in code lifetime
const TWOFA_SETUP_MIN = 10;      // setup confirmation lifetime
const TWOFA_MAX_ATTEMPTS = 6;    // wrong codes before a challenge is voided

// Canonical, ABSOLUTE base URL for links we put in emails (e.g. the password
// reset link). Must never be relative — a relative link like "/reset-password"
// makes Safari say "the address is invalid". Prefer an explicit APP_URL env var,
// then the request Origin (only if it's a real https site and not the API host),
// and finally fall back to the production website.
const DEFAULT_APP_URL = 'https://clarkemechanicalinc.org';
function resetBaseUrl(req) {
  const clean = (u) => String(u || '').trim().replace(/\/+$/, '');
  const env = clean(process.env.APP_URL);
  if (/^https?:\/\/.+/i.test(env)) return env;
  const origin = clean(req.headers.origin);
  // Accept the browser's origin only if it's an https page and not the Render API host.
  if (/^https:\/\/.+/i.test(origin) && !/onrender\.com$/i.test(origin) && !/^https:\/\/localhost/i.test(origin)) {
    return origin;
  }
  return DEFAULT_APP_URL;
}

// GET /api/auth/public-info — unauthenticated business info for the login screen.
router.get('/public-info', async (req, res) => {
  try {
    res.json({
      business_name: await settings.get('business_name'),
      business_phone: await settings.get('business_phone'),
      business_email: await settings.get('business_email'),
      business_website: await settings.get('business_website'),
      business_address: await settings.get('business_address'),
    });
  } catch { res.json({ business_name: 'Clarke Mechanical Inc.', business_phone: '' }); }
});

// POST /api/auth/forgot-password — email a password reset link. Always responds 200
// so the form can't be used to discover which emails have accounts.
router.post('/forgot-password', forgotLimiter, async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Please enter your email address' });
    const user = await findOne('users', 'email', email);
    if (user) {
      const token = uuid() + uuid().replace(/-/g, '');
      const expires_at = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
      await create('password_resets', token, { user_id: user.id, email, expires_at, used: false });
      const link = `${resetBaseUrl(req)}/reset-password?token=${token}`;
      try {
        const { subject, html } = await render('password_reset', { name: user.name, link });
        await sendMail({ type: 'password_reset', to: email, toName: user.name, subject, html, customerId: null, sentBy: 'Automated' });
      } catch (e) { console.error('[auth] reset email failed:', e.message); }
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not process that request' });
  }
});

// POST /api/auth/reset-password — set a new password using a valid reset token.
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'A reset token and new password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const record = await getById('password_resets', token);
    if (!record || record.used) return res.status(400).json({ error: 'This reset link is invalid or has already been used.' });
    if (new Date(record.expires_at).getTime() < Date.now()) {
      await remove('password_resets', token).catch(() => {});
      return res.status(400).json({ error: 'This reset link has expired. Please request a new one.' });
    }
    await update('users', record.user_id, { password: bcrypt.hashSync(password, 10) });
    await remove('password_resets', token).catch(() => {});
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not reset your password' });
  }
});

// POST /api/auth/register — self-service signup, always role "customer".
router.post('/register', async (req, res) => {
  try {
    const { name, password, phone } = req.body;
    const email = (req.body.email || '').trim().toLowerCase();
    if (!name || !email || !password || !phone) {
      return res.status(400).json({ error: 'First name, last name, email, phone, and password are required' });
    }
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address' });

    const existing = await findOne('users', 'email', email);
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    const role = 'customer';
    const id = uuid();
    const hashed = bcrypt.hashSync(password, 10);
    await create('users', id, { name, email, password: hashed, role, phone: phone || null });

    // Auto-link: ensure a customer record exists for this email so the portal works right away.
    // (If the business already added them as a customer, that record links automatically — no duplicate.)
    const existingCustomer = await findOne('customers', 'email', email);
    if (!existingCustomer) {
      await create('customers', uuid(), {
        name, email, phone: phone || null,
        address: null, city: null, state: null, zip: null,
        notes: 'Self-registered via customer portal',
      });
    }

    // Record a referral if they signed up via a referral code/link.
    const ref = (req.body.ref || '').trim().toUpperCase();
    if (ref) {
      try {
        const users = await list('users');
        const referrer = users.find(u => referralCode(u) === ref);
        if (referrer && referrer.id !== id) {
          await create('referrals', uuid(), {
            referrer_user_id: referrer.id, referrer_name: referrer.name, code: ref,
            new_user_id: id, new_name: name, new_email: email, status: 'pending', created_at: new Date().toISOString(),
          });
        }
      } catch (e) { console.error('[auth] referral record failed:', e.message); }
    }

    const token = jwt.sign({ id, name, email, role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id, name, email, role, phone } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    // Block if this account/IP has too many recent failed attempts.
    const gate = loginGuard.check(req, email);
    if (gate.blocked) {
      const mins = Math.ceil(gate.retryAfterSec / 60);
      res.set('Retry-After', String(gate.retryAfterSec));
      return res.status(429).json({ error: `Too many sign-in attempts. Please try again in about ${mins} minute${mins === 1 ? '' : 's'}, or reset your password.`, retryAfter: gate.retryAfterSec });
    }

    const user = await findOne('users', 'email', email);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      loginGuard.fail(req, email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    loginGuard.clear(req, email);

    // Two-step verification: password is correct, but this account requires a
    // second factor. Start a challenge and DO NOT issue a token yet.
    if (user.twofa && user.twofa.enabled) {
      const method = user.twofa.method;
      const challengeId = uuid();
      let code_hash = null;
      if (method === 'email' || method === 'sms') {
        const code = twofa.generateCode();
        code_hash = twofa.hashCode(code);
        try {
          if (method === 'email') {
            const { subject, html } = await render('twofa_code', { name: user.name, code });
            await sendMail({ type: 'twofa_code', to: user.email, toName: user.name, subject, html, sentBy: 'Automated' });
          } else {
            const biz = (await settings.get('business_name')) || 'Clarke Mechanical';
            await sendSms(user.phone, `${biz}: your sign-in code is ${code}. It expires in ${TWOFA_CHALLENGE_MIN} minutes.`);
          }
        } catch (err) { console.error('[2fa] code delivery failed:', err.message); }
      }
      await create('twofa_challenges', challengeId, {
        user_id: user.id, method, code_hash,
        expires_at: new Date(Date.now() + TWOFA_CHALLENGE_MIN * 60 * 1000).toISOString(),
        attempts: 0, created_at: new Date().toISOString(),
      });
      const hint = method === 'email' ? maskEmail(user.email) : method === 'sms' ? maskPhone(user.phone) : 'your authenticator app';
      return res.json({ twofa: true, challenge_id: challengeId, method, hint });
    }

    res.json(issueToken(user));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/login/verify — complete a 2FA challenge and issue the token.
router.post('/login/verify', async (req, res) => {
  try {
    const { challenge_id, code } = req.body || {};
    const input = String(code || '').trim();
    if (!challenge_id || !input) return res.status(400).json({ error: 'Code required' });
    const ch = await getById('twofa_challenges', challenge_id);
    if (!ch) return res.status(400).json({ error: 'This sign-in request expired. Please sign in again.' });
    if (new Date(ch.expires_at).getTime() < Date.now()) {
      await remove('twofa_challenges', challenge_id);
      return res.status(400).json({ error: 'Your code expired. Please sign in again.' });
    }
    if ((ch.attempts || 0) >= TWOFA_MAX_ATTEMPTS) {
      await remove('twofa_challenges', challenge_id);
      return res.status(429).json({ error: 'Too many incorrect codes. Please sign in again.' });
    }
    const user = await getById('users', ch.user_id);
    if (!user || !user.twofa) { await remove('twofa_challenges', challenge_id); return res.status(400).json({ error: 'Please sign in again.' }); }

    let ok = false;
    // A one-time backup code always works and is then consumed.
    const backup = Array.isArray(user.twofa.backup_codes) ? user.twofa.backup_codes : [];
    const inputHash = twofa.hashCode(input.toLowerCase());
    if (backup.includes(inputHash)) {
      ok = true;
      await update('users', user.id, { twofa: { ...user.twofa, backup_codes: backup.filter(h => h !== inputHash) } });
    } else if (ch.method === 'totp') {
      ok = twofa.verifyTOTP(user.twofa.totp_secret, input);
    } else {
      ok = !!ch.code_hash && twofa.hashCode(input) === ch.code_hash;
    }

    if (!ok) {
      await update('twofa_challenges', challenge_id, { attempts: (ch.attempts || 0) + 1 });
      return res.status(401).json({ error: 'That code is not correct. Please try again.' });
    }
    await remove('twofa_challenges', challenge_id);
    res.json(issueToken(user));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not verify the code' });
  }
});

// POST /api/auth/change-password — authenticated user changes their own password.
router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password are required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
    const user = await getById('users', req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!bcrypt.compareSync(currentPassword, user.password)) return res.status(401).json({ error: 'Current password is incorrect' });
    await update('users', req.user.id, { password: bcrypt.hashSync(newPassword, 10), must_change_password: false });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not change password' });
  }
});

/* ---------------- Two-step verification (2FA) management ---------------- */

// GET /api/auth/2fa/status — is 2FA on, and which methods are available.
router.get('/2fa/status', authMiddleware, async (req, res) => {
  try {
    const u = await getById('users', req.user.id);
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json({
      enabled: !!(u.twofa && u.twofa.enabled),
      method: u.twofa?.method || null,
      backup_remaining: Array.isArray(u.twofa?.backup_codes) ? u.twofa.backup_codes.length : 0,
      has_phone: !!u.phone,
      sms_available: smsConfigured(),
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not load status' }); }
});

// POST /api/auth/2fa/setup { method } — begin enabling a method (sends a test code
// for email/sms, or returns a secret to scan for totp). Does NOT enable yet.
router.post('/2fa/setup', authMiddleware, async (req, res) => {
  try {
    const method = String(req.body.method || '').toLowerCase();
    if (!['email', 'sms', 'totp'].includes(method)) return res.status(400).json({ error: 'Choose email, text message, or an authenticator app.' });
    const u = await getById('users', req.user.id);
    if (!u) return res.status(404).json({ error: 'User not found' });

    const pending = { method, expires_at: new Date(Date.now() + TWOFA_SETUP_MIN * 60 * 1000).toISOString() };
    const out = { method };

    if (method === 'email') {
      const code = twofa.generateCode();
      pending.code_hash = twofa.hashCode(code);
      const { subject, html } = await render('twofa_code', { name: u.name, code });
      await sendMail({ type: 'twofa_code', to: u.email, toName: u.name, subject, html, sentBy: 'Automated' });
      out.sent_to = maskEmail(u.email);
    } else if (method === 'sms') {
      if (!u.phone) return res.status(422).json({ error: 'Add a mobile number to your account first.' });
      if (!smsConfigured()) return res.status(503).json({ error: 'Text messaging isn’t set up. Try email or an authenticator app.' });
      const code = twofa.generateCode();
      pending.code_hash = twofa.hashCode(code);
      const biz = (await settings.get('business_name')) || 'Clarke Mechanical';
      await sendSms(u.phone, `${biz}: your verification code is ${code}.`);
      out.sent_to = maskPhone(u.phone);
    } else { // totp
      const secret = twofa.generateSecret();
      pending.totp_secret = secret;
      out.secret = secret;
      out.otpauth = twofa.otpauthURL({ secret, label: u.email, issuer: (await settings.get('business_name')) || 'Clarke Mechanical' });
    }

    await update('users', u.id, { twofa_pending: pending });
    res.json(out);
  } catch (e) { console.error('[2fa] setup failed:', e.message); res.status(500).json({ error: 'Could not start setup' }); }
});

// POST /api/auth/2fa/confirm { code } — verify the setup code and turn 2FA on.
router.post('/2fa/confirm', authMiddleware, async (req, res) => {
  try {
    const input = String(req.body.code || '').trim();
    if (!input) return res.status(400).json({ error: 'Enter the code to confirm.' });
    const u = await getById('users', req.user.id);
    const pending = u?.twofa_pending;
    if (!pending) return res.status(400).json({ error: 'Start setup again — nothing pending.' });
    if (new Date(pending.expires_at).getTime() < Date.now()) {
      await update('users', u.id, { twofa_pending: null });
      return res.status(400).json({ error: 'Setup timed out. Please start again.' });
    }
    const ok = pending.method === 'totp'
      ? twofa.verifyTOTP(pending.totp_secret, input)
      : (!!pending.code_hash && twofa.hashCode(input) === pending.code_hash);
    if (!ok) return res.status(401).json({ error: 'That code is not correct. Please try again.' });

    const backupPlain = twofa.generateBackupCodes(8);
    const twofaRecord = {
      enabled: true, method: pending.method,
      totp_secret: pending.method === 'totp' ? pending.totp_secret : null,
      backup_codes: backupPlain.map(c => twofa.hashCode(c)),
      enabled_at: new Date().toISOString(),
    };
    await update('users', u.id, { twofa: twofaRecord, twofa_pending: null });
    res.json({ enabled: true, method: pending.method, backup_codes: backupPlain });
  } catch (e) { console.error('[2fa] confirm failed:', e.message); res.status(500).json({ error: 'Could not confirm' }); }
});

// POST /api/auth/2fa/disable { password } — turn 2FA off (requires the password).
router.post('/2fa/disable', authMiddleware, async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: 'Enter your password to turn this off.' });
    const u = await getById('users', req.user.id);
    if (!u) return res.status(404).json({ error: 'User not found' });
    if (!bcrypt.compareSync(password, u.password)) return res.status(401).json({ error: 'Password is incorrect' });
    await update('users', u.id, { twofa: null, twofa_pending: null });
    res.json({ enabled: false });
  } catch (e) { console.error('[2fa] disable failed:', e.message); res.status(500).json({ error: 'Could not turn off' }); }
});

// GET /api/auth/me — the current user's own account info (works for every role).
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const u = await getById('users', req.user.id);
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json({ id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone || null, must_change_password: !!u.must_change_password });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load your account' });
  }
});

// POST /api/auth/set-initial-password — a signed-in user with a one-time password
// sets their own new password (no need to re-type the temp one).
router.post('/set-initial-password', authMiddleware, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
    const user = await getById('users', req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await update('users', req.user.id, { password: bcrypt.hashSync(newPassword, 10), must_change_password: false });
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not set your password' }); }
});

// POST /api/auth/admin/reset-password — ADMIN issues a one-time password for any
// user (staff or customer) who is locked out. Returns the temp password once.
router.post('/admin/reset-password', authMiddleware, adminOnly, async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const userId = req.body.userId;
    const user = userId ? await getById('users', userId) : (email ? await findOne('users', 'email', email) : null);
    if (!user) return res.status(404).json({ error: 'No login account exists for that person yet.' });
    const tempPassword = genTempPassword();
    await update('users', user.id, { password: bcrypt.hashSync(tempPassword, 10), must_change_password: true });
    res.json({ tempPassword, name: user.name, email: user.email });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not reset the password' }); }
});

// PUT /api/auth/me — update your own name / phone (works for every role).
router.put('/me', authMiddleware, async (req, res) => {
  try {
    const patch = {};
    if (typeof req.body.name === 'string' && req.body.name.trim()) patch.name = req.body.name.trim();
    if ('phone' in req.body) patch.phone = req.body.phone ? String(req.body.phone).trim() : null;
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update' });
    const saved = await update('users', req.user.id, patch);

    // Keep the linked customer record(s) in sync. A customer can have more than one
    // matching record (office-created + self-registered), and the portal reads
    // records[0] — so we must update EVERY record with this email, not just one.
    // If the phone changed, the new number is unverified and must be re-verified by
    // SMS; the old pending verification is cleared so it targets the new number.
    try {
      const email = String(saved.email || '').toLowerCase();
      if (email) {
        const customers = await findWhere('customers', 'email', email);
        for (const customer of customers) {
          const cPatch = {};
          if ('name' in patch) cPatch.name = patch.name;
          if ('phone' in patch && (customer.phone || null) !== (patch.phone || null)) {
            cPatch.phone = patch.phone || null;
            cPatch.phone_verified = false;
            cPatch.phone_verify_code = null;
            cPatch.phone_verify_expires = null;
          }
          if (Object.keys(cPatch).length) await update('customers', customer.id, cPatch);
        }
      }
    } catch (e) { console.error('[auth] customer sync failed:', e.message); }

    res.json({ id: saved.id, name: saved.name, email: saved.email, role: saved.role, phone: saved.phone || null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not update your account' });
  }
});

module.exports = router;
