'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { getDB } = require('../models/database');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken, requireAdmin);

// ── USER MANAGEMENT ─────────────────────────────────────────────────────────

// GET /api/admin/users
router.get('/users', (req, res) => {
  try {
    const users = getDB().prepare('SELECT id, username, email, balance, role, is_active, avatar, phone, created_at FROM users ORDER BY created_at DESC').all();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// PUT /api/admin/users/:id
router.put('/users/:id', (req, res) => {
  try {
    const { balance, is_active, role } = req.body;
    const db = getDB();
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.username === 'admin') return res.status(403).json({ error: 'Cannot modify main admin' });

    if (balance !== undefined) db.prepare('UPDATE users SET balance=? WHERE id=?').run(parseFloat(balance), req.params.id);
    if (is_active !== undefined) db.prepare('UPDATE users SET is_active=? WHERE id=?').run(is_active ? 1 : 0, req.params.id);
    if (role !== undefined) db.prepare('UPDATE users SET role=? WHERE id=?').run(role, req.params.id);

    res.json({ message: 'User updated' });
  } catch (err) {
    res.status(500).json({ error: 'Update failed' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', (req, res) => {
  try {
    const db = getDB();
    const user = db.prepare('SELECT username FROM users WHERE id=?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.username === 'admin') return res.status(403).json({ error: 'Cannot delete main admin' });
    db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// POST /api/admin/users/:id/add-balance
router.post('/users/:id/add-balance', (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount) return res.status(400).json({ error: 'Amount required' });
    getDB().prepare('UPDATE users SET balance=balance+? WHERE id=?').run(parseFloat(amount), req.params.id);
    const user = getDB().prepare('SELECT balance FROM users WHERE id=?').get(req.params.id);
    res.json({ message: 'Balance updated', new_balance: user.balance });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// ── PAYMENT MANAGEMENT ───────────────────────────────────────────────────────

// GET /api/admin/payments
router.get('/payments', (req, res) => {
  try {
    const { status } = req.query;
    let query = `SELECT p.*, u.username FROM payments p JOIN users u ON p.user_id=u.id`;
    const params = [];
    if (status) { query += ' WHERE p.status=?'; params.push(status); }
    query += ' ORDER BY p.created_at DESC';
    res.json({ payments: getDB().prepare(query).all(...params) });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// PUT /api/admin/payments/:id
router.put('/payments/:id', (req, res) => {
  try {
    const { action, admin_note } = req.body;
    const db = getDB();
    const payment = db.prepare('SELECT * FROM payments WHERE id=?').get(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (payment.status !== 'pending') return res.status(400).json({ error: 'Payment already processed' });

    if (action === 'approve') {
      db.prepare("UPDATE payments SET status='approved', admin_note=?, processed_at=datetime('now') WHERE id=?").run(admin_note||null, req.params.id);
      if (payment.type === 'deposit') {
        db.prepare('UPDATE users SET balance=balance+? WHERE id=?').run(payment.amount, payment.user_id);
      }
      // If withdrawal: balance already deducted on request
      db.prepare("INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'payment', ?, ?)").run(
        payment.user_id, `✅ ${payment.type === 'deposit' ? 'Deposit' : 'Withdrawal'} Approved`,
        `Your ${payment.type} of ₹${payment.amount} has been approved`
      );
    } else if (action === 'reject') {
      db.prepare("UPDATE payments SET status='rejected', admin_note=?, processed_at=datetime('now') WHERE id=?").run(admin_note||null, req.params.id);
      if (payment.type === 'withdraw') {
        // Refund held balance
        db.prepare('UPDATE users SET balance=balance+? WHERE id=?').run(payment.amount, payment.user_id);
      }
      db.prepare("INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'payment', ?, ?)").run(
        payment.user_id, `❌ ${payment.type} Rejected`, `Your ${payment.type} of ₹${payment.amount} was rejected. ${admin_note||''}`
      );
    } else {
      return res.status(400).json({ error: 'Action must be approve or reject' });
    }
    res.json({ message: `Payment ${action}d successfully` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process payment' });
  }
});

// ── MARKET / ASSET MANAGEMENT ────────────────────────────────────────────────

// GET /api/admin/assets
router.get('/assets', (req, res) => {
  res.json({ assets: getDB().prepare('SELECT * FROM assets ORDER BY category, symbol').all() });
});

// POST /api/admin/assets
router.post('/assets', (req, res) => {
  try {
    const { symbol, name, category, price, profit_pct, icon } = req.body;
    if (!symbol || !name || !price) return res.status(400).json({ error: 'Symbol, name, price required' });
    const result = getDB().prepare('INSERT INTO assets (symbol, name, category, price, prev_price, profit_pct, icon) VALUES (?,?,?,?,?,?,?)').run(symbol, name, category||'crypto', parseFloat(price), parseFloat(price), parseFloat(profit_pct||85), icon||'🪙');
    res.status(201).json({ message: 'Asset added', id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add asset' });
  }
});

// PUT /api/admin/assets/:id
router.put('/assets/:id', (req, res) => {
  try {
    const { price, profit_pct, is_active, name } = req.body;
    const db = getDB();
    if (price !== undefined) db.prepare('UPDATE assets SET price=?, updated_at=datetime("now") WHERE id=?').run(parseFloat(price), req.params.id);
    if (profit_pct !== undefined) db.prepare('UPDATE assets SET profit_pct=? WHERE id=?').run(parseFloat(profit_pct), req.params.id);
    if (is_active !== undefined) db.prepare('UPDATE assets SET is_active=? WHERE id=?').run(is_active?1:0, req.params.id);
    if (name !== undefined) db.prepare('UPDATE assets SET name=? WHERE id=?').run(name, req.params.id);
    res.json({ message: 'Asset updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// DELETE /api/admin/assets/:id
router.delete('/assets/:id', (req, res) => {
  try {
    getDB().prepare('DELETE FROM assets WHERE id=?').run(req.params.id);
    res.json({ message: 'Asset deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// ── SETTINGS ──────────────────────────────────────────────────────────────────

// GET /api/admin/settings
router.get('/settings', (req, res) => {
  const rows = getDB().prepare('SELECT key, value FROM settings').all();
  const s = {};
  rows.forEach(r => s[r.key] = r.value);
  res.json(s);
});

// PUT /api/admin/settings
router.put('/settings', (req, res) => {
  try {
    const db = getDB();
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime("now"))');
    Object.entries(req.body).forEach(([k, v]) => stmt.run(k, String(v)));
    res.json({ message: 'Settings saved' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// ── GRAPH CONTROL ────────────────────────────────────────────────────────────

// GET /api/admin/graph
router.get('/graph', (req, res) => {
  res.json({ configs: getDB().prepare('SELECT * FROM graph_config').all() });
});

// PUT /api/admin/graph/:asset
router.put('/graph/:asset', (req, res) => {
  try {
    const { mode, manual_direction, ai_logic, bias_strength } = req.body;
    const db = getDB();
    const existing = db.prepare('SELECT id FROM graph_config WHERE asset=?').get(req.params.asset);
    if (existing) {
      db.prepare('UPDATE graph_config SET mode=?, manual_direction=?, ai_logic=?, bias_strength=?, updated_at=datetime("now") WHERE asset=?')
        .run(mode||'auto', manual_direction||'neutral', ai_logic||null, bias_strength||0.5, req.params.asset);
    } else {
      db.prepare('INSERT INTO graph_config (asset, mode, manual_direction, ai_logic, bias_strength) VALUES (?,?,?,?,?)')
        .run(req.params.asset, mode||'auto', manual_direction||'neutral', ai_logic||null, bias_strength||0.5);
    }
    // Also save ai_logic to settings if provided
    if (ai_logic) db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES ("ai_logic", ?)').run(ai_logic);
    res.json({ message: 'Graph config updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update graph config' });
  }
});

// ── NOTIFICATIONS ────────────────────────────────────────────────────────────

// GET /api/admin/notifications
router.get('/notifications', (req, res) => {
  const notifs = getDB().prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100').all();
  res.json({ notifications: notifs });
});

// PUT /api/admin/notifications/read-all
router.put('/notifications/read-all', (req, res) => {
  getDB().prepare('UPDATE notifications SET is_read=1').run();
  res.json({ message: 'All marked read' });
});

// ── ADS MANAGEMENT ───────────────────────────────────────────────────────────

// GET /api/admin/ads
router.get('/ads', (req, res) => {
  res.json({ ads: getDB().prepare('SELECT * FROM ads ORDER BY created_at DESC').all() });
});

// POST /api/admin/ads
router.post('/ads', (req, res) => {
  try {
    const { title, content, image_url, link, position } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    const result = getDB().prepare('INSERT INTO ads (title, content, image_url, link, position) VALUES (?,?,?,?,?)').run(title, content||'', image_url||'', link||'', position||'banner');
    res.status(201).json({ message: 'Ad created', id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// DELETE /api/admin/ads/:id
router.delete('/ads/:id', (req, res) => {
  getDB().prepare('DELETE FROM ads WHERE id=?').run(req.params.id);
  res.json({ message: 'Ad deleted' });
});

// PUT /api/admin/ads/:id/toggle
router.put('/ads/:id/toggle', (req, res) => {
  try {
    const ad = getDB().prepare('SELECT is_active FROM ads WHERE id=?').get(req.params.id);
    if (!ad) return res.status(404).json({ error: 'Ad not found' });
    getDB().prepare('UPDATE ads SET is_active=? WHERE id=?').run(ad.is_active ? 0 : 1, req.params.id);
    res.json({ message: 'Ad toggled', is_active: !ad.is_active });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// ── DASHBOARD STATS ──────────────────────────────────────────────────────────

// GET /api/admin/dashboard
router.get('/dashboard', (req, res) => {
  try {
    const db = getDB();
    const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users WHERE role="user"').get().c;
    const totalTrades = db.prepare('SELECT COUNT(*) as c FROM trades').get().c;
    const totalVolume = db.prepare('SELECT COALESCE(SUM(amount),0) as s FROM trades').get().s;
    const pendingPayments = db.prepare("SELECT COUNT(*) as c FROM payments WHERE status='pending'").get().c;
    const pendingDeposits = db.prepare("SELECT COALESCE(SUM(amount),0) as s FROM payments WHERE type='deposit' AND status='pending'").get().s;
    const recentTrades = db.prepare('SELECT t.*, u.username FROM trades t JOIN users u ON t.user_id=u.id ORDER BY t.created_at DESC LIMIT 10').all();
    const recentPayments = db.prepare('SELECT p.*, u.username FROM payments p JOIN users u ON p.user_id=u.id ORDER BY p.created_at DESC LIMIT 10').all();
    const unreadNotifs = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE is_read=0').get().c;
    res.json({ totalUsers, totalTrades, totalVolume, pendingPayments, pendingDeposits, recentTrades, recentPayments, unreadNotifs });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// ── TRADE OVERRIDE (ADMIN RESULT CONTROL) ────────────────────────────────────

// PUT /api/admin/trade/:id/result
router.put('/trade/:id/result', (req, res) => {
  try {
    const { result } = req.body;
    if (!['win','lose'].includes(result)) return res.status(400).json({ error: 'Result must be win or lose' });
    const db = getDB();
    const trade = db.prepare('SELECT * FROM trades WHERE id=? AND result="pending"').get(req.params.id);
    if (!trade) return res.status(404).json({ error: 'Pending trade not found' });

    const pnl = result === 'win' ? trade.amount * (trade.profit_pct/100) : -trade.amount;
    if (result === 'win') db.prepare('UPDATE users SET balance=balance+? WHERE id=?').run(trade.amount + (trade.amount*(trade.profit_pct/100)), trade.user_id);
    db.prepare("UPDATE trades SET result=?, pnl=?, closed_at=datetime('now') WHERE id=?").run(result, pnl, req.params.id);
    res.json({ message: `Trade ${result}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
