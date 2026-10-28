const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 10000;

// 连接 Neon 数据库
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 允许解析 JSON 请求体
app.use(express.json());
// 托管静态文件
app.use(express.static(__dirname));

// 接口 1：获取所有挂单
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
    res.status(500).json({ error: '数据库查询失败' });
  }
});

// 接口 2：发布新挂单
app.post('/api/listings', async (req, res) => {
  try {
    const { name, price, min, max, pays } = req.body;
    const result = await pool.query(
      `INSERT INTO listings (name, verified, trades, rate, price, min_limit, max_limit, pays) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [name, true, 0, 100, price, min, max, pays] 
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('发布挂单报错:', err);
    res.status(500).json({ error: '发布失败' });
  }
});

// 接口 3：提交订单
app.post('/api/orders', async (req, res) => {
  try {
    const { listing_id, buyer_name, amount_cny, amount_usdt } = req.body;
    const result = await pool.query(
      `INSERT INTO orders (listing_id, buyer_name, amount_cny, amount_usdt) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [listing_id, buyer_name, amount_cny, amount_usdt]
    );
    res.json({ success: true, order: result.rows[0] });
  } catch (err) {
    console.error('下单报错:', err);
    res.status(500).json({ error: '下单失败' });
  }
});

app.listen(PORT, () => {
  console.log('Server is running on port ' + PORT);
});
