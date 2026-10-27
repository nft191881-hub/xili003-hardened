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

module.exports = { pool, query, initDatabase };
