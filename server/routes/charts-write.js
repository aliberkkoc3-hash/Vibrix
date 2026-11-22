'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const { z } = require('zod');
const { db } = require('../db');
const { requireAuth } = require('../auth');
const { validateChartData } = require('../chartdata');
const { rateLimit } = require('../ratelimit');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');
const AUDIO_DIR = path.join(UPLOAD_DIR, 'audio');
const COVER_DIR = path.join(UPLOAD_DIR, 'cover');
for (const d of [AUDIO_DIR, COVER_DIR]) if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });

const AUDIO_EXT = ['.mp3', '.ogg', '.wav', '.m4a', '.flac', '.aac', '.webm'];
const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, file.fieldname === 'audio' ? AUDIO_DIR : COVER_DIR);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024, files: 2 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (file.fieldname === 'audio') {
      if (!AUDIO_EXT.includes(ext)) return cb(new Error('Desteklenmeyen ses dosyası biçimi. MP3, OGG, WAV, M4A kullanın.'));
    } else if (file.fieldname === 'cover') {
      if (!IMAGE_EXT.includes(ext)) return cb(new Error('Desteklenmeyen kapak görseli biçimi. PNG, JPG veya WEBP kullanın.'));
    } else {
      return cb(new Error('Beklenmeyen dosya alanı.'));
    }
    cb(null, true);
  },
});

function uploadFields(req, res, next) {
  const handler = upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'cover', maxCount: 1 }]);
  handler(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Dosya çok büyük (en fazla 25 MB).' : err.message || 'Dosya yüklenemedi.';
      return res.status(400).json({ error: msg });
    }
    next();
  });
}

function chartRowToJson(row, { includeData = false, ownerName, isFavorite } = {}) {
  if (!row) return null;
  const out = {
    id: row.id,
    ownerId: row.owner_id,
    owner: ownerName || row.owner_name || undefined,
    songTitle: row.song_title,
    artist: row.artist,
    bpm: row.bpm,
    offsetMs: row.offset_ms,
    difficulty: row.difficulty,
    difficultyLevel: row.difficulty_level,
    description: row.description,
    cover: row.cover,
    audio: row.audio_reference,
    noteCount: row.note_count,
    lengthMs: row.length_ms,
    status: row.publication_status,
    isDemo: !!row.is_demo,
    isAutoChart: !!row.is_auto_chart,
    playCount: row.play_count,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (includeData) {
    try { out.chartData = JSON.parse(row.chart_data); } catch { out.chartData = null; }
  }
  if (isFavorite !== undefined) out.isFavorite = isFavorite;
  return out;
}

const metaSchema = z.object({
  songTitle: z.string().trim().min(1, 'Şarkı adı gerekli.').max(120, 'Şarkı adı en fazla 120 karakter.'),
  artist: z.string().trim().max(120, 'Sanatçı adı en fazla 120 karakter.').optional().default(''),
  bpm: z.coerce.number().min(20, 'BPM en az 20 olmalı.').max(400, 'BPM en fazla 400 olabilir.'),
  offsetMs: z.coerce.number().min(-10000).max(10000).optional().default(0),
  difficulty: z.enum(['Kolay', 'Normal', 'Zor', 'Uzman', 'Ustaca'], { message: 'Geçersiz zorluk seviyesi.' }).optional().default('Normal'),
  difficultyLevel: z.coerce.number().int().min(1).max(15).optional().default(5),
  description: z.string().max(500, 'Açıklama en fazla 500 karakter.').optional().default(''),
});

function parseChartPayload(body) {
  const meta = metaSchema.safeParse(body);
  if (!meta.success) return { error: meta.error.issues[0].message };
  let chartData;
  try {
    chartData = typeof body.chartData === 'string' ? JSON.parse(body.chartData) : body.chartData;
  } catch {
    return { error: 'Grafik verisi geçersiz JSON.' };
  }
  const validation = validateChartData(chartData, { bpm: meta.data.bpm, offset: meta.data.offsetMs });
  if (!validation.ok) return { error: validation.errors[0] || 'Grafik verisi geçersiz.' };
  return { meta: meta.data, chart: validation.chart };
}

function computeNoteMeta(chart) {
  let lengthMs = 0;
  for (const n of chart.notes) {
    const end = n.type === 'hold' ? n.time + n.duration : n.time;
    if (end > lengthMs) lengthMs = end;
  }
  return { noteCount: chart.notes.length, lengthMs: Math.round(lengthMs) };
}

/** Yeni grafik oluştur (taslak) */
router.post('/', requireAuth, rateLimit({ windowMs: 60 * 1000, max: 30 }), uploadFields, (req, res) => {
  const parsed = parseChartPayload(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const audioFile = req.files?.audio?.[0];
  const coverFile = req.files?.cover?.[0];
  if (!audioFile) return res.status(400).json({ error: 'Bir ses dosyası yüklemelisiniz.' });
  const { noteCount, lengthMs } = computeNoteMeta(parsed.chart);
  const audioRef = `/uploads/audio/${audioFile.filename}`;
  const coverRef = coverFile ? `/uploads/cover/${coverFile.filename}` : null;
  const info = db.prepare(`
    INSERT INTO charts (owner_id, song_title, artist, bpm, offset_ms, difficulty, difficulty_level, description,
      cover, audio_reference, chart_data, note_count, length_ms, publication_status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'draft')
  `).run(req.user.id, parsed.meta.songTitle, parsed.meta.artist, parsed.meta.bpm, parsed.meta.offsetMs,
    parsed.meta.difficulty, parsed.meta.difficultyLevel, parsed.meta.description, coverRef, audioRef,
    JSON.stringify(parsed.chart), noteCount, lengthMs);
  const row = db.prepare('SELECT * FROM charts WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ chart: chartRowToJson(row, { includeData: true, ownerName: req.user.username }) });
});

/** Mevcut grafiği güncelle (sahip) */
router.put('/:id', requireAuth, uploadFields, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM charts WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Grafik bulunamadı.' });
  if (row.owner_id !== req.user.id) return res.status(403).json({ error: 'Bu grafiği düzenleme yetkiniz yok.' });
  const parsed = parseChartPayload(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const audioFile = req.files?.audio?.[0];
  const coverFile = req.files?.cover?.[0];
  const audioRef = audioFile ? `/uploads/audio/${audioFile.filename}` : row.audio_reference;
  const coverRef = coverFile ? `/uploads/cover/${coverFile.filename}` : row.cover;
  const { noteCount, lengthMs } = computeNoteMeta(parsed.chart);
  // AI ile üretim işareti: istemci açıkça göndermediyse mevcut değer korunur
  const autoFlag = req.body?.autoChart === undefined
    ? row.is_auto_chart
    : (req.body.autoChart === '1' || req.body.autoChart === 'true' || req.body.autoChart === true ? 1 : 0);
  db.prepare(`
    UPDATE charts SET song_title=?, artist=?, bpm=?, offset_ms=?, difficulty=?, difficulty_level=?, description=?,
      cover=?, audio_reference=?, chart_data=?, note_count=?, length_ms=?, is_auto_chart=?, updated_at=datetime('now')
    WHERE id=?
  `).run(parsed.meta.songTitle, parsed.meta.artist, parsed.meta.bpm, parsed.meta.offsetMs, parsed.meta.difficulty,
    parsed.meta.difficultyLevel, parsed.meta.description, coverRef, audioRef, JSON.stringify(parsed.chart),
    noteCount, lengthMs, autoFlag, id);
  // Yeni ses yüklendiyse eski dosyayı temizle
  if (audioFile && row.audio_reference?.startsWith('/uploads/')) {
    const old = path.join(__dirname, '..', '..', 'public', row.audio_reference);
    if (old.includes('/uploads/') && fs.existsSync(old)) { try { fs.unlinkSync(old); } catch { /* yoksay */ } }
  }
  const updated = db.prepare('SELECT * FROM charts WHERE id = ?').get(id);
  res.json({ chart: chartRowToJson(updated, { includeData: true, ownerName: req.user.username }) });
});

/** Yayınla / yayından kaldır */
router.post('/:id/publish', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM charts WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Grafik bulunamadı.' });
  if (row.owner_id !== req.user.id) return res.status(403).json({ error: 'Bu grafiği yayınlama yetkiniz yok.' });
  if (row.note_count < 4) return res.status(400).json({ error: 'Yayınlamak için grafikte en az 4 nota olmalı.' });
  db.prepare(`UPDATE charts SET publication_status='published', published_at=COALESCE(published_at, datetime('now')), updated_at=datetime('now') WHERE id=?`).run(id);
  res.json({ ok: true, status: 'published' });
});

router.post('/:id/unpublish', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM charts WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Grafik bulunamadı.' });
  if (row.owner_id !== req.user.id) return res.status(403).json({ error: 'Bu grafiği yayından kaldırma yetkiniz yok.' });
  db.prepare(`UPDATE charts SET publication_status='draft', updated_at=datetime('now') WHERE id=?`).run(id);
  res.json({ ok: true, status: 'draft' });
});

/** Sil (sahip) */
router.delete('/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM charts WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Grafik bulunamadı.' });
  if (row.owner_id !== req.user.id) return res.status(403).json({ error: 'Bu grafiği silme yetkiniz yok.' });
  db.prepare('DELETE FROM charts WHERE id = ?').run(id);
  // Demo olmayan kullanıcı yüklemelerini diskten temizle
  for (const ref of [row.audio_reference, row.cover]) {
    if (ref && ref.startsWith('/uploads/')) {
      const f = path.join(__dirname, '..', '..', 'public', ref);
      if (f.includes('/uploads/') && fs.existsSync(f)) { try { fs.unlinkSync(f); } catch { /* yoksay */ } }
    }
  }
  res.json({ ok: true });
});

module.exports = { router, chartRowToJson, uploadFields };
