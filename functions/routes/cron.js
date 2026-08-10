// Unauthenticated cron endpoints, guarded by a shared secret (CRON_KEY env var).
// Point a free scheduler (e.g. cron-job.org or a Render Cron Job) at these once a
// day. Example:
//   curl -X POST https://YOUR-API/api/cron/appointment-reminders \
//        -H "x-cron-key: YOUR_CRON_KEY"
const express = require('express');
const { list, getById, update } = require('../lib/db');
const { render, sendMail } = require('../lib/email');
const { notifyCustomerBySms } = require('../lib/sms');
const settings = require('../lib/settings');

const router = express.Router();

// Every route here requires the secret. Returns 404 (not 401) when unconfigured
// so the endpoint is invisible until you set CRON_KEY.
router.use((req, res, next) => {
  const key = process.env.CRON_KEY;
  if (!key) return res.status(404).json({ error: 'Not found' });
  if ((req.headers['x-cron-key'] || '') !== key) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

function apptWhen(job) {
  if (!job.scheduled_date) return '';
  let when = new Date(job.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (job.booking_window) when += ` (${job.booking_window})`;
  else if (job.scheduled_time) when += ` at ${job.scheduled_time}`;
  return when;
}

// POST /api/cron/appointment-reminders — text/email a reminder for jobs scheduled
// on the target day (defaults to tomorrow). Idempotent: skips jobs already reminded.
// Optional body/query: ?date=YYYY-MM-DD to override the target day.
router.post('/appointment-reminders', async (req, res) => {
  try {
    const override = (req.query.date || req.body?.date || '').trim();
    let target = override;
    if (!target) {
      const d = new Date(); d.setDate(d.getDate() + 1);
      target = d.toISOString().slice(0, 10);
    }
    const jobs = await list('jobs');
    const due = jobs.filter(j =>
      j.scheduled_date === target &&
      j.status === 'scheduled' &&
      !j.reminder_sent_at &&
      j.customer_id
    );
    const biz = (await settings.get('business_name')) || 'Clarke Mechanical';
    let texted = 0, emailed = 0;
    for (const job of due) {
      const customer = await getById('customers', job.customer_id);
      const when = apptWhen(job);
      const sms = await notifyCustomerBySms(customer, `${biz}: reminder — your appointment for "${job.title}" is ${when || 'tomorrow'}. Reply STOP to opt out.`);
      if (sms) texted++;
      if (customer?.email) {
        try {
          const tech = job.technician_id ? await getById('users', job.technician_id) : null;
          const html = `<div style="font-family:sans-serif;font-size:15px;color:#334155;line-height:1.6">
            <p>Hi${customer.name ? ` ${customer.name}` : ''}, this is a friendly reminder of your upcoming appointment with ${biz}.</p>
            <p><strong>${job.title}</strong>${when ? `<br><strong>When:</strong> ${when}` : ''}${tech?.name ? `<br><strong>Technician:</strong> ${tech.name}` : ''}${job.address ? `<br><strong>Location:</strong> ${job.address}` : ''}</p>
            <p>Need to reschedule? Open the Appointments page in your account. See you soon!</p></div>`;
          await sendMail({ type: 'appointment_reminder', to: customer.email, toName: customer.name, subject: `Reminder: ${job.title}${when ? ` — ${when}` : ''}`, html, relatedId: job.id, customerId: job.customer_id, sentBy: 'Automated' });
          emailed++;
        } catch (e) { console.error('[cron] reminder email failed:', e.message); }
      }
      await update('jobs', job.id, { reminder_sent_at: new Date().toISOString() });
    }
    res.json({ ok: true, date: target, total: due.length, texted, emailed });
  } catch (e) {
    console.error('[cron] appointment-reminders failed:', e.message);
    res.status(500).json({ error: 'Reminder run failed' });
  }
});

module.exports = router;
