const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { initDatabase } = require('./config/db');
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const chatRoutes = require('./routes/chat');
const adminRoutes = require('./routes/admin');
const { PORT } = require('./config/env');

const app = express();
const port = Number(PORT || 3000);

app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
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

app.get('/health', async (req, res) => {
  try {
    const { query } = require('./config/db');
    await query('SELECT 1');
    res.json({ ok: true, status: 'healthy' });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'database unavailable' });
  }
});

app.use(authRoutes);
app.use(productRoutes);
app.use(orderRoutes);
app.use(chatRoutes);
app.use(adminRoutes);

app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: '服务器内部错误' });
});

async function start() {
  try {
    await initDatabase();
    app.listen(port, () => console.log(`Hardened xili003 app listening on port ${port}`));
  } catch (error) {
    console.error('Startup failed:', error);
    process.exit(1);
  }
}

start();

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
