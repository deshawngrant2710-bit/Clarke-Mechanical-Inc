// One-off: email real template samples to a chosen address (no customer data is mutated).
require('dotenv').config();
const db = require('./db');
const { sendMail, templates } = require('./email');

const TO = process.argv[2] || 'deshawn.grant27@gmail.com';

(async () => {
  const out = [];

  // 1. Invoice
  const inv = db.prepare(`SELECT i.*, c.name AS customer_name FROM invoices i LEFT JOIN customers c ON i.customer_id=c.id
    WHERE c.name IS NOT NULL ORDER BY i.created_at DESC LIMIT 1`).get();
  if (inv) {
    inv.items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id=?').all(inv.id);
    inv.amountPaid = db.prepare('SELECT COALESCE(SUM(amount),0) t FROM payments WHERE invoice_id=?').get(inv.id).t;
    const { subject, html } = templates.invoice(inv);
    out.push(await sendMail({ type: 'invoice', to: TO, toName: 'Sample', subject, html, sentBy: 'Sample preview' }));
  }

  // 2. Quote
  const q = db.prepare(`SELECT q.*, c.name AS customer_name FROM quotes q LEFT JOIN customers c ON q.customer_id=c.id
    WHERE c.name IS NOT NULL ORDER BY q.created_at DESC LIMIT 1`).get();
  if (q) {
    q.items = db.prepare('SELECT * FROM quote_items WHERE quote_id=?').all(q.id);
    const { subject, html } = templates.quote(q);
    out.push(await sendMail({ type: 'quote', to: TO, toName: 'Sample', subject, html, sentBy: 'Sample preview' }));
  }

  // 3. Appointment reminder
  const job = db.prepare(`SELECT j.*, c.name AS customer_name, u.name AS technician_name
    FROM jobs j LEFT JOIN customers c ON j.customer_id=c.id LEFT JOIN users u ON j.technician_id=u.id
    WHERE c.name IS NOT NULL AND j.scheduled_date IS NOT NULL ORDER BY j.scheduled_date DESC LIMIT 1`).get();
  if (job) {
    const { subject, html } = templates.job_reminder(job);
    out.push(await sendMail({ type: 'job_reminder', to: TO, toName: 'Sample', subject, html, sentBy: 'Sample preview' }));
  }

  console.log('Samples sent to', TO);
  out.forEach(r => console.log(' -', r.status, r.error || ''));
  process.exit(0);
})();
