'use strict';
/** Grafik okuma uçları: keşfet, arama, filtre, detay, kendi grafiklerim */
const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../auth');
const { chartRowToJson } = require('./charts-write');
const { chartLeaderboard, userChartPosition } = require('../stats');

const router = express.Router();

const SORTS = {
  newest: 'c.published_at DESC, c.id DESC',
  popular: 'c.play_count DESC, c.published_at DESC',
  trending: `(c.play_count + 8 * (SELECT COUNT(*) FROM score_attempts a WHERE a.chart_id = c.id AND a.submitted_at >= datetime('now','-7 days'))) DESC, c.published_at DESC`,
  alpha: 'c.song_title COLLATE NOCASE ASC',
  best: '(SELECT MAX(pb.best_score) FROM personal_bests pb WHERE pb.chart_id = c.id) DESC',
};

router.get('/', (req, res) => {
  const q = String(req.query.q || '').trim();
  const sort = SORTS[req.query.sort] ? req.query.sort : 'newest';
  const difficulty = String(req.query.difficulty || '').trim();
  const bpmMin = req.query.bpmMin !== undefined && req.query.bpmMin !== '' ? Number(req.query.bpmMin) : null;
  const bpmMax = req.query.bpmMax !== undefined && req.query.bpmMax !== '' ? Number(req.query.bpmMax) : null;
  const lenMax = req.query.lenMax !== undefined && req.query.lenMax !== '' ? Number(req.query.lenMax) : null;
  const owner = req.query.owner ? Number(req.query.owner) : null;
  const series = String(req.query.series || '').trim();
  const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 24));
  const offset = Math.max(0, Number(req.query.offset) || 0);

  const where = [`c.publication_status = 'published'`];
  const params = [];
  if (q) {
    where.push('(c.song_title LIKE ? OR c.artist LIKE ? OR u.username LIKE ? OR c.description LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (difficulty) { where.push('c.difficulty = ?'); params.push(difficulty); }
  if (Number.isFinite(bpmMin)) { where.push('c.bpm >= ?'); params.push(bpmMin); }
  if (Number.isFinite(bpmMax)) { where.push('c.bpm <= ?'); params.push(bpmMax); }
  if (Number.isFinite(lenMax)) { where.push('c.length_ms <= ?'); params.push(lenMax); }
  if (owner) { where.push('c.owner_id = ?'); params.push(owner); }
  // Seri filtresi: başlıktaki kelimeler tire/boşluk farkı gözetmeden aranır
  // ("Vibrix Apocalypse" → "Vibrix-Apocalypse" başlıklarını da bulur)
  if (series) {
    // Önce grafikte kayıtlı paket adı, yoksa başlıktaki kelimeler
    const words = series.split(/[\s\-]+/).filter(Boolean);
    const titleMatch = words.map(() => 'c.song_title LIKE ?').join(' AND ');
    where.push(`(c.chart_data LIKE ? OR (${titleMatch}))`);
    params.push(`%"series":"${series.replace(/"/g, '')}"%`, ...words.map((w) => `%${w}%`));
  }

  const whereSql = where.join(' AND ');
  const rows = db.prepare(`
    SELECT c.*, u.username AS owner_name,
      (SELECT MAX(pb.best_score) FROM personal_bests pb JOIN score_attempts a ON a.id = pb.attempt_id
        WHERE pb.chart_id = c.id AND a.validation_status='valid') AS top_score,
      (SELECT COUNT(*) FROM personal_bests pb WHERE pb.chart_id = c.id) AS player_count
    FROM charts c JOIN users u ON u.id = c.owner_id
    WHERE ${whereSql}
    ORDER BY ${SORTS[sort]}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);
  const total = db.prepare(`SELECT COUNT(*) AS c FROM charts c JOIN users u ON u.id = c.owner_id WHERE ${whereSql}`).get(...params).c;

  res.json({
    total,
    limit,
    offset,
    charts: rows.map((r) => ({
      ...chartRowToJson(r),
      owner: r.owner_name,
      topScore: r.top_score || null,
      playerCount: r.player_count,
    })),
  });
});

/** Kendi grafiklerim (taslak + yayınlanan) */
router.get('/mine', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM personal_bests pb WHERE pb.chart_id = c.id) AS player_count
    FROM charts c WHERE c.owner_id = ? ORDER BY c.updated_at DESC
  `).all(req.user.id);
  res.json({ charts: rows.map((r) => ({ ...chartRowToJson(r), playerCount: r.player_count })) });
});

/** Grafik detayı */
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Geçersiz grafik kimliği.' });
  const row = db.prepare('SELECT c.*, u.username AS owner_name FROM charts c JOIN users u ON u.id=c.owner_id WHERE c.id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Grafik bulunamadı.' });
  const isOwner = req.user && req.user.id === row.owner_id;
  if (row.publication_status !== 'published' && !isOwner) {
    return res.status(403).json({ error: 'Bu grafik henüz yayınlanmadı.' });
  }
  const isFavorite = req.user
    ? !!db.prepare('SELECT 1 AS x FROM favorites WHERE user_id=? AND chart_id=?').get(req.user.id, id)
    : false;
  const lb = chartLeaderboard(id, { limit: 5, offset: 0 });
  const mine = req.user ? userChartPosition(id, req.user.id) : null;
  const chart = chartRowToJson(row, { includeData: true, ownerName: row.owner_name, isFavorite });
  chart.isOwner = !!isOwner;
  // Nota verisi yalnızca sahibine ve oynanış için (play=1) verilir.
  // Başkasının grafiğini inceleyen kullanıcı notaları göremez/kopyalayamaz.
  const wantsPlay = req.query.play === '1';
  if (!isOwner && !wantsPlay) delete chart.chartData;
  res.json({
    chart,
    topEntries: lb.entries,
    totalPlayers: lb.total,
    myBest: mine ? {
      score: mine.best_score, accuracy: mine.best_accuracy, maxCombo: mine.max_combo,
      rank: mine.rank, achievedAt: mine.achieved_at, position: mine.position, playCount: mine.play_count,
    } : null,
  });
});

/** Grafik liderlik tablosu */
router.get('/:id/leaderboard', (req, res) => {
  const id = Number(req.params.id);
  const chart = db.prepare('SELECT id, publication_status FROM charts WHERE id = ?').get(id);
  if (!chart) return res.status(404).json({ error: 'Grafik bulunamadı.' });
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const search = String(req.query.q || '').trim();
  const lb = chartLeaderboard(id, { limit, offset, search });
  const mine = req.user ? userChartPosition(id, req.user.id) : null;
  res.json({ ...lb, myBest: mine });
});

/** Oynanışa başlarken oynama sayacı */
router.post('/:id/play', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT id, publication_status, owner_id FROM charts WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Grafik bulunamadı.' });
  if (row.publication_status !== 'published' && (!req.user || req.user.id !== row.owner_id)) {
    return res.status(403).json({ error: 'Bu grafik oynanamaz.' });
  }
  db.prepare('UPDATE charts SET play_count = play_count + 1 WHERE id = ?').run(id);
  res.json({ ok: true });
});

/** Favori ekle / çıkar */
router.post('/:id/favorite', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT id FROM charts WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Grafik bulunamadı.' });
  const existing = db.prepare('SELECT 1 AS x FROM favorites WHERE user_id=? AND chart_id=?').get(req.user.id, id);
  if (existing) {
    db.prepare('DELETE FROM favorites WHERE user_id=? AND chart_id=?').run(req.user.id, id);
    return res.json({ favorite: false });
  }
  db.prepare('INSERT INTO favorites (user_id, chart_id) VALUES (?,?)').run(req.user.id, id);
  res.json({ favorite: true });
});

module.exports = router;
