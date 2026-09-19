// In-app notification center for staff (admin + office).
const express = require('express');
const { v4: uuid } = require('uuid');
const { list, getById, create, update, remove } = require('../lib/db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { sendPush, pushConfigured } = require('../lib/push');

const router = express.Router();
router.use(authMiddleware, requireRole('admin', 'office'));

// POST /api/notifications/test — send a push to MY registered device(s), so you
// can confirm end-to-end delivery on the iOS app without waiting on a real event.
router.post('/test', async (req, res) => {
  try {
    if (!pushConfigured()) return res.status(503).json({ error: 'Push isn’t set up on the server yet — add the APNs keys on Render first.' });
    const tokens = (await list('device_tokens')).filter(d => d.user_id === req.user.id).map(d => d.token);
    if (!tokens.length) return res.status(422).json({ error: 'No device registered yet. Open the iOS app, sign in, and allow notifications — then try again.' });
    const result = await sendPush(tokens, { title: 'Test notification', body: 'Push notifications are working. You’re all set.', link: '/', badge: 1 });
    res.json({ ok: true, devices: tokens.length, result: result || null });
  } catch (e) {
    console.error('[push] test failed:', e.message);
    res.status(502).json({ error: 'Could not send the test push. Check the server logs for APNs errors.' });
  }
});

// POST /api/notifications/register-device — save an APNs device token for push.
router.post('/register-device', async (req, res) => {
  try {
    const token = (req.body?.token || '').toString().trim();
    const platform = (req.body?.platform || 'ios').toString();
    if (!token) return res.status(400).json({ error: 'token required' });
    const existing = (await list('device_tokens')).find(d => d.token === token);
    if (existing) {
      await update('device_tokens', existing.id, { user_id: req.user.id, platform, updated_at: new Date().toISOString() });
    } else {
      await create('device_tokens', uuid(), { user_id: req.user.id, token, platform, created_at: new Date().toISOString() });
    }
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not register device' }); }
});

// DELETE /api/notifications/register-device — remove a token (on sign-out).
router.delete('/register-device', async (req, res) => {
  try {
    const token = (req.body?.token || '').toString().trim();
    const ex = (await list('device_tokens')).find(d => d.token === token);
    if (ex) await remove('device_tokens', ex.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Could not remove device' }); }
});

const mineFilter = (n, role) => (n.for_roles || ['admin', 'office']).includes(role);

// GET /api/notifications — recent notifications for me + unread count.
router.get('/', async (req, res) => {
  try {
    const all = await list('notifications');
    const mine = all.filter(n => mineFilter(n, req.user.role));
    mine.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    const items = mine.slice(0, 50).map(n => ({
      id: n.id, type: n.type, title: n.title, body: n.body, link: n.link,
      created_at: n.created_at, read: (n.read_by || []).includes(req.user.id),
    }));
    res.json({ items, unread: items.filter(i => !i.read).length });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not load notifications' }); }
});

// POST /api/notifications/:id/read
router.post('/:id/read', async (req, res) => {
  try {
    const n = await getById('notifications', req.params.id);
    if (!n) return res.status(404).json({ error: 'Not found' });
    const read_by = Array.from(new Set([...(n.read_by || []), req.user.id]));
    await update('notifications', req.params.id, { read_by });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not update' }); }
});

// POST /api/notifications/read-all
router.post('/read-all', async (req, res) => {
  try {
    const all = await list('notifications');
    const mine = all.filter(n => mineFilter(n, req.user.role) && !(n.read_by || []).includes(req.user.id));
    for (const n of mine) {
      await update('notifications', n.id, { read_by: Array.from(new Set([...(n.read_by || []), req.user.id])) });
    }
    res.json({ ok: true, marked: mine.length });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not update' }); }
});

module.exports = router;
