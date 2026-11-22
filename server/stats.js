'use strict';
const { db } = require('./db');

/**
 * Kullanıcı istatistikleri — tamamı gerçek oyuncu verilerinden hesaplanır.
 * is_test = 0 ve validation_status = 'valid' olan denemeler dikkate alınır.
 */
function userStats(userId) {
  const agg = db.prepare(`
    SELECT
      COUNT(*) AS plays,
      COALESCE(SUM(score),0) AS total_score,
      COALESCE(SUM(total_notes),0) AS notes_hit_total,
      COALESCE(SUM(miss),0) AS misses_total,
      COALESCE(MAX(accuracy),0) AS best_accuracy,
      COALESCE(MAX(max_combo),0) AS best_combo,
      COALESCE(SUM(full_combo),0) AS full_combos,
      COALESCE(SUM(perfect_full_combo),0) AS pfc_count
    FROM score_attempts
    WHERE user_id = ? AND is_test = 0 AND validation_status = 'valid'
  `).get(userId) || {};

  const chartsPlayed = db.prepare(`
    SELECT COUNT(DISTINCT chart_id) AS c FROM score_attempts
    WHERE user_id = ? AND is_test = 0 AND validation_status = 'valid'
  `).get(userId).c;

  const chartsCreated = db.prepare(`SELECT COUNT(*) AS c FROM charts WHERE owner_id = ?`).get(userId).c;
  const chartsPublished = db.prepare(`SELECT COUNT(*) AS c FROM charts WHERE owner_id = ? AND publication_status='published'`).get(userId).c;

  const notesHit = db.prepare(`
    SELECT COALESCE(SUM(perfect+great+good+bad),0) AS h FROM score_attempts
    WHERE user_id = ? AND is_test = 0 AND validation_status = 'valid'
  `).get(userId).h;

  const totalNotes = agg.notes_hit_total || 0;
  const rating = db.prepare('SELECT rating, peak_rating, rated_plays FROM competitive_ratings WHERE user_id = ?').get(userId)
    || { rating: 0, peak_rating: 0, rated_plays: 0 };

  const rankRow = db.prepare(`
    SELECT COUNT(*) AS better FROM competitive_ratings
    WHERE rating > ? AND rated_plays > 0
  `).get(rating.rating);
  const rankedCount = db.prepare(`SELECT COUNT(*) AS c FROM competitive_ratings WHERE rated_plays > 0`).get().c;

  const bestRankRow = db.prepare(`
    SELECT rank FROM score_attempts WHERE user_id = ? AND is_test=0 AND validation_status='valid'
  `).all(userId);
  const order = { SS: 0, S: 1, A: 2, B: 3, C: 4, D: 5 };
  let bestRank = null;
  for (const r of bestRankRow) if (bestRank === null || order[r.rank] < order[bestRank]) bestRank = r.rank;

  // Oynama süresi: grafiğin uzunluğu (ms) * oynanış sayısı
  const playtime = db.prepare(`
    SELECT COALESCE(SUM(c.length_ms),0) AS ms FROM score_attempts a JOIN charts c ON c.id = a.chart_id
    WHERE a.user_id = ? AND a.is_test = 0 AND a.validation_status='valid'
  `).get(userId).ms;

  return {
    plays: agg.plays || 0,
    totalScore: agg.total_score || 0,
    notesHit,
    totalNotes,
    misses: agg.misses_total || 0,
    bestAccuracy: agg.best_accuracy || 0,
    bestCombo: agg.best_combo || 0,
    fullCombos: agg.full_combos || 0,
    perfectFullCombos: agg.pfc_count || 0,
    chartsPlayed,
    chartsCreated,
    chartsPublished,
    bestRank,
    playtimeMs: playtime || 0,
    rating: Number(rating.rating.toFixed(2)),
    peakRating: Number(rating.peak_rating.toFixed(2)),
    ratedPlays: rating.rated_plays,
    globalRank: rating.rated_plays > 0 ? rankRow.better + 1 : null,
    rankedPlayers: rankedCount,
  };
}

/** Harita sıralaması: en yüksek skor → doğruluk → maks kombo → önceki tarih */
const CHART_ORDER_SQL = `ORDER BY pb.best_score DESC, pb.best_accuracy DESC, pb.max_combo DESC, pb.achieved_at ASC, pb.user_id ASC`;

function chartLeaderboard(chartId, { limit = 50, offset = 0, search = '' } = {}) {
  const params = [chartId];
  let searchSql = '';
  if (search) { searchSql = ' AND u.username LIKE ? '; params.push(`%${search}%`); }
  const rows = db.prepare(`
    SELECT pb.user_id, u.username, u.avatar, pb.best_score, pb.best_accuracy, pb.max_combo, pb.misses,
           pb.rank, pb.achieved_at, pb.play_count,
           (SELECT COUNT(*) FROM personal_bests p2 WHERE p2.chart_id = pb.chart_id
              AND (p2.best_score > pb.best_score
                OR (p2.best_score = pb.best_score AND p2.best_accuracy > pb.best_accuracy)
                OR (p2.best_score = pb.best_score AND p2.best_accuracy = pb.best_accuracy AND p2.max_combo > pb.max_combo)
                OR (p2.best_score = pb.best_score AND p2.best_accuracy = pb.best_accuracy AND p2.max_combo = pb.max_combo AND p2.achieved_at < pb.achieved_at)
              )) AS better
    FROM personal_bests pb
    JOIN users u ON u.id = pb.user_id
    JOIN score_attempts a ON a.id = pb.attempt_id
    WHERE pb.chart_id = ? AND a.validation_status = 'valid' AND a.is_test = 0 ${searchSql}
    ${CHART_ORDER_SQL}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);
  const total = db.prepare(`
    SELECT COUNT(*) AS c FROM personal_bests pb
    JOIN score_attempts a ON a.id = pb.attempt_id
    JOIN users u ON u.id = pb.user_id
    WHERE pb.chart_id = ? AND a.validation_status='valid' AND a.is_test = 0 ${searchSql}
  `).get(...(search ? [chartId, `%${search}%`] : [chartId])).c;
  return {
    total,
    entries: rows.map((r, i) => ({
      position: offset + i + 1,
      userId: r.user_id,
      username: r.username,
      avatar: r.avatar,
      score: r.best_score,
      accuracy: r.best_accuracy,
      maxCombo: r.max_combo,
      misses: r.misses,
      rank: r.rank,
      achievedAt: r.achieved_at,
      playCount: r.play_count,
    })),
  };
}

function userChartPosition(chartId, userId) {
  const pb = db.prepare('SELECT * FROM personal_bests WHERE chart_id = ? AND user_id = ?').get(chartId, userId);
  if (!pb) return null;
  const better = db.prepare(`
    SELECT COUNT(*) AS c FROM personal_bests
    WHERE chart_id = ? AND (
      best_score > ? OR (best_score = ? AND best_accuracy > ?)
      OR (best_score = ? AND best_accuracy = ? AND max_combo > ?)
      OR (best_score = ? AND best_accuracy = ? AND max_combo = ? AND achieved_at < ?)
    )
  `).get(chartId, pb.best_score, pb.best_score, pb.best_accuracy, pb.best_score, pb.best_accuracy, pb.max_combo,
    pb.best_score, pb.best_accuracy, pb.max_combo, pb.achieved_at).c;
  return { position: better + 1, ...pb };
}

/**
 * Global liderlik tablosu. period: 'all' | 'weekly' | 'monthly'
 * Sıralama: dönemdeki en iyi denemelerden oluşan toplam skor (real data only)
 */
function globalLeaderboard({ period = 'all', limit = 25, offset = 0, search = '' } = {}) {
  let dateFilter = '';
  const params = [];
  if (period === 'weekly') dateFilter = ` AND a.submitted_at >= datetime('now','-7 days') `;
  if (period === 'monthly') dateFilter = ` AND a.submitted_at >= datetime('now','-30 days') `;

  let searchSql = '';
  if (search) { searchSql = ' AND u.username LIKE ? '; }

  const base = `
    FROM users u
    JOIN score_attempts a ON a.user_id = u.id AND a.is_test = 0 AND a.validation_status = 'valid' ${dateFilter}
    JOIN charts c ON c.id = a.chart_id AND c.publication_status = 'published'
    WHERE 1=1 ${searchSql}
    GROUP BY u.id
  `;
  const p = [...params, ...(search ? [`%${search}%`] : [])];
  const rows = db.prepare(`
    SELECT u.id AS user_id, u.username, u.avatar,
      SUM(a.score) AS total_score,
      MAX(a.score) AS best_score,
      MAX(a.accuracy) AS best_accuracy,
      COUNT(*) AS plays,
      COUNT(DISTINCT a.chart_id) AS charts_played,
      COALESCE((SELECT rating FROM competitive_ratings r WHERE r.user_id = u.id), 0) AS rating
    ${base}
    ORDER BY total_score DESC, best_accuracy DESC, u.id ASC
    LIMIT ? OFFSET ?
  `).all(...p, limit, offset);
  const total = db.prepare(`SELECT COUNT(*) AS c FROM (SELECT u.id ${base})`).get(...p).c;
  return {
    total,
    entries: rows.map((r, i) => ({
      position: offset + i + 1,
      userId: r.user_id,
      username: r.username,
      avatar: r.avatar,
      totalScore: r.total_score,
      bestScore: r.best_score,
      bestAccuracy: r.best_accuracy,
      plays: r.plays,
      chartsPlayed: r.charts_played,
      rating: Number((r.rating || 0).toFixed(2)),
    })),
  };
}

module.exports = { userStats, chartLeaderboard, userChartPosition, globalLeaderboard, CHART_ORDER_SQL };
