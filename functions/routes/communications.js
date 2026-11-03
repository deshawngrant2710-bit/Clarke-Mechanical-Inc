// Communications inbox — mirrors your Quo (OpenPhone) texts and calls into the
// app so the office can see conversations and missed/returned calls, and reply
// to texts. The app never places calls. Inbound data arrives by Quo webhook;
// replies go out through the existing SMS sender.
const express = require('express');
const { v4: uuid } = require('uuid');
const { list, getById, create, update, remove, findWhere } = require('../lib/db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { sendSms, toE164 } = require('../lib/sms');
let notify; try { ({ notify } = require('../lib/notify')); } catch { notify = async () => {}; }

const router = express.Router();

const digits = (s) => String(s || '').replace(/[^\d]/g, '');
const last10 = (s) => digits(s).slice(-10);
const e164 = (s) => toE164(s) || (s ? String(s).trim() : null);
const sameContact = (a, b) => last10(a) && last10(a) === last10(b);
const nowISO = () => new Date().toISOString();

// Match a phone number to a customer by its last 10 digits.
async function matchCustomer(num) {
  const t = last10(num);
  if (!t) return {};
  const custs = await list('customers');
  const c = custs.find(x => x.phone && last10(x.phone) === t);
  return c ? { customer_id: c.id, customer_name: c.business_name || c.name || null } : {};
}

// ---- Normalizers. Quo nests the item in data.resource and carries the phone
// numbers as data.senderIdentifier + data.recipientIdentifiers[]. We also accept
// the older data.object / from / to shape, to be safe. ----
const senderOf = (data, r) => e164(data.senderIdentifier || r.from || r.participant);
const recipientOf = (data, r) => e164((Array.isArray(data.recipientIdentifiers) && data.recipientIdentifiers[0]) || (Array.isArray(r.to) ? r.to[0] : r.to));

function normMessage(data, r, type) {
  const dir = String(r.direction || data.direction || '').toLowerCase();
  const direction = dir.includes('out') ? 'out' : dir.includes('in') ? 'in' : (type.includes('received') ? 'in' : 'out');
  const sender = senderOf(data, r);
  const recipient = recipientOf(data, r);
  return {
    quo_id: r.id || data.id || null, direction,
    contact: direction === 'in' ? sender : recipient,
    from: sender, to: recipient,
    body: r.text || r.body || r.content || '',
    status: r.status || (direction === 'in' ? 'received' : 'sent'),
    at: r.createdAt || data.createdAt || nowISO(),
  };
}
function callStatus(r) {
  const s = String(r.status || '').toLowerCase();
  if (r.voicemailUrl || r.voicemail_url || s.includes('voicemail')) return 'voicemail';
  if (/missed|no-?answer|unanswered|declined|rejected|busy/.test(s)) return 'missed';
  if (String(r.direction || '').toLowerCase().includes('in') && (Number(r.duration) || 0) === 0 && s && s !== 'completed') return 'missed';
  return 'answered';
}
function normCall(data, r) {
  const dir = String(r.direction || data.direction || '').toLowerCase();
  const direction = dir.includes('out') ? 'out' : 'in';
  const sender = senderOf(data, r);
  const recipient = recipientOf(data, r);
  return {
    quo_id: r.id || data.id || null, direction,
    contact: direction === 'in' ? sender : recipient,
    from: sender, to: recipient,
    status: callStatus(r),
    duration: Number(r.duration || r.completedDuration || 0) || 0,
    recording_url: r.recordingUrl || r.recording_url || null,
    voicemail_url: r.voicemailUrl || r.voicemail_url || null,
    at: r.createdAt || data.createdAt || r.answeredAt || r.completedAt || nowISO(),
  };
}

async function upsertMessage(m) {
  if (m.quo_id) { try { const ex = await findWhere('comm_messages', 'quo_id', m.quo_id); if (ex[0]) return update('comm_messages', ex[0].id, { status: m.status }); } catch {} }
  return create('comm_messages', uuid(), { ...m, read: m.direction === 'out', created_at: nowISO() });
}
async function upsertCall(c) {
  if (c.quo_id) { try { const ex = await findWhere('comm_calls', 'quo_id', c.quo_id); if (ex[0]) return update('comm_calls', ex[0].id, { status: c.status, duration: c.duration, recording_url: c.recording_url, voicemail_url: c.voicemail_url }); } catch {} }
  return create('comm_calls', uuid(), { ...c, created_at: nowISO() });
}

/* ============ WEBHOOK (no auth — guarded by shared key) ============ */
// Quo (OpenPhone) doesn't allow a "?query" in webhook URLs, so the key is taken
// from the PATH: POST /api/comms/quo-webhook/<QUO_WEBHOOK_KEY>
// (a ?key= / x-quo-key header is still accepted for flexibility).
// Register in Quo for: message.received, message.delivered, call.completed,
// call.recording.completed. Always answers 200 so Quo doesn't retry-storm.
async function handleWebhook(req, res) {
  const key = process.env.QUO_WEBHOOK_KEY;
  if (!key) return res.status(404).json({ error: 'Not found' });
  const provided = req.params.key || req.query.key || req.headers['x-quo-key'] || '';
  if (provided !== key) return res.status(401).json({ error: 'Unauthorized' });
  const dbg = { at: nowISO(), outcome: 'init' };
  try {
    const body = req.body || {};
    const type = String(body.type || body.event || '').toLowerCase();
    dbg.type = type;
    const data = body.data || {};
    const resource = data.resource || data.object || data;
    if (type.startsWith('message')) {
      const m = normMessage(data, resource, type);
      dbg.contact = m.contact; dbg.direction = m.direction; dbg.body = (m.body || '').slice(0, 40);
      if (m.contact) {
        const match = await matchCustomer(m.contact);
        const saved = await upsertMessage({ ...m, ...match });
        dbg.outcome = 'stored_message'; dbg.saved_id = saved?.id || null;
        if (m.direction === 'in') {
          try { await notify({ type: 'message', title: `New text — ${match.customer_name || m.contact}`, body: (m.body || '').slice(0, 120), link: '/messages', roles: ['admin', 'office'] }); } catch {}
        }
      } else { dbg.outcome = 'no_contact'; }
    } else if (type.startsWith('call')) {
      const c = normCall(data, resource);
      dbg.contact = c.contact; dbg.direction = c.direction; dbg.callStatus = c.status;
      if (c.contact) {
        const match = await matchCustomer(c.contact);
        await upsertCall({ ...c, ...match });
        dbg.outcome = 'stored_call';
        if (c.direction === 'in' && c.status === 'missed') {
          try { await notify({ type: 'call', title: `Missed call — ${match.customer_name || c.contact}`, link: '/messages', roles: ['admin', 'office'] }); } catch {}
        }
      } else { dbg.outcome = 'no_contact'; }
    } else { dbg.outcome = 'unhandled_type'; }
  } catch (e) {
    dbg.outcome = 'ERROR'; dbg.error = e.message; dbg.stack = (e.stack || '').split('\n').slice(0, 3).join(' | ');
    console.error('[comms] webhook:', e.message);
  }
  try { await create('comm_debug', uuid(), { at: dbg.at, raw: JSON.stringify(dbg) }); } catch {}
  res.json({ ok: true });
}
router.post('/quo-webhook/:key', handleWebhook); // preferred (no query string)
router.post('/quo-webhook', handleWebhook);       // legacy (?key= / header)

// Temporary debug: view the last raw payloads Quo sent (key-guarded, so it can be
// opened straight in a browser). Remove later.
router.get('/quo-webhook-debug/:key', async (req, res) => {
  if (!process.env.QUO_WEBHOOK_KEY || req.params.key !== process.env.QUO_WEBHOOK_KEY) return res.status(401).json({ error: 'Unauthorized' });
  const [dbg, msgs, calls] = await Promise.all([list('comm_debug'), list('comm_messages'), list('comm_calls')]);
  const recent = (arr) => arr.sort((a, b) => (b.at || b.created_at || '').localeCompare(a.at || a.created_at || '')).slice(0, 8);
  res.json({
    stored_messages: msgs.length,
    stored_calls: calls.length,
    recent_messages: recent(msgs).map(m => ({ at: m.at, direction: m.direction, contact: m.contact, body: m.body, customer: m.customer_name })),
    recent_calls: recent(calls).map(c => ({ at: c.at, direction: c.direction, status: c.status, contact: c.contact })),
    recent_raw: recent(dbg).map(r => ({ at: r.at, raw: r.raw })),
  });
});

/* ============ APP API (staff auth) ============ */
router.use(authMiddleware, requireRole('admin', 'office'));

// GET /api/comms/summary — badge counts.
router.get('/summary', async (req, res) => {
  const [msgs, calls] = await Promise.all([list('comm_messages'), list('comm_calls')]);
  const unread = msgs.filter(m => m.direction === 'in' && !m.read).length;
  const missedOpen = calls.filter(c => c.direction === 'in' && c.status === 'missed').length;
  res.json({ unread, missed: missedOpen, configured: !!process.env.QUO_WEBHOOK_KEY });
});

// GET /api/comms/threads — one row per contact, newest first.
router.get('/threads', async (req, res) => {
  const msgs = await list('comm_messages');
  const by = {};
  for (const m of msgs) { const k = last10(m.contact) || m.contact || 'unknown'; (by[k] = by[k] || []).push(m); }
  const threads = Object.values(by).map(arr => {
    arr.sort((a, b) => (a.at || '').localeCompare(b.at || ''));
    const last = arr[arr.length - 1];
    return {
      contact: last.contact, customer_id: last.customer_id || null, customer_name: last.customer_name || null,
      last_body: last.body, last_at: last.at, last_dir: last.direction,
      unread: arr.filter(x => x.direction === 'in' && !x.read).length, count: arr.length,
    };
  }).sort((a, b) => (b.last_at || '').localeCompare(a.last_at || ''));
  res.json(threads);
});

// GET /api/comms/threads/:contact/messages — full conversation; marks inbound read.
router.get('/threads/:contact/messages', async (req, res) => {
  const all = await list('comm_messages');
  const rows = all.filter(m => sameContact(m.contact, req.params.contact)).sort((a, b) => (a.at || '').localeCompare(b.at || ''));
  for (const m of rows) if (m.direction === 'in' && !m.read) { try { await update('comm_messages', m.id, { read: true }); } catch {} }
  res.json(rows);
});

// POST /api/comms/threads/:contact/reply { body } — send a text back via Quo.
router.post('/threads/:contact/reply', async (req, res) => {
  const body = (req.body?.body || '').toString().trim();
  if (!body) return res.status(400).json({ error: 'Type a message' });
  const to = e164(req.params.contact);
  try {
    await sendSms(to, body);
    const match = await matchCustomer(to);
    const saved = await create('comm_messages', uuid(), {
      quo_id: null, direction: 'out', contact: to, from: process.env.QUO_FROM || null, to,
      body, status: 'sent', at: nowISO(), read: true, ...match, created_at: nowISO(), sent_by: req.user.name,
    });
    res.status(201).json(saved);
  } catch (e) { res.status(400).json({ error: e.message || 'Could not send the text' }); }
});

// GET /api/comms/calls — call log with auto-detected "returned" on missed calls.
router.get('/calls', async (req, res) => {
  const [calls, msgs] = await Promise.all([list('comm_calls'), list('comm_messages')]);
  const rows = calls.map(c => {
    let returned = false;
    if (c.direction === 'in' && c.status === 'missed') {
      const t = c.at || '';
      returned = msgs.some(m => m.direction === 'out' && sameContact(m.contact, c.contact) && (m.at || '') > t)
        || calls.some(x => x.id !== c.id && x.direction === 'out' && sameContact(x.contact, c.contact) && (x.at || '') > t);
    }
    return { ...c, returned };
  }).sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  res.json(rows);
});

// DELETE helpers (tidy up).
router.delete('/messages/:id', async (req, res) => { await remove('comm_messages', req.params.id); res.json({ success: true }); });
router.delete('/calls/:id', async (req, res) => { await remove('comm_calls', req.params.id); res.json({ success: true }); });

module.exports = router;
