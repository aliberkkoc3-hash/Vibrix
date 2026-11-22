'use strict';
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const cookieParser = require('cookie-parser');
const { sessionMiddleware } = require('./auth');
const { db } = require('./db');
const { router: authRouter } = require('./routes/auth');
const chartsWrite = require('./routes/charts-write');
const chartsRead = require('./routes/charts-read');
const scoresRouter = require('./routes/scores');
const community = require('./routes/community');

const app = express();
const PORT = Number(process.env.PORT) || 4321;
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// Güvenlik başlıkları
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'microphone=(), camera=(), geolocation=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob: data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "connect-src 'self'",
    "font-src 'self' data:",
  ].join('; '));
  next();
});

// Site kilidi (opsiyonel): SITE_USER + SITE_PASS env değişkenleri girilirse
// tüm site HTTP Basic Auth ile korunur. Kimse hesap açamaz, grafik ekleyemez.
const SITE_USER = process.env.SITE_USER || '';
const SITE_PASS = process.env.SITE_PASS || '';
if (SITE_USER && SITE_PASS) {
  app.use((req, res, next) => {
    if (req.path === '/api/health') return next();
    const header = req.headers.authorization || '';
    const [scheme, encoded] = header.split(' ');
    if (scheme === 'Basic' && encoded) {
      const [u, p] = Buffer.from(encoded, 'base64').toString().split(':');
      const okU = u === SITE_USER;
      const okP = p && p.length === SITE_PASS.length
        && crypto.timingSafeEqual(Buffer.from(p), Buffer.from(SITE_PASS));
      if (okU && okP) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Vibrix", charset="UTF-8"');
    res.status(401).send('Vibrix — erişim için giriş gerekli.');
  });
}

app.use(sessionMiddleware);

app.use('/api/auth', authRouter);
app.use('/api/charts', chartsWrite.router);
app.use('/api/charts', chartsRead);
app.use('/api/scores', scoresRouter);
app.use('/api', community.router);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api', (req, res) => res.status(404).json({ error: 'İstenen API uç noktası bulunamadı.' }));

// Statik dosyalar
app.use('/uploads', express.static(path.join(PUBLIC_DIR, 'uploads'), { maxAge: '7d', index: false }));
app.use(express.static(PUBLIC_DIR, { index: false, maxAge: 0 }));

// SPA yönlendirmesi
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Hata yakalayıcı — iç ayrıntılar kullanıcıya gösterilmez
app.use((err, req, res, next) => {
  console.error('[Vibrix hata]', err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Gönderilen veri çok büyük.' });
  if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'Geçersiz JSON gövdesi.' });
  res.status(500).json({ error: 'Sunucuda beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.' });
});

process.on('unhandledRejection', (e) => console.error('[Vibrix] işlenmeyen promise reddi:', e));

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    const count = db.prepare('SELECT COUNT(*) AS c FROM charts').get().c;
    console.log(`Vibrix çalışıyor → http://${HOST}:${PORT}  (kayıtlı grafik: ${count})`);
  });
}

module.exports = app;
