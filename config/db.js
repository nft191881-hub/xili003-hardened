const { Pool } = require('pg');
const { DATABASE_URL } = require('./env');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: /localhost|127\.0\.0\.1/.test(DATABASE_URL) ? false : { rejectUnauthorized: true },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

async function query(text, params = []) {
  return pool.query(text, params);
}

async function initDatabase() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      balance NUMERIC(14,2) NOT NULL DEFAULT 0,
      merchant BOOLEAN NOT NULL DEFAULT FALSE,
      deposit NUMERIC(14,2) NOT NULL DEFAULT 0,
      contact TEXT,
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
      sold INT NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      blocked BOOLEAN NOT NULL DEFAULT FALSE,
      special BOOLEAN NOT NULL DEFAULT FALSE,
      is_card BOOLEAN NOT NULL DEFAULT FALSE,
      images TEXT[] NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      product_id INT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      title TEXT NOT NULL,
      buyer_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      seller_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      qty INT NOT NULL CHECK(qty > 0),
      amount NUMERIC(14,2) NOT NULL CHECK(amount >= 0),
      status TEXT NOT NULL DEFAULT 'paid',
      secret TEXT,
      is_card BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      delivered_at TIMESTAMPTZ
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS ledger (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount NUMERIC(14,2) NOT NULL,
      type TEXT NOT NULL,
      note TEXT,
      order_id INT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'text',
      body TEXT NOT NULL,
      pinned BOOLEAN NOT NULL DEFAULT FALSE,
      deleted BOOLEAN NOT NULL DEFAULT FALSE,
      quote_id INT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS settings (
      k TEXT PRIMARY KEY,
      v TEXT NOT NULL
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS deposits (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      method TEXT NOT NULL,
      network TEXT,
      amount NUMERIC(18,4) NOT NULL,
      proof TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      method TEXT NOT NULL,
      network TEXT,
      account TEXT NOT NULL,
      ludd NUMERIC(14,2) NOT NULL,
      payout NUMERIC(14,2) NOT NULL,
      rate NUMERIC(14,4) DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'pending',
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS wants (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category_id INT REFERENCES categories(id),
      title TEXT NOT NULL,
      budget NUMERIC(14,2) NOT NULL,
      quantity INT NOT NULL DEFAULT 1,
      contact TEXT,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS merchant_apps (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      shop TEXT,
      intro TEXT,
      contact TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
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

  const defaultSettings = [
    ['service', '欢迎使用 XILI 数字服务站'],
    ['about', '这是一个安全版的数字交易服务站。'],
    ['rules', '请遵守平台规则，保证交易真实合法。'],
    ['pay_info', ''],
    ['rate', '1'],
    ['deposit_amount', '0'],
    ['channels', JSON.stringify({ alipay: true, card: true })],
    ['words', '军火\n枪支弹药\n炸药\n毒品\n冰毒\n海洛因\n人口贩卖\n贩卖人口'],
    ['tools', JSON.stringify([])],
  ];

  for (const [k, v] of defaultSettings) {
    await query(`INSERT INTO settings(k, v) VALUES($1, $2) ON CONFLICT(k) DO NOTHING`, [k, v]);
  }
}

module.exports = { pool, query, initDatabase };
