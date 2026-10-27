const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'novax-super-secret-key-change-me';

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(DATA_FILE)) {
    const seed = {
      users: [],
      wallets: [],
      orders: [],
      chat: [
        {
          id: 'seed-1',
          userId: 'system',
          username: 'Alice',
          body: 'USDT 当前稳，短线有点承压，建议分批挂单，别追涨。',
          createdAt: new Date().toISOString()
        },
        {
          id: 'seed-2',
          userId: 'system',
          username: 'Milo',
          body: '我手里有 2k ETH 要换 USDT，偏向安全撮合，价位可谈。',
          createdAt: new Date().toISOString()
        },
        {
          id: 'seed-3',
          userId: 'system',
          username: 'Raven',
          body: '现在看盘口偏向稳定，等待做市商补仓，后面可能有反弹。',
          createdAt: new Date().toISOString()
        }
      ],
      stats: {
        totalVolume: 18400,
        totalOrders: 1248,
        activeUsers: 2908,
        productCount: 486
      }
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2));
  }
}

function readStore() {
  ensureStorage();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeStore(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

async function fetchMarketData() {
  const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,usd-coin&vs_currencies=usd&include_24hr_change=true';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Market data unavailable');

  const data = await res.json();

  return [
    {
      id: 'btc',
      symbol: 'BTC',
      name: 'Bitcoin',
      price: Number(data.bitcoin?.usd || 68421),
      change: Number(data.bitcoin?.usd_24h_change || 2.48)
    },
    {
      id: 'eth',
      symbol: 'ETH',
      name: 'Ethereum',
      price: Number(data.ethereum?.usd || 3842),
      change: Number(data.ethereum?.usd_24h_change || 1.86)
    },
    {
      id: 'sol',
      symbol: 'SOL',
      name: 'Solana',
      price: Number(data.solana?.usd || 148.24),
      change: Number(data.solana?.usd_24h_change || -0.92)
    },
    {
      id: 'usdc',
      symbol: 'USDC',
      name: 'USD Coin',
      price: Number(data['usd-coin']?.usd || 1),
      change: Number(data['usd-coin']?.usd_24h_change || 0.08)
    }
  ];
}

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false
}));

app.use(express.static(PUBLIC_DIR));

app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.get('/wallet.html', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'wallet.html')));
app.get('/trade.html', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'trade.html')));
app.get('/chat.html', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'chat.html')));

app.get('/health', (req, res) => res.json({ ok: true }));

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password || username.trim().length < 3 || password.length < 4) {
    return res.status(400).json({ error: 'Username >=3 and password >=4 required' });
  }

  const store = readStore();
  const exists = store.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (exists) {
    return res.status(400).json({ error: 'Username already exists' });
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = {
    id: Date.now().toString(),
    username: username.trim(),
    password: hashed,
    createdAt: new Date().toISOString()
  };

  store.users.push(user);

  store.wallets.push({
    userId: user.id,
    walletAddress: '0x' + Math.random().toString(16).slice(2, 12) + '...fe41',
    btc: 0.8421,
    eth: 4.801,
    sol: 92.44,
    usdc: 12400,
    totalUsd: 42680
  });

  writeStore(store);

  return res.json({
    token: generateToken(user),
    user: { id: user.id, username: user.username }
  });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const store = readStore();
  const user = store.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  return res.json({
    token: generateToken(user),
    user: { id: user.id, username: user.username }
  });
});

app.get('/api/me', requireAuth, (req, res) => {
  const store = readStore();
  const user = store.users.find(u => u.id === req.user.id);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.json({ id: user.id, username: user.username });
});

app.get('/api/markets', async (req, res) => {
  try {
    const markets = await fetchMarketData();
    return res.json(markets);
  } catch (e) {
    return res.status(500).json({ error: 'Market data unavailable' });
  }
});

app.get('/api/wallet', requireAuth, (req, res) => {
  const store = readStore();
  const wallet = store.wallets.find(w => w.userId === req.user.id);

  if (!wallet) {
    return res.json({
      walletAddress: '0x00000000000000000000000000000000',
      btc: 0,
      eth: 0,
      sol: 0,
      usdc: 0,
      totalUsd: 0
    });
  }

  return res.json(wallet);
});

app.get('/api/orders', requireAuth, (req, res) => {
  const store = readStore();
  const orders = (store.orders || []).filter(o => o.userId === req.user.id);
  return res.json(orders);
});

app.post('/api/orders', requireAuth, (req, res) => {
  const { pair, side, amount, price } = req.body || {};
  if (!pair || !side || !amount || !price) {
    return res.status(400).json({ error: 'Missing order fields' });
  }

  const store = readStore();

  const order = {
    id: Date.now().toString(),
    userId: req.user.id,
    pair,
    side,
    amount: Number(amount),
    price: Number(price),
    status: 'open',
    createdAt: new Date().toISOString()
  };

  store.orders.push(order);
  writeStore(store);

  return res.status(201).json(order);
});

app.get('/api/chat', (req, res) => {
  const store = readStore();
  return res.json(store.chat);
});

app.post('/api/chat', requireAuth, (req, res) => {
  const { message } = req.body || {};
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message required' });
  }

  const store = readStore();
  const entry = {
    id: Date.now().toString(),
    userId: req.user.id,
    username: req.user.username,
    body: message.trim(),
    createdAt: new Date().toISOString()
  };

  store.chat.push(entry);
  writeStore(store);

  return res.status(201).json(entry);
});

app.get('/api/stats', (req, res) => {
  const store = readStore();
  return res.json(store.stats);
});

app.listen(PORT, () => {
  console.log(`NovaX app is running on http://localhost:${PORT}`);
});
