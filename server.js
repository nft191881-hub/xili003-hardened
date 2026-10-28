const express = require('express');
const http = require('http');
const path = require('path');
const { Pool } = require('pg');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 10000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

async function initChatTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chats (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        avatar TEXT,
        type TEXT DEFAULT 'single',
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE,
        sender_id TEXT DEFAULT '1',
        sender_name TEXT DEFAULT 'user',
        text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    const c = await pool.query('SELECT COUNT(*) FROM chats');
    if (parseInt(c.rows[0].count) === 0) {
      await pool.query(`INSERT INTO chats (name, avatar, type) VALUES 
        ('公共大厅', 'https://api.dicebear.com/7.x/bottts/svg?seed=hall', 'group'),
        ('系统通知', 'https://api.dicebear.com/7.x/bottts/svg?seed=sys', 'system')
      `);
    }
  } catch (e) { console.error(e.message); }
}
initChatTables();

app.get('/api/user', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = 1');
    res.json(result.rows[0] || { username: 'guest' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
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

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws/chat' });

wss.on('connection', (ws) => {
  ws.myUserId = null;
  ws.on('message', async (raw) => {
    try {
      const data = JSON.parse(raw);
      if (data.type === 'get_chats') {
        const chats = await pool.query(`
          SELECT c.*, (SELECT text FROM messages WHERE chat_id=c.id ORDER BY id DESC LIMIT 1) as last_msg
          FROM chats c ORDER BY c.id DESC
        `);
        const list = chats.rows.map(r => ({
          id: r.id, name: r.name, avatar: r.avatar, lastMsg: r.last_msg || '点击进入聊天'
        }));
        ws.send(JSON.stringify({ type: 'chats', list }));
      }
      if (data.type === 'open_chat') {
        const msgs = await pool.query('SELECT * FROM messages WHERE chat_id=$1 ORDER BY id ASC LIMIT 100', [data.chatId]);
        const formatted = msgs.rows.map(m => ({
          id: m.id, text: m.text, isMe: m.sender_id === ws.myUserId, sender: m.sender_name
        }));
        ws.send(JSON.stringify({ type: 'chat_history', chatId: data.chatId, messages: formatted }));
      }
      if (data.type === 'send') {
        ws.myUserId = data.userId;
        const ins = await pool.query('INSERT INTO messages (chat_id, text, sender_id, sender_name) VALUES ($1,$2,$3,$4) RETURNING *', [data.chatId, data.text, data.userId, data.userName]);
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            const isMe = client.myUserId && client.myUserId === data.userId;
            client.send(JSON.stringify({
              type: 'new_message', chatId: data.chatId,
              message: { id: ins.rows[0].id, text: data.text, isMe: isMe, sender: data.userName }
            }));
          }
        });
      }
    } catch (e) {}
  });
});

server.listen(PORT, () => { console.log('WS ready'); });
