const express = require('express');
const { query } = require('../config/db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

function sanitizeText(value, maxLen = 500) {
  return String(value ?? '').replace(/[<>]/g, '').trim().slice(0, maxLen);
}

router.post('/api/chat', authRequired, async (req, res) => {
  const body = sanitizeText(req.body.message || '', 500);

  if (!body) {
    return res.status(400).json({ error: '消息不能为空' });
  }

  await query('INSERT INTO messages(user_id, kind, body) VALUES($1, $2, $3)', [req.user.id, 'text', body]);
  return res.status(201).json({ ok: true });
});

router.get('/api/chat', async (req, res) => {
  const result = await query(`
    SELECT m.id, m.body, m.created_at, u.username
    FROM messages m
    JOIN users u ON u.id = m.user_id
    WHERE m.deleted = false
    ORDER BY m.created_at DESC
    LIMIT 50
  `);

  return res.json(result.rows.reverse());
});

module.exports = router;
