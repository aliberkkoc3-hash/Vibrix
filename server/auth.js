'use strict';
/** Oturum yönetimi: ham token yalnızca çerezde, veritabanında SHA-256 özeti saklanır. */
const crypto = require('crypto');
const { db } = require('./db');

const COOKIE_NAME = 'vibrix_sid';
const SHORT_DAYS = 1;       // "Beni hatırla" işaretlenmezse
const LONG_DAYS = 30;       // "Beni hatırla" işaretlenirse

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function nowIso() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }

function createSession(userId, { remember = false, userAgent = '', ip = '' } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  const days = remember ? LONG_DAYS : SHORT_DAYS;
  const expires = new Date(Date.now() + days * 86400000);
  db.prepare(`INSERT INTO sessions (user_id, token_hash, expires_at, user_agent, ip) VALUES (?,?,?,?,?)`)
    .run(userId, sha256(token), expires.toISOString(), String(userAgent).slice(0, 250), String(ip).slice(0, 60));
  return { token, expires, maxAgeMs: days * 86400000 };
}

function setSessionCookie(res, session) {
  res.cookie(COOKIE_NAME, session.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // yerel geliştirme (http). Üretimde HTTPS arkasında true yapılmalı.
    path: '/',
    maxAge: session.maxAgeMs,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

function findSessionUser(token) {
  if (!token || typeof token !== 'string') return null;
  const row = db.prepare(`
    SELECT s.id AS sid, s.expires_at, s.revoked_at, u.id, u.username, u.email, u.avatar, u.bio, u.created_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `).get(sha256(token));
  if (!row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').run(nowIso(), row.sid);
    return null;
  }
  return { sid: row.sid, id: row.id, username: row.username, email: row.email, avatar: row.avatar, bio: row.bio, created_at: row.created_at };
}

function revokeSession(token) {
  if (!token) return;
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').run(nowIso(), sha256(token));
}

function revokeAllForUser(userId) {
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(nowIso(), userId);
}

/** Her istekte oturumu çözen middleware */
function sessionMiddleware(req, res, next) {
  const token = req.cookies ? req.cookies[COOKIE_NAME] : null;
  const user = findSessionUser(token);
  req.sessionToken = token;
  req.user = user;
  if (user) {
    // last_used_at güncellemesi en fazla 60 saniyede bir
    try {
      db.prepare(`UPDATE sessions SET last_used_at = ? WHERE id = ? AND last_used_at < datetime('now','-60 seconds')`)
        .run(nowIso(), user.sid);
    } catch { /* yoksay */ }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Bu işlem için oturum açmanız gerekiyor.' });
  next();
}

module.exports = {
  COOKIE_NAME, sessionMiddleware, requireAuth, createSession, setSessionCookie,
  clearSessionCookie, revokeSession, revokeAllForUser, findSessionUser, sha256,
};
