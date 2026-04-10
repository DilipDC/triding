'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');

// 📦 Routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const tradeRoutes = require('./routes/trade');
const marketRoutes = require('./routes/market');
const paymentRoutes = require('./routes/payment');
const adminRoutes = require('./routes/admin');
const graphRoutes = require('./routes/graph');

// 🗄 Database
const { setupDatabase } = require('./models/database');

const app = express();
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────
// 🔐 SECURITY
// ─────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());

// ─────────────────────────────────────────
// 🚦 RATE LIMIT
// ─────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20
});

// ─────────────────────────────────────────
// 📥 BODY PARSER
// ─────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 📊 Logger
app.use(morgan('dev'));

// ─────────────────────────────────────────
// 📁 PATH SETUP
// ─────────────────────────────────────────
const frontendPath = path.join(__dirname, '../frontend');
const adminPath = path.join(__dirname, '../admin-panel');
const uploadsPath = path.join(__dirname, '../uploads');

// ─────────────────────────────────────────
// 📂 STATIC FILES
// ─────────────────────────────────────────
app.use(express.static(frontendPath));
app.use('/admin', express.static(adminPath));
app.use('/uploads', express.static(uploadsPath));

// ─────────────────────────────────────────
// 🔗 API ROUTES
// ─────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/user', apiLimiter, userRoutes);
app.use('/api/trade', apiLimiter, tradeRoutes);
app.use('/api/market', apiLimiter, marketRoutes);
app.use('/api/payment', apiLimiter, paymentRoutes);
app.use('/api/admin', apiLimiter, adminRoutes);
app.use('/api/graph', apiLimiter, graphRoutes);

// ─────────────────────────────────────────
// ❤️ HEALTH CHECK
// ─────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString()
  });
});

// ─────────────────────────────────────────
// 🌐 FRONTEND ROUTES
// ─────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'pages/trade.html'));
});

app.get('/trade', (req, res) => {
  res.sendFile(path.join(frontendPath, 'pages/trade.html'));
});

app.get('/history', (req, res) => {
  res.sendFile(path.join(frontendPath, 'pages/history.html'));
});

app.get('/markets', (req, res) => {
  res.sendFile(path.join(frontendPath, 'pages/markets.html'));
});

app.get('/profile', (req, res) => {
  res.sendFile(path.join(frontendPath, 'pages/profile.html'));
});

app.get('/admin-panel', (req, res) => {
  res.sendFile(path.join(adminPath, 'admin.html'));
});

// ─────────────────────────────────────────
// 🔁 SPA FALLBACK (CRITICAL)
// ─────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'pages/trade.html'));
});

// ─────────────────────────────────────────
// ❌ ERROR HANDLER
// ─────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ ERROR:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

// ─────────────────────────────────────────
// 🚀 START SERVER
// ─────────────────────────────────────────
async function startServer() {
  try {
    await setupDatabase();

    app.listen(PORT, () => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 http://localhost:${PORT}`);
      console.log(`📊 Admin → http://localhost:${PORT}/admin-panel`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔑 Admin Login: admin / admin123');
      console.log('👤 User Login: demo_user / user123');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    });

  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

startServer();

module.exports = app;
