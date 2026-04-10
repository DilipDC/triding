'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { getDB } = require('../models/database');
const { generateToken, verifyToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const db = getDB();
    const user = db.prepare('SELECT * FROM users WHERE (username=? OR email=?) AND is_active=1').get(username, username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = bcrypt.compareSync(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = generateToken(user);
    const { password: _, ...safeUser } = user;
    res.json({ token, user: safeUser, message: 'Login successful' });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/signup
router.post('/signup', (req, res) => {
  try {
    const { username, email, password, phone } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const db = getDB();
    const existing = db.prepare('SELECT id FROM users WHERE username=? OR email=?').get(username, email || '');
    if (existing) return res.status(409).json({ error: 'Username or email already exists' });

    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(`
      INSERT INTO users (username, email, password, phone, balance, role) VALUES (?, ?, ?, ?, 20000, 'user')
    `).run(username, email || null, hash, phone || null);

    const newUser = db.prepare('SELECT * FROM users WHERE id=?').get(result.lastInsertRowid);
    const token = generateToken(newUser);
    const { password: _, ...safeUser } = newUser;
    res.status(201).json({ token, user: safeUser, message: 'Account created successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// GET /api/auth/me
router.get('/me', verifyToken, (req, res) => {
  const { password: _, ...safeUser } = req.user;
  res.json({ user: safeUser });
});

// POST /api/auth/change-password
router.post('/change-password', verifyToken, (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords required' });
    if (new_password.length < 6) return res.status(400).json({ error: 'New password too short' });

    const valid = bcrypt.compareSync(current_password, req.user.password);
    if (!valid) return res.status(401).json({ error: 'Current password incorrect' });

    const hash = bcrypt.hashSync(new_password, 10);
    getDB().prepare('UPDATE users SET password=?, updated_at=datetime("now") WHERE id=?').run(hash, req.user.id);
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router;
