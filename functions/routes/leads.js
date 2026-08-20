// Sales pipeline — leads the office/admin call and try to convert into customers.
// Admin + office only.
const express = require('express');
const { v4: uuid } = require('uuid');
const { list, getById, create, update, remove } = require('../lib/db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireRole('admin', 'office'));

const STAGES = ['new', 'contacted', 'quoted', 'won', 'lost'];
const clampStage = (s) => (STAGES.includes(s) ? s : 'new');

// GET /api/leads — all leads (newest first).
router.get('/', async (req, res) => {
  try {
    const leads = await list('leads');
    leads.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    res.json(leads);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not load leads' }); }
});

// POST /api/leads — add a lead.
router.post('/', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name || !b.name.trim()) return res.status(400).json({ error: 'A name is required' });
    const lead = await create('leads', uuid(), {
      name: b.name.trim(),
      phone: b.phone ? String(b.phone).trim() : null,
      email: b.email ? String(b.email).trim() : null,
      address: b.address ? String(b.address).trim() : null,
      source: b.source ? String(b.source).trim() : 'Manual',
      notes: b.notes ? String(b.notes).trim() : null,
      value: b.value != null && b.value !== '' ? Number(b.value) : null,
      stage: clampStage(b.stage),
      next_follow_up: b.next_follow_up || null,
      last_contacted: null,
      call_log: [],
      customer_id: null,
      created_by: req.user.name,
      created_at: new Date().toISOString(),
    });
    res.status(201).json(lead);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not add lead' }); }
});

// PUT /api/leads/:id — edit fields or move stage.
router.put('/:id', async (req, res) => {
  try {
    const lead = await getById('leads', req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const b = req.body || {};
    const patch = {};
    for (const f of ['name', 'phone', 'email', 'address', 'source', 'notes', 'next_follow_up']) {
      if (b[f] !== undefined) patch[f] = b[f] === '' ? null : b[f];
    }
    if (b.value !== undefined) patch.value = b.value === '' || b.value == null ? null : Number(b.value);
    if (b.stage !== undefined) patch.stage = clampStage(b.stage);
    const saved = await update('leads', req.params.id, patch);
    res.json(saved);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not update lead' }); }
});

// POST /api/leads/:id/log — record a call attempt/outcome.
router.post('/:id/log', async (req, res) => {
  try {
    const lead = await getById('leads', req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const b = req.body || {};
    const entry = {
      at: new Date().toISOString(),
      by: req.user.name,
      outcome: (b.outcome || 'called').toString().slice(0, 40),
      note: b.note ? String(b.note).trim().slice(0, 1000) : null,
    };
    const call_log = [...(lead.call_log || []), entry];
    const patch = { call_log, last_contacted: entry.at };
    if (b.next_follow_up !== undefined) patch.next_follow_up = b.next_follow_up || null;
    if (b.stage) patch.stage = clampStage(b.stage);
    else if (lead.stage === 'new') patch.stage = 'contacted'; // first touch advances New → Contacted
    const saved = await update('leads', req.params.id, patch);
    res.json(saved);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not log the call' }); }
});

// POST /api/leads/:id/convert — turn a won lead into a customer (+ optional pending job).
router.post('/:id/convert', async (req, res) => {
  try {
    const lead = await getById('leads', req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (lead.customer_id) return res.status(400).json({ error: 'This lead is already converted.' });

    const customer = await create('customers', uuid(), {
      name: lead.name, email: lead.email || null, phone: lead.phone || null,
      address: lead.address || null, city: null, state: null, zip: null,
      notes: `Converted from a sales lead (source: ${lead.source || 'Manual'}).`,
    });

    let job = null;
    if (req.body?.createJob) {
      job = await create('jobs', uuid(), {
        title: `New work for ${lead.name}`.slice(0, 140),
        description: lead.notes || 'Created from a converted lead.',
        customer_id: customer.id, technician_id: null, status: 'pending', priority: 'normal',
        job_type: 'Lead', scheduled_date: null, scheduled_time: null, booking_window: null,
        completed_date: null, address: lead.address || null, source: 'lead',
        notes: 'Converted from the sales pipeline. Schedule with the customer.',
      });
    }

    const saved = await update('leads', req.params.id, { stage: 'won', customer_id: customer.id });
    res.json({ ok: true, lead: saved, customerId: customer.id, jobId: job?.id || null });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not convert the lead' }); }
});

// POST /api/leads/import — bulk-add leads parsed from an uploaded spreadsheet.
// Body: { leads: [{ name, phone, email, address, source, notes, value }, ...] }
router.post('/import', async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.leads) ? req.body.leads : [];
    if (!rows.length) return res.status(400).json({ error: 'No rows found to import' });
    let added = 0, skipped = 0;
    for (const r of rows.slice(0, 5000)) {
      const name = (r?.name || '').toString().trim();
      if (!name) { skipped++; continue; }
      await create('leads', uuid(), {
        name,
        phone: r.phone ? String(r.phone).trim() : null,
        email: r.email ? String(r.email).trim() : null,
        address: r.address ? String(r.address).trim() : null,
        source: r.source ? String(r.source).trim() : 'Import',
        notes: r.notes ? String(r.notes).trim() : null,
        value: r.value != null && r.value !== '' ? (Number(r.value) || null) : null,
        stage: 'new', next_follow_up: null, last_contacted: null, call_log: [],
        customer_id: null, created_by: req.user.name, created_at: new Date().toISOString(),
      });
      added++;
    }
    res.json({ ok: true, added, skipped });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not import leads' }); }
});

// DELETE /api/leads/:id
router.delete('/:id', async (req, res) => {
  try {
    await remove('leads', req.params.id);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not delete lead' }); }
});

module.exports = router;
