const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 10000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 把 JSON 的接收限制调大，因为图片转成文字后会很大
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// 用户资料（真实读取）
app.get('/api/user', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = 1');
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 用户资料（真实保存图片或认证）
app.put('/api/user', async (req, res) => {
  try {
    const { username, avatar_url, is_kyc } = req.body;
    const result = await pool.query(
      'UPDATE users SET username = $1, avatar_url = $2, is_kyc = $3 WHERE id = 1 RETURNING *',
      [username, avatar_url, is_kyc]
    );
    res.json({ success: true, user: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 动态
app.get('/api/posts', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM posts ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/posts', async (req, res) => {
  try {
    const { content } = req.body;
    const result = await pool.query('INSERT INTO posts (content) VALUES ($1) RETURNING *', [content]);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 挂单
app.get('/api/listings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM listings ORDER BY id DESC');
    const formatData = result.rows.map(row => ({
      id: row.id, name: row.name, verified: row.verified, trades: row.trades,
      rate: row.rate, price: Number(row.price), min: Number(row.min_limit), 
      max: Number(row.max_limit), pays: row.pays || []
    }));
    res.json(formatData); 
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/listings', async (req, res) => {
  try {
    const { name, price, min, max, pays } = req.body;
    const pgArrayFormat = `{${(pays || []).map(p => `"${p}"`).join(',')}}`;
    const result = await pool.query(
      `INSERT INTO listings (name, verified, trades, rate, price, min_limit, max_limit, pays) 
       VALUES ($1, true, 0, 100, $2, $3, $4, $5) RETURNING *`,
      [name, Number(price), Number(min), Number(max), pgArrayFormat] 
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => { console.log('Server running'); });
