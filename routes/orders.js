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

  const buyer = await query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
  if (!buyer.rows[0]) return res.status(401).json({ error: '用户不存在' });

  const total = Number(product.price) * qty;
  const result = await query(
    'INSERT INTO orders(product_id, buyer_id, seller_id, qty, amount, status) VALUES($1, $2, $3, $4, $5, $6) RETURNING id',
    [product.id, req.user.id, product.seller_id, qty, total, 'paid']
  );

  await query('UPDATE products SET stock = stock - $1 WHERE id = $2', [qty, product.id]);
  return res.status(201).json({ id: result.rows[0].id, amount: total });
});

router.get('/api/orders', authRequired, async (req, res) => {
  const result = await query(
    `SELECT o.*, p.title AS product_title
     FROM orders o
     JOIN products p ON p.id = o.product_id
     WHERE o.buyer_id = $1 OR o.seller_id = $1
     ORDER BY o.created_at DESC`,
    [req.user.id]
  );

  return res.json(result.rows);
});

module.exports = router;
