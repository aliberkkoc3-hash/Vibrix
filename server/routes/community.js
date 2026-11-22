'use strict';
/** Liderlik tabloları, oyuncu profilleri ve ayarlar */
const express = require('express');
const { z } = require('zod');
const { db } = require('../db');
const { requireAuth } = require('../auth');
const { userStats, globalLeaderboard, chartLeaderboard, userChartPosition } = require('../stats');
const { publicUser } = require('./auth');

const router = express.Router();

/**
 * Site sahibi — OWNER_USER env değişkeniyle belirlenir (ör. OWNER_USER=BFAli).
 * Tanımlı değilse en düşük id'li kullanıcı sahip sayılır.
 */
function isOwner(user) {
  if (!user) return false;
  const envName = (process.env.OWNER_USER || '').trim().toLowerCase();
  if (envName) return String(user.username || '').toLowerCase() === envName;
  const first = db.prepare('SELECT username FROM users ORDER BY id LIMIT 1').get();
  return !!first && first.username.toLowerCase() === String(user.username || '').toLowerCase();
}

router.get('/leaderboard', (req, res) => {
  const period = ['all', 'weekly', 'monthly'].includes(req.query.period) ? req.query.period : 'all';
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const search = String(req.query.q || '').trim();
  const data = globalLeaderboard({ period, limit, offset, search });
  let myPosition = null;
  if (req.user) {
    const all = globalLeaderboard({ period, limit: 100000, offset: 0 });
    const idx = all.entries.findIndex((e) => e.userId === req.user.id);
    if (idx >= 0) myPosition = { ...all.entries[idx], position: idx + 1 };
  }
  res.json({ ...data, period, myPosition });
});

/** Global rating sıralaması */
router.get('/rating-leaderboard', (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const rows = db.prepare(`
    SELECT r.user_id, r.rating, r.peak_rating, r.rated_plays, u.username, u.avatar
    FROM competitive_ratings r JOIN users u ON u.id = r.user_id
    WHERE r.rated_plays > 0
    ORDER BY r.rating DESC, r.rated_plays DESC, r.user_id ASC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
  const total = db.prepare('SELECT COUNT(*) AS c FROM competitive_ratings WHERE rated_plays > 0').get().c;
  res.json({
    total,
    entries: rows.map((r, i) => ({
      position: offset + i + 1, userId: r.user_id, username: r.username, avatar: r.avatar,
      rating: Number(r.rating.toFixed(2)), peakRating: Number(r.peak_rating.toFixed(2)), ratedPlays: r.rated_plays,
    })),
  });
});

router.get('/users/:username', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE username_lower = ?').get(String(req.params.username).toLowerCase());
  if (!u) return res.status(404).json({ error: 'Oyuncu bulunamadı.' });
  const stats = userStats(u.id);
  const records = db.prepare(`
    SELECT pb.*, c.song_title, c.artist, c.cover, c.difficulty, c.difficulty_level, c.id AS chart_id
    FROM personal_bests pb JOIN charts c ON c.id = pb.chart_id
    JOIN score_attempts a ON a.id = pb.attempt_id
    WHERE pb.user_id = ? AND a.validation_status='valid' AND a.is_test = 0
    ORDER BY pb.achieved_at DESC LIMIT 20
  `).all(u.id);
  const recent = db.prepare(`
    SELECT a.id, a.score, a.accuracy, a.max_combo, a.misses, a.rank, a.submitted_at, a.validation_status,
           c.id AS chart_id, c.song_title, c.artist, c.cover, c.difficulty
    FROM score_attempts a JOIN charts c ON c.id = a.chart_id
    WHERE a.user_id = ? AND a.is_test = 0 ORDER BY a.submitted_at DESC LIMIT 15
  `).all(u.id);
  const published = db.prepare(`
    SELECT id, song_title, artist, cover, difficulty, bpm, note_count, play_count, published_at
    FROM charts WHERE owner_id = ? AND publication_status = 'published' ORDER BY published_at DESC LIMIT 20
  `).all(u.id);
  const history = db.prepare('SELECT rating, delta, created_at FROM rating_history WHERE user_id=? ORDER BY id DESC LIMIT 30').all(u.id).reverse();
  res.json({
    user: { ...publicUser(u), lastSeenAt: u.last_seen_at },
    stats,
    records: records.map((r) => ({
      chartId: r.chart_id, songTitle: r.song_title, artist: r.artist, cover: r.cover, difficulty: r.difficulty,
      score: r.best_score, accuracy: r.best_accuracy, maxCombo: r.max_combo, rank: r.rank, achievedAt: r.achieved_at,
    })),
    recent: recent.map((r) => ({
      id: r.id, chartId: r.chart_id, songTitle: r.song_title, artist: r.artist, cover: r.cover,
      difficulty: r.difficulty, score: r.score, accuracy: r.accuracy, maxCombo: r.max_combo,
      misses: r.misses, rank: r.rank, submittedAt: r.submitted_at, validationStatus: r.validation_status,
    })),
    publishedCharts: published,
    ratingHistory: history.map((h) => ({ rating: Number(h.rating.toFixed(2)), delta: Number(h.delta.toFixed(2)), at: h.created_at })),
  });
});

/** Oturum açmış kullanıcının tüm özel istatistikleri */
router.get('/me/overview', requireAuth, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const stats = userStats(u.id);
  const records = db.prepare(`
    SELECT pb.*, c.song_title, c.artist, c.cover, c.difficulty, c.id AS chart_id
    FROM personal_bests pb JOIN charts c ON c.id = pb.chart_id
    JOIN score_attempts a ON a.id = pb.attempt_id
    WHERE pb.user_id = ? AND a.validation_status='valid' AND a.is_test=0
    ORDER BY pb.achieved_at DESC LIMIT 10
  `).all(u.id);
  const recent = db.prepare(`
    SELECT a.id, a.score, a.accuracy, a.max_combo, a.misses, a.rank, a.submitted_at, a.validation_status,
           c.id AS chart_id, c.song_title, c.artist, c.cover, c.difficulty
    FROM score_attempts a JOIN charts c ON c.id = a.chart_id
    WHERE a.user_id = ? AND a.is_test=0 ORDER BY a.submitted_at DESC LIMIT 10
  `).all(u.id);
  const chartCount = db.prepare('SELECT COUNT(*) AS c FROM charts WHERE owner_id=?').get(u.id).c;
  res.json({
    user: publicUser(u),
    stats: { ...stats, chartsCreated: chartCount },
    records: records.map((r) => ({
      chartId: r.chart_id, songTitle: r.song_title, artist: r.artist, cover: r.cover, difficulty: r.difficulty,
      score: r.best_score, accuracy: r.best_accuracy, maxCombo: r.max_combo, rank: r.rank, achievedAt: r.achieved_at,
    })),
    recent: recent.map((r) => ({
      id: r.id, chartId: r.chart_id, songTitle: r.song_title, artist: r.artist, cover: r.cover,
      difficulty: r.difficulty, score: r.score, accuracy: r.accuracy, maxCombo: r.max_combo,
      misses: r.misses, rank: r.rank, submittedAt: r.submitted_at, validationStatus: r.validation_status,
    })),
  });
});

/** Oynanış geçmişi (tüm denemeler) */
router.get('/me/history', requireAuth, (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const rows = db.prepare(`
    SELECT a.*, c.song_title, c.artist, c.cover, c.difficulty, c.id AS chart_id
    FROM score_attempts a JOIN charts c ON c.id = a.chart_id
    WHERE a.user_id = ? ORDER BY a.submitted_at DESC LIMIT ? OFFSET ?
  `).all(req.user.id, limit, offset);
  const total = db.prepare('SELECT COUNT(*) AS c FROM score_attempts WHERE user_id = ?').get(req.user.id).c;
  res.json({
    total,
    attempts: rows.map((r) => ({
      id: r.id, chartId: r.chart_id, songTitle: r.song_title, artist: r.artist, cover: r.cover, difficulty: r.difficulty,
      score: r.score, accuracy: r.accuracy, maxCombo: r.max_combo, misses: r.misses, rank: r.rank,
      submittedAt: r.submitted_at, validationStatus: r.validation_status, isTest: !!r.is_test,
    })),
  });
});

/** Ayarlar */
const settingsSchema = z.object({
  audio: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])).optional(),
  gameplay: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])).optional(),
  visual: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])).optional(),
  keys: z.record(z.string(), z.string().max(20)).optional(),
});

function readSettings(userId) {
  const row = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
  if (!row) return { audio: {}, gameplay: {}, visual: {}, keys: {} };
  const parse = (s) => { try { return JSON.parse(s); } catch { return {}; } };
  return {
    audio: parse(row.audio_settings), gameplay: parse(row.gameplay_settings),
    visual: parse(row.visual_settings), keys: parse(row.key_bindings),
  };
}

router.get('/me/settings', requireAuth, (req, res) => res.json({ settings: readSettings(req.user.id) }));

router.put('/me/settings', requireAuth, (req, res) => {
  const parsed = settingsSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'Ayarlar geçersiz.' });
  const current = readSettings(req.user.id);
  const next = {
    audio: { ...current.audio, ...(parsed.data.audio || {}) },
    gameplay: { ...current.gameplay, ...(parsed.data.gameplay || {}) },
    visual: { ...current.visual, ...(parsed.data.visual || {}) },
    keys: { ...current.keys, ...(parsed.data.keys || {}) },
  };
  db.prepare(`
    INSERT INTO user_settings (user_id, audio_settings, gameplay_settings, visual_settings, key_bindings, updated_at)
    VALUES (?,?,?,?,?,datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET audio_settings=excluded.audio_settings, gameplay_settings=excluded.gameplay_settings,
      visual_settings=excluded.visual_settings, key_bindings=excluded.key_bindings, updated_at=excluded.updated_at
  `).run(req.user.id, JSON.stringify(next.audio), JSON.stringify(next.gameplay), JSON.stringify(next.visual), JSON.stringify(next.keys));
  res.json({ settings: next });
});

/** Puanlama sistemi açıklaması (şeffaflık) */
router.get('/meta/scoring', (req, res) => {
  res.json({
    maxNoteScore: 300,
    comboBonusMax: 50,
    judgments: [
      { key: 'perfect', label: 'KUSURSUZ', windowMs: 45, points: 300, weight: 1 },
      { key: 'great', label: 'MÜKEMMEL', windowMs: 85, points: 200, weight: 0.7 },
      { key: 'good', label: 'İYİ', windowMs: 120, points: 100, weight: 0.4 },
      { key: 'bad', label: 'ZAYIF', windowMs: 165, points: 30, weight: 0.1 },
      { key: 'miss', label: 'KAÇTI :(', windowMs: null, points: 0, weight: 0 },
    ],
    ranks: [
      { rank: 'SS', rule: 'Tüm notalar KUSURSUZ' },
      { rank: 'S', rule: 'Doğruluk ≥ 98%' },
      { rank: 'A', rule: 'Doğruluk ≥ 93%' },
      { rank: 'B', rule: 'Doğruluk ≥ 86%' },
      { rank: 'C', rule: 'Doğruluk ≥ 75%' },
      { rank: 'D', rule: 'Doğruluk < 75%' },
    ],
    rating: 'Rating, yalnızca kişisel rekorunuz geliştiğinde güncellenir: derece temelli taban puan (SS 100, S 85, A 65, B 45, C 25, D 10) × zorluk çarpanı (1-15 arası, 0.7-1.3) + doğruluk × 0.05. Yeni rating = eski × 0.82 + performans × 0.18.',
    leaderboard: 'Harita sıralaması: skor → doğruluk → maks. kombo → daha erken tarih. Global tablo: dönemdeki en iyi denemelerin toplam skoru.',
  });
});

module.exports = { router, readSettings };

/* ------------------------------------------------------------------ */
/* Chart Editor kilidi — sahip istediğinde kapatır/açar                 */
/* ------------------------------------------------------------------ */

const EDITOR_OPEN_KEY = 'editor_open';

function isEditorOpen() {
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(EDITOR_OPEN_KEY);
  return !row || row.value !== '0'; // varsayılan: açık
}

/** Kilit durumu (herkes görebilir) */
router.get('/editor/status', (req, res) => {
  res.json({ open: isEditorOpen(), isOwner: isOwner(req.user) });
});

/** Kilidi değiştir (yalnızca sahip) */
router.put('/editor/status', requireAuth, (req, res) => {
  if (!isOwner(req.user)) return res.status(403).json({ error: 'Bu ayarı yalnızca site sahibi değiştirebilir.' });
  const open = !!req.body?.open;
  db.prepare(`INSERT INTO app_meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(EDITOR_OPEN_KEY, open ? '1' : '0');
  res.json({ open });
});

