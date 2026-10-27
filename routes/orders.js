const express = require('express');
const { query } = require('../config/db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.post('/api/orders', authRequired, async (req, res) => {
  const productId = Number(req.body.product_id || 0);
  const qty = Number(req.body.qty || 1);

  if (!Number.isInteger(qty) || qty < 1 || qty > 1000) {
    return res.status(400).json({ error: '购买数量不合法' });
  }

  const productResult = await query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [productId]);
  const product = productResult.rows[0];
  if (!product) return res.status(404).json({ error: '商品不存在' });
  if (!product.active) return res.status(400).json({ error: '商品已下架' });
  if (product.seller_id === req.user.id) return res.status(400).json({ error: '不能购买自己的商品' });
  if (product.stock < qty) return res.status(400).json({ error: '库存不足' });

  const buyer = await query('SELECT balance FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
  if (!buyer.rows[0]) return res.status(401).json({ error: '用户不存在' });

  const total = Number(product.price) * qty;
  if (Number(buyer.rows[0].balance) < total) {
    return res.status(400).json({ error: '余额不足' });
  }

  await query('UPDATE users SET balance = balance - $1 WHERE id = $2', [total, req.user.id]);
  await query('UPDATE products SET stock = stock - $1, sold = sold + $1 WHERE id = $2', [qty, product.id]);

  const result = await query(`
    INSERT INTO orders(product_id, title, buyer_id, seller_id, qty, amount, status)
    VALUES($1, $2, $3, $4, $5, $6, 'paid')
    RETURNING id
  `, [product.id, product.title, req.user.id, product.seller_id, qty, total]);

  await query('INSERT INTO ledger(user_id, amount, type, note, order_id) VALUES($1, -$2, $3, $4, $5)', [req.user.id, total, 'purchase', `购买：${product.title}`, result.rows[0].id]);
  await query('UPDATE users SET balance = balance + $1 WHERE id = $2', [total, product.seller_id]);
  await query('INSERT INTO ledger(user_id, amount, type, note, order_id) VALUES($1, $2, $3, $4, $5)', [product.seller_id, total, 'sale', `售出：${product.title}`, result.rows[0].id]);

  return res.status(201).json({ id: result.rows[0].id, amount: total });
});

router.get('/api/orders', authRequired, async (req, res) => {
  const result = await query(`
    SELECT o.*, p.title AS product_title
    FROM orders o
    JOIN products p ON p.id = o.product_id
    WHERE o.buyer_id = $1 OR o.seller_id = $1
    ORDER BY o.created_at DESC
  `, [req.user.id]);

  return res.json(result.rows);
});

router.post('/api/orders/:id/confirm', authRequired, async (req, res) => {
  const id = Number(req.params.id || 0);
  const order = await query('SELECT * FROM orders WHERE id = $1 AND buyer_id = $2 AND status = $3 FOR UPDATE', [id, req.user.id, 'paid']);
  if (!order.rows[0]) return res.status(400).json({ error: '订单状态不正确' });

  await query('UPDATE orders SET status = $1, delivered_at = NOW() WHERE id = $2', ['done', id]);
  return res.json({ ok: true });
});

router.post('/api/orders/:id/deliver', authRequired, async (req, res) => {
  const id = Number(req.params.id || 0);
  const secret = String(req.body.secret || '').trim().slice(0, 2000);

  if (!secret) return res.status(400).json({ error: '请填写交付内容' });

  const order = await query('SELECT * FROM orders WHERE id = $1 AND seller_id = $2 AND status = $3 FOR UPDATE', [id, req.user.id, 'paid']);
  if (!order.rows[0]) return res.status(400).json({ error: '订单状态不正确' });

  await query('UPDATE orders SET status = $1, secret = $2, delivered_at = NOW() WHERE id = $3', ['delivered', secret, id]);
  return res.json({ ok: true });
});

module.exports = router;
