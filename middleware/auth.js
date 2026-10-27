const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const { query } = require('../config/db');

function authRequired(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!token) {
      return res.status(401).json({ error: '请先登录' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    query('SELECT id, username, role, balance, merchant, deposit, contact FROM users WHERE id = $1', [decoded.id])
      .then((result) => {
        if (!result.rows[0]) {
          return res.status(401).json({ error: '用户不存在或已被删除' });
        }

        req.user = result.rows[0];
        next();
      })
      .catch((error) => {
        console.error('auth error:', error);
        return res.status(401).json({ error: '登录已过期，请重新登录' });
      });
  } catch (error) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: '无权限' });
    }
    next();
  };
}

module.exports = { authRequired, requireRole };
