const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// Roles a user can hold. Everyone self-registers as "customer"; only an admin can reassign.
const ROLES = ['customer', 'technician', 'office', 'admin'];

router.get('/', (req, res) => {
  const users = db.prepare('SELECT id, name, email, role, phone, created_at FROM users ORDER BY name ASC').all();
  res.json(users);
});

router.get('/:id', (req, res) => {
  const user = db.prepare('SELECT id, name, email, role, phone, created_at FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Employee not found' });
  const jobs = db.prepare('SELECT * FROM jobs WHERE technician_id = ? ORDER BY created_at DESC LIMIT 20').all(req.params.id);
  res.json({ ...user, jobs });
});

router.post('/', adminOnly, (req, res) => {
  const { name, email, password, role, phone } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password required' });
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already in use' });
  const id = uuidv4();
  const hashed = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (id, name, email, password, role, phone) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, name, email, hashed, role || 'technician', phone || null);
  res.status(201).json(db.prepare('SELECT id, name, email, role, phone FROM users WHERE id = ?').get(id));
});

// Update profile fields (name/phone). Admins may edit anyone; users may edit themselves.
// Role is intentionally NOT editable here — use PUT /:id/role (admin only).
router.put('/:id', (req, res) => {
  if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { name, phone } = req.body;
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Employee not found' });
  db.prepare('UPDATE users SET name=?, phone=? WHERE id=?').run(name, phone || null, req.params.id);
  res.json(db.prepare('SELECT id, name, email, role, phone FROM users WHERE id = ?').get(req.params.id));
});

// Change a user's role — ADMIN ONLY.
router.put('/:id/role', adminOnly, (req, res) => {
  const { role } = req.body;
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: `Role must be one of: ${ROLES.join(', ')}` });
  }
  const existing = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'User not found' });
  // Prevent an admin from demoting themselves (avoids accidental lock-out).
  if (req.params.id === req.user.id && role !== 'admin') {
    return res.status(400).json({ error: 'You cannot change your own admin role' });
  }
  db.prepare('UPDATE users SET role=? WHERE id=?').run(role, req.params.id);
  res.json(db.prepare('SELECT id, name, email, role, phone FROM users WHERE id = ?').get(req.params.id));
});

router.delete('/:id', adminOnly, (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
