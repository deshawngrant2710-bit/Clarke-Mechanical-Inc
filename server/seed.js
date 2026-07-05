require('dotenv').config();
const db = require('./db');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const email = 'admin@clarkemechanical.com';
const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
if (existing) {
  console.log('Admin already exists:', email);
} else {
  db.prepare('INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)')
    .run(uuidv4(), 'Clarke Admin', email, bcrypt.hashSync('clarke2024', 10), 'admin');
  console.log('Admin created!');
  console.log('Email: admin@clarkemechanical.com');
  console.log('Password: clarke2024');
}
process.exit(0);
