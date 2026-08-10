// Shared appointment-reminder run, used by both the public cron endpoint and the
// authenticated in-app "send reminders now" button. Texts + emails a reminder for
// jobs scheduled on the target day (defaults to tomorrow). Idempotent: skips jobs
// already reminded (reminder_sent_at). `force` re-sends even if already reminded.
const { list, getById, update } = require('./db');
const { render, sendMail } = require('./email');
const { notifyCustomerBySms } = require('./sms');
const settings = require('./settings');

function apptWhen(job) {
  if (!job.scheduled_date) return '';
  let when = new Date(job.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (job.booking_window) when += ` (${job.booking_window})`;
  else if (job.scheduled_time) when += ` at ${job.scheduled_time}`;
  return when;
}

async function runAppointmentReminders({ date, force = false } = {}) {
  let target = (date || '').trim();
  if (!target) {
    const d = new Date(); d.setDate(d.getDate() + 1);
    target = d.toISOString().slice(0, 10);
  }
  const jobs = await list('jobs');
  const due = jobs.filter(j =>
    j.scheduled_date === target &&
    j.status === 'scheduled' &&
    (force || !j.reminder_sent_at) &&
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
      } catch (e) { console.error('[reminders] email failed:', e.message); }
    }
    await update('jobs', job.id, { reminder_sent_at: new Date().toISOString() });
  }
  return { date: target, total: due.length, texted, emailed };
}

module.exports = { runAppointmentReminders };
