const express = require('express');
const { query } = require('../config/db');
const { authRequired, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/api/admin/stats', authRequired, requireRole('admin', 'owner'), async (req, res) => {
  const [users, products, orders] = await Promise.all([
    query('SELECT COUNT(*)::int AS n FROM users'),
    query('SELECT COUNT(*)::int AS n FROM products'),
    query('SELECT COUNT(*)::int AS n FROM orders'),
  ]);

  return res.json({
    users: users.rows[0].n,
    products: products.rows[0].n,
    orders: orders.rows[0].n,
  });
});

router.get('/api/admin/users', authRequired, requireRole('admin', 'owner'), async (req, res) => {
  const result = await query('SELECT id, username, role, balance, merchant, deposit, created_at FROM users ORDER BY id DESC LIMIT 100');
  return res.json(result.rows);
});

module.exports = router;
