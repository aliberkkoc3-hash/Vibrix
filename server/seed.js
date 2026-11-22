'use strict';
/**
 * Demo içerik üretici.
 * Tüm sesler ve kapaklar bu betik tarafından sentezlenir (telifsiz, prosedürel).
 * Demo grafikler is_demo = 1 olarak işaretlenir ve sahibi "demo" sistem hesabıdır.
 */
const fs = require('fs');
const path = require('path');
const { db } = require('./db');
const { hashPassword } = require('./password');

const PUBLIC = path.join(__dirname, '..', 'public');
const AUDIO_DIR = path.join(PUBLIC, 'media', 'audio');
const COVER_DIR = path.join(PUBLIC, 'media', 'cover');
for (const d of [AUDIO_DIR, COVER_DIR]) if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });

/* ---------------- WAV sentezleyici ---------------- */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
};

/**
 * Şarkı üretir: 16. nota çözünürlüğünde bir nota listesi döndürür
 * (grafik editörü/seed bu listeyi kullanır) ve WAV dosyası yazar.
 */
function synthesizeSong({ seed, bpm, bars, scaleName = 'minor', root = 57, key = 0 }) {
  const rnd = mulberry32(seed);
  const sr = 44100;
  const beat = 60 / bpm;
  const sixteenth = beat / 4;
  const totalSixteenths = bars * 16;
  const duration = totalSixteenths * sixteenth + 1.2;
  const n = Math.floor(duration * sr);
  const buf = new Float32Array(n);

  const scale = SCALES[scaleName];
  const chordRoots = [0, 0, 5, 5, 3, 3, 4, 4];

  // 1) Arpej / melodi
  const melodyNotes = [];
  let s = 0;
  while (s < totalSixteenths) {
    const bar = Math.floor(s / 16);
    const r = rnd();
    let step = 1;
    if (r < 0.25) step = 2; else if (r < 0.35) step = 3; else if (r < 0.45) step = 4;
    const chordRoot = chordRoots[bar % chordRoots.length];
    const degIdx = Math.floor(rnd() * scale.length);
    const octave = rnd() < 0.3 ? 24 : 12;
    const pitch = root + chordRoot + scale[degIdx] + octave;
    const accent = (s % 4 === 0) ? 1 : 0.72;
    melodyNotes.push({ s, len: step, pitch, accent });
    s += step;
  }

  for (const note of melodyNotes) {
    const start = note.s * sixteenth;
    const len = note.len * sixteenth * 0.92;
    const f = midiToFreq(note.pitch + key);
    const i0 = Math.floor(start * sr);
    const i1 = Math.min(n, Math.floor((start + len) * sr));
    const amp = 0.14 * note.accent;
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / sr;
      const env = Math.min(1, t / 0.008) * Math.exp(-t * 3.2);
      const wave = Math.sin(2 * Math.PI * f * t) * 0.62
        + Math.sin(2 * Math.PI * f * 2 * t) * 0.24
        + Math.sin(2 * Math.PI * f * 3 * t) * 0.12
        + Math.sin(2 * Math.PI * f * 4.01 * t) * 0.05;
      buf[i] += wave * amp * env;
    }
  }

  // 2) Bas
  for (let b = 0; b < totalSixteenths; b += 4) {
    const bar = Math.floor(b / 16);
    const chordRoot = chordRoots[bar % chordRoots.length];
    const f = midiToFreq(root - 12 + chordRoot + key);
    const start = b * sixteenth;
    const len = sixteenth * 3.4;
    const i0 = Math.floor(start * sr);
    const i1 = Math.min(n, Math.floor((start + len) * sr));
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / sr;
      const env = Math.min(1, t / 0.01) * Math.exp(-t * 2.6);
      const wave = Math.sin(2 * Math.PI * f * t) * 0.8 + Math.sin(2 * Math.PI * f * 2 * t) * 0.2;
      buf[i] += wave * 0.16 * env;
    }
  }

  // 3) Davul
  const kickTimes = [];
  for (let b = 0; b < totalSixteenths; b += 16) {
    kickTimes.push(b);
    if (rnd() < 0.4) kickTimes.push(b + 10);
    if (rnd() < 0.25) kickTimes.push(b + 6);
  }
  for (const k of kickTimes) {
    const i0 = Math.floor(k * sixteenth * sr);
    for (let i = i0; i < Math.min(n, i0 + Math.floor(0.16 * sr)); i++) {
      const t = (i - i0) / sr;
      const env = Math.exp(-t * 26);
      const f = 150 * Math.exp(-t * 16) + 45;
      buf[i] += Math.sin(2 * Math.PI * f * t) * 0.36 * env;
    }
  }
  for (let b = 4; b < totalSixteenths; b += 8) {
    const i0 = Math.floor(b * sixteenth * sr);
    const noise = mulberry32(seed + b);
    let prev = 0;
    for (let i = i0; i < Math.min(n, i0 + Math.floor(0.12 * sr)); i++) {
      const t = (i - i0) / sr;
      const env = Math.exp(-t * 34);
      const w = noise() * 2 - 1;
      const hp = w - prev; prev = w;
      buf[i] += hp * 0.12 * env;
    }
  }

  // 4) Yumuşak pad
  for (let bar = 0; bar < bars; bar++) {
    const chordRoot = chordRoots[bar % chordRoots.length];
    const chord = [0, scale[2], scale[4]].map((d) => midiToFreq(root + chordRoot + d + key));
    const start = bar * 16 * sixteenth;
    const i0 = Math.floor(start * sr);
    const i1 = Math.min(n, Math.floor((start + 16 * sixteenth) * sr));
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / sr;
      const env = Math.min(1, t / 0.35) * Math.min(1, (i1 - i) / sr / 0.4);
      let w = 0;
      for (const f of chord) w += Math.sin(2 * Math.PI * f * t + Math.sin(2 * Math.PI * f * 0.5 * t));
      buf[i] += (w / 3) * 0.045 * env;
    }
  }

  // Normalize + yumuşak limiter
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(buf[i]));
  const gain = peak > 0 ? 0.88 / peak : 1;
  const fade = Math.floor(0.4 * sr);
  const pcm = Buffer.alloc(44 + n * 2);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + n * 2, 4); pcm.write('WAVE', 8);
  pcm.write('fmt ', 12); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
  pcm.writeUInt32LE(sr, 24); pcm.writeUInt32LE(sr * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34);
  pcm.write('data', 36); pcm.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    let v = buf[i] * gain;
    if (i < fade) v *= i / fade;
    if (i > n - fade) v *= (n - i) / fade;
    v = Math.max(-1, Math.min(1, Math.tanh(v * 1.1)));
    pcm.writeInt16LE(Math.round(v * 32000), 44 + i * 2);
  }
  return { pcm, duration, beat, sixteenth };
}

/** Kapak görseli: gradyan + ızgara + dalga SVG (telifsiz, prosedürel) */
function generateCover({ seed, title, colorA, colorB, accent }) {
  const rnd = mulberry32(seed * 7 + 13);
  const bars = [];
  for (let i = 0; i < 26; i++) {
    const h = 12 + rnd() * 66;
    bars.push(`<rect x="${18 + i * 10.6}" y="${186 - h}" width="5" height="${h}" rx="2.5" opacity="${0.25 + rnd() * 0.5}"/>`);
  }
  const rings = [];
  for (let i = 0; i < 4; i++) {
    rings.push(`<circle cx="${300 + i * 8}" cy="${70 - i * 6}" r="${44 + i * 26}" fill="none" stroke="${accent}" stroke-opacity="${0.28 - i * 0.05}" stroke-width="1.5"/>`);
  }
  const safeTitle = String(title).replace(/[<>&"]/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" width="320" height="320">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${colorA}"/><stop offset="100%" stop-color="${colorB}"/>
    </linearGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.72"/>
    </linearGradient>
    <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M20 0H0V20" fill="none" stroke="#ffffff" stroke-opacity="0.06" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="320" height="320" fill="#0B0D12"/>
  <rect width="320" height="320" fill="url(#g)" opacity="0.85"/>
  <rect width="320" height="320" fill="url(#grid)"/>
  ${rings.join('')}
  <g fill="${accent}" opacity="0.75">${bars.join('')}</g>
  <rect width="320" height="320" fill="url(#fade)"/>
  <text x="20" y="270" font-family="Segoe UI, Arial, sans-serif" font-size="21" font-weight="700" fill="#F1F5F9">${safeTitle.slice(0, 22)}</text>
  <text x="20" y="292" font-family="Segoe UI, Arial, sans-serif" font-size="11" font-weight="600" letter-spacing="2.5" fill="${accent}">RHYTHMX · DEMO</text>
</svg>`;
}

/** Melodiden 4K grafik üretir (nota listesi) */
function chartFromMelody(melody, { sixteenth, offset, density, holdChance, seed }) {
  const rnd = mulberry32(seed + 99);
  const notes = [];
  let lastLane = Math.floor(rnd() * 4);
  for (const m of melody) {
    if (rnd() > density) continue;
    let lane = Math.floor(rnd() * 4);
    if (lane === lastLane) lane = (lane + 1 + Math.floor(rnd() * 3)) % 4;
    lastLane = lane;
    const time = Math.round(m.s * sixteenth * 1000 + offset);
    if (time < 0) continue;
    const isHold = m.len >= 3 && rnd() < holdChance;
    notes.push({
      id: `d${notes.length}`,
      lane,
      time,
      type: isHold ? 'hold' : 'tap',
      duration: isHold ? Math.round(m.len * sixteenth * 1000 * 0.85) : 0,
    });
  }
  // Aynı lane+time çakışmalarını temizle
  const seen = new Set();
  const clean = [];
  for (const n of notes.sort((a, b) => a.time - b.time || a.lane - b.lane)) {
    const k = `${n.lane}:${n.time}`;
    if (seen.has(k)) continue;
    seen.add(k);
    clean.push(n);
  }
  return clean;
}

const SONGS = [
  {
    slug: 'neon-pulse', title: 'Neon Pulse', artist: 'Vibrix Studio', bpm: 132, bars: 24, scale: 'minor', root: 57,
    key: 0, seed: 11, difficulty: 'Normal', level: 6, density: 0.62, holdChance: 0.18,
    colors: ['#3B1D6E', '#0B2A4A'], accent: '#A78BFA',
    description: 'Neon ışıkları altında akıcı bir ısınma grafiği. Temel ritim duygusunu geliştirmek için ideal.',
  },
  {
    slug: 'siber-yagmur', title: 'Siber Yağmur', artist: 'Asel & Kaan', bpm: 148, bars: 26, scale: 'dorian', root: 55,
    key: 2, seed: 23, difficulty: 'Zor', level: 9, density: 0.78, holdChance: 0.22,
    colors: ['#0E3B4A', '#12203A'], accent: '#38BDF8',
    description: 'Hızlı geçişler ve uzun hold notalarla dolu, ritmi sıkı tutan bir grafik.',
  },
  {
    slug: 'kristal-melodi', title: 'Kristal Melodi', artist: 'Luna Vex', bpm: 120, bars: 22, scale: 'major', root: 60,
    key: 0, seed: 37, difficulty: 'Kolay', level: 3, density: 0.42, holdChance: 0.12,
    colors: ['#1B2A4A', '#0F2E2A'], accent: '#22C55E',
    description: 'Yeni başlayanlar için sakin tempolu, melodik bir grafik.',
  },
  {
    slug: 'gece-yarisi-treni', title: 'Gece Yarısı Treni', artist: 'Demir Yolu', bpm: 168, bars: 28, scale: 'phrygian', root: 52,
    key: 3, seed: 51, difficulty: 'Uzman', level: 12, density: 0.9, holdChance: 0.25,
    colors: ['#4A1B1B', '#1A1030'], accent: '#EF4444',
    description: 'Yüksek BPM, yoğun nota akışı. Parmak hızını sınayan bir meydan okuma.',
  },
  {
    slug: 'elektrik-ruya', title: 'Elektrik Rüya', artist: 'Nova Sen', bpm: 142, bars: 24, scale: 'minor', root: 59,
    key: -1, seed: 67, difficulty: 'Zor', level: 8, density: 0.72, holdChance: 0.2,
    colors: ['#2A1B4A', '#0B1B33'], accent: '#A78BFA',
    description: 'Dalgalı melodiler ve dengeli nota yoğunluğu ile akıcı bir deneyim.',
  },
  {
    slug: 'celik-kalp', title: 'Çelik Kalp', artist: 'Ironbeat', bpm: 155, bars: 26, scale: 'minor', root: 53,
    key: 1, seed: 83, difficulty: 'Ustaca', level: 14, density: 0.95, holdChance: 0.28,
    colors: ['#3A1030', '#101828'], accent: '#F472B6',
    description: 'Platformun en zorlu demo grafiği. Yoğun çift nota ve uzun hold zincirleri.',
  },
];

function buildDemoContent() {
  const existing = db.prepare("SELECT value FROM app_meta WHERE key = 'demo_seeded'").get();
  if (existing && existing.value === '2') {
    console.log('Demo içerik zaten mevcut, atlanıyor.');
    return;
  }

  let demoUser = db.prepare("SELECT * FROM users WHERE username_lower = 'demo'").get();
  if (!demoUser) {
    const info = db.prepare(`INSERT INTO users (username, username_lower, email, password_hash, avatar, bio) VALUES (?,?,?,?,?,?)`)
      .run('Prism Crew', 'prism crew', 'prismcrew@vibrix.local', hashPassword(require('crypto').randomBytes(24).toString('hex')), null,
        'Vibrix resmi içerik stüdyosu. Buradaki grafikler telifsiz olarak sentezlenmiş örnek şarkılardır.');
    demoUser = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  }

  const insertChart = db.prepare(`
    INSERT INTO charts (owner_id, song_title, artist, bpm, offset_ms, difficulty, difficulty_level, description,
      cover, audio_reference, chart_data, note_count, length_ms, publication_status, is_demo, published_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'published',1, datetime('now', ?))
  `);

  let created = 0;
  SONGS.forEach((song, index) => {
    const existingChart = db.prepare('SELECT id FROM charts WHERE audio_reference = ?').get(`/media/audio/${song.slug}.wav`);
    if (existingChart) return;
    const { pcm, sixteenth } = synthesizeSong({
      seed: song.seed, bpm: song.bpm, bars: song.bars, scaleName: song.scale, root: song.root, key: song.key,
    });
    fs.writeFileSync(path.join(AUDIO_DIR, `${song.slug}.wav`), pcm);
    const coverSvg = generateCover({
      seed: song.seed, title: song.title, colorA: song.colors[0], colorB: song.colors[1], accent: song.accent,
    });
    fs.writeFileSync(path.join(COVER_DIR, `${song.slug}.svg`), coverSvg);

    // Melodi listesini yeniden üretmek için aynı tohumla sentezleyiciyi çağırıyoruz.
    const melody = regenerateMelody(song);
    const offset = 400;
    const notes = chartFromMelody(melody, { sixteenth, offset, density: song.density, holdChance: song.holdChance, seed: song.seed });
    let lengthMs = 0;
    for (const nt of notes) lengthMs = Math.max(lengthMs, nt.type === 'hold' ? nt.time + nt.duration : nt.time);
    const chartData = { version: 1, bpm: song.bpm, offset, lanes: 4, notes };
    insertChart.run(demoUser.id, song.title, song.artist, song.bpm, offset, song.difficulty, song.level, song.description,
      `/media/cover/${song.slug}.svg`, `/media/audio/${song.slug}.wav`, JSON.stringify(chartData), notes.length,
      Math.round(lengthMs), `-${(index + 1) * 3} days`);
    created++;
  });

  db.prepare(`INSERT INTO app_meta (key, value) VALUES ('demo_seeded','2')
    ON CONFLICT(key) DO UPDATE SET value='2'`).run();
  console.log(`Demo içerik hazır: ${created} grafik oluşturuldu.`);
}

/** Aynı tohumla melodi adımlarını yeniden üret (sentezleyiciyle birebir aynı mantık) */
function regenerateMelody({ seed, bars, scaleName = 'minor', root = 57, key = 0 }) {
  const rnd = mulberry32(seed);
  const scale = SCALES[scaleName];
  const chordRoots = [0, 0, 5, 5, 3, 3, 4, 4];
  const totalSixteenths = bars * 16;
  const melody = [];
  let s = 0;
  while (s < totalSixteenths) {
    const bar = Math.floor(s / 16);
    const r = rnd();
    let step = 1;
    if (r < 0.25) step = 2; else if (r < 0.35) step = 3; else if (r < 0.45) step = 4;
    const chordRoot = chordRoots[bar % chordRoots.length];
    const degIdx = Math.floor(rnd() * scale.length);
    const octave = rnd() < 0.3 ? 24 : 12;
    const pitch = root + chordRoot + scale[degIdx] + octave;
    const accent = (s % 4 === 0) ? 1 : 0.72;
    melody.push({ s, len: step, pitch, accent });
    s += step;
  }
  return melody;
}

if (require.main === module) {
  buildDemoContent();
}

module.exports = { buildDemoContent, synthesizeSong, regenerateMelody, chartFromMelody, generateCover, SONGS };
