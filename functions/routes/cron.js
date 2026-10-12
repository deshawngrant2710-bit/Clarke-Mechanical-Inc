// Unauthenticated cron endpoints, guarded by a shared secret (CRON_KEY env var).
// Point a free scheduler (e.g. cron-job.org or a Render Cron Job) at these once a
// day. Example:
//   https://YOUR-API/api/cron/appointment-reminders?key=YOUR_CRON_KEY
const express = require('express');
const { v4: uuid } = require('uuid');
const { list, create } = require('../lib/db');
const { runAppointmentReminders } = require('../lib/reminders');
let notify; try { ({ notify } = require('../lib/notify')); } catch { notify = async () => {}; }

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

// GET or POST /api/cron/subscription-review — weekly nudge to confirm/update
// subscription prices (they drift month to month). Self-gates to Fridays, so a
// daily scheduler still fires it only once a week; dedupes within 6 days.
// Force a run any day with ?force=1.
async function subscriptionReview(req, res) {
  try {
    const force = req.query.force === '1' || req.body?.force === true;
    const now = new Date();
    if (!force && now.getDay() !== 5) return res.json({ ok: true, skipped: 'not Friday' });

    const tasks = await list('tasks');
    const recent = tasks.find(t => t.source === 'subscription_review' && t.created_at && (Date.now() - new Date(t.created_at).getTime()) < 6 * 864e5);
    if (recent && !force) return res.json({ ok: true, skipped: 'already reminded this week' });

    const subs = (await list('subscriptions')).filter(s => s.active !== false);
    const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const listStr = subs.length
      ? subs.map(s => `• ${s.name}: ${money(s.amount)}/${s.frequency === 'yearly' ? 'yr' : 'mo'}`).join('\n')
      : 'No subscriptions on file yet.';

    await create('tasks', uuid(), {
      title: 'Review subscription prices',
      notes: `Weekly check: confirm each subscription is still billed at the right amount (they change month to month) and update any that moved in Financial Reports.\n\n${listStr}`,
      assigned_to: null, customer_id: null, customer_name: null, job_id: null, job_title: null,
      invoice_id: null, due_date: now.toISOString().slice(0, 10), remind_at: null,
      priority: 'normal', recurrence: 'none', comments: [], status: 'open',
      created_by: 'Automated', created_at: new Date().toISOString(), completed_at: null,
      source: 'subscription_review',
    });
    await notify({ type: 'info', title: 'Review subscription prices', body: 'Weekly check — confirm Quo, Claude and other subscription amounts are still correct, and update any that changed in Financial Reports.', link: '/reports', roles: ['admin', 'office'] });

    res.json({ ok: true, reminded: true, subscriptions: subs.length });
  } catch (e) {
    console.error('[cron] subscription-review failed:', e.message);
    res.status(500).json({ error: 'Subscription review run failed' });
  }
}
router.get('/subscription-review', subscriptionReview);
router.post('/subscription-review', subscriptionReview);

module.exports = router;
