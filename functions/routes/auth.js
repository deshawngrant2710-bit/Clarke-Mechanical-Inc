const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { db, findOne, create, getById, update } = require('../lib/db');
const { JWT_SECRET, authMiddleware } = require('../middleware/auth');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone } });
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
