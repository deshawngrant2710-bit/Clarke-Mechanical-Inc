const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { sendMail, templates } = require('../email');
const settings = require('../settings');

const router = express.Router();
router.use(authMiddleware);

// Is a real SMTP transport configured? (UI uses this to show a hint.)
router.get('/status', (req, res) => {
  const cfg = settings.emailConfig();
  res.json({ configured: cfg.configured, from: cfg.from, business: cfg.business });
});

// Communication history — all sent email, or filtered by ?customer_id=
router.get('/log', (req, res) => {
  const { customer_id } = req.query;
  const rows = customer_id
    ? db.prepare('SELECT * FROM email_log WHERE customer_id = ? ORDER BY sent_at DESC LIMIT 100').all(customer_id)
    : db.prepare('SELECT * FROM email_log ORDER BY sent_at DESC LIMIT 100').all();
  res.json(rows);
});

// Load the entity for a given email type and shape it for the template.
function loadContext(type, id) {
  if (type === 'invoice' || type === 'receipt') {
    const inv = db.prepare(`
      SELECT i.*, c.name as customer_name, c.email as customer_email, c.id as cust_id
      FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id WHERE i.id = ?`).get(id);
    if (!inv) return null;
    inv.items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(id);
    const payments = db.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY paid_at DESC').all(id);
    inv.amountPaid = payments.reduce((s, p) => s + p.amount, 0);
    inv.lastPayment = payments[0]?.amount;
    return { entity: inv, email: inv.customer_email, name: inv.customer_name, customerId: inv.cust_id, ref: inv.invoice_number };
  }
  if (type === 'quote') {
    const q = db.prepare(`
      SELECT q.*, c.name as customer_name, c.email as customer_email, c.id as cust_id
      FROM quotes q LEFT JOIN customers c ON q.customer_id = c.id WHERE q.id = ?`).get(id);
    if (!q) return null;
    q.items = db.prepare('SELECT * FROM quote_items WHERE quote_id = ?').all(id);
    return { entity: q, email: q.customer_email, name: q.customer_name, customerId: q.cust_id, ref: q.quote_number };
  }
  if (type === 'job_confirmation' || type === 'job_reminder') {
    const job = db.prepare(`
      SELECT j.*, c.name as customer_name, c.email as customer_email, c.id as cust_id, u.name as technician_name
      FROM jobs j LEFT JOIN customers c ON j.customer_id = c.id LEFT JOIN users u ON j.technician_id = u.id
      WHERE j.id = ?`).get(id);
    if (!job) return null;
    return { entity: job, email: job.customer_email, name: job.customer_name, customerId: job.cust_id, ref: job.title };
  }
  return null;
}

// POST /api/email/send  { type, id }
router.post('/send', async (req, res) => {
  const { type, id } = req.body;
  if (!templates[type]) return res.status(400).json({ error: 'Unknown email type' });

  const ctx = loadContext(type, id);
  if (!ctx) return res.status(404).json({ error: 'Record not found' });
  if (!ctx.email) return res.status(422).json({ error: 'This customer has no email address on file' });

  const { subject, html } = templates[type](ctx.entity);
  const result = await sendMail({
    type, to: ctx.email, toName: ctx.name, subject, html,
    relatedId: id, customerId: ctx.customerId, sentBy: req.user?.name,
  });

  if (result.status === 'failed') return res.status(502).json({ error: result.error || 'Email failed to send' });

  // Auto-advance invoice/quote status to "sent" when appropriate.
  if (type === 'invoice') db.prepare("UPDATE invoices SET status='sent' WHERE id=? AND status='draft'").run(id);
  if (type === 'quote') db.prepare("UPDATE quotes SET status='sent' WHERE id=? AND status='draft'").run(id);

  res.json({ ...result, to: ctx.email, subject });
});

module.exports = router;
