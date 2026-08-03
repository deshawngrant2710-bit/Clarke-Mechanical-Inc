const express = require('express');
const { v4: uuid } = require('uuid');
const { list, getById, create, update, remove } = require('../lib/db');
const { authMiddleware, requireStaff } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireStaff);

// Advance a YYYY-MM-DD date by a recurrence interval.
function advance(dateStr, rec) {
  const base = dateStr || new Date().toISOString().slice(0, 10);
  const d = new Date(base + 'T00:00:00');
  if (rec === 'daily') d.setDate(d.getDate() + 1);
  else if (rec === 'weekly') d.setDate(d.getDate() + 7);
  else if (rec === 'biweekly') d.setDate(d.getDate() + 14);
  else if (rec === 'monthly') d.setMonth(d.getMonth() + 1);
  else return null;
  return d.toISOString().slice(0, 10);
}

// When a recurring task is completed, create the next occurrence.
async function spawnNext(t) {
  const nextDue = advance(t.due_date, t.recurrence);
  if (!nextDue) return;
  await create('office_tasks', uuid(), {
    title: t.title, notes: t.notes,
    assigned_to: t.assigned_to || null, assigned_name: t.assigned_name || null,
    customer_id: t.customer_id || null, customer_name: t.customer_name || null,
    job_id: t.job_id || null, job_title: t.job_title || null,
    invoice_id: t.invoice_id || null, invoice_number: t.invoice_number || null,
    due_date: nextDue, remind_at: null, priority: t.priority || 'normal',
    recurrence: t.recurrence, comments: [],
    status: 'open', created_by: t.created_by || 'Recurring', created_at: new Date().toISOString(), completed_at: null,
  });
}

// GET /api/tasks — all office to-do tasks (frontend filters by assignee/status).
router.get('/', async (req, res) => {
  const tasks = (await list('office_tasks')).sort((a, b) => {
    if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1;
    return (a.due_date || a.created_at || '').localeCompare(b.due_date || b.created_at || '');
  });
  res.json(tasks);
});

router.post('/', async (req, res) => {
  const { title, notes, assigned_to, customer_id, job_id, invoice_id, due_date, remind_at, priority, recurrence } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'A task description is required' });
  const assignee = assigned_to ? await getById('users', assigned_to) : null;
  const customer = customer_id ? await getById('customers', customer_id) : null;
  const job = job_id ? await getById('jobs', job_id) : null;
  const invoice = invoice_id ? await getById('invoices', invoice_id) : null;
  const saved = await create('office_tasks', uuid(), {
    title: title.trim(), notes: (notes || '').trim() || null,
    assigned_to: assigned_to || null, assigned_name: assignee?.name || null,
    customer_id: customer_id || null, customer_name: customer?.name || null,
    job_id: job_id || null, job_title: job?.title || null,
    invoice_id: invoice_id || null, invoice_number: invoice?.invoice_number || null,
    due_date: due_date || null, remind_at: remind_at || null,
    priority: priority || 'normal', recurrence: recurrence || 'none', comments: [],
    status: 'open', created_by: req.user.name, created_at: new Date().toISOString(), completed_at: null,
  });
  res.status(201).json(saved);
});

router.put('/:id', async (req, res) => {
  const existing = await getById('office_tasks', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });
  const patch = {};
  const b = req.body;
  if (b.title !== undefined) patch.title = (b.title || '').trim();
  if (b.notes !== undefined) patch.notes = (b.notes || '').trim() || null;
  if (b.due_date !== undefined) patch.due_date = b.due_date || null;
  if (b.remind_at !== undefined) patch.remind_at = b.remind_at || null;
  if (b.priority !== undefined) patch.priority = b.priority || 'normal';
  if (b.recurrence !== undefined) patch.recurrence = b.recurrence || 'none';
  if (b.assigned_to !== undefined) {
    const a = b.assigned_to ? await getById('users', b.assigned_to) : null;
    patch.assigned_to = b.assigned_to || null; patch.assigned_name = a?.name || null;
  }
  if (b.customer_id !== undefined) {
    const c = b.customer_id ? await getById('customers', b.customer_id) : null;
    patch.customer_id = b.customer_id || null; patch.customer_name = c?.name || null;
  }
  if (b.job_id !== undefined) {
    const j = b.job_id ? await getById('jobs', b.job_id) : null;
    patch.job_id = b.job_id || null; patch.job_title = j?.title || null;
  }
  if (b.invoice_id !== undefined) {
    const iv = b.invoice_id ? await getById('invoices', b.invoice_id) : null;
    patch.invoice_id = b.invoice_id || null; patch.invoice_number = iv?.invoice_number || null;
  }
  if (b.status !== undefined) {
    patch.status = b.status === 'done' ? 'done' : 'open';
    patch.completed_at = patch.status === 'done' ? new Date().toISOString() : null;
  }
  const saved = await update('office_tasks', req.params.id, patch);
  // A recurring task just got completed → queue up the next occurrence.
  if (patch.status === 'done' && existing.status !== 'done' && saved.recurrence && saved.recurrence !== 'none') {
    await spawnNext(saved);
  }
  res.json(saved);
});

// POST /api/tasks/:id/comments — add a comment to a task.
router.post('/:id/comments', async (req, res) => {
  const t = await getById('office_tasks', req.params.id);
  if (!t) return res.status(404).json({ error: 'Task not found' });
  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Comment cannot be empty' });
  const comments = [...(t.comments || []), { id: uuid(), by: req.user.name, text, at: new Date().toISOString() }];
  res.json(await update('office_tasks', req.params.id, { comments }));
});

router.delete('/:id', async (req, res) => {
  await remove('office_tasks', req.params.id);
  res.json({ success: true });
});

module.exports = router;
