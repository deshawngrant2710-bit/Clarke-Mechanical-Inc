// Unauthenticated cron endpoints, guarded by a shared secret (CRON_KEY env var).
// Point a free scheduler (e.g. cron-job.org or a Render Cron Job) at these once a
// day. Example:
//   https://YOUR-API/api/cron/appointment-reminders?key=YOUR_CRON_KEY
const express = require('express');
const { runAppointmentReminders } = require('../lib/reminders');

const router = express.Router();

// Every route here requires the secret. Returns 404 (not 401) when unconfigured
// so the endpoint is invisible until you set CRON_KEY. The secret may be provided
// either as an `x-cron-key` header or a `?key=` query param (so a plain GET from a
// simple scheduler works without custom headers).
router.use((req, res, next) => {
  const key = process.env.CRON_KEY;
  if (!key) return res.status(404).json({ error: 'Not found' });
  const provided = req.headers['x-cron-key'] || req.query.key || '';
  if (provided !== key) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

// GET or POST /api/cron/appointment-reminders — reminders for jobs scheduled on the
// target day (defaults to tomorrow). Optional ?date=YYYY-MM-DD to override the day.
async function appointmentReminders(req, res) {
  try {
    const date = (req.query.date || req.body?.date || '').trim();
    const result = await runAppointmentReminders({ date });
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[cron] appointment-reminders failed:', e.message);
    res.status(500).json({ error: 'Reminder run failed' });
  }
}

router.get('/appointment-reminders', appointmentReminders);
router.post('/appointment-reminders', appointmentReminders);

module.exports = router;
