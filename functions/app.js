const express = require('express');
const cors = require('cors');

// Shared Express app — used by server.js (Render) and index.js (Firebase, optional).
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/billing', require('./routes/billing'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/email', require('./routes/email'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/portal', require('./routes/portal'));
app.use('/api/time', require('./routes/time'));
app.use('/api/inspections', require('./routes/inspections'));
app.use('/api/support', require('./routes/support'));
app.use('/api/reports', require('./routes/reports'));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
