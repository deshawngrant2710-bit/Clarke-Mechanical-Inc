// Gmail connection endpoints — admin connects the office inbox (read-only) so the
// system can auto-capture vendor invoices. The OAuth callback is public (Google
// redirects the browser to it); everything else is admin-only.
const express = require('express');
const { v4: uuid } = require('uuid');
const { getById, create, remove } = require('../lib/db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const gmail = require('../lib/gmail');

const router = express.Router();
const appBase = () => (process.env.BUSINESS_URL || 'https://clarkemechanicalinc.org').replace(/\/$/, '');

// GET /api/gmail/callback — Google redirects here after the user authorizes.
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const fail = (why) => res.redirect(`${appBase()}/vendor-bills?gmail=error${why ? `&why=${encodeURIComponent(why)}` : ''}`);
  if (error) return fail(String(error));
  if (!code || !state) return fail('missing_code');
  try {
    const st = await getById('gmail_oauth', String(state)).catch(() => null);
    if (!st) return fail('bad_state');
    await remove('gmail_oauth', String(state)).catch(() => {});
    const tokens = await gmail.exchangeCode(String(code));
    if (!tokens.refresh_token) return fail('no_refresh_token'); // happens if already granted without prompt=consent
    let email = null;
    try { email = await gmail.fetchProfileEmail(tokens.access_token); } catch { /* optional */ }
    await gmail.saveConnection({ refresh_token: tokens.refresh_token, email, connected_by: st.by || null });
    res.redirect(`${appBase()}/vendor-bills?gmail=connected`);
  } catch (e) {
    console.error('[gmail] callback:', e.message);
    fail('exchange_failed');
  }
});

// Everything below requires an admin.
router.use(authMiddleware, requireRole('admin'));

router.get('/status', async (req, res) => {
  const conn = await gmail.getConn();
  res.json({ configured: gmail.configured(), connected: !!conn, email: conn?.email || null, connected_at: conn?.connected_at || null });
});

// GET /api/gmail/connect — returns the Google authorization URL to open.
router.get('/connect', async (req, res) => {
  if (!gmail.configured()) return res.status(400).json({ error: 'Gmail is not set up yet. Add the Google OAuth keys in Render first.' });
  const state = uuid();
  await create('gmail_oauth', state, { by: req.user.name, created_at: new Date().toISOString() });
  res.json({ url: gmail.authUrl(state) });
});

router.post('/disconnect', async (req, res) => {
  await gmail.disconnect();
  res.json({ ok: true });
});

module.exports = router;
