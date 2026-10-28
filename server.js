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

// 1. 获取挂单列表
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
    res.status(500).json({ error: err.message });
  }
});

// 2. 发布新挂单
app.post('/api/listings', async (req, res) => {
  try {
    const { name, price, min, max, pays } = req.body;
    
    // 强制转成数据库认识的数组格式
    const pgArrayFormat = `{${(pays || []).map(p => `"${p}"`).join(',')}}`;

    const result = await pool.query(
      `INSERT INTO listings (name, verified, trades, rate, price, min_limit, max_limit, pays) 
       VALUES ($1, true, 0, 100, $2, $3, $4, $5) RETURNING *`,
      [name, Number(price), Number(min), Number(max), pgArrayFormat] 
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log('Server is running on port ' + PORT);
});
