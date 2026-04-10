'use strict';
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDB } = require('../models/database');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

const uploadDir = path.join(__dirname, '../../uploads/screenshots');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  if (/image\/(jpeg|jpg|png|webp)/.test(file.mimetype)) cb(null, true);
  else cb(new Error('Only images allowed'));
}});

// GET /api/payment/settings - get deposit/withdraw settings
router.get('/settings', (req, res) => {
  try {
    const db = getDB();
    const rows = db.prepare("SELECT key, value FROM settings WHERE key IN ('payment_lock','payment_lock_timer','deposit_min','withdraw_min','qr_image')").all();
    const s = {};
    rows.forEach(r => s[r.key] = r.value);
    res.json(s);
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// POST /api/payment/deposit
router.post('/deposit', verifyToken, upload.single('screenshot'), (req, res) => {
  try {
    const { amount } = req.body;
    const db = getDB();
    const minRow = db.prepare("SELECT value FROM settings WHERE key='deposit_min'").get();
    const minDeposit = parseFloat(minRow?.value || '100');
    const lockRow = db.prepare("SELECT value FROM settings WHERE key='payment_lock'").get();

    if (lockRow?.value === 'true') return res.status(403).json({ error: 'Deposits are currently locked by admin' });
    if (!amount || parseFloat(amount) < minDeposit) return res.status(400).json({ error: `Minimum deposit is ₹${minDeposit}` });

    const screenshot = req.file ? `/uploads/screenshots/${req.file.filename}` : null;
    const result = db.prepare(`
      INSERT INTO payments (user_id, type, amount, status, screenshot) VALUES (?, 'deposit', ?, 'pending', ?)
    `).run(req.user.id, parseFloat(amount), screenshot);

    // Notify admin
    db.prepare(`INSERT INTO notifications (type, title, message) VALUES ('payment', '💰 New Deposit Request', ?)`).run(
      `User ${req.user.username} requested deposit of ₹${amount}`
    );

    res.json({ message: 'Deposit request submitted. Awaiting admin approval.', payment_id: result.lastInsertRowid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit deposit' });
  }
});

// POST /api/payment/withdraw
router.post('/withdraw', verifyToken, (req, res) => {
  try {
    const { amount, upi_id, upi_name } = req.body;
    const db = getDB();
    const minRow = db.prepare("SELECT value FROM settings WHERE key='withdraw_min'").get();
    const minWithdraw = parseFloat(minRow?.value || '150');
    const lockRow = db.prepare("SELECT value FROM settings WHERE key='payment_lock'").get();

    if (lockRow?.value === 'true') return res.status(403).json({ error: 'Withdrawals are currently locked by admin' });
    if (!amount || parseFloat(amount) < minWithdraw) return res.status(400).json({ error: `Minimum withdrawal is ₹${minWithdraw}` });
    if (!upi_id || !upi_name) return res.status(400).json({ error: 'UPI ID and name are required' });

    const user = db.prepare('SELECT balance FROM users WHERE id=?').get(req.user.id);
    if (user.balance < parseFloat(amount)) return res.status(400).json({ error: 'Insufficient balance' });

    // Hold balance
    db.prepare('UPDATE users SET balance=balance-? WHERE id=?').run(parseFloat(amount), req.user.id);
    const result = db.prepare(`
      INSERT INTO payments (user_id, type, amount, upi_id, upi_name, status) VALUES (?, 'withdraw', ?, ?, ?, 'pending')
    `).run(req.user.id, parseFloat(amount), upi_id, upi_name);

    db.prepare(`INSERT INTO notifications (type, title, message) VALUES ('payment', '💸 New Withdrawal Request', ?)`).run(
      `User ${req.user.username} requested withdrawal of ₹${amount} to UPI: ${upi_id}`
    );

    res.json({ message: 'Withdrawal request submitted. Processing...', payment_id: result.lastInsertRowid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit withdrawal' });
  }
});

// GET /api/payment/history
router.get('/history', verifyToken, (req, res) => {
  try {
    const payments = getDB().prepare('SELECT * FROM payments WHERE user_id=? ORDER BY created_at DESC').all(req.user.id);
    res.json({ payments });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
