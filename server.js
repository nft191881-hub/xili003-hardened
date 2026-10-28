const express = require('express');
const http = require('http');
const { Pool } = require('pg');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 10000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// ================= 自动建表与初始虚拟数据 =================
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(50) NOT NULL,
        avatar_url TEXT DEFAULT 'https://api.dicebear.com/7.x/bottts/svg?seed=X',
        is_kyc BOOLEAN DEFAULT false
      );
      CREATE TABLE IF NOT EXISTS listings (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id),
        name VARCHAR(50),
        verified BOOLEAN DEFAULT true,
        trades INT DEFAULT 100,
        rate INT DEFAULT 100,
        price NUMERIC,
        min_limit NUMERIC,
        max_limit NUMERIC,
        pays TEXT[]
      );
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id),
        content TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        sender_id INT REFERENCES users(id),
        receiver_id INT REFERENCES users(id),
        content TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 塞入虚拟商家
    await pool.query(`INSERT INTO users (username, password) VALUES ('系统商家A', '123'), ('系统商家B', '123') ON CONFLICT DO NOTHING;`);
    const ls = await pool.query('SELECT COUNT(*) FROM listings');
    if (parseInt(ls.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO listings (user_id, name, verified, trades, rate, price, min_limit, max_limit, pays) VALUES
        (1, 'sp pldmnd', true, 45, 100, 6.7, 5000, 15000, ARRAY['微信', '银行转账']),
        (2, 'lakesxchange', false, 12, 95, 7.05, 500, 3000, ARRAY['支付宝']),
        (1, 'CryptoKing', true, 890, 99, 6.85, 100, 50000, ARRAY['银行卡', '信用卡']);
      `);
    }
    // 塞入虚拟动态
    const ps = await pool.query('SELECT COUNT(*) FROM posts');
    if (parseInt(ps.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO posts (user_id, content) VALUES 
        (1, '今天收了一点USDT，有需要的老板联系我。支持担保交易！'),
        (2, '出U，支持支付宝微信。');
      `);
    }
  } catch (e) { console.error('DB Init Error:', e.message); }
}
initDB();

// ================= REST API =================
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const r = await pool.query('INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username, avatar_url, is_kyc', [username, password]);
    res.json({ success: true, user: r.rows[0] });
  } catch (err) { res.status(400).json({ error: '用户名已存在' }); }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const r = await pool.query('SELECT id, username, avatar_url, is_kyc FROM users WHERE username = $1 AND password = $2', [username, password]);
  if (r.rows.length > 0) res.json({ success: true, user: r.rows[0] });
  else res.status(401).json({ error: '账号或密码错误' });
});

app.put('/api/user/:id', async (req, res) => {
  const { avatar_url, is_kyc } = req.body;
  const r = await pool.query('UPDATE users SET avatar_url = $1, is_kyc = $2 WHERE id = $3 RETURNING *', [avatar_url, is_kyc, req.params.id]);
  res.json({ success: true, user: r.rows[0] });
});

app.get('/api/users/:id', async (req, res) => {
  const r = await pool.query('SELECT id, username, avatar_url FROM users WHERE id != $1', [req.params.id]);
  res.json(r.rows);
});

app.get('/api/listings', async (req, res) => { const r = await pool.query('SELECT * FROM listings ORDER BY id DESC'); res.json(r.rows); });
app.post('/api/listings', async (req, res) => {
  const { user_id, name, price, min, max, pays } = req.body;
  const pgArr = `{${(pays || []).map(p => `"${p}"`).join(',')}}`;
  await pool.query('INSERT INTO listings (user_id, name, verified, trades, rate, price, min_limit, max_limit, pays) VALUES ($1, $2, true, 0, 100, $3, $4, $5, $6)', [user_id, name, price, min, max, pgArr]);
  res.json({ success: true });
});

app.get('/api/posts', async (req, res) => { const r = await pool.query('SELECT p.*, u.username, u.avatar_url FROM posts p JOIN users u ON p.user_id = u.id ORDER BY p.id DESC'); res.json(r.rows); });
app.post('/api/posts', async (req, res) => { const { user_id, content } = req.body; await pool.query('INSERT INTO posts (user_id, content) VALUES ($1, $2)', [user_id, content]); res.json({ success: true }); });

app.get('/api/messages/:myId/:otherId', async (req, res) => {
  const { myId, otherId } = req.params;
  const r = await pool.query(`SELECT * FROM messages WHERE (sender_id=$1 AND receiver_id=$2) OR (sender_id=$2 AND receiver_id=$1) ORDER BY created_at ASC`, [myId, otherId]);
  res.json(r.rows);
});

// ================= WebSocket 实时秒达 =================
const wss = new WebSocket.Server({ server, path: '/ws' });
const clients = new Map();

wss.on('connection', (ws) => {
  ws.on('message', async (raw) => {
    try {
      const data = JSON.parse(raw);
      
      if (data.type === 'auth') {
        ws.userId = data.userId;
        clients.set(data.userId.toString(), ws);
      }

      if (data.type === 'send') {
        const { sender_id, receiver_id, content } = data;
        const r = await pool.query('INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1, $2, $3) RETURNING *', [sender_id, receiver_id, content]);
        const msg = r.rows[0];

        // A 发给 B，服务器把消息推给 B
        const target = clients.get(receiver_id.toString());
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify({ type: 'receive', message: msg }));
        }
        // 同时回传给 A，让 A 的界面立刻显示
        ws.send(JSON.stringify({ type: 'sent', message: msg }));
      }
    } catch (e) { }
  });

  ws.on('close', () => {
    if (ws.userId) clients.delete(ws.userId.toString());
  });
});

server.listen(PORT, () => console.log('Server running'));
