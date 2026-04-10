'use strict';
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../database/trading.db');

let db;

function getDB() {
  if (!db) db = new Database(DB_PATH);
  return db;
}

function setupDatabase() {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  const database = getDB();
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');

  // ── Users table ────────────────────────────────────────────────────────────
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      password TEXT NOT NULL,
      balance REAL DEFAULT 20000,
      avatar TEXT DEFAULT 'default',
      role TEXT DEFAULT 'user',
      is_active INTEGER DEFAULT 1,
      phone TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // ── Trades table ───────────────────────────────────────────────────────────
  database.exec(`
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      asset TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL,
      duration INTEGER DEFAULT 1,
      entry_price REAL,
      exit_price REAL,
      profit_pct REAL DEFAULT 85,
      result TEXT DEFAULT 'pending',
      pnl REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      closed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // ── Assets / Markets table ─────────────────────────────────────────────────
  database.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'crypto',
      price REAL NOT NULL,
      prev_price REAL,
      change_pct REAL DEFAULT 0,
      profit_pct REAL DEFAULT 85,
      is_active INTEGER DEFAULT 1,
      icon TEXT DEFAULT '🪙',
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // ── Payments table ─────────────────────────────────────────────────────────
  database.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      upi_id TEXT,
      upi_name TEXT,
      screenshot TEXT,
      admin_note TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      processed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // ── App settings table ─────────────────────────────────────────────────────
  database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // ── Notifications table ────────────────────────────────────────────────────
  database.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // ── Ads table ─────────────────────────────────────────────────────────────
  database.exec(`
    CREATE TABLE IF NOT EXISTS ads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT,
      image_url TEXT,
      link TEXT,
      is_active INTEGER DEFAULT 1,
      position TEXT DEFAULT 'banner',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // ── Graph control table ────────────────────────────────────────────────────
  database.exec(`
    CREATE TABLE IF NOT EXISTS graph_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset TEXT NOT NULL,
      mode TEXT DEFAULT 'auto',
      trend TEXT DEFAULT 'neutral',
      manual_direction TEXT DEFAULT 'neutral',
      ai_logic TEXT,
      bias_strength REAL DEFAULT 0.5,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // ── Seed data ──────────────────────────────────────────────────────────────
  _seedUsers(database);
  _seedAssets(database);
  _seedSettings(database);
  _seedGraphConfig(database);

  console.log('[DB] Database initialized ✓');
}

function _seedUsers(database) {
  const adminExists = database.prepare('SELECT id FROM users WHERE username=?').get('admin');
  if (!adminExists) {
    const adminHash = bcrypt.hashSync('admin123', 10);
    database.prepare(`
      INSERT INTO users (username, email, password, balance, role, avatar)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('admin', 'admin@ultratrading.com', adminHash, 999999999, 'admin', 'admin');
    console.log('[DB] Admin user created ✓');
  }

  const demoExists = database.prepare('SELECT id FROM users WHERE username=?').get('demo_user');
  if (!demoExists) {
    const userHash = bcrypt.hashSync('user123', 10);
    database.prepare(`
      INSERT INTO users (username, email, password, balance, role, avatar)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('demo_user', 'demo@ultratrading.com', userHash, 20000, 'user', 'default');
    console.log('[DB] Demo user created ✓');
  }
}

function _seedAssets(database) {
  const count = database.prepare('SELECT COUNT(*) as c FROM assets').get();
  if (count.c > 0) return;

  const assets = [
    { symbol: 'BTC/USDT', name: 'Bitcoin', category: 'crypto', price: 67842.50, profit_pct: 87, icon: '₿' },
    { symbol: 'ETH/USDT', name: 'Ethereum', category: 'crypto', price: 3521.30, profit_pct: 85, icon: 'Ξ' },
    { symbol: 'BNB/USDT', name: 'BNB Chain', category: 'crypto', price: 598.75, profit_pct: 82, icon: '🔶' },
    { symbol: 'SOL/USDT', name: 'Solana', category: 'crypto', price: 178.40, profit_pct: 88, icon: '◎' },
    { symbol: 'XRP/USDT', name: 'XRP', category: 'crypto', price: 0.6320, profit_pct: 83, icon: '✕' },
    { symbol: 'ADA/USDT', name: 'Cardano', category: 'crypto', price: 0.4518, profit_pct: 80, icon: '₳' },
    { symbol: 'DOGE/USDT', name: 'Dogecoin', category: 'crypto', price: 0.1782, profit_pct: 84, icon: 'Ð' },
    { symbol: 'MATIC/USDT', name: 'Polygon', category: 'crypto', price: 0.8945, profit_pct: 81, icon: '⬡' },
    { symbol: 'EUR/USD', name: 'Euro / US Dollar', category: 'forex', price: 1.0842, profit_pct: 78, icon: '€' },
    { symbol: 'GBP/USD', name: 'British Pound', category: 'forex', price: 1.2654, profit_pct: 78, icon: '£' },
    { symbol: 'GOLD/USD', name: 'Gold Spot', category: 'commodity', price: 2347.80, profit_pct: 86, icon: '🥇' },
    { symbol: 'OIL/USD', name: 'Crude Oil', category: 'commodity', price: 82.35, profit_pct: 84, icon: '🛢️' },
    { symbol: 'TSLA', name: 'Tesla Inc.', category: 'stock', price: 172.50, profit_pct: 82, icon: '⚡' },
    { symbol: 'AAPL', name: 'Apple Inc.', category: 'stock', price: 189.30, profit_pct: 80, icon: '🍎' },
  ];

  const stmt = database.prepare(`
    INSERT INTO assets (symbol, name, category, price, prev_price, profit_pct, icon)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  assets.forEach(a => stmt.run(a.symbol, a.name, a.category, a.price, a.price, a.profit_pct, a.icon));
  console.log('[DB] Assets seeded ✓');
}

function _seedSettings(database) {
  const defaults = [
    ['payment_lock', 'false'],
    ['payment_lock_timer', '0'],
    ['deposit_min', '100'],
    ['withdraw_min', '150'],
    ['qr_image', ''],
    ['maintenance_mode', 'false'],
    ['site_name', 'Ultra Trading'],
    ['graph_mode', 'auto'],
    ['ai_logic', `// AI Graph Logic\n// buys = total BUY trades\n// sells = total SELL trades\n// Return: 'up', 'down', or 'neutral'\nfunction aiTrend(buys, sells) {\n  if (buys > sells * 1.2) return 'down'; // contrarian\n  if (sells > buys * 1.2) return 'up';\n  return 'neutral';\n}`],
  ];
  const stmt = database.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  defaults.forEach(([k, v]) => stmt.run(k, v));
  console.log('[DB] Settings seeded ✓');
}

function _seedGraphConfig(database) {
  const count = database.prepare('SELECT COUNT(*) as c FROM graph_config').get();
  if (count.c > 0) return;
  const stmt = database.prepare('INSERT INTO graph_config (asset, mode) VALUES (?, ?)');
  stmt.run('BTC/USDT', 'auto');
  console.log('[DB] Graph config seeded ✓');
}

module.exports = { getDB, setupDatabase };
