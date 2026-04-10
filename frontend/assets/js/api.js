/* ============================================================
   Ultra Trading Platform – API Client
   Shared across all pages
   ============================================================ */
const API_BASE = window.location.origin + '/api';

const UltraAPI = {
  token: localStorage.getItem('ultra_token'),

  setToken(t) { this.token = t; localStorage.setItem('ultra_token', t); },
  clearToken() { this.token = null; localStorage.removeItem('ultra_token'); localStorage.removeItem('ultra_user'); },

  async _req(method, path, body, multipart) {
    const headers = {};
    if (this.token) headers['Authorization'] = 'Bearer ' + this.token;
    if (!multipart) headers['Content-Type'] = 'application/json';

    const opts = { method, headers };
    if (body) opts.body = multipart ? body : JSON.stringify(body);

    const res = await fetch(API_BASE + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  get: (path) => UltraAPI._req('GET', path),
  post: (path, body) => UltraAPI._req('POST', path, body),
  put: (path, body) => UltraAPI._req('PUT', path, body),
  delete: (path) => UltraAPI._req('DELETE', path),
  postForm: (path, fd) => UltraAPI._req('POST', path, fd, true),

  // Auth
  login: (u, p) => UltraAPI.post('/auth/login', { username: u, password: p }),
  signup: (u, e, p) => UltraAPI.post('/auth/signup', { username: u, email: e, password: p }),
  me: () => UltraAPI.get('/auth/me'),

  // Market
  assets: (cat, search) => UltraAPI.get(`/market/assets${cat||search ? '?' + new URLSearchParams({...(cat?{category:cat}:{}), ...(search?{search}:{})}).toString() : ''}`),
  prices: () => UltraAPI.get('/market/prices'),
  asset: (sym) => UltraAPI.get(`/market/asset/${encodeURIComponent(sym)}`),

  // Trade
  placeTrade: (d) => UltraAPI.post('/trade/place', d),
  tradeHistory: (f, pg) => UltraAPI.get(`/trade/history?filter=${f||''}&page=${pg||1}`),
  tradeStats: () => UltraAPI.get('/trade/stats'),
  pendingTrades: () => UltraAPI.get('/trade/pending'),

  // Payment
  paymentSettings: () => UltraAPI.get('/payment/settings'),
  deposit: (fd) => UltraAPI.postForm('/payment/deposit', fd),
  withdraw: (d) => UltraAPI.post('/payment/withdraw', d),
  paymentHistory: () => UltraAPI.get('/payment/history'),

  // User
  profile: () => UltraAPI.get('/user/profile'),
  balance: () => UltraAPI.get('/user/balance'),
  notifications: () => UltraAPI.get('/user/notifications'),

  // Admin
  admin: {
    dashboard: () => UltraAPI.get('/admin/dashboard'),
    users: () => UltraAPI.get('/admin/users'),
    updateUser: (id, d) => UltraAPI.put(`/admin/users/${id}`, d),
    deleteUser: (id) => UltraAPI.delete(`/admin/users/${id}`),
    addBalance: (id, amt) => UltraAPI.post(`/admin/users/${id}/add-balance`, { amount: amt }),
    payments: (s) => UltraAPI.get(`/admin/payments${s ? '?status=' + s : ''}`),
    processPayment: (id, action, note) => UltraAPI.put(`/admin/payments/${id}`, { action, admin_note: note }),
    assets: () => UltraAPI.get('/admin/assets'),
    addAsset: (d) => UltraAPI.post('/admin/assets', d),
    updateAsset: (id, d) => UltraAPI.put(`/admin/assets/${id}`, d),
    deleteAsset: (id) => UltraAPI.delete(`/admin/assets/${id}`),
    settings: () => UltraAPI.get('/admin/settings'),
    saveSettings: (d) => UltraAPI.put('/admin/settings', d),
    graph: () => UltraAPI.get('/admin/graph'),
    updateGraph: (asset, d) => UltraAPI.put(`/admin/graph/${encodeURIComponent(asset)}`, d),
    notifications: () => UltraAPI.get('/admin/notifications'),
    markNotifRead: () => UltraAPI.put('/admin/notifications/read-all', {}),
    ads: () => UltraAPI.get('/admin/ads'),
    addAd: (d) => UltraAPI.post('/admin/ads', d),
    deleteAd: (id) => UltraAPI.delete(`/admin/ads/${id}`),
    toggleAd: (id) => UltraAPI.put(`/admin/ads/${id}/toggle`, {}),
    tradeResult: (id, result) => UltraAPI.put(`/admin/trade/${id}/result`, { result }),
  }
};

/* ── Auth Guard ─────────────────────────────────────────────── */
function requireAuth(redirectTo = '/') {
  if (!UltraAPI.token) { window.location.href = redirectTo; return false; }
  return true;
}

/* ── Stored user ────────────────────────────────────────────── */
function getStoredUser() {
  try { return JSON.parse(localStorage.getItem('ultra_user') || 'null'); } catch { return null; }
}
function storeUser(u) { localStorage.setItem('ultra_user', JSON.stringify(u)); }

/* ── Toast Notifications ─────────────────────────────────────── */
function showToast(msg, type = 'info', duration = 3000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;max-width:320px;pointer-events:none;';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  const colors = { success:'#10b981', error:'#ef4444', info:'#3b82f6', warning:'#f59e0b' };
  toast.style.cssText = `background:${colors[type]||colors.info};color:#fff;padding:12px 16px;border-radius:10px;font-size:14px;font-weight:600;box-shadow:0 4px 20px rgba(0,0,0,0.4);transform:translateX(120%);transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1);pointer-events:auto;`;
  toast.textContent = msg;
  container.appendChild(toast);
  requestAnimationFrame(() => { toast.style.transform = 'translateX(0)'; });
  setTimeout(() => {
    toast.style.transform = 'translateX(120%)';
    setTimeout(() => toast.remove(), 350);
  }, duration);
}

/* ── Format helpers ─────────────────────────────────────────── */
const fmt = {
  currency: (n) => '₹' + parseFloat(n||0).toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:2}),
  price: (n) => parseFloat(n||0) > 100 ? parseFloat(n).toFixed(2) : parseFloat(n||0).toFixed(4),
  pct: (n) => (n >= 0 ? '+' : '') + parseFloat(n||0).toFixed(2) + '%',
  date: (s) => s ? new Date(s).toLocaleString('en-IN') : '-',
  timeAgo: (s) => {
    const d = (Date.now() - new Date(s+'Z')) / 1000;
    if (d < 60) return Math.floor(d) + 's ago';
    if (d < 3600) return Math.floor(d/60) + 'm ago';
    if (d < 86400) return Math.floor(d/3600) + 'h ago';
    return Math.floor(d/86400) + 'd ago';
  }
};

/* ── Ripple effect ──────────────────────────────────────────── */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button, .ripple-target');
  if (!btn) return;
  const r = document.createElement('span');
  r.className = 'ripple';
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  r.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX-rect.left-size/2}px;top:${e.clientY-rect.top-size/2}px;`;
  btn.appendChild(r);
  setTimeout(() => r.remove(), 700);
});

/* ── Sound Engine (Web Audio API) ──────────────────────────── */
const SoundEngine = {
  ctx: null,
  enabled: true,
  init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext||window.webkitAudioContext)(); } catch(e){} } },
  play(type) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.connect(g); g.connect(this.ctx.destination);
    const configs = {
      buy: { freq:880, type:'sine', dur:0.15, vol:0.3 },
      sell: { freq:440, type:'sine', dur:0.15, vol:0.3 },
      win: { freq:1047, type:'triangle', dur:0.4, vol:0.4 },
      lose: { freq:220, type:'sawtooth', dur:0.4, vol:0.2 },
      click: { freq:600, type:'sine', dur:0.05, vol:0.15 },
      notify: { freq:660, type:'sine', dur:0.25, vol:0.3 },
    };
    const c = configs[type] || configs.click;
    o.type = c.type; o.frequency.setValueAtTime(c.freq, this.ctx.currentTime);
    g.gain.setValueAtTime(c.vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + c.dur);
    o.start(this.ctx.currentTime); o.stop(this.ctx.currentTime + c.dur);
  }
};
