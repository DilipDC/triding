'use strict';
const express = require('express');
const { getDB } = require('../models/database');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/user/profile
router.get('/profile', verifyToken, (req, res) => {
  const { password: _, ...safeUser } = req.user;
  const stats = getDB().prepare(`
    SELECT 
      COUNT(*) as total_trades,
      SUM(CASE WHEN result='win' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN result='lose' THEN 1 ELSE 0 END) as losses,
      COALESCE(SUM(pnl),0) as net_pnl
    FROM trades WHERE user_id=?
  `).get(req.user.id);
  res.json({ user: safeUser, stats });
});

// PUT /api/user/profile
router.put('/profile', verifyToken, (req, res) => {
  try {
    const { phone, email } = req.body;
    getDB().prepare('UPDATE users SET phone=?, email=?, updated_at=datetime("now") WHERE id=?').run(phone||null, email||null, req.user.id);
    res.json({ message: 'Profile updated' });
  } catch (err) {
    res.status(500).json({ error: 'Update failed' });
  }
});

// GET /api/user/balance
router.get('/balance', verifyToken, (req, res) => {
  const user = getDB().prepare('SELECT balance FROM users WHERE id=?').get(req.user.id);
  res.json({ balance: user.balance });
});

// GET /api/user/notifications
router.get('/notifications', verifyToken, (req, res) => {
  try {
    const notifs = getDB().prepare('SELECT * FROM notifications WHERE user_id=? OR user_id IS NULL ORDER BY created_at DESC LIMIT 20').all(req.user.id);
    res.json({ notifications: notifs });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
