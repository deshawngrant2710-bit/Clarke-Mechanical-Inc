const db = require('./db');
const { sendMail, templates } = require('./email');
const settings = require('./settings');

// Has this reminder already gone out recently? Prevents duplicate sends.
function alreadySent(type, relatedId, withinHours) {
  const row = db.prepare(
    `SELECT id FROM email_log WHERE type = ? AND related_id = ? AND status != 'failed' AND sent_at >= datetime('now', ?)`
  ).get(type, relatedId, `-${withinHours} hours`);
  return !!row;
}

// Send reminders for tomorrow's appointments and overdue invoices.
async function runReminders() {
  const cfg = settings.emailConfig();
  const summary = { jobReminders: 0, overdueNotices: 0, skipped: 0 };

  if (cfg.reminders.job) {
    const jobs = db.prepare(`
      SELECT j.*, c.name AS customer_name, c.email AS customer_email, u.name AS technician_name
      FROM jobs j
      JOIN customers c ON j.customer_id = c.id
      LEFT JOIN users u ON j.technician_id = u.id
      WHERE j.scheduled_date = date('now', '+1 day')
        AND j.status NOT IN ('completed', 'cancelled')
        AND c.email IS NOT NULL AND c.email != ''
    `).all();
    for (const job of jobs) {
      if (alreadySent('job_reminder', job.id, 20)) { summary.skipped++; continue; }
      const { subject, html } = templates.job_reminder(job);
      await sendMail({ type: 'job_reminder', to: job.customer_email, toName: job.customer_name,
        subject, html, relatedId: job.id, customerId: job.customer_id, sentBy: 'Automated' });
      summary.jobReminders++;
    }
  }

  if (cfg.reminders.overdue) {
    const invoices = db.prepare(`
      SELECT i.*, c.name AS customer_name, c.email AS customer_email
      FROM invoices i
      JOIN customers c ON i.customer_id = c.id
      WHERE i.status NOT IN ('paid', 'cancelled')
        AND i.due_date IS NOT NULL AND i.due_date < date('now')
        AND c.email IS NOT NULL AND c.email != ''
    `).all();
    for (const inv of invoices) {
      if (alreadySent('invoice_reminder', inv.id, 72)) { summary.skipped++; continue; }
      inv.items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(inv.id);
      inv.amountPaid = db.prepare('SELECT COALESCE(SUM(amount),0) AS t FROM payments WHERE invoice_id = ?').get(inv.id).t;
      const { subject, html } = templates.invoice_reminder(inv);
      await sendMail({ type: 'invoice_reminder', to: inv.customer_email, toName: inv.customer_name,
        subject, html, relatedId: inv.id, customerId: inv.customer_id, sentBy: 'Automated' });
      summary.overdueNotices++;
    }
  }

  return summary;
}

let timer;
function startScheduler() {
  // Run once shortly after boot, then hourly. Dedup logic keeps each item to one send/day.
  setTimeout(() => runReminders().then(s => console.log('[reminders]', s)).catch(console.error), 10_000);
  timer = setInterval(() => runReminders().catch(console.error), 60 * 60 * 1000);
}

module.exports = { runReminders, startScheduler };
