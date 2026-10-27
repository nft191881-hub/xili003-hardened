const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { JWT_SECRET } = require('../config/env');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

function sanitizeUsername(value) {
  return String(value ?? '').trim().replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
}

function signUser(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
}

router.post('/api/register', async (req, res) => {
  const username = sanitizeUsername(req.body.username);
  const password = String(req.body.password || '').trim();

  if (username.length < 2 || username.length > 20) {
    return res.status(400).json({ error: '用户名需要 2 到 20 位' });
  }

  if (!/^[A-Za-z0-9]+$/.test(username)) {
    return res.status(400).json({ error: '用户名只能使用字母和数字' });
  }

  if (password.length < 6 || password.length > 64) {
    return res.status(400).json({ error: '密码需要 6 到 64 位' });
  }

  try {
    const exists = await query('SELECT 1 FROM users WHERE lower(username) = lower($1)', [username]);
    if (exists.rows[0]) {
      return res.status(409).json({ error: '用户名已被使用' });
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await query(
      'INSERT INTO users(username, password_hash, role) VALUES($1, $2, $3) RETURNING id, username, role',
      [username, hash, 'user']
    );

    const user = result.rows[0];
    return res.status(201).json({ token: signUser(user), user });
  } catch (error) {
    console.error('register error:', error);
    return res.status(500).json({ error: '注册失败' });
  }
});

router.post('/api/login', async (req, res) => {
  const username = sanitizeUsername(req.body.username);
  const password = String(req.body.password || '');

  try {
    const result = await query('SELECT * FROM users WHERE lower(username)=lower($1)', [username]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: '用户名或密码不正确' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: '用户名或密码不正确' });
    }

    return res.json({
      token: signUser(user),
      user: { id: user.id, username: user.username, role: user.role }
    });
  } catch (error) {
    console.error('login error:', error);
    return res.status(500).json({ error: '登录失败' });
  }
});

router.get('/api/me', authRequired, async (req, res) => {
  return res.json({
    id: req.user.id,
    username: req.user.username,
    role: req.user.role,
  });
});

module.exports = router;
