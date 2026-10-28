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

// --- 自动建聊天表，不存在就建 ---
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
        sender_id INTEGER DEFAULT 1,
        text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    // 如果是空库，塞两条测试聊天
    const c = await pool.query('SELECT COUNT(*) FROM chats');
    if (parseInt(c.rows[0].count) === 0) {
      await pool.query(`INSERT INTO chats (name, avatar, type) VALUES 
        ('系统通知', 'https://api.dicebear.com/7.x/bottts/svg?seed=sys', 'system'),
        ('客服', 'https://api.dicebear.com/7.x/bottts/svg?seed=service', 'single')
      `);
    }
    console.log('Chat tables ready');
  } catch (e) { console.error('init chat err', e.message); }
}
initChatTables();

// 用户资料
app.get('/api/user', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = 1');
    res.json(result.rows[0]);
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

const server = http.createServer(app);

// --- 真 WebSocket ---
const wss = new WebSocket.Server({ server, path: '/ws/chat' });

wss.on('connection', (ws) => {
  console.log('ws client connected');
  
  ws.on('message', async (raw) => {
    try {
      const data = JSON.parse(raw);
      
      if (data.type === 'get_chats') {
        const chats = await pool.query(`
          SELECT c.*, (SELECT text FROM messages WHERE chat_id=c.id ORDER BY id DESC LIMIT 1) as last_msg,
          (SELECT created_at FROM messages WHERE chat_id=c.id ORDER BY id DESC LIMIT 1) as last_time
          FROM chats c ORDER BY c.id DESC
        `);
        const list = chats.rows.map(r => ({
          id: r.id, name: r.name, avatar: r.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${r.name}`,
          lastMsg: r.last_msg || '暂无消息', time: r.last_time ? new Date(r.last_time).toLocaleTimeString() : '', group: '全部', unread: 0
        }));
        ws.send(JSON.stringify({ type: 'chats', list }));
      }

      if (data.type === 'open_chat') {
        const msgs = await pool.query('SELECT * FROM messages WHERE chat_id=$1 ORDER BY id ASC', [data.chatId]);
        const formatted = msgs.rows.map(m => ({
          id: m.id, text: m.text, isMe: m.sender_id === 1,
          time: new Date(m.created_at).toLocaleTimeString()
        }));
        ws.send(JSON.stringify({ type: 'chat_history', chatId: data.chatId, messages: formatted }));
      }

      if (data.type === 'send') {
        const ins = await pool.query('INSERT INTO messages (chat_id, text, sender_id) VALUES ($1,$2,1) RETURNING *', [data.chatId, data.text]);
        const msgRow = ins.rows[0];
        const payload = {
          type: 'new_message',
          chatId: data.chatId,
          message: { id: msgRow.id, text: msgRow.text, isMe: true, time: new Date(msgRow.created_at).toLocaleTimeString() }
        };
        // 广播给所有人，你可以改成只发给同chat的
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            // 给发送者 isMe=true，给别人 false
            if (client === ws) client.send(JSON.stringify(payload));
            else client.send(JSON.stringify({ ...payload, message: { ...payload.message, isMe: false } }));
          }
        });
      }
    } catch (e) { console.error('ws err', e.message); }
  });
});

server.listen(PORT, () => { console.log('Server running with WS on /ws/chat'); });
