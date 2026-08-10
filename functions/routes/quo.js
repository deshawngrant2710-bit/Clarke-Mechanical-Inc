// Quo (formerly OpenPhone) webhook receiver. Turns a completed Sona call into a
// pending service request (job) in the app, matching an existing customer by phone
// or creating a new one. Guarded by a shared secret in the URL (?key=QUO_WEBHOOK_KEY)
// so it works without depending on Quo's signature format.
//
// Register the webhook once (needs your Quo API key), pointing at:
//   https://YOUR-API/api/quo/call-summary?key=YOUR_QUO_WEBHOOK_KEY
// event: call.summary.completed
const express = require('express');
const { v4: uuid } = require('uuid');
const { list, create, findOne } = require('../lib/db');
const { toE164 } = require('../lib/sms');

const router = express.Router();

// Secret guard. 404 when unconfigured so the endpoint is invisible until set up.
router.use((req, res, next) => {
  const key = process.env.QUO_WEBHOOK_KEY;
  if (!key) return res.status(404).json({ error: 'Not found' });
  if ((req.query.key || req.headers['x-quo-key'] || '') !== key) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

// Pull the summary object out of whatever envelope Quo sends.
function extractSummary(body) {
  return body?.data?.object || body?.data || body || {};
}

// Flatten all Sona job result fields into { normalizedKey: value }.
function jobFields(summary) {
  const out = {};
  for (const job of (summary.jobs || [])) {
    for (const field of (job?.result?.data || [])) {
      if (field && field.name != null) out[String(field.name).toLowerCase().trim()] = field.value;
    }
  }
  return out;
}

// Find the first field whose key contains any of the given substrings.
function pick(fields, needles) {
  for (const [k, v] of Object.entries(fields)) {
    if (v == null || v === '') continue;
    if (needles.some(n => k.includes(n))) return String(v).trim();
  }
  return null;
}

function toText(arr) {
  if (!arr) return '';
  return (Array.isArray(arr) ? arr : [arr]).filter(Boolean).map(String).join(' ');
}

// POST /api/quo/call-summary — Sona/AI call finished; create a pending service request.
router.post('/call-summary', async (req, res) => {
  try {
    const summary = extractSummary(req.body);
    const callId = summary.callId || summary.id || null;

    // Only act on completed summaries (ignore in-progress/failed pings).
    if (summary.status && summary.status !== 'completed') return res.json({ ok: true, ignored: 'not completed' });

    // Idempotency: never create two requests for the same call.
    if (callId) {
      const existing = (await list('jobs')).find(j => j.sona_call_id === callId);
      if (existing) return res.json({ ok: true, duplicate: true, jobId: existing.id });
    }

    const fields = jobFields(summary);
    const name = pick(fields, ['name']) || 'Phone caller';
    const phoneRaw = pick(fields, ['phone', 'callback', 'number', 'mobile', 'cell']);
    const phone = phoneRaw ? (toE164(phoneRaw) || phoneRaw) : null;
    const email = pick(fields, ['email']);
    const address = pick(fields, ['address', 'location']);
    const problem = pick(fields, ['problem', 'issue', 'reason', 'describe', 'need', 'work', 'repair']);
    const preferred = pick(fields, ['time', 'window', 'when', 'preferred', 'day', 'schedule']);
    const urgent = String(pick(fields, ['emergency', 'urgent']) || '').toLowerCase();
    const isUrgent = urgent === 'true' || urgent === 'yes';

    // Build a readable description from the AI summary + captured details.
    const bullets = toText(summary.summary);
    const nextSteps = toText(summary.nextSteps);
    const descParts = [];
    if (problem) descParts.push(problem);
    if (bullets) descParts.push(`Call summary: ${bullets}`);
    if (preferred) descParts.push(`Preferred time: ${preferred}`);
    if (nextSteps) descParts.push(`Next steps: ${nextSteps}`);
    const description = descParts.join('\n').slice(0, 4000) || 'Captured from an AI phone call.';

    // Match an existing customer by email or phone; otherwise create one.
    let customer = null;
    if (email) customer = await findOne('customers', 'email', email).catch(() => null);
    if (!customer && phone) {
      const target = toE164(phone);
      customer = (await list('customers')).find(c => c.phone && toE164(c.phone) === target) || null;
    }
    if (!customer) {
      customer = await create('customers', uuid(), {
        name, email: email || null, phone: phone || null,
        address: address || null, city: null, state: null, zip: null,
        notes: 'Created from an AI phone call (Sona).',
      });
    }

    const job = await create('jobs', uuid(), {
      title: (problem || `Phone request from ${name}`).slice(0, 140),
      description,
      customer_id: customer.id,
      technician_id: null,
      status: 'pending',
      priority: isUrgent ? 'high' : 'normal',
      job_type: 'Phone Request (Sona)',
      scheduled_date: null,
      scheduled_time: null,
      booking_window: null,
      completed_date: null,
      address: address || customer.address || null,
      sona_call_id: callId,
      source: 'sona',
      notes: `Captured from an AI phone call via Sona${isUrgent ? ' — caller indicated URGENT/emergency' : ''}. Review and confirm with the customer.`,
    });

    res.json({ ok: true, jobId: job.id, customerId: customer.id, urgent: isUrgent });
  } catch (e) {
    console.error('[quo] call-summary webhook failed:', e.message);
    // Return 200 so Quo does not hammer retries on a parse issue; we've logged it.
    res.json({ ok: false, error: 'processing_error' });
  }
});

module.exports = router;
