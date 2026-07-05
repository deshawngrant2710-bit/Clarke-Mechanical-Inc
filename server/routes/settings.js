const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const settings = require('../settings');
const { sendMail, templates, resetTransport } = require('../email');
const { runReminders } = require('../scheduler');

const router = express.Router();
router.use(authMiddleware, adminOnly);

// GET current settings (SMTP password is never returned — only whether it's set).
router.get('/', (req, res) => {
  const s = settings.getAll();
  res.json({
    business_name: s.business_name,
    business_email: s.business_email,
    business_phone: s.business_phone,
    email_from: s.email_from,
    smtp_host: s.smtp_host,
    smtp_port: s.smtp_port,
    smtp_user: s.smtp_user,
    smtp_pass_set: !!s.smtp_pass,
    reminders_job_enabled: s.reminders_job_enabled === '1',
    reminders_overdue_enabled: s.reminders_overdue_enabled === '1',
    configured: !!(s.smtp_host && s.smtp_user),
  });
});

router.put('/', (req, res) => {
  const textKeys = ['business_name', 'business_email', 'business_phone', 'email_from', 'smtp_host', 'smtp_port', 'smtp_user'];
  const patch = {};
  for (const k of textKeys) if (k in req.body) patch[k] = req.body[k];
  if ('reminders_job_enabled' in req.body) patch.reminders_job_enabled = req.body.reminders_job_enabled ? '1' : '0';
  if ('reminders_overdue_enabled' in req.body) patch.reminders_overdue_enabled = req.body.reminders_overdue_enabled ? '1' : '0';
  // Only overwrite the password when a new non-empty value is supplied.
  if (req.body.smtp_pass) patch.smtp_pass = req.body.smtp_pass;

  settings.setMany(patch);
  resetTransport(); // pick up new SMTP creds immediately
  res.json({ success: true });
});

// Send a test email to verify configuration.
router.post('/test-email', async (req, res) => {
  const to = (req.body.to || settings.get('business_email') || '').trim();
  if (!to) return res.status(400).json({ error: 'No recipient address' });
  const { subject, html } = templates.test();
  const result = await sendMail({ type: 'test', to, toName: 'Test', subject, html, sentBy: req.user.name });
  if (result.status === 'failed') return res.status(502).json({ error: result.error || 'Send failed' });
  res.json({ ...result, to });
});

// Manually run the reminder pass now.
router.post('/run-reminders', async (req, res) => {
  try {
    const summary = await runReminders();
    res.json(summary);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
