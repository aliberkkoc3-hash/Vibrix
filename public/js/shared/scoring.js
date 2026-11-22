'use strict';
/**
 * Vibrix puanlama / doğrulama motoru — SUNUCU TARAFI TEK DOĞRULUK KAYNAĞI.
 * Bu modül hem sunucuda (doğrulama) hem de tarayıcıda (anlık gösterim) kullanılır.
 * Bu yüzden saf ES modülü olarak yazılmıştır ve hiçbir Node API'si kullanmaz.
 */

export const JUDGMENTS = ['perfect', 'great', 'good', 'bad', 'miss'];

export const JUDGMENT_META = {
  perfect: { label: 'KUSURSUZ', score: 300, weight: 1 },
  great: { label: 'MÜKEMMEL', score: 200, weight: 0.7 },
  good: { label: 'İYİ', score: 100, weight: 0.4 },
  bad: { label: 'ZAYIF', score: 30, weight: 0.1 },
  miss: { label: 'KAÇTI :(', score: 0, weight: 0 },
};

/** Varsayılan zamanlama pencereleri (ms, mutlak değer) */
export const DEFAULT_WINDOWS = { perfect: 45, great: 85, good: 120, bad: 165 };

/** Nota başına maksimum puan */
export const MAX_NOTE_SCORE = 300;
/** Kombo bonusu katsayısı: nota başına en fazla 50 puan (300'ün 1/6'sı) */
export const COMBO_BONUS_RATIO = 1 / 6;

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/**
 * Sıralı judgment listesinden (oynanış sırası) tam puan hesabı.
 * Oyun içinde gerçek zamanlı kullanılan fonksiyon budur.
 * her nota: JUDGMENT_META[j].score + kombo bonusu (aktif komboya göre, nota başına en fazla 50)
 */
export function scoreFromSequence(sequence) {
  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  for (const j of sequence) {
    if (j === 'miss') { combo = 0; continue; }
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    const base = JUDGMENT_META[j].score;
    const bonus = Math.round(clamp(combo, 1, 100) / 100 * MAX_NOTE_SCORE * COMBO_BONUS_RATIO);
    score += base + bonus;
  }
  return { score: Math.round(score), maxCombo };
}

/**
 * Yalnızca judgment toplamlarından skor tahmini (oynanış sırası bilinmeden).
 * Kombo bonusunun üst sınırıyla alt sınırının ortalaması alınır; sunucu doğrulaması
 * bu değeri makul tolerans içinde karşılaştırır.
 */
export function scoreFromCounts(counts) {
  const order = ['perfect', 'great', 'good', 'bad'];
  let base = 0;
  let n = 0;
  for (const j of order) { base += counts[j] * JUDGMENT_META[j].score; n += counts[j]; }
  const avgBonus = Math.round(clamp((n + 1) / 2, 1, 100) / 100 * MAX_NOTE_SCORE * COMBO_BONUS_RATIO);
  return Math.round(base + n * avgBonus);
}

/** Doğruluk yüzdesi (0-100) — judgment ağırlıklarına göre */
export function computeAccuracy(counts) {
  const total = counts.perfect + counts.great + counts.good + counts.bad + counts.miss;
  if (total <= 0) return 0;
  const weighted =
    counts.perfect * JUDGMENT_META.perfect.weight +
    counts.great * JUDGMENT_META.great.weight +
    counts.good * JUDGMENT_META.good.weight +
    counts.bad * JUDGMENT_META.bad.weight;
  return clamp((weighted / total) * 100, 0, 100);
}

/** Derece eşikleri (doğruluk + miss/FC bazlı) */
export const RANKS = ['SS', 'S', 'A', 'B', 'C', 'D'];

export function computeRank(accuracy, counts) {
  const total = counts.perfect + counts.great + counts.good + counts.bad + counts.miss;
  const pfc = counts.perfect === total && total > 0;
  if (pfc) return 'SS';
  if (accuracy >= 98) return 'S';
  if (accuracy >= 93) return 'A';
  if (accuracy >= 86) return 'B';
  if (accuracy >= 75) return 'C';
  return 'D';
}

export function rankColor(rank) {
  return {
    SS: '#C4B5FD', S: '#C084FC', A: '#22C55E', B: '#EAB308', C: '#F97316', D: '#EF4444',
  }[rank] || '#94A3B8';
}

/** Teorik maksimum puan (tüm notalar PERFECT ve kombo tam) */
export function maxScoreForNotes(noteCount) {
  return scoreFromSequence(new Array(noteCount).fill('perfect')).score;
}

/** Grafik verisinden nota sayısı ve uzunluk çıkarımı */
export function analyzeChartData(chartData) {
  const notes = Array.isArray(chartData?.notes) ? chartData.notes : [];
  let lengthMs = 0;
  for (const n of notes) {
    const end = n.type === 'hold' ? n.time + (n.duration || 0) : n.time;
    if (end > lengthMs) lengthMs = end;
  }
  return { noteCount: notes.length, lengthMs: Math.round(lengthMs) };
}

export function judgeOffset(offsetMs, windows = DEFAULT_WINDOWS) {
  const a = Math.abs(offsetMs);
  if (a <= windows.perfect) return 'perfect';
  if (a <= windows.great) return 'great';
  if (a <= windows.good) return 'good';
  if (a <= windows.bad) return 'bad';
  return 'miss';
}

/** Rating: doğruluk ve dereceye dayalı, deterministik (bkz. /api/meta/scoring) */
export function ratingForPlay(rank, accuracy, level) {
  const base = { SS: 100, S: 85, A: 65, B: 45, C: 25, D: 10 }[rank] || 0;
  return base * (0.7 + (clamp(level, 1, 15) / 15) * 0.6) + accuracy * 0.05;
}
