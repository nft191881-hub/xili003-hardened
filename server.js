const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const app = express();
const port = Number(process.env.PORT || 3000);
const secret = process.env.JWT_SECRET;
const databaseUrl = process.env.DATABASE_URL;
const isLocalDb = /localhost|127\.0\.0\.1/.test(databaseUrl);

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: isLocalDb ? false : { rejectUnauthorized: true },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  });
  next();
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后再试' },
});
app.use('/api/', apiLimiter);

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#039;');
}

function sanitizeText(value, maxLen = 500) {
  return String(value ?? '').replace(/[<>]/g, '').trim().slice(0, maxLen);
}

function sanitizeUsername(value) {
  return String(value ?? '').trim().replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
}

function signUser(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, secret, { expiresIn: '30d' });
}

async function query(text, params = []) {
  return pool.query(text, params);
}

async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      icon TEXT DEFAULT 'grid',
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      sort INT NOT NULL DEFAULT 0
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      seller_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category_id INT REFERENCES categories(id),
      title TEXT NOT NULL,
      description TEXT,
      price NUMERIC(14,2) NOT NULL CHECK(price > 0),
      stock INT NOT NULL DEFAULT 0 CHECK(stock >= 0),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      product_id INT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      buyer_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      seller_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      qty INT NOT NULL CHECK(qty > 0),
      amount NUMERIC(14,2) NOT NULL CHECK(amount >= 0),
      status TEXT NOT NULL DEFAULT 'paid',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const categoryCount = await query('SELECT COUNT(*)::int AS n FROM categories');
  if (categoryCount.rows[0].n === 0) {
    const seed = [
      ['卡券类', 'ticket', 0],
      ['技术类', 'cpu', 1],
      ['工具类', 'wrench', 2],
      ['信息类', 'info', 3],
      ['其他类', 'grid', 4],
    ];

    for (const [name, icon, sort] of seed) {
      await query('INSERT INTO categories(name, icon, sort) VALUES($1, $2, $3)', [name, icon, sort]);
    }
  }
}

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      return res.status(401).json({ error: '请先登录' });
    }

    const decoded = jwt.verify(token, secret);
    const user = await query('SELECT id, username, role FROM users WHERE id = $1', [decoded.id]);
    if (!user.rows[0]) {
      return res.status(401).json({ error: '用户不存在或已被删除' });
    }

    req.user = user.rows[0];
    next();
  } catch (error) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: '无权限' });
    }
    next();
  };
}

async function sendTelegramNotification(text) {
  const token = process.env.TG_BOT_TOKEN;
  const chatId = process.env.TG_CHAT_ID;
  if (!token || !chatId) return;

  try {
    const cleaned = escapeHtml(String(text ?? '').slice(0, 3000)).replace(/\n/g, '<br>');
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: cleaned, parse_mode: 'HTML' }),
    });
  } catch (error) {
    console.error('Telegram notification failed:', error.message);
  }
}

app.get('/health', async (req, res) => {
  try {
    await query('SELECT 1');
    return res.json({ ok: true, status: 'healthy' });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'database unavailable' });
  }
});

app.post('/api/register', async (req, res) => {
  const username = sanitizeUsername(req.body.username);
  const password = String(req.body.password || '').trim();

  if (username.length < 2 || username.length > 20) {
    return res.status(400).json({ error: '用户名需要 2 到 20 位' });
  }

  if (!/^[A-Za-z0-9]+$/.test(username)) {
    return res.status(400).json({ error: '用户名只能使用字母和数字' });
  }

  if (password.length < 6 || password.length > 64) {
    return res.status(400).json({ error: '密码需要 6 到 64 位' });
  }

  try {
    const exists = await query('SELECT 1 FROM users WHERE lower(username) = lower($1)', [username]);
    if (exists.rows[0]) {
      return res.status(409).json({ error: '用户名已被使用' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query(
      'INSERT INTO users(username, password_hash, role) VALUES($1, $2, $3) RETURNING id, username, role',
      [username, passwordHash, 'user']
    );

    const user = result.rows[0];
    await sendTelegramNotification(`👤 新用户注册\n用户名：${escapeHtml(user.username)}`);

    return res.status(201).json({ token: signUser(user), user });
  } catch (error) {
    console.error('register error:', error);
    return res.status(500).json({ error: '注册失败' });
  }
});

app.post('/api/login', async (req, res) => {
  const username = sanitizeUsername(req.body.username);
  const password = String(req.body.password || '');

  try {
    const result = await query('SELECT * FROM users WHERE lower(username)=lower($1)', [username]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: '用户名或密码不正确' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: '用户名或密码不正确' });
    }

    return res.json({ token: signUser(user), user: { id: user.id, username: user.username, role: user.role } });
  } catch (error) {
    console.error('login error:', error);
    return res.status(500).json({ error: '登录失败' });
  }
});

app.get('/api/me', authMiddleware, async (req, res) => {
  return res.json({
    id: req.user.id,
    username: req.user.username,
    role: req.user.role,
  });
});

app.get('/api/categories', async (req, res) => {
  const rows = await query('SELECT id, name, icon FROM categories WHERE enabled = true ORDER BY sort, id');
  return res.json(rows.rows);
});

app.get('/api/products', async (req, res) => {
  const categoryId = Number(req.query.category_id || 0);
  const keyword = sanitizeText(req.query.q || '', 40);

  let queryText = 'SELECT p.id, p.title, p.description, p.price, p.stock, p.created_at, u.username as seller_name FROM products p JOIN users u ON u.id = p.seller_id WHERE p.active = true';
  const params = [];

  if (categoryId > 0) {
    params.push(categoryId);
    queryText += ` AND p.category_id = $${params.length}`;
  }

  if (keyword) {
    params.push(`%${keyword}%`);
    queryText += ` AND p.title ILIKE $${params.length}`;
  }

  queryText += ' ORDER BY p.created_at DESC LIMIT 50';

  const result = await query(queryText, params);
  return res.json(result.rows);
});

app.get('/api/products/:id', async (req, res) => {
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

app.post('/api/products', authMiddleware, async (req, res) => {
  const title = sanitizeText(req.body.title || '', 80);
  const description = sanitizeText(req.body.description || '', 2000);
  const price = Number(req.body.price || 0);
  const stock = Number(req.body.stock || 0);
  const categoryId = Number(req.body.category_id || 0);

  if (!title) {
    return res.status(400).json({ error: '请填写商品标题' });
  }

  if (!Number.isFinite(price) || price <= 0 || price > 1_000_000) {
    return res.status(400).json({ error: '价格不合法' });
  }

  if (!Number.isInteger(stock) || stock < 0 || stock > 1_000_000) {
    return res.status(400).json({ error: '库存不合法' });
  }

  if (!categoryId || !(await query('SELECT 1 FROM categories WHERE id = $1 AND enabled = true', [categoryId])).rows[0]) {
    return res.status(400).json({ error: '请选择有效分类' });
  }

  const result = await query(
    'INSERT INTO products(seller_id, category_id, title, description, price, stock) VALUES($1, $2, $3, $4, $5, $6) RETURNING id',
    [req.user.id, categoryId, title, description, price, stock]
  );

  await sendTelegramNotification(`📦 新商品上架\n商品：${escapeHtml(title)}\n卖家：${escapeHtml(req.user.username)}`);

  return res.status(201).json({ id: result.rows[0].id });
});

app.post('/api/orders', authMiddleware, async (req, res) => {
  const productId = Number(req.body.product_id || 0);
  const qty = Number(req.body.qty || 1);

  if (!Number.isInteger(qty) || qty < 1 || qty > 1000) {
    return res.status(400).json({ error: '购买数量不合法' });
  }

  const productResult = await query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [productId]);
  const product = productResult.rows[0];
  if (!product) {
    return res.status(404).json({ error: '商品不存在' });
  }

  if (!product.active) {
    return res.status(400).json({ error: '商品已下架' });
  }

  if (product.seller_id === req.user.id) {
    return res.status(400).json({ error: '不能购买自己的商品' });
  }

  if (product.stock < qty) {
    return res.status(400).json({ error: '库存不足' });
  }

  const buyerResult = await query('SELECT id, role FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
  const buyer = buyerResult.rows[0];
  if (!buyer) {
    return res.status(401).json({ error: '用户不存在' });
  }

  const total = Number(product.price) * qty;
  const orderInsert = await query(
    'INSERT INTO orders(product_id, buyer_id, seller_id, qty, amount, status) VALUES($1, $2, $3, $4, $5, $6) RETURNING id',
    [product.id, buyer.id, product.seller_id, qty, total, 'paid']
  );

  await query('UPDATE products SET stock = stock - $1 WHERE id = $2', [qty, product.id]);

  await sendTelegramNotification(`💰 新订单\n商品：${escapeHtml(product.title)}\n买家：${escapeHtml(req.user.username)}\n金额：${total}`);

  return res.status(201).json({ id: orderInsert.rows[0].id, amount: total });
});

app.get('/api/orders', authMiddleware, async (req, res) => {
  const rows = await query(
    `SELECT o.*, p.title AS product_title
     FROM orders o
     JOIN products p ON p.id = o.product_id
     WHERE o.buyer_id = $1 OR o.seller_id = $1
     ORDER BY o.created_at DESC`,
    [req.user.id]
  );

  return res.json(rows.rows);
});

app.post('/api/chat', authMiddleware, async (req, res) => {
  const message = sanitizeText(req.body.message || '', 500);
  if (!message) {
    return res.status(400).json({ error: '消息不能为空' });
  }

  await query('INSERT INTO messages(sender_id, body) VALUES($1, $2)', [req.user.id, message]);
  return res.status(201).json({ ok: true });
});

app.get('/api/chat', async (req, res) => {
  const rows = await query(`
    SELECT m.id, m.body, m.created_at, u.username
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    ORDER BY m.created_at DESC
    LIMIT 50
  `);

  return res.json(rows.rows.reverse());
});

app.get('/api/admin/stats', authMiddleware, requireRole('admin', 'owner'), async (req, res) => {
  const [users, products, orders] = await Promise.all([
    query('SELECT COUNT(*)::int AS n FROM users'),
    query('SELECT COUNT(*)::int AS n FROM products'),
    query('SELECT COUNT(*)::int AS n FROM orders'),
  ]);

  return res.json({
    users: users.rows[0].n,
    products: products.rows[0].n,
    orders: orders.rows[0].n,
  });
});

app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: '服务器内部错误' });
});

async function main() {
  try {
    await initDb();
    app.listen(port, () => {
      console.log(`Hardened xili003 app listening on http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Startup failed:', error);
    process.exit(1);
  }
}

main();

process.on('SIGINT', async () => {
  console.log('Shutting down');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down');
  await pool.end();
  process.exit(0);
});
