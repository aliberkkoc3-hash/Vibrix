/**
 * Vibrix — AI Grafik Üretici (v2)
 *
 * Gerçek bir müzik analizi yapar; hiçbir ses dosyası dışarı gönderilmez ve
 * harici bir servis çağrılmaz. Tamamen tarayıcıda çalışır.
 *
 * Boru hattı:
 *   1) Kanal birleştirme + 22.05 kHz'e indirme (anti-aliasing için kutu ortalama)
 *   2) Kısa zamanlı Fourier dönüşümü (STFT) — 1024 örnek, %50 örtüşme, Hann penceresi
 *   3) Spektral akış (spectral flux) tabanlı vuruş zarfı + çok bantlı (bas/orta/tiz) zarf
 *   4) Tempo takibi: otokorelasyon + ızgara hizalama (dynamic-programming benzeri skor)
 *   5) Katmanlı vuruş algılama: bas vuruşlar (kick), tiz vuruşlar (snare/hat), melodi
 *   6) 1/16 ızgaraya oturtma, BPM'e kilitlenme, ölçü (bar) yapısı
 *   7) Kademeli zorluk: nota yoğunluğu, akor (aynı anda 2 nota), hold süreleri
 *   8) Hat ataması: bas → dış hatlar, melodi → iç hatlar, tekrar cezası ile akıcı akış
 *   9) "Stairs" (merdiven) desenleri: art arda gelen kısa notalarda 1-2-3-4 veya 4-3-2-1
 *
 * Çıktı deterministiktir: aynı ses + aynı ayar = aynı grafik.
 */

const FFT_SIZE = 1024;
const HOP = 512;
const TARGET_RATE = 22050;

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */

function nextPow2(n) { let p = 1; while (p < n) p *= 2; return p; }

/** İteratif radix-2 FFT (yerinde) */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** AudioBuffer → mono Float32Array @ TARGET_RATE */
function toMono(buffer, targetRate = TARGET_RATE) {
  const channels = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
  const ratio = buffer.sampleRate / targetRate;
  const outLen = Math.floor(buffer.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const a = Math.floor(i * ratio);
    const b = Math.min(buffer.length, Math.max(a + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = a; j < b; j++) {
      let v = 0;
      for (let c = 0; c < channels.length; c++) v += channels[c][j];
      sum += v / channels.length;
    }
    out[i] = sum / (b - a);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* STFT ve bant enerjileri                                             */
/* ------------------------------------------------------------------ */

/**
 * @param {Float32Array} samples
 * @param {number} rate
 * @returns {{frames:number, fps:number, bass:Float32Array, mid:Float32Array, treble:Float32Array, flux:Float32Array, rms:Float32Array, chroma:Float32Array[]}}
 */
function spectralAnalysis(samples, rate) {
  const win = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)); // Hann
  const frames = Math.max(1, Math.floor((samples.length - FFT_SIZE) / HOP) + 1);
  const fps = rate / HOP;

  const bass = new Float32Array(frames);
  const mid = new Float32Array(frames);
  const treble = new Float32Array(frames);
  const rms = new Float32Array(frames);
  const flux = new Float32Array(frames);
  const prevMag = new Float32Array(FFT_SIZE / 2);

  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);
  const mag = new Float32Array(FFT_SIZE / 2);
  const binHz = rate / FFT_SIZE;
  const bassMax = Math.min(FFT_SIZE / 2, Math.floor(200 / binHz));
  const midMin = bassMax;
  const midMax = Math.min(FFT_SIZE / 2, Math.floor(2500 / binHz));
  const trebMin = midMax;

  for (let f = 0; f < frames; f++) {
    const off = f * HOP;
    let energy = 0;
    for (let i = 0; i < FFT_SIZE; i++) {
      const s = samples[off + i] || 0;
      energy += s * s;
      re[i] = s * win[i];
      im[i] = 0;
    }
    rms[f] = Math.sqrt(energy / FFT_SIZE);
    fft(re, im);
    let b = 0;
    let m = 0;
    let t = 0;
    let fl = 0;
    for (let k = 1; k < FFT_SIZE / 2; k++) {
      const m2 = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      mag[k] = m2;
      if (k < bassMax) b += m2;
      else if (k < midMax) m += m2;
      else if (k < trebMin + Math.floor(6000 / binHz)) t += m2;
      const d = m2 - prevMag[k];
      if (d > 0) fl += d;
      prevMag[k] = m2;
    }
    bass[f] = b;
    mid[f] = m;
    treble[f] = t;
    flux[f] = fl;
  }

  // Normalize
  const norm = (arr) => {
    let max = 0;
    for (let i = 0; i < arr.length; i++) if (arr[i] > max) max = arr[i];
    if (max > 0) for (let i = 0; i < arr.length; i++) arr[i] /= max;
    return arr;
  };
  norm(bass); norm(mid); norm(treble); norm(flux); norm(rms);

  return { frames, fps, bass, mid, treble, flux, rms };
}

/* ------------------------------------------------------------------ */
/* Tempo takibi                                                        */
/* ------------------------------------------------------------------ */

/**
 * Onset zarfından tempo kestirimi: otokorelasyon + ızgara hizalama skoru.
 * @returns {{bpm:number, offset:number, confidence:number}}
 */
function trackTempo(env, fps, opts = {}) {
  const { bass, treble, flux } = env;
  const n = flux.length;
  // Birleşik onset zarfı (perkusif + spektral akış)
  const onset = new Float32Array(n);
  for (let i = 1; i < n; i++) {
    onset[i] = 0.45 * Math.max(0, flux[i] - flux[i - 1] * 0.5)
      + 0.35 * Math.max(0, bass[i] - bass[i - 1] * 0.6)
      + 0.2 * Math.max(0, treble[i] - treble[i - 1] * 0.6);
  }
  // Yerel ortalama çıkarma (adaptif)
  const w = Math.round(fps * 0.5);
  const nov = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += onset[i];
    if (i >= 2 * w) acc -= onset[i - 2 * w];
    const mean = acc / Math.min(i + 1, 2 * w);
    nov[i] = Math.max(0, onset[i] - mean);
  }

  // Otokorelasyon: 60..200 BPM aralığı (300ms..1000ms periyot)
  const minLag = Math.max(2, Math.round(fps * 60 / 200));
  const maxLag = Math.min(Math.floor(n / 2), Math.round(fps * 60 / 60));
  let bestLag = Math.round(fps * 60 / 120);
  let bestScore = -Infinity;
  const acf = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += nov[i] * nov[i + lag];
    // Lag'e göre normalizasyon (kısa lag'ler daha çok eşleşir)
    acf[lag] = s / (n - lag);
    // 4/4 varsayımı: lag'in yarısı ve iki katı da kontrol edilir
    const harmonic = 0.5 * (acf[Math.round(lag / 2)] || 0) + 0.25 * (acf[lag * 2] || 0);
    const score = acf[lag] + harmonic * 0.35;
    if (score > bestScore) { bestScore = score; bestLag = lag; }
  }
  let bpm = (60 * fps) / bestLag;
  // 70..180 aralığına çek
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;

  // Tempo oylaması: tüm lag'lerin karşılık geldiği BPM adaylarını topla.
  // Tam sayı ve .5 tempolara yakınlık, gerçek müzikte tempoların neredeyse
  // tam sayı olduğu gerçeğinden gelir; böylece 129.2 yerine 128 bulunur.
  const votes = new Map();
  for (let lag = minLag; lag <= maxLag; lag++) {
    const w = acf[lag];
    if (!(w > 0) || w < bestScore * 0.25) continue;
    let cand = (60 * fps) / lag;
    while (cand < 70) cand *= 2;
    while (cand > 180) cand /= 2;
    const snapped = Math.round(cand * 2) / 2;
    if (Math.abs(snapped - cand) > 2.5) continue;
    votes.set(snapped, (votes.get(snapped) || 0) + w);
  }
  let voted = bpm;
  let voteBest = 0;
  for (const [cand, w] of votes) if (w > voteBest) { voteBest = w; voted = cand; }
  if (voteBest > 0 && Math.abs(voted - bpm) <= 4) bpm = voted;
  // Kullanıcıya sunulacak değer: 0.1 hassasiyet, tam sayıya çok yakınsa tam sayı
  bpm = Math.abs(bpm - Math.round(bpm)) < 0.15 ? Math.round(bpm) : Math.round(bpm * 10) / 10;
  if (Number(opts.forceBpm) > 0) bpm = Number(opts.forceBpm);

  // Ofset: ızgara fazını tara, en çok onset enerjisi toplayan fazı seç
  const period = (60 / bpm) * fps;
  let bestPhase = 0;
  let bestPhaseScore = -Infinity;
  const phaseSteps = Math.max(16, Math.round(period));
  for (let p = 0; p < phaseSteps; p++) {
    const phase = (p / phaseSteps) * period;
    let s = 0;
    for (let t = phase; t < n; t += period / 4) {
      const idx = Math.round(t);
      if (idx < n) s += nov[idx];
    }
    if (s > bestPhaseScore) { bestPhaseScore = s; bestPhase = phase; }
  }
  const offset = (bestPhase / fps) * 1000;

  return { bpm: Math.round(bpm * 100) / 100, offset: Math.round(offset), confidence: bestScore };
}

/* ------------------------------------------------------------------ */
/* Vuruş algılama                                                      */
/* ------------------------------------------------------------------ */

/**
 * Bant başına tepe noktaları (onset) bulur.
 * @returns {{time:number, strength:number, band:'bass'|'mid'|'treble'}[]}
 */
function detectPeaks(env, bpm, { sensitivity = 1 } = {}) {
  const { fps, bass, mid, treble, flux } = env;
  const beatFrames = (60 / bpm) * fps;
  const results = [];

  const scan = (arr, band, weight) => {
    const n = arr.length;
    const w = Math.max(4, Math.round(beatFrames / 4));
    // Yerel tepe + adaptif eşik
    for (let i = 1; i < n - 1; i++) {
      const v = arr[i];
      if (v <= arr[i - 1] || v < arr[i + 1]) continue;
      let mean = 0;
      let count = 0;
      for (let j = Math.max(0, i - w); j < Math.min(n, i + w); j++) { mean += arr[j]; count++; }
      mean /= count;
      const thresh = mean * (1.15 / sensitivity);
      if (v < thresh || v < 0.02) continue;
      results.push({ time: (i / fps) * 1000, strength: v * weight, band });
    }
  };

  scan(bass, 'bass', 1.0);
  scan(treble, 'treble', 0.85);
  scan(mid, 'mid', 0.7);
  // Spektral akış da bir bant gibi değerlendirilir (perkusif olmayan girişler)
  scan(flux, 'treble', 0.6);

  results.sort((a, b) => a.time - b.time);
  // Aynı ana düşenleri birleştir
  const merged = [];
  for (const r of results) {
    const last = merged[merged.length - 1];
    if (last && r.time - last.time < 45) {
      if (r.strength > last.strength) merged[merged.length - 1] = r;
    } else merged.push(r);
  }
  return merged;
}

/* ------------------------------------------------------------------ */
/* Grafik üretimi                                                      */
/* ------------------------------------------------------------------ */

const LANE_NAMES = ['D', 'F', 'J', 'K'];

/**
 * Stairs (merdiven) deseni üretir: 4 notalı iniş/çıkış.
 * @param {number} startLane
 * @param {boolean} up
 */
function stairsLanes(startLane, up) {
  const out = [];
  for (let i = 0; i < 4; i++) {
    const lane = up ? (startLane + i) % 4 : (startLane - i + 8) % 4;
    out.push(lane);
  }
  return out;
}

/**
 * @param {AudioBuffer} buffer
 * @param {object} opts
 * @param {number} opts.difficulty  1..15
 * @param {number} [opts.bpm]       0 = otomatik
 * @param {number} [opts.offset]    null/undefined = otomatik
 * @param {boolean} [opts.stairs]   merdiven desenleri kullan
 * @param {number} [opts.chords]    akor yoğunluğu 0..100
 * @param {number} [opts.sensitivity] vuruş hassasiyeti 50..150
 * @param {(p:number, msg:string)=>void} [opts.onProgress]
 */
export async function generateChart(buffer, opts = {}) {
  const onProgress = opts.onProgress || (() => {});
  const difficulty = Math.min(15, Math.max(1, Number(opts.difficulty) || 6));
  const useStairs = opts.stairs !== false;
  const chordAmount = Math.min(100, Math.max(0, Number(opts.chords ?? 20)));
  const sensitivity = Math.min(150, Math.max(50, Number(opts.sensitivity ?? 100))) / 100;
  const style = ['balanced', 'stream', 'jack', 'tech'].includes(opts.style) ? opts.style : 'balanced';

  onProgress(0.02, 'Ses çözümleniyor…');
  await tick();
  const samples = toMono(buffer);

  onProgress(0.12, 'Spektral analiz yapılıyor…');
  await tick();
  const env = spectralAnalysis(samples, TARGET_RATE);

  onProgress(0.45, 'Tempo ve ritim takip ediliyor…');
  await tick();
  const tempo = trackTempo(env, env.fps, { forceBpm: Number(opts.bpm) || 0 });
  const bpm = tempo.bpm;
  let offset = Number.isFinite(Number(opts.offset)) && opts.offset !== null && Number(opts.offset) !== 0
    ? Number(opts.offset)
    : tempo.offset;

  onProgress(0.6, 'Vuruşlar algılanıyor…');
  await tick();
  const peaks = detectPeaks(env, bpm, { sensitivity });

  const totalMs = buffer.duration * 1000;
  const beatMs = 60000 / bpm;
  const gridMs = beatMs / 4; // 1/16

  // Ofset + BPM ızgara araması:
  // Gerçek şarkılarda tempo nadiren tam oturur; ofset tek başına kaydırmak
  // yerine (bpm, ofset) çiftini küçük bir aralıkta tarayıp ızgaraya en iyi
  // oturan kombinasyonu seçiyoruz. Bu, uzun şarkılarda biriken kaymayı önler.
  let gridBpm = bpm;
  let gridOffset = offset;
  const autoBpm = !(Number(opts.bpm) > 0);
  const autoOffset = !(Number.isFinite(Number(opts.offset)) && opts.offset !== null && Number(opts.offset) !== 0);

  if (autoOffset || autoBpm) {
    const searchBpms = autoBpm
      ? [bpm, bpm - 0.5, bpm + 0.5, bpm - 1, bpm + 1].filter((v) => v >= 60 && v <= 200)
      : [bpm];

    // Referans: en güçlü tepe (ilk güçlü vuruş değil — sessiz girişlerde kayar)
    const anchorT = peaks.reduce((a, p) => (p.strength > a.strength ? p : a), peaks[0]).time;
    const scoreGrid = (o, cBpm) => {
      const b = 60000 / cBpm;
      let sc = 0;
      for (const p of peaks) {
        const rel = (p.time - o) / b;
        const dist = Math.abs(rel - Math.round(rel));
        if (dist < 0.02) sc += p.strength * (1 - dist / 0.02);
      }
      return sc / Math.max(1, peaks.length);
    };

    let best = { score: -Infinity, bpm, offset: 0 };
    for (const candBpm of searchBpms) {
      const beat = 60000 / candBpm;
      // Izgara fazını tara; ofset ızgaranın tam katı olabilir, modulo ile 0..beat
      let bestFace = { score: -Infinity, phase: 0 };
      for (let d = -beat; d <= beat; d += 3) {
        const o = anchorT + d;
        if (o < 0) continue;
        const sc = scoreGrid(o, candBpm);
        if (sc > bestFace.score) bestFace = { score: sc, phase: o };
      }
      const fine = { ...bestFace };
      for (let fd = -20; fd <= 20; fd++) {
        const o = bestFace.phase + fd;
        if (o < 0) continue;
        const sc = scoreGrid(o, candBpm);
        if (sc > fine.score) fine.score = sc, fine.phase = o;
      }
      // Aynı ızgara fazını veren en küçük pozitif ofset: kalan vuruş sayısı kadar geri git
      const k = Math.floor(fine.phase / beat);
      const normalized = Math.max(0, Math.round((fine.phase - k * beat) * 1000) / 1000);
      if (fine.score > best.score) best = { score: fine.score, bpm: candBpm, offset: normalized };
    }
    if (autoOffset) gridOffset = Math.max(0, Math.round(best.offset));
    if (autoBpm) gridBpm = best.bpm;
    offset = gridOffset;
  }

  // 1) Izgaraya oturt; aynı yuvada en güçlüyü tut
  /** @type {Map<number, {time:number, strength:number, band:string}>} */
  const slots = new Map();
  for (const p of peaks) {
    const step = 60000 / gridBpm / 4;
    const snapped = offset + Math.round((p.time - offset) / step) * step;
    if (snapped < 0 || snapped > totalMs - 80) continue;
    const key = Math.round(snapped);
    const prev = slots.get(key);
    if (!prev || p.strength > prev.strength) slots.set(key, { time: key, strength: p.strength, band: p.band });
  }
  let ordered = [...slots.values()].sort((a, b) => a.time - b.time);

  // 2) Zorluk: minimum aralık ve seyreltme
  const styleGap = { balanced: 0, stream: -30, jack: 15, tech: 5 }[style];
  const minGap = Math.max(65, 210 - difficulty * 12 + styleGap); // ms
  const maxPerSec = 1.0 + difficulty * 0.62;
  let filtered = [];
  for (const s of ordered) {
    const last = filtered[filtered.length - 1];
    if (last && s.time - last.time < Math.max(minGap, 1000 / maxPerSec)) {
      if (s.strength > last.strength) filtered[filtered.length - 1] = s;
      continue;
    }
    filtered.push(s);
  }
  const keepRatio = Math.min(1, 0.3 + difficulty * 0.105);
  if (keepRatio < 1 && filtered.length > 10) {
    const keep = new Set([...filtered].sort((a, b) => b.strength - a.strength).slice(0, Math.round(filtered.length * keepRatio)).map((s) => s.time));
    filtered = filtered.filter((s) => keep.has(s.time));
  }
  ordered = filtered;

  onProgress(0.78, 'Notalar yerleştiriliyor…');
  await tick();

  // 3) Nota üretimi — iki geçiş:
  //    a) zaman damgası bazında hat dizisi kur (merdivenler, bas/melodi rolleri)
  //    b) çakışmaları çözerek notaları yaz
  const stairLen = difficulty >= 12 ? 6 : difficulty >= 9 ? 5 : 4;
  const stairChance = { balanced: 0.7, stream: 0.8, jack: 0.25, tech: 0.92 }[style];
  const chordMul = { balanced: 1, stream: 0.5, jack: 1.1, tech: 1.6 }[style];
  /** @type {{time:number, band:string, gap:number, beatPos:number, strength:number, lanes:number[]}[]} */
  const events = [];
  let stairsCount = 0;
  let lastLane = 1;
  let stairQueue = [];

  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i];
    const next = ordered[i + 1];
    const gap = next ? next.time - s.time : beatMs;
    const beatPos = (s.time - offset) / beatMs;
    const onBeat = Math.abs(beatPos - Math.round(beatPos)) < 0.08;
    const onBar = onBeat && Math.round(beatPos) % 4 === 0;

    // --- Merdiven başlat ---
    if (useStairs && stairQueue.length === 0 && difficulty >= 3 && gap < beatMs * 0.95) {
      let count = 1;
      for (let j = i; j < ordered.length - 1 && count < stairLen; j++) {
        if (ordered[j + 1].time - ordered[j].time < beatMs * 0.95) count++;
        else break;
      }
      if (count >= 4 && Math.random() < stairChance) {
        const len = Math.min(stairLen, count);
        const up = lastLane <= 1;
        const startLane = up ? Math.min(lastLane, 4 - Math.min(len, 4)) : Math.max(lastLane, Math.min(len, 4) - 1);
        stairQueue = [];
        stairsCount++;
        for (let k = 0; k < len; k++) {
          let l = up ? startLane + k : startLane - k;
          if (l < 0) l += 4;
          if (l > 3) l -= 4;
          stairQueue.push(l);
        }
      }
    }

    let lane;
    if (stairQueue.length) {
      lane = stairQueue.shift();
    } else if (s.band === 'bass' && onBar) {
      lane = (Math.round(beatPos) / 4) % 2 === 0 ? 0 : 3;
    } else if (s.band === 'bass') {
      lane = onBeat ? (Math.round(beatPos) % 2 === 0 ? 0 : 3) : (lastLane < 2 ? 1 : 2);
    } else {
      lane = (lastLane + (1 + (Math.round(beatPos) % 2))) % 4;
      if (lane === lastLane) lane = (lane + 2) % 4;
    }
    if (!stairQueue.length && lane === lastLane && s.band !== 'bass') {
      if (style === 'jack' && Math.random() < 0.65) { /* bilinçli tekrar */ }
      else lane = (lane + 1) % 4;
    }
    lastLane = lane;

    // --- Hold: uzun boşluklarda ve güçlü bas vuruşlarında ---
    let type = 'tap';
    let duration = 0;
    if (s.band === 'bass' && gap > beatMs * 1.5 && difficulty >= 4) {
      duration = Math.min(gap * 0.75, beatMs * 1.5);
      if (duration >= 140) type = 'hold';
    }

    const lanes = [lane];
    // --- Akor (aynı anda ikinci nota) ---
    const chordChance = Math.min(1, (chordAmount / 100) * chordMul) * (onBar ? 0.85 : onBeat ? 0.45 : 0.15);
    if (difficulty >= 7 && Math.random() < chordChance) lanes.push(lane <= 1 ? lane + 2 : lane - 2);

    events.push({ time: Math.round(s.time), band: s.band, gap, beatPos, strength: s.strength, lanes, type, duration });
  }

  // b) Notaları yaz
  /** @type {{id:string,lane:number,time:number,type:string,duration:number}[]} */
  const notes = [];
  const laneTimes = new Map(); // lane -> son nota zamanı
  const occupied = new Set();
  for (const ev of events) {
    for (const lane of ev.lanes) {
      if (occupied.has(`${lane}:${ev.time}`)) continue;
      const lastT = laneTimes.get(lane);
      if (lastT !== undefined && ev.time - lastT < 60) continue;
      occupied.add(`${lane}:${ev.time}`);
      laneTimes.set(lane, ev.time);
      notes.push({ id: `n${notes.length}`, lane, time: ev.time, type: ev.lanes.length > 1 ? 'tap' : ev.type, duration: ev.lanes.length > 1 ? 0 : Math.round(ev.duration) });
    }
  }
  notes.sort((a, b) => a.time - b.time || a.lane - b.lane);

  // 4) Temizlik: aynı anda aynı hat, çok yakın aynı hat
  const cleaned = [];
  const byLane = new Map();
  for (const n of [...notes].sort((a, b) => a.time - b.time)) {
    const prev = byLane.get(n.lane);
    if (prev && n.time - prev.time < 60) continue;
    byLane.set(n.lane, n);
    cleaned.push(n);
  }
  cleaned.forEach((n, i) => { n.id = `n${i}`; });

  onProgress(1, 'Grafik hazır.');
  return {
    chartData: { version: 1, bpm: gridBpm, offset: Math.round(offset), lanes: 4, notes: cleaned },
    stats: {
      bpm: gridBpm,
      offset: Math.round(offset),
      noteCount: cleaned.length,
      onsets: peaks.length,
      lengthMs: Math.round(totalMs),
      difficulty,
      tempoConfidence: Math.round(tempo.confidence * 100) / 100,
      holdCount: cleaned.filter((n) => n.type === 'hold').length,
      chordCount: countChords(cleaned),
      stairsUsed: useStairs,
      stairsCount,
      style,
    },
  };
}

function countChords(notes) {
  const map = new Map();
  for (const n of notes) map.set(n.time, (map.get(n.time) || 0) + 1);
  let c = 0;
  for (const v of map.values()) if (v > 1) c++;
  return c;
}

function tick() { return new Promise((r) => setTimeout(r, 0)); }

export { LANE_NAMES };
