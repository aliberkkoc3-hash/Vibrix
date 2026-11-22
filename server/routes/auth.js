'use strict';
const express = require('express');
const { z } = require('zod');
const { db } = require('../db');
const { hashPassword, verifyPassword } = require('../password');
const {
  createSession, setSessionCookie, clearSessionCookie, revokeSession, revokeAllForUser, requireAuth,
} = require('../auth');
const { rateLimit } = require('../ratelimit');
const { userStats } = require('../stats');

const router = express.Router();

const usernameSchema = z.string().trim().min(3, 'Kullanıcı adı en az 3 karakter olmalı.').max(20, 'Kullanıcı adı en fazla 20 karakter olabilir.')
  .regex(/^[a-zA-Z0-9_]+$/, 'Kullanıcı adı yalnızca harf, rakam ve alt çizgi içerebilir.');
const emailSchema = z.string().trim().toLowerCase().max(160).email('Geçerli bir e-posta adresi girin.');
const passwordSchema = z.string().min(8, 'Şifre en az 8 karakter olmalı.').max(128, 'Şifre en fazla 128 karakter olabilir.');

const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  passwordConfirm: z.string(),
  remember: z.boolean().optional(),
}).refine((d) => d.password === d.passwordConfirm, { message: 'Şifreler birbiriyle uyuşmuyor.', path: ['passwordConfirm'] });

function publicUser(u) {
  return { id: u.id, username: u.username, email: u.email, avatar: u.avatar, bio: u.bio, createdAt: u.created_at };
}

router.post('/register', rateLimit({ windowMs: 10 * 60 * 1000, max: 20, message: 'Çok fazla kayıt denemesi. Lütfen daha sonra tekrar deneyin.' }), (req, res) => {
  const parsed = registerSchema.safeParse(req.body || {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json({ error: first.message, field: first.path?.[0] });
  }
  const { username, email, password, remember } = parsed.data;
  const existingName = db.prepare('SELECT id FROM users WHERE username_lower = ?').get(username.toLowerCase());
  if (existingName) return res.status(409).json({ error: 'Bu kullanıcı adı zaten alınmış.', field: 'username' });
  const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existingEmail) return res.status(409).json({ error: 'Bu e-posta adresi zaten kayıtlı.', field: 'email' });

  const hash = hashPassword(password);
  let userId;
  try {
    const info = db.prepare('INSERT INTO users (username, username_lower, email, password_hash, avatar, bio) VALUES (?,?,?,?,?,?)')
      .run(username, username.toLowerCase(), email, hash, null, '');
    userId = info.lastInsertRowid;
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Bu kullanıcı adı veya e-posta zaten kayıtlı.' });
    throw e;
  }
  db.prepare('INSERT OR IGNORE INTO competitive_ratings (user_id, rating, peak_rating, rated_plays) VALUES (?, 0, 0, 0)').run(userId);
  const session = createSession(userId, { remember: !!remember, userAgent: req.headers['user-agent'], ip: req.ip });
  setSessionCookie(res, session);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  res.status(201).json({ user: publicUser(user), stats: userStats(userId) });
});

router.post('/login', rateLimit({ windowMs: 5 * 60 * 1000, max: 25, message: 'Çok fazla giriş denemesi. Lütfen 5 dakika sonra tekrar deneyin.' }), (req, res) => {
  const schema = z.object({
    identifier: z.string().trim().min(1, 'Kullanıcı adı veya e-posta girin.').max(160),
    password: z.string().min(1, 'Şifre girin.').max(128),
    remember: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { identifier, password, remember } = parsed.data;
  const id = identifier.toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE username_lower = ? OR email = ?').get(id, id);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Kullanıcı adı/e-posta veya şifre hatalı.' });
  }
  const session = createSession(user.id, { remember: !!remember, userAgent: req.headers['user-agent'], ip: req.ip });
  setSessionCookie(res, session);
  db.prepare("UPDATE users SET last_seen_at = datetime('now') WHERE id = ?").run(user.id);
  res.json({ user: publicUser(user), stats: userStats(user.id) });
});

router.post('/logout', (req, res) => {
  revokeSession(req.sessionToken);
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.post('/logout-all', requireAuth, (req, res) => {
  revokeAllForUser(req.user.id);
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(u), stats: userStats(u.id) });
});

const profileSchema = z.object({
  bio: z.string().max(280, 'Biyografi en fazla 280 karakter olabilir.').optional(),
  avatar: z.string().max(500).nullable().optional(),
});

router.patch('/me', requireAuth, (req, res) => {
  const parsed = profileSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { bio, avatar } = parsed.data;
  if (bio !== undefined) db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(bio, req.user.id);
  if (avatar !== undefined) db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar || null, req.user.id);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(u) });
});

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Mevcut şifrenizi girin.'),
  newPassword: passwordSchema,
});

router.post('/password', requireAuth, rateLimit({ windowMs: 10 * 60 * 1000, max: 10 }), (req, res) => {
  const parsed = passwordChangeSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(parsed.data.currentPassword, u.password_hash)) {
    return res.status(403).json({ error: 'Mevcut şifreniz hatalı.' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(parsed.data.newPassword), u.id);
  revokeAllForUser(u.id);
  const session = createSession(u.id, { remember: true, userAgent: req.headers['user-agent'], ip: req.ip });
  setSessionCookie(res, session);
  res.json({ ok: true, message: 'Şifreniz güncellendi. Diğer oturumlar kapatıldı.' });
});

module.exports = { router, publicUser };
