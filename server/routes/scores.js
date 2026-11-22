'use strict';
/** Skor gönderimi ve sunucu tarafı doğrulama */
const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../auth');
const { rateLimit } = require('../ratelimit');
const { scoring } = require('../scoring');
const { validateAttempt } = require('../chartdata');
const { userChartPosition } = require('../stats');

const router = express.Router();

function nowIso() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }

/**
 * Doğrulama katmanları (modüler, genişletilebilir):
 *  1) Alan/aralık doğrulaması (judgment toplamı = nota sayısı, kombo ≤ isabet)
 *  2) Skor ve doğruluğun sunucuda yeniden hesaplanması ve istemciyle karşılaştırılması
 *  3) Oynanış süresi kontrolü (çok kısa oynanışlar imkânsız)
 *  4) Hız/insan sınırı kontrolü (saniyede ulaşılabilir maksimum nota oranı)
 *  5) Aynı sonucun kısa süre içinde tekrar gönderilmesinin engellenmesi
 */
async function validateSubmission({ body, chart, chartData, userId }) {
  const reasons = [];
  let suspicious = false;

  const noteCount = chart.note_count;
  const v = validateAttempt({ attempt: body, chart, noteCount, level: chart.difficulty_level });
  if (!v.ok) return { ok: false, reasons: v.reasons, suspicious: true };

  const S = await scoring;
  // 2) Yeniden hesap
  const acc = S.computeAccuracy(v.counts);
  if (Math.abs(acc - v.accuracy) > 0.01) { reasons.push('Doğruluk sunucu hesabıyla uyuşmuyor.'); suspicious = true; }
  const expectedRank = S.computeRank(acc, v.counts);
  const reportedRank = String(body.rank || expectedRank);
  if (reportedRank !== expectedRank) { reasons.push(`Derece uyuşmuyor (beklenen ${expectedRank}).`); suspicious = true; }

  // Skor: maksimumu aşamaz ve yalnızca kombo bonusundaki sıra belirsizliği kadar fark olabilir
  const maxPossible = S.maxScoreForNotes(noteCount);
  if (v.score > maxPossible) { reasons.push('Skor teorik maksimumu aşıyor.'); suspicious = true; }
  const scoreFromCounts = S.scoreFromCounts(v.counts);
  const tolerance = Math.max(60, Math.round(maxPossible * 0.02));
  if (Math.abs(v.score - scoreFromCounts) > tolerance) { reasons.push('Skor yeniden hesaplanan aralığın dışında.'); suspicious = true; }

  // 3) Süre kontrolü
  const expectedLength = Math.max(chart.length_ms, 1000);
  if (v.durationMs < expectedLength * 0.5) { reasons.push('Oynanış süresi şarkı uzunluğuyla uyumsuz.'); suspicious = true; }
  if (v.durationMs > expectedLength + 5 * 60 * 1000) { reasons.push('Oynanış süresi beklenenden çok uzun.'); suspicious = true; }

  // 4) İnsan hızı sınırı: ortalama saniyede 25'ten fazla nota isabeti mümkün değil
  const hits = v.counts.perfect + v.counts.great + v.counts.good + v.counts.bad;
  const seconds = Math.max(0.5, v.durationMs / 1000);
  if (hits / seconds > 25) { reasons.push('İsabet hızı insan sınırlarını aşıyor.'); suspicious = true; }

  // Grafik notalarıyla tutarlılık: hold notaları ayrı bir kategori değil, nota sayısına dahildir.
  // Sunucu yalnızca toplam nota sayısını doğrular (validateAttempt içinde).

  return { ok: reasons.length === 0, reasons, suspicious, computed: { accuracy: acc, rank: expectedRank, scoreFromCounts } };
}

router.post('/', requireAuth, rateLimit({ windowMs: 60 * 1000, max: 20, message: 'Çok hızlı skor gönderiyorsunuz. Lütfen biraz bekleyin.' }), async (req, res) => {
  const S = await scoring;
  const body = req.body || {};
  const chartId = Number(body.chartId);
  const isTest = !!body.test;
  if (!Number.isInteger(chartId)) return res.status(400).json({ error: 'Geçersiz grafik kimliği.' });

  const chart = db.prepare('SELECT * FROM charts WHERE id = ?').get(chartId);
  if (!chart) return res.status(404).json({ error: 'Grafik bulunamadı.' });
  if (isTest && chart.owner_id !== req.user.id) return res.status(403).json({ error: 'Test oynanışı yalnızca kendi grafiklerinizde yapılabilir.' });
  if (!isTest && chart.publication_status !== 'published') {
    return res.status(400).json({ error: 'Yayınlanmamış grafikler için skor kaydedilemez.' });
  }
  let chartData = null;
  try { chartData = JSON.parse(chart.chart_data); } catch { /* yoksay */ }

  const result = await validateSubmission({ body, chart, chartData, userId: req.user.id });

  // Aynı sonuç 20 saniye içinde tekrar gönderildiyse yinelenen kayıt engellenir
  const dupe = db.prepare(`
    SELECT id FROM score_attempts WHERE user_id=? AND chart_id=? AND score=? AND max_combo=? AND submitted_at >= datetime('now','-20 seconds')
  `).get(req.user.id, chartId, Number(body.score) || -1, Number(body.maxCombo) || -1);

  const j = body.judgments || {};
  const counts = {
    perfect: Number(j.perfect) || 0, great: Number(j.great) || 0, good: Number(j.good) || 0,
    bad: Number(j.bad) || 0, miss: Number(j.miss) || 0,
  };
  const total = counts.perfect + counts.great + counts.good + counts.bad + counts.miss;
  const accuracy = result.computed ? result.computed.accuracy : (Number(body.accuracy) || 0);
  const rank = result.computed ? result.computed.rank : 'D';
  const score = Math.min(Number(body.score) || 0, S.maxScoreForNotes(chart.note_count));

  const previousBest = db.prepare('SELECT * FROM personal_bests WHERE user_id=? AND chart_id=?').get(req.user.id, chartId);
  const accepted = !isTest && result.ok && !dupe;

  let attemptId = null;
  if (!dupe) {
    const info = db.prepare(`
      INSERT INTO score_attempts (user_id, chart_id, score, accuracy, max_combo, misses, perfect, great, good, bad, miss,
        total_notes, full_combo, perfect_full_combo, rank, is_test, validation_status, validation_note)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(req.user.id, chartId, score, accuracy, Math.min(Number(body.maxCombo) || 0, total), counts.miss,
      counts.perfect, counts.great, counts.good, counts.bad, counts.miss, total,
      counts.miss === 0 ? 1 : 0, counts.perfect === total && total > 0 ? 1 : 0, rank, isTest ? 1 : 0,
      accepted ? 'valid' : 'suspicious', accepted ? null : (result.reasons.join(' ') || 'Doğrulanamadı'));
    attemptId = info.lastInsertRowid;
  }

  let isNewBest = false;
  let ratingDelta = 0;
  let position = null;

  if (accepted && attemptId) {
    const better = !previousBest || score > previousBest.best_score
      || (score === previousBest.best_score && accuracy > previousBest.best_accuracy)
      || (score === previousBest.best_score && accuracy === previousBest.best_accuracy && (Number(body.maxCombo) || 0) > previousBest.max_combo);
    if (better) {
      isNewBest = true;
      db.prepare(`
        INSERT INTO personal_bests (user_id, chart_id, best_score, best_accuracy, max_combo, misses, rank, attempt_id, play_count, achieved_at)
        VALUES (?,?,?,?,?,?,?,?,1,?)
        ON CONFLICT(user_id, chart_id) DO UPDATE SET
          best_score=excluded.best_score, best_accuracy=excluded.best_accuracy, max_combo=excluded.max_combo,
          misses=excluded.misses, rank=excluded.rank, attempt_id=excluded.attempt_id, achieved_at=excluded.achieved_at,
          play_count=personal_bests.play_count+1
      `).run(req.user.id, chartId, score, accuracy, Number(body.maxCombo) || 0, counts.miss, rank, attemptId, nowIso());
    } else {
      db.prepare('UPDATE personal_bests SET play_count = play_count + 1 WHERE user_id=? AND chart_id=?').run(req.user.id, chartId);
    }

    // Rating: yalnızca kişisel en iyisi geliştiğinde, yeni en iyinin derecesine göre
    if (isNewBest) {
      const ratingRow = db.prepare('SELECT * FROM competitive_ratings WHERE user_id=?').get(req.user.id)
        || { rating: 0, peak_rating: 0, rated_plays: 0 };
      const playRating = S.ratingForPlay(rank, accuracy, chart.difficulty_level);
      // Ağırlıklı ortalama: oyuncunun ratingi, yeni performansla %18 ağırlıkla güncellenir
      const next = ratingRow.rated_plays === 0 ? playRating : ratingRow.rating * 0.82 + playRating * 0.18;
      ratingDelta = next - ratingRow.rating;
      db.prepare(`
        INSERT INTO competitive_ratings (user_id, rating, peak_rating, rated_plays, updated_at) VALUES (?,?,?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET rating=excluded.rating,
          peak_rating=MAX(competitive_ratings.peak_rating, excluded.peak_rating),
          rated_plays=competitive_ratings.rated_plays+1, updated_at=excluded.updated_at
      `).run(req.user.id, next, Math.max(next, ratingRow.peak_rating), ratingRow.rated_plays + 1, nowIso());
      db.prepare('INSERT INTO rating_history (user_id, rating, delta, chart_id) VALUES (?,?,?,?)')
        .run(req.user.id, next, ratingDelta, chartId);
    }
    position = userChartPosition(chartId, req.user.id);
  }

  res.json({
    accepted,
    attemptId,
    validation: {
      status: accepted ? 'valid' : 'suspicious',
      reasons: result.reasons,
      duplicate: !!dupe,
    },
    isNewBest,
    ratingDelta: Number(ratingDelta.toFixed(2)),
    position: position ? position.position : null,
    previousBest: previousBest ? {
      score: previousBest.best_score, accuracy: previousBest.best_accuracy, maxCombo: previousBest.max_combo,
      rank: previousBest.rank, achievedAt: previousBest.achieved_at,
    } : null,
    scoreDifference: previousBest ? score - previousBest.best_score : null,
    serverComputed: { accuracy, rank, maxPossible: S.maxScoreForNotes(chart.note_count) },
  });
});

/** Skor gönderilmeden önce doğrulanabilir oynanış oturumu */
const sessions = new Map();
router.post('/start', requireAuth, rateLimit({ windowMs: 60 * 1000, max: 40 }), (req, res) => {
  const chartId = Number(req.body?.chartId);
  const chart = db.prepare('SELECT id, publication_status, owner_id FROM charts WHERE id = ?').get(chartId);
  if (!chart) return res.status(404).json({ error: 'Grafik bulunamadı.' });
  const token = require('crypto').randomBytes(16).toString('hex');
  sessions.set(token, { userId: req.user.id, chartId, startedAt: Date.now() });
  setTimeout(() => sessions.delete(token), 30 * 60 * 1000).unref();
  res.json({ token, startedAt: new Date().toISOString() });
});

module.exports = router;
