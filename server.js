const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 10000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.json());
app.use(express.static(__dirname));

// 获取挂单
app.get('/api/listings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM listings ORDER BY id DESC');
    const formatData = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      verified: row.verified,
      trades: row.trades,
      rate: row.rate,
      price: Number(row.price),
      min: Number(row.min_limit),
      max: Number(row.max_limit),
      pays: row.pays || []
    }));
    res.json(formatData); 
  } catch (err) {
    console.error('获取挂单报错:', err);
    res.status(500).json({ error: err.message });
  }
});

// 发布挂单（修复了数组格式问题）
app.post('/api/listings', async (req, res) => {
  try {
    const { name, price, min, max, pays } = req.body;
    
    // 强制转换为 PostgreSQL 的 TEXT[] 格式: {"微信","支付宝"}
    const pgArrayFormat = `{${(pays || []).map(p => `"${p}"`).join(',')}}`;

    const result = await pool.query(
      `INSERT INTO listings (name, verified, trades, rate, price, min_limit, max_limit, pays) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [name, true, 0, 100, Number(price), Number(min), Number(max), pgArrayFormat] 
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('发布挂单报错:', err);
    // 把具体错误发给前端，方便排查
    res.status(500).json({ error: err.message });
  }
});

// 下单
app.post('/api/orders', async (req, res) => {
  try {
    const { listing_id, buyer_name, amount_cny, amount_usdt } = req.body;
    const result = await pool.query(
      `INSERT INTO orders (listing_id, buyer_name, amount_cny, amount_usdt) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [listing_id, buyer_name, Number(amount_cny), Number(amount_usdt)]
    );
    res.json({ success: true, order: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log('Server is running on port ' + PORT);
});
