// Unauthenticated cron endpoints, guarded by a shared secret (CRON_KEY env var).
// Point a free scheduler (e.g. cron-job.org or a Render Cron Job) at these once a
// day. Example:
//   https://YOUR-API/api/cron/appointment-reminders?key=YOUR_CRON_KEY
const express = require('express');
const { v4: uuid } = require('uuid');
const { list, create, update } = require('../lib/db');
const { runAppointmentReminders } = require('../lib/reminders');
const gmail = require('../lib/gmail');
const { extractInvoice } = require('../lib/invoiceExtract');
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

// GET or POST /api/cron/vendor-invoices — scan Gmail for recent emails from known
// vendors, pull the PDF invoice, AI-extract the details, and file each as a
// pending-review vendor bill. Point a scheduler at this every ~2 hours.
async function vendorInvoices(req, res) {
  try {
    const conn = await gmail.getConn();
    if (!conn) return res.json({ ok: true, skipped: 'gmail_not_connected' });

    const vendors = await list('vendors');
    // Match on any of a vendor's sender emails AND optional domains, so invoices
    // from different people at the same vendor (AR, Tessa, Jerome…) all map to it.
    const emailMap = new Map(); const domainMap = new Map();
    const lc = (s) => String(s || '').toLowerCase().trim();
    for (const v of vendors) {
      [v.email, ...String(v.invoice_emails || '').split(/[,;\s]+/)].map(lc).filter(Boolean).forEach(e => emailMap.set(e, v));
      String(v.invoice_domains || '').split(/[,;\s]+/).map(e => lc(e).replace(/^@/, '')).filter(Boolean).forEach(d => domainMap.set(d, v));
    }
    if (emailMap.size === 0 && domainMap.size === 0) return res.json({ ok: true, skipped: 'no_vendor_emails' });

    const token = await gmail.getAccessToken();
    // Normal runs look back 3 days; pass ?days=60 once for a catch-up of older
    // invoices already in the inbox. ?max raises how many messages are scanned.
    const days = Math.min(Math.max(Number(req.query.days) || 3, 1), 180);
    const max = Math.min(Math.max(Number(req.query.max) || 25, 1), 100);
    const terms = [...emailMap.keys(), ...domainMap.keys()].slice(0, 40).map(x => `from:${x}`).join(' OR ');
    const q = `has:attachment newer_than:${days}d (${terms})`;
    const msgs = await gmail.listMessages(token, q, max);

    const existing = await list('vendor_bills');
    const seen = new Set(existing.map(b => b.email_message_id).filter(Boolean));

    let imported = 0;
    for (const { id } of msgs) {
      if (seen.has(id)) continue;
      try {
        const msg = await gmail.getMessage(token, id);
        const { fromEmail, subject, pdfs } = gmail.parseHeadersAndParts(msg);
        const vendor = emailMap.get(fromEmail) || domainMap.get(fromEmail.split('@')[1] || '');
        if (!vendor || !pdfs.length) continue;

        const pdf = pdfs[0];
        const b64 = await gmail.getAttachment(token, id, pdf.attachmentId);
        let data = {};
        try { data = await extractInvoice(b64); } catch (e) { console.error('[cron] extract:', e.message); }

        const tooBig = (b64.length * 0.75) > 6 * 1024 * 1024; // skip storing very large PDFs
        await create('vendor_bills', uuid(), {
          vendor_id: vendor.id, vendor_name: vendor.name,
          invoice_number: data.invoice_number || null,
          amount: Number(data.amount) || 0,
          bill_date: data.bill_date || new Date().toISOString().slice(0, 10),
          due_date: data.due_date || null,
          line_items: data.line_items || [],
          notes: `Auto-imported from email: "${(subject || '').slice(0, 120)}"`,
          status: 'pending_review', source: 'email',
          email_message_id: id, email_from: fromEmail, email_subject: subject || null,
          attachment: tooBig ? { filename: pdf.filename, mimeType: 'application/pdf', data: null } : { filename: pdf.filename, mimeType: 'application/pdf', data: b64 },
          created_by: 'Email import', created_at: new Date().toISOString(),
        });
        seen.add(id); imported++;
      } catch (e) { console.error('[cron] vendor-invoice msg failed:', e.message); }
    }

    try { await update('gmail_connection', 'default', { last_check: new Date().toISOString() }); } catch {}
    if (imported > 0) {
      await notify({ type: 'payment', title: 'New vendor invoice' + (imported > 1 ? 's' : '') + ' to review', body: `${imported} invoice${imported > 1 ? 's' : ''} captured from email — review and approve in Vendor Bills.`, link: '/vendor-bills', roles: ['admin', 'office'] });
    }
    res.json({ ok: true, scanned: msgs.length, imported });
  } catch (e) {
    console.error('[cron] vendor-invoices failed:', e.message);
    res.status(500).json({ error: 'Vendor invoice scan failed', detail: e.message });
  }
}
router.get('/vendor-invoices', vendorInvoices);
router.post('/vendor-invoices', vendorInvoices);

module.exports = router;
