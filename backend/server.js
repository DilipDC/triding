'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const tradeRoutes = require('./routes/trade');
const marketRoutes = require('./routes/market');
const paymentRoutes = require('./routes/payment');
const adminRoutes = require('./routes/admin');
const graphRoutes = require('./routes/graph');

const { setupDatabase } = require('./models/database');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security middleware ──────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','PATCH'], allowedHeaders: ['Content-Type','Authorization'] }));

// ── Rate limiting ────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));

// ── Static files ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/admin', express.static(path.join(__dirname, '../admin-panel')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/user', apiLimiter, userRoutes);
app.use('/api/trade', apiLimiter, tradeRoutes);
app.use('/api/market', apiLimiter, marketRoutes);
app.use('/api/payment', apiLimiter, paymentRoutes);
app.use('/api/admin', apiLimiter, adminRoutes);
app.use('/api/graph', apiLimiter, graphRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── Frontend page routes ───────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/trade.html')));
app.get('/trade', (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/trade.html')));
app.get('/history', (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/history.html')));
app.get('/markets', (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/markets.html')));
app.get('/profile', (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/profile.html')));
app.get('/admin-panel', (req, res) => res.sendFile(path.join(__dirname, '../admin-panel/admin.html')));

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ── Boot ──────────────────────────────────────────────────────────────────────
setupDatabase();
app.listen(PORT, () => {
  console.log(`\n🚀 Ultra Trading Platform running at http://localhost:${PORT}`);
  console.log(`📊 Admin panel: http://localhost:${PORT}/admin-panel`);
  console.log(`🔑 Admin: admin / admin123   |   User: demo_user / user123\n`);
});

module.exports = app;
