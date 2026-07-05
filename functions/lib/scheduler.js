const { db, list, nameMap } = require('./db');
const { render, sendMail } = require('./email');

const iso = (d) => d.toISOString();
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Has a non-failed reminder of this type gone out for this record within `hours`?
async function alreadySent(type, relatedId, hours) {
  const cutoff = iso(new Date(Date.now() - hours * 3600 * 1000));
  const snap = await db.collection('email_log').where('related_id', '==', relatedId).get();
  return snap.docs.some(d => {
    const e = d.data();
    return e.type === type && e.status !== 'failed' && (e.sent_at || '') >= cutoff;
  });
}

async function runReminders() {
  const summary = { jobReminders: 0, overdueNotices: 0, skipped: 0 };
  const [jobs, invoices, customers, users, cfg] = await Promise.all([
    list('jobs'), list('invoices'), nameMap('customers'), nameMap('users'),
    require('./settings').emailConfig(),
  ]);
  const custEmail = {};
  (await list('customers')).forEach(c => { custEmail[c.id] = c.email; });
  const tomorrow = daysFromNow(1);
  const today = daysFromNow(0);

  if (cfg.reminders.job) {
    const due = jobs.filter(j => j.scheduled_date === tomorrow && !['completed', 'cancelled'].includes(j.status) && custEmail[j.customer_id]);
    for (const job of due) {
      if (await alreadySent('job_reminder', job.id, 20)) { summary.skipped++; continue; }
      const entity = { ...job, customer_name: customers[job.customer_id], technician_name: users[job.technician_id] };
      const { subject, html } = await render('job_reminder', entity);
      await sendMail({ type: 'job_reminder', to: custEmail[job.customer_id], toName: customers[job.customer_id], subject, html, relatedId: job.id, customerId: job.customer_id, sentBy: 'Automated' });
      summary.jobReminders++;
    }
  }

  if (cfg.reminders.overdue) {
    const overdue = invoices.filter(i => !['paid', 'cancelled'].includes(i.status) && i.due_date && i.due_date < today && custEmail[i.customer_id]);
    for (const inv of overdue) {
      if (await alreadySent('invoice_reminder', inv.id, 72)) { summary.skipped++; continue; }
      const payments = (await db.collection('payments').where('invoice_id', '==', inv.id).get()).docs.map(d => d.data());
      const entity = { ...inv, customer_name: customers[inv.customer_id], amountPaid: payments.reduce((s, p) => s + (p.amount || 0), 0) };
      const { subject, html } = await render('invoice_reminder', entity);
      await sendMail({ type: 'invoice_reminder', to: custEmail[inv.customer_id], toName: customers[inv.customer_id], subject, html, relatedId: inv.id, customerId: inv.customer_id, sentBy: 'Automated' });
      summary.overdueNotices++;
    }
  }

  return summary;
}

module.exports = { runReminders };
