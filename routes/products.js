const express = require('express');
const { query } = require('../config/db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

function sanitizeText(value, maxLen = 500) {
  return String(value ?? '').replace(/[<>]/g, '').trim().slice(0, maxLen);
}

router.get('/api/categories', async (req, res) => {
  const result = await query('SELECT id, name, icon FROM categories WHERE enabled = true ORDER BY sort, id');
  return res.json(result.rows);
});

router.get('/api/products', async (req, res) => {
  const categoryId = Number(req.query.category_id || 0);
  const keyword = sanitizeText(req.query.q || '', 40);

  let sql = 'SELECT p.id, p.title, p.description, p.price, p.stock, p.created_at, u.username AS seller_name FROM products p JOIN users u ON u.id = p.seller_id WHERE p.active = true';
  const params = [];

  if (categoryId > 0) {
    params.push(categoryId);
    sql += ` AND p.category_id = $${params.length}`;
  }

  if (keyword) {
    params.push(`%${keyword}%`);
    sql += ` AND p.title ILIKE $${params.length}`;
  }

  sql += ' ORDER BY p.created_at DESC LIMIT 50';

  const result = await query(sql, params);
  return res.json(result.rows);
});

router.get('/api/products/:id', async (req, res) => {
  const id = Number(req.params.id || 0);

  const result = await query(
    'SELECT p.*, u.username AS seller_name FROM products p JOIN users u ON u.id = p.seller_id WHERE p.id = $1',
    [id]
  );

  if (!result.rows[0]) {
    return res.status(404).json({ error: '商品不存在' });
  }

  return res.json(result.rows[0]);
});

router.post('/api/products', authRequired, async (req, res) => {
  const title = sanitizeText(req.body.title || '', 80);
  const description = sanitizeText(req.body.description || '', 2000);
  const price = Number(req.body.price || 0);
  const stock = Number(req.body.stock || 0);
  const categoryId = Number(req.body.category_id || 0);

  if (!title) return res.status(400).json({ error: '请填写商品标题' });
  if (!Number.isFinite(price) || price <= 0 || price > 1_000_000) return res.status(400).json({ error: '价格不合法' });
  if (!Number.isInteger(stock) || stock < 0 || stock > 1_000_000) return res.status(400).json({ error: '库存不合法' });

  const category = await query('SELECT 1 FROM categories WHERE id = $1 AND enabled = true', [categoryId]);
  if (!categoryId || !category.rows[0]) return res.status(400).json({ error: '请选择有效分类' });

  const result = await query(
    'INSERT INTO products(seller_id, category_id, title, description, price, stock) VALUES($1, $2, $3, $4, $5, $6) RETURNING id',
    [req.user.id, categoryId, title, description, price, stock]
  );

  return res.status(201).json({ id: result.rows[0].id });
});

module.exports = router;
