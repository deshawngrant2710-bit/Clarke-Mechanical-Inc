// Leads-caller points: self-logged activities + admin oversight + leaderboard.
const express = require('express');
const { list, getById, update, remove, nameMap } = require('../lib/db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const settings = require('../lib/settings');
const { POINT_TYPES, pointsFor, awardPoints } = require('../lib/points');

const router = express.Router();
router.use(authMiddleware);

const isManager = (req) => ['admin', 'office'].includes(req.user?.role);
const isAdmin = (req) => req.user?.role === 'admin';

async function dollarValue() {
  const v = Number(await settings.get('points_dollar_value'));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

// GET /api/points/catalog — the point types + current $/point (for the UI).
router.get('/catalog', async (req, res) => {
  res.json({ types: POINT_TYPES, dollar_value: await dollarValue() });
});

// POST /api/points — log an activity. Leads agents log for themselves; admin/office
// may log on behalf of any agent via agent_id.
router.post('/', requireRole('admin', 'office', 'leads'), async (req, res) => {
  const b = req.body || {};
  if (!POINT_TYPES[b.type]) return res.status(400).json({ error: 'Pick a valid activity.' });
  const users = await nameMap('users');
  let agentId = req.user.id;
  if (isManager(req) && b.agent_id) agentId = b.agent_id;
  const customerName = b.customer_id ? (await nameMap('customers'))[b.customer_id] || null : (b.customer_name || null);
  try {
    const event = await awardPoints({
      agentId, agentName: users[agentId] || req.user.name,
      type: b.type, customerId: b.customer_id || null, customerName,
      note: b.note || null, source: 'manual', createdBy: req.user.name,
    });
    res.status(201).json(event);
  } catch (e) { res.status(400).json({ error: e.message || 'Could not log the activity.' }); }
});

// GET /api/points — events (agent sees only their own; managers see all/filterable).
router.get('/', async (req, res) => {
  const all = await list('point_events');
  let rows = all;
  if (!isManager(req)) rows = rows.filter(e => e.agent_id === req.user.id);
  else if (req.query.agent) rows = rows.filter(e => e.agent_id === req.query.agent);
  rows.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  res.json(rows.slice(0, limit));
});

// GET /api/points/summary — totals per agent (+ this agent's own breakdown).
router.get('/summary', async (req, res) => {
  const [all, users] = await Promise.all([list('point_events'), nameMap('users')]);
  const rate = await dollarValue();
  const mine = !isManager(req);
  const events = mine ? all.filter(e => e.agent_id === req.user.id) : all;

  const byAgent = {};
  for (const e of events) {
    const id = e.agent_id || 'unknown';
    byAgent[id] = byAgent[id] || { agent_id: id, agent_name: e.agent_name || users[id] || 'Unknown', points: 0, count: 0, by_type: {} };
    byAgent[id].points += Number(e.points) || 0;
    byAgent[id].count += 1;
    byAgent[id].by_type[e.type] = (byAgent[id].by_type[e.type] || 0) + 1;
  }
  const leaderboard = Object.values(byAgent)
    .map(a => ({ ...a, value: rate ? Math.round(a.points * rate * 100) / 100 : null }))
    .sort((a, b) => b.points - a.points);

  res.json({ dollar_value: rate, leaderboard, is_manager: isManager(req), me_id: req.user.id });
});

// PUT /api/points/:id — admin adjust (points / type / note).
router.put('/:id', requireRole('admin'), async (req, res) => {
  const e = await getById('point_events', req.params.id);
  if (!e) return res.status(404).json({ error: 'Entry not found' });
  const patch = {};
  if (req.body.type && POINT_TYPES[req.body.type]) { patch.type = req.body.type; patch.points = pointsFor(req.body.type); }
  if (req.body.points != null && req.body.points !== '') patch.points = Number(req.body.points);
  if (req.body.note !== undefined) patch.note = req.body.note ? String(req.body.note).slice(0, 500) : null;
  const saved = await update('point_events', req.params.id, patch);
  res.json(saved);
});

// DELETE /api/points/:id — admin remove a bogus/duplicate entry.
router.delete('/:id', requireRole('admin'), async (req, res) => {
  await remove('point_events', req.params.id);
  res.json({ success: true });
});

module.exports = router;
