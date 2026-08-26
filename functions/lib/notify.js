// Writes an in-app notification for staff AND sends a real push (APNs) to their
// registered devices. Fire-and-forget — never throws.
const { v4: uuid } = require('uuid');
const { create, list } = require('./db');
const { sendPush } = require('./push');

async function notify({ type, title, body, link = null, meta = null, roles = ['admin', 'office'] }) {
  // 1) In-app notification (bell center).
  try {
    await create('notifications', uuid(), {
      type: type || 'info',
      title: String(title || '').slice(0, 140),
      body: body != null ? String(body).slice(0, 300) : null,
      link, meta,
      for_roles: roles,
      read_by: [],
      created_at: new Date().toISOString(),
    });
  } catch (e) { console.error('[notify] in-app failed:', e.message); }

  // 2) Push notification to the devices of every user in these roles.
  try {
    const users = (await list('users')).filter(u => roles.includes(u.role));
    const userIds = new Set(users.map(u => u.id));
    const tokens = (await list('device_tokens'))
      .filter(d => userIds.has(d.user_id) && d.token)
      .map(d => d.token);
    if (tokens.length) await sendPush([...new Set(tokens)], { title, body, link });
  } catch (e) { console.error('[notify] push failed:', e.message); }
}

module.exports = { notify };
