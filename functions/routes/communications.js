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

// ---- Normalizers (tolerant of Quo/OpenPhone envelope variations) ----
function normMessage(obj, type) {
  const dir = String(obj.direction || '').toLowerCase();
  const direction = dir.includes('out') ? 'out' : dir.includes('in') ? 'in' : (type.includes('received') ? 'in' : 'out');
  const from = e164(obj.from);
  const toArr = Array.isArray(obj.to) ? obj.to : [obj.to];
  const to = e164(toArr[0]);
  const contact = direction === 'in' ? from : to;
  return {
    quo_id: obj.id || null, direction, contact, from, to,
    body: obj.text || obj.body || obj.content || '',
    status: obj.status || (direction === 'in' ? 'received' : 'sent'),
    at: obj.createdAt || obj.created_at || nowISO(),
  };
}
function callStatus(obj) {
  const s = String(obj.status || '').toLowerCase();
  if (obj.voicemailUrl || obj.voicemail_url || s.includes('voicemail')) return 'voicemail';
  if (/missed|no-?answer|unanswered|declined|rejected/.test(s)) return 'missed';
  if (String(obj.direction || '').toLowerCase().includes('in') && (Number(obj.duration) || 0) === 0 && s && s !== 'completed') return 'missed';
  return 'answered';
}
function normCall(obj) {
  const dir = String(obj.direction || '').toLowerCase();
  const direction = dir.includes('out') ? 'out' : 'in';
  const from = e164(obj.from);
  const toArr = Array.isArray(obj.to) ? obj.to : [obj.to];
  const to = e164(toArr[0]);
  const contact = direction === 'in' ? from : to;
  return {
    quo_id: obj.id || null, direction, contact, from, to,
    status: callStatus(obj),
    duration: Number(obj.duration || obj.completedDuration || 0) || 0,
    recording_url: obj.recordingUrl || obj.recording_url || null,
    voicemail_url: obj.voicemailUrl || obj.voicemail_url || null,
    at: obj.createdAt || obj.answeredAt || obj.completedAt || nowISO(),
  };
}

async function upsertMessage(m) {
  if (m.quo_id) { const ex = await findWhere('comm_messages', 'quo_id', m.quo_id); if (ex[0]) return update('comm_messages', ex[0].id, { status: m.status }); }
  return create('comm_messages', uuid(), { ...m, read: m.direction === 'out', created_at: nowISO() });
}
async function upsertCall(c) {
  if (c.quo_id) { const ex = await findWhere('comm_calls', 'quo_id', c.quo_id); if (ex[0]) return update('comm_calls', ex[0].id, { status: c.status, duration: c.duration, recording_url: c.recording_url, voicemail_url: c.voicemail_url }); }
  return create('comm_calls', uuid(), { ...c, created_at: nowISO() });
}

/* ============ WEBHOOK (no auth — guarded by shared key) ============ */
// POST /api/comms/quo-webhook?key=QUO_WEBHOOK_KEY
// Register in Quo for: message.received, message.delivered, call.completed,
// call.recording.completed. Always answers 200 so Quo doesn't retry-storm.
router.post('/quo-webhook', async (req, res) => {
  const key = process.env.QUO_WEBHOOK_KEY;
  if (!key) return res.status(404).json({ error: 'Not found' });
  if ((req.query.key || req.headers['x-quo-key'] || '') !== key) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const body = req.body || {};
    const type = String(body.type || body.event || '').toLowerCase();
    const obj = body.data?.object || body.data || body.object || body;
    if (type.startsWith('message')) {
      const m = normMessage(obj, type);
      if (m.contact) {
        const match = await matchCustomer(m.contact);
        await upsertMessage({ ...m, ...match });
        if (m.direction === 'in') {
          try { await notify({ type: 'message', title: `New text — ${match.customer_name || m.contact}`, body: (m.body || '').slice(0, 120), link: '/messages', roles: ['admin', 'office'] }); } catch {}
        }
      }
    } else if (type.startsWith('call')) {
      const c = normCall(obj);
      if (c.contact) {
        const match = await matchCustomer(c.contact);
        await upsertCall({ ...c, ...match });
        if (c.direction === 'in' && c.status === 'missed') {
          try { await notify({ type: 'call', title: `Missed call — ${match.customer_name || c.contact}`, link: '/messages', roles: ['admin', 'office'] }); } catch {}
        }
      }
    }
    res.json({ ok: true });
  } catch (e) { console.error('[comms] webhook:', e.message); res.json({ ok: true }); }
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
