const express = require('express');
const { v4: uuid } = require('uuid');
const { getById, list, findWhere, create, update } = require('../lib/db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, requireRole('admin', 'office'));

// List escalated chats (anything that reached a human), newest activity first.
router.get('/', async (req, res) => {
  const chats = (await list('support_chats'))
    .filter(c => c.status && c.status !== 'bot')
    .sort((a, b) => (b.last_message_at || '').localeCompare(a.last_message_at || ''));
  res.json(chats);
});

// One chat with its full message thread.
router.get('/:id', async (req, res) => {
  const chat = await getById('support_chats', req.params.id);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  const messages = (await findWhere('support_messages', 'chat_id', req.params.id))
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  res.json({ ...chat, messages });
});

// Agent replies — assigns the chat and marks it live.
router.post('/:id/messages', async (req, res) => {
  const chat = await getById('support_chats', req.params.id);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  const text = (req.body?.text || '').toString().trim();
  if (!text) return res.status(400).json({ error: 'Message is required' });
  const now = new Date().toISOString();
  const saved = await create('support_messages', uuid(), {
    chat_id: chat.id, sender: 'agent', sender_name: req.user.name, text, created_at: now,
  });
  await update('support_chats', chat.id, {
    status: chat.status === 'closed' ? 'closed' : 'live',
    assigned_to: chat.assigned_to || req.user.name,
    updated_at: now, last_message_at: now, last_message_preview: text.slice(0, 120),
  });
  res.status(201).json(saved);
});

// Close a chat.
router.post('/:id/close', async (req, res) => {
  const chat = await getById('support_chats', req.params.id);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  const now = new Date().toISOString();
  await update('support_chats', chat.id, { status: 'closed', updated_at: now, last_message_at: now });
  await create('support_messages', uuid(), {
    chat_id: chat.id, sender: 'system', sender_name: 'System',
    text: `${req.user.name} closed the chat.`, created_at: now,
  });
  res.json({ ok: true });
});

module.exports = router;
