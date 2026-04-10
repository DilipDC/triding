'use strict';
const express = require('express');
const { getDB } = require('../models/database');

const router = express.Router();

// Simulate live prices
setInterval(() => {
  try {
    const db = getDB();
    const assets = db.prepare('SELECT * FROM assets WHERE is_active=1').all();
    const stmt = db.prepare('UPDATE assets SET prev_price=price, price=?, change_pct=? WHERE id=?');
    assets.forEach(a => {
      const volatility = a.category === 'crypto' ? 0.005 : 0.002;
      const newPrice = Math.max(0.001, a.price * (1 + (Math.random() - 0.48) * volatility));
      const changePct = ((newPrice - a.prev_price) / a.prev_price) * 100;
      stmt.run(parseFloat(newPrice.toFixed(6)), parseFloat(changePct.toFixed(4)), a.id);
    });
  } catch (e) { /* DB might not be ready */ }
}, 2000);

// GET /api/market/assets
router.get('/assets', (req, res) => {
  try {
    const { category, search } = req.query;
    let query = 'SELECT * FROM assets WHERE is_active=1';
    const params = [];
    if (category && category !== 'all') { query += ' AND category=?'; params.push(category); }
    if (search) { query += ' AND (symbol LIKE ? OR name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    query += ' ORDER BY category, symbol';
    const assets = getDB().prepare(query).all(...params);
    res.json({ assets });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

// GET /api/market/asset/:symbol
router.get('/asset/:symbol', (req, res) => {
  try {
    const asset = getDB().prepare('SELECT * FROM assets WHERE symbol=?').get(req.params.symbol);
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    res.json({ asset });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch asset' });
  }
});

// GET /api/market/prices - lightweight price feed
router.get('/prices', (req, res) => {
  try {
    const rows = getDB().prepare('SELECT symbol, price, change_pct FROM assets WHERE is_active=1').all();
    const prices = {};
    rows.forEach(r => { prices[r.symbol] = { price: r.price, change: r.change_pct }; });
    res.json({ prices, ts: Date.now() });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
