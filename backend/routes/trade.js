'use strict';
const express = require('express');
const { getDB } = require('../models/database');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/trade/place
router.post('/place', verifyToken, (req, res) => {
  try {
    const { asset, amount, type, duration } = req.body;
    if (!asset || !amount || !type) return res.status(400).json({ error: 'Missing trade parameters' });
    if (!['call', 'put'].includes(type.toLowerCase())) return res.status(400).json({ error: 'Type must be call or put' });
    if (amount < 10) return res.status(400).json({ error: 'Minimum trade amount is ₹10' });

    const db = getDB();
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
    if (user.balance < amount) return res.status(400).json({ error: 'Insufficient balance' });

    const assetData = db.prepare('SELECT * FROM assets WHERE symbol=? AND is_active=1').get(asset);
    if (!assetData) return res.status(404).json({ error: 'Asset not found' });

    // Deduct balance immediately
    db.prepare('UPDATE users SET balance=balance-? WHERE id=?').run(amount, user.id);

    const trade = db.prepare(`
      INSERT INTO trades (user_id, asset, amount, type, duration, entry_price, profit_pct, result)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(req.user.id, asset, amount, type.toLowerCase(), duration || 1, assetData.price, assetData.profit_pct);

    // Schedule result after duration (minutes → ms)
    const durationMs = (duration || 1) * 60 * 1000;
    setTimeout(() => resolveTradeResult(trade.lastInsertRowid), durationMs);

    res.json({
      message: 'Trade placed successfully',
      trade_id: trade.lastInsertRowid,
      entry_price: assetData.price,
      amount,
      type: type.toLowerCase(),
      duration: duration || 1,
      resolves_at: new Date(Date.now() + durationMs).toISOString()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to place trade' });
  }
});

function resolveTradeResult(tradeId) {
  try {
    const db = getDB();
    const trade = db.prepare('SELECT * FROM trades WHERE id=? AND result="pending"').get(tradeId);
    if (!trade) return;

    // Check graph control for this asset
    const graphConfig = db.prepare('SELECT * FROM graph_config WHERE asset=?').get(trade.asset);
    const setting = db.prepare('SELECT value FROM settings WHERE key="graph_mode"').get();
    const globalMode = setting?.value || 'auto';

    let forcedResult = null;
    if (graphConfig) {
      if (graphConfig.mode === 'manual') {
        // Manual mode: admin set direction
        if (graphConfig.manual_direction === 'up') {
          forcedResult = trade.type === 'call' ? 'win' : 'lose';
        } else if (graphConfig.manual_direction === 'down') {
          forcedResult = trade.type === 'put' ? 'win' : 'lose';
        }
      } else if (graphConfig.mode === 'ai' || globalMode === 'ai') {
        // AI mode: contrarian logic
        const stats = db.prepare(`
          SELECT 
            SUM(CASE WHEN type='call' THEN 1 ELSE 0 END) as buys,
            SUM(CASE WHEN type='put' THEN 1 ELSE 0 END) as sells
          FROM trades WHERE asset=? AND created_at > datetime('now', '-1 hour')
        `).get(trade.asset);
        const buys = stats.buys || 0;
        const sells = stats.sells || 0;
        if (buys > sells * 1.2) {
          // More buyers → price goes down → put wins
          forcedResult = trade.type === 'put' ? 'win' : 'lose';
        } else if (sells > buys * 1.2) {
          // More sellers → price goes up → call wins
          forcedResult = trade.type === 'call' ? 'win' : 'lose';
        }
      }
    }

    const result = forcedResult || (Math.random() > 0.45 ? 'win' : 'lose');
    const assetData = db.prepare('SELECT price FROM assets WHERE symbol=?').get(trade.asset);
    const exitPrice = assetData ? assetData.price * (1 + (Math.random() - 0.5) * 0.02) : trade.entry_price;

    let pnl = 0;
    if (result === 'win') {
      pnl = trade.amount * (trade.profit_pct / 100);
      db.prepare('UPDATE users SET balance=balance+? WHERE id=?').run(trade.amount + pnl, trade.user_id);
    }
    // If lose, balance already deducted, pnl = -amount
    if (result === 'lose') pnl = -trade.amount;

    db.prepare(`
      UPDATE trades SET result=?, exit_price=?, pnl=?, closed_at=datetime('now') WHERE id=?
    `).run(result, exitPrice, pnl, tradeId);

    console.log(`[TRADE] #${tradeId} resolved: ${result} | PnL: ${pnl}`);
  } catch (err) {
    console.error('[TRADE RESOLVE ERROR]', err);
  }
}

// GET /api/trade/history
router.get('/history', verifyToken, (req, res) => {
  try {
    const { filter, page = 1, limit = 50 } = req.query;
    const db = getDB();
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM trades WHERE user_id=?';
    const params = [req.user.id];

    if (filter === 'win') { query += ' AND result="win"'; }
    else if (filter === 'lose') { query += ' AND result="lose"'; }
    else if (filter === 'pending') { query += ' AND result="pending"'; }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const trades = db.prepare(query).all(...params);
    const totalRow = db.prepare(`SELECT COUNT(*) as c FROM trades WHERE user_id=?${filter === 'win' ? ' AND result="win"' : filter === 'lose' ? ' AND result="lose"' : ''}`).get(req.user.id);

    res.json({ trades, total: totalRow.c, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch trade history' });
  }
});

// GET /api/trade/stats
router.get('/stats', verifyToken, (req, res) => {
  try {
    const db = getDB();
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN result='win' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN result='lose' THEN 1 ELSE 0 END) as losses,
        SUM(CASE WHEN result='pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN result='win' THEN pnl ELSE 0 END) as total_profit,
        SUM(CASE WHEN result='lose' THEN ABS(pnl) ELSE 0 END) as total_loss,
        SUM(amount) as total_invested
      FROM trades WHERE user_id=?
    `).get(req.user.id);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/trade/pending - check pending trades
router.get('/pending', verifyToken, (req, res) => {
  try {
    const trades = getDB().prepare('SELECT * FROM trades WHERE user_id=? AND result="pending" ORDER BY created_at DESC').all(req.user.id);
    res.json({ trades });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
