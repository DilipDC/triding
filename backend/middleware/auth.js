'use strict';
const jwt = require('jsonwebtoken');
const { getDB } = require('../models/database');

const JWT_SECRET = process.env.JWT_SECRET || 'ultra_trading_jwt_secret_2024_x9k2p';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function verifyToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = auth.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Refresh user from DB to get latest data
    const user = getDB().prepare('SELECT * FROM users WHERE id=? AND is_active=1').get(decoded.id);
    if (!user) return res.status(401).json({ error: 'User not found or deactivated' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { generateToken, verifyToken, requireAdmin, JWT_SECRET };
