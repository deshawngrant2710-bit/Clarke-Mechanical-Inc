const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { db, findOne, create, getById, update, remove } = require('../lib/db');
const { JWT_SECRET, authMiddleware } = require('../middleware/auth');
const { sendMail, render } = require('../lib/email');
const settings = require('../lib/settings');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/auth/public-info — unauthenticated business info for the login screen.
router.get('/public-info', async (req, res) => {
  try {
    res.json({ business_name: await settings.get('business_name'), business_phone: await settings.get('business_phone') });
  } catch { res.json({ business_name: 'Clarke Mechanical Inc.', business_phone: '' }); }
});

// POST /api/auth/forgot-password — email a password reset link. Always responds 200
// so the form can't be used to discover which emails have accounts.
router.post('/forgot-password', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Please enter your email address' });
    const user = await findOne('users', 'email', email);
    if (user) {
      const token = uuid() + uuid().replace(/-/g, '');
      const expires_at = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
      await create('password_resets', token, { user_id: user.id, email, expires_at, used: false });
      const origin = req.headers.origin || process.env.APP_URL || '';
      const link = `${origin}/reset-password?token=${token}`;
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

    const user = await findOne('users', 'email', email);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET, { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone, also_technician: !!user.also_technician } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Login failed' });
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
    await update('users', req.user.id, { password: bcrypt.hashSync(newPassword, 10) });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not change password' });
  }
});

module.exports = router;
