const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const express = require('express');
const cors = require('cors');

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

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// The whole API as one HTTPS function.
exports.api = onRequest({ region: 'us-central1' }, app);

// Automated reminders: runs hourly in production (Cloud Scheduler).
exports.reminders = onSchedule({ schedule: 'every 60 minutes', region: 'us-central1' }, async () => {
  const { runReminders } = require('./lib/scheduler');
  const summary = await runReminders();
  console.log('[reminders]', summary);
});
