const express = require('express');
const { v4: uuid } = require('uuid');
const { list, getById, create, update, remove } = require('../lib/db');
const { authMiddleware, requireStaff } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireStaff);

// GET /api/tasks — all office to-do tasks (frontend filters by assignee/status).
router.get('/', async (req, res) => {
  const tasks = (await list('office_tasks')).sort((a, b) => {
    // Open first, then by due date / creation.
    if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1;
    return (a.due_date || a.created_at || '').localeCompare(b.due_date || b.created_at || '');
  });
  res.json(tasks);
});

router.post('/', async (req, res) => {
  const { title, notes, assigned_to, customer_id, job_id, due_date, priority } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'A task description is required' });
  const assignee = assigned_to ? await getById('users', assigned_to) : null;
  const customer = customer_id ? await getById('customers', customer_id) : null;
  const saved = await create('office_tasks', uuid(), {
    title: title.trim(), notes: (notes || '').trim() || null,
    assigned_to: assigned_to || null, assigned_name: assignee?.name || null,
    customer_id: customer_id || null, customer_name: customer?.name || null,
    job_id: job_id || null, due_date: due_date || null, priority: priority || 'normal',
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
  if (b.priority !== undefined) patch.priority = b.priority || 'normal';
  if (b.assigned_to !== undefined) {
    const a = b.assigned_to ? await getById('users', b.assigned_to) : null;
    patch.assigned_to = b.assigned_to || null; patch.assigned_name = a?.name || null;
  }
  if (b.status !== undefined) {
    patch.status = b.status === 'done' ? 'done' : 'open';
    patch.completed_at = patch.status === 'done' ? new Date().toISOString() : null;
  }
  res.json(await update('office_tasks', req.params.id, patch));
});

router.delete('/:id', async (req, res) => {
  await remove('office_tasks', req.params.id);
  res.json({ success: true });
});

module.exports = router;
