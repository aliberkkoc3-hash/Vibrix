'use strict';
/**
 * Grafik verisi biçimi (JSON):
 * {
 *   version: 1,
 *   bpm: number,
 *   offset: number (ms),
 *   lanes: 4,
 *   notes: [{ id: string, lane: 0..3, time: ms, type: 'tap'|'hold', duration: ms }]
 * }
 * Notalar zamana göre sıralı tutulur; lane/time çakışmalarına izin verilmez.
 */
const MAX_NOTES = 8000;

const CHART_SLOTS = ['audio', 'cover'];

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function validateChartData(data, { bpm, offset }) {
  const errors = [];
  if (!data || typeof data !== 'object') return { ok: false, errors: ['Grafik verisi geçersiz.'], chart: null };
  if (data.version !== undefined && data.version !== 1) errors.push('Desteklenmeyen grafik sürümü.');
  const notesRaw = Array.isArray(data.notes) ? data.notes : null;
  if (!notesRaw) errors.push('Grafik verisinde nota listesi bulunamadı.');
  if (notesRaw && notesRaw.length > MAX_NOTES) errors.push(`Grafik en fazla ${MAX_NOTES} nota içerebilir.`);
  if (notesRaw && notesRaw.length === 0) errors.push('Grafik en az bir nota içermelidir.');

  const notes = [];
  const seen = new Set();
  if (notesRaw) {
    for (let i = 0; i < notesRaw.length; i++) {
      const n = notesRaw[i];
      if (!n || typeof n !== 'object') { errors.push(`Nota #${i + 1} geçersiz.`); continue; }
      const lane = Number(n.lane);
      const time = Number(n.time);
      if (!Number.isInteger(lane) || lane < 0 || lane > 3) { errors.push(`Nota #${i + 1}: geçersiz lane.`); continue; }
      if (!Number.isFinite(time) || time < 0 || time > 60 * 60 * 1000) { errors.push(`Nota #${i + 1}: geçersiz zaman.`); continue; }
      const type = n.type === 'hold' ? 'hold' : 'tap';
      let duration = 0;
      if (type === 'hold') {
        duration = Number(n.duration);
        if (!Number.isFinite(duration) || duration < 40 || duration > 60000) {
          errors.push(`Nota #${i + 1}: hold süresi geçersiz (40ms - 60000ms).`); continue;
        }
        duration = Math.round(duration);
      }
      const t = Math.round(time);
      const key = `${lane}:${t}`;
      if (seen.has(key)) { errors.push(`Nota #${i + 1}: aynı lane ve zamanda çift nota.`); continue; }
      seen.add(key);
      notes.push({ id: String(n.id || `${lane}-${t}`), lane, time: t, type, duration });
    }
  }
  if (errors.length) return { ok: false, errors: errors.slice(0, 12), chart: null };

  notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
  const clean = {
    version: 1,
    bpm: Number(bpm),
    offset: Number(offset) || 0,
    lanes: 4,
    notes,
  };
  return { ok: true, errors: [], chart: clean };
}

/** İstemciden gelen deneme (attempt) verisini doğrular */
function validateAttempt({ attempt, chart, noteCount, level }) {
  const reasons = [];
  const c = attempt || {};
  const j = c.judgments || {};
  const ints = ['perfect', 'great', 'good', 'bad', 'miss'];
  for (const k of ints) {
    if (!Number.isInteger(j[k]) || j[k] < 0) reasons.push(`judgments.${k} geçersiz.`);
  }
  if (reasons.length) return { ok: false, reasons, suspicious: true };

  const sum = ints.reduce((s, k) => s + j[k], 0);
  if (sum !== noteCount) reasons.push(`Judgment toplamı (${sum}) nota sayısıyla (${noteCount}) uyuşmuyor.`);

  const maxCombo = Number(c.maxCombo);
  if (!Number.isInteger(maxCombo) || maxCombo < 0) reasons.push('maxCombo geçersiz.');
  if (maxCombo > noteCount) reasons.push('Kombo nota sayısından büyük olamaz.');
  const hits = j.perfect + j.great + j.good + j.bad;
  if (maxCombo > hits) reasons.push('Kombo, isabet edilen nota sayısından büyük olamaz.');

  const accuracy = Number(c.accuracy);
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100) reasons.push('Doğruluk 0-100 arasında olmalı.');

  const score = Number(c.score);
  if (!Number.isInteger(score) || score < 0) reasons.push('Skor geçersiz.');

  const durationMs = Number(c.durationMs);
  if (!Number.isFinite(durationMs) || durationMs < 0) reasons.push('Oynanış süresi geçersiz.');

  if (reasons.length) return { ok: false, reasons, suspicious: true };

  // Sunucu tarafından yeniden hesaplama
  return { ok: true, reasons: [], counts: j, maxCombo, accuracy, score, durationMs };
}

module.exports = { validateChartData, validateAttempt, MAX_NOTES, clamp };
