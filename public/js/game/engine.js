/* Vibrix — oynanış motoru (Canvas 2D, AudioContext tabanlı senkronizasyon) */
import { api, auth, settings, sfx, toast, navigate, esc, fmtNum, fmtAcc } from '../app.js';
import { icon } from '../icons.js';
import {
  JUDGMENT_META, scoreFromSequence, computeAccuracy, computeRank, DEFAULT_WINDOWS,
} from '../shared/scoring.js';

const LANE_COLORS = ['#C4B5FD', '#C084FC', '#22C55E', '#F472B6'];

/**
 * Hazır nota renk paletleri.
 * BFLec  = sarı / siyah
 * BFAli  = mavi, kırmızı, koyu kırmızı, siyah
 * Prism  = prizma: menekşe, camgöbeği, fuşya, zümrüt
 */
export const NOTE_PALETTES = {
  default: { name: 'Vibrix (Varsayılan)', colors: LANE_COLORS },
  bflec: { name: 'BFLec — Sarı & Siyah', colors: ['#FFD400', '#1A1A1A', '#FFC000', '#3A3A3A'] },
  bfali: { name: 'BFAli — Mavi & Kırmızı', colors: ['#2F6BFF', '#E11D48', '#7F1D1D', '#1E293B'] },
  prism: { name: 'Prism Crew — Prizma', colors: ['#8B5CF6', '#22D3EE', '#E879F9', '#34D399'] },
  neon: { name: 'Neon Gece', colors: ['#22D3EE', '#A3E635', '#F472B6', '#FBBF24'] },
  mono: { name: 'Tek Renk (Beyaz)', colors: ['#F8FAFC', '#F8FAFC', '#F8FAFC', '#F8FAFC'] },
};

/** "#rrggbb" → doğrula */
export function normalizeHex(v) {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^#?([0-9a-fA-F]{6})$/);
  return m ? `#${m[1].toUpperCase()}` : null;
}

/** Ayarlardan geçerli 4 hat rengi (palet veya kullanıcı paleti) */
export function resolveLaneColors(visual = {}) {
  const preset = visual.noteColors || 'default';
  if (preset === 'custom') {
    const custom = Array.isArray(visual.customNoteColors) ? visual.customNoteColors : [];
    return [0, 1, 2, 3].map((i) => normalizeHex(custom[i]) || LANE_COLORS[i]);
  }
  const pal = NOTE_PALETTES[preset] || NOTE_PALETTES.default;
  return pal.colors.slice(0, 4);
}
const WINDOW_PRESETS = {
  strict: { perfect: 35, great: 70, good: 105, bad: 150 },
  normal: { perfect: 45, great: 85, good: 120, bad: 165 },
  lenient: { perfect: 60, great: 100, good: 140, bad: 185 },
};
const LANE_KEYS = ['d', 'f', 'j', 'k'];

function windowsFor() {
  const preset = settings.data.gameplay.judgementWindows || 'normal';
  return WINDOW_PRESETS[preset] || DEFAULT_WINDOWS;
}

export async function launchGame({ chartId, test = false, onExit } = {}) {
  const root = document.getElementById('game-root');
  if (!root) throw new Error('Oyun alanı bulunamadı.');
  root.innerHTML = '';
  root.classList.add('active');
  document.body.classList.add('in-game');
  root.innerHTML = '<div class="loading-screen" style="height:100vh"><div class="spinner"></div><div>Grafik yükleniyor…</div></div>';

  let data;
  try {
    data = await api(`/charts/${chartId}`);
  } catch (e) {
    root.classList.remove('active');
    document.body.classList.remove('in-game');
    root.innerHTML = '';
    toast(e.message, 'error');
    if (onExit) onExit();
    return null;
  }
  const chart = data.chart;
  if (!chart.chartData || !Array.isArray(chart.chartData.notes)) {
    root.classList.remove('active');
    document.body.classList.remove('in-game');
    root.innerHTML = '';
    toast('Grafik verisi bozuk veya eksik.', 'error');
    if (onExit) onExit();
    return null;
  }
  const notes = chart.chartData.notes;
  if (auth.user) api(`/charts/${chartId}/play`, { method: 'POST' }).catch(() => {});

  return new Game({
    root, chart, notes, test, onExit,
  }).start();
}

class Game {
  constructor({ root, chart, notes, test, onExit }) {
    this.root = root;
    this.chart = chart;
    this.notes = notes;
    this.test = test;
    this.onExit = onExit;
    this.settings = settings.data;
    // Nota renkleri: hazır palet ya da kullanıcının kendi renkleri
    this.laneColors = resolveLaneColors(this.settings.visual || {});
    this.windows = windowsFor();

    this.state = 'loading'; // loading | ready | countdown | playing | paused | finished
    this.audio = null;
    this.audioCtx = null;
    this.ctx = null;
    this.raf = 0;
    this.fps = 0;
    this._fpsFrames = 0;
    this._fpsLast = performance.now();

    this.resetPlayState();
    this.buildUi();
    this.bindInput();
  }

  /** Motoru başlatır (UI kurulduktan sonra sesi yükler) */
  async start() {
    await this.loadAudio();
    return this;
  }

  resetPlayState() {
    this.judgments = [];
    this.noteState = new Map(); // id -> {hit, holdActive, released}
    this.combo = 0;
    this.maxCombo = 0;
    this.counts = { perfect: 0, great: 0, good: 0, bad: 0, miss: 0 };
    this.lastJudgment = null;
    this.lastJudgmentAt = 0;
    this.lastJudgmentLane = 1; // judgment yazısı notanın basıldığı hatta çıkar
    this.effects = [];
    this.pressed = [false, false, false, false];
    this.nextNoteIdx = 0;
    this.score = 0;
    this.finished = false;
    this.startedAt = 0;
  }

  buildUi() {
    const c = this.chart;
    this.root.innerHTML = `
      <canvas id="rx-canvas"></canvas>
      <div class="game-hud">
        <div class="hud-top">
          <div class="hud-song">
            <div class="t">${esc(c.songTitle)}</div>
            <div class="a">${esc(c.artist || '')} · Lv.${c.difficultyLevel} ${esc(c.difficulty)}${c.isAutoChart ? ' · <span class="ai-tag" title="Bu grafik AI ile oluşturuldu">✨ AI ile oluşturuldu</span>' : ''}</div>
            <div class="mono" id="hud-fps" style="font-size:.7rem;color:#64748b;display:${this.settings.visual.showFps ? 'block' : 'none'}">FPS --</div>
          </div>
          <div class="hud-score">
            <div class="s" id="hud-score">0</div>
            <div class="acc" id="hud-acc">100.00% · 0 kombo</div>
            <div class="acc" id="hud-miss">Miss: 0</div>
          </div>
        </div>
        <div class="hud-progress"><div id="hud-progress"></div></div>
      </div>
      <button class="btn btn-ghost btn-icon game-pause-btn" id="pause-btn" title="Duraklat (Esc)">${icon('pause')}</button>
      <div class="overlay-screen" id="overlay"></div>`;

    this.canvas = this.root.querySelector('#rx-canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.resize();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);

    this.root.querySelector('#pause-btn').addEventListener('click', () => this.togglePause());
    this.el = {
      score: this.root.querySelector('#hud-score'),
      acc: this.root.querySelector('#hud-acc'),
      miss: this.root.querySelector('#hud-miss'),
      progress: this.root.querySelector('#hud-progress'),
      fps: this.root.querySelector('#hud-fps'),
      overlay: this.root.querySelector('#overlay'),
    };
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.w = this.canvas.clientWidth || window.innerWidth;
    this.h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.floor(this.w * dpr);
    this.canvas.height = Math.floor(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.layout();
  }

  layout() {
    const laneWidth = Math.max(96, Math.min(200, this.w * 0.1));
    this.laneW = laneWidth;
    this.boardW = laneWidth * 4;
    this.boardX = (this.w - this.boardW) / 2;
    // Judgment çizgisi: notalar YUKARIDAN gelir, çizgi ekranın alt kısmında
    this.judgmentY = this.h - Math.max(110, this.h * 0.16);
    // Notaların çizildiği bant: üst kenar (uzak) → judgment (yakın)
    this.playTop = -this.h * 0.02;
    this.playBot = this.judgmentY;

    // 3D perspektif: uzak ufuk noktası ve üst genişlik ölçeği
    this.persp = this.perspectiveStrength();
    this.vanishX = this.w / 2;
    // Ufuk: ekranın üstünde, çok yukarı taşmasın (notalar oradan gelir)
    this.vanishY = -this.h * 0.22 * this.persp;
    // Uzak uçtaki hat genişliği: derinlik arttıkça daralır (oynanabilir kalsın)
    this.farScale = Math.max(0.6, 1 - this.persp * 0.42);
    this.topY = 0;
  }

  /** 0 = kapalı (düz 4K), 1 = maksimum perspektif */
  perspectiveStrength() {
    if (!this.settings.gameplay.perspective) return 0;
    const v = Number(this.settings.gameplay.perspectiveStrength ?? 65);
    return Math.min(1, Math.max(0.1, v / 100));
  }

  /**
   * Düz ekran Y'sini perspektifli Y'ye çevirir (0 = uzak, 1 = yakın/judgment).
   * t: 0 → ekranın en üstü, 1 → judgment çizgisi
   */
  /**
   * Düz Y'yi perspektifli Y'ye çevirir: judgment çizgisine olan piksel
   * uzaklığı perspektif eğrisinden geçirilir.
   */
  perspY(yFlat) {
    if (!this.persp) return yFlat;
    if (!Number.isFinite(yFlat)) return yFlat;
    const jy = this.judgmentY;
    const span = this.depthSpan() || 1;
    const d = Math.abs(yFlat - jy) / span;           // 0 judgment, 1 ekranın öteki ucu
    const p = Math.max(0, Math.min(1.6, d));
    // İçeri (=uzaklaşan) yönde sıkıştır; ekranın boş tarafına taşan kısmı da kırp.
    // Küçük uzaklıklarda neredeyse doğrusal kalır (notalar yapışmaz),
    // uzakta hızla daralır (derinlik hissi).
    const k = 0.2 + this.persp * 0.75;
    const pc = Math.min(1, p);
    const warp = pc * (1 - 0.35 * this.persp) + Math.pow(pc, 1 / (1 + k)) * (0.35 * this.persp);
    const far = this.farY();
    if (yFlat > jy) return jy + (yFlat - jy) * 0.5; // judgment'ın altı (kısa boşluk)
    return jy - warp * Math.abs(jy - far);
  }

  /** Ekrandaki en uzak noktanın Y'si (notalar yukarıdan gelir: üst kenar) */
  farY() {
    return this.playTop;
  }

  /** Judgment çizgisinden ekranın öteki ucuna piksel mesafesi */
  depthSpan() {
    return this.judgmentY - this.playTop;
  }

  /** Uzak ufkun ekranda gerçekten göründüğü Y (perspektif dönüşümünden sonra) */
  farScreenY() {
    const Y = this.perspY(this.farY());
    return Number.isFinite(Y) ? Y : 0;
  }

  /** Perspektifte bir noktadaki hat ölçeği (piksel uzaklığa göre) */
  perspScaleAt(yFlat) {
    if (!this.persp || !Number.isFinite(yFlat)) return 1;
    const span = this.depthSpan() || 1;
    const p = Math.min(1, Math.max(0, Math.abs(yFlat - this.judgmentY) / span));
    const k = 0.2 + this.persp * 0.75;
    const warp = p * (1 - 0.35 * this.persp) + Math.pow(p, 1 / (1 + k)) * (0.35 * this.persp);
    return 1 + (this.farScale - 1) * warp;
  }

  /** p: 0 = judgment çizgisi, 1 = uzak ufuk — hat genişlik ölçeği */
  perspScale(progress) {
    if (!this.persp) return 1;
    const t = Math.max(0, Math.min(1, progress));
    return 1 + (this.farScale - 1) * Math.pow(t, 0.75);
  }

  /** Perspektifte bir hattın sol/sağ X koordinatları */
  perspLaneX(lane, scale) {
    if (!this.persp) {
      const x = this.boardX + lane * this.laneW;
      return { x, w: this.laneW };
    }
    const cx = this.w / 2;
    const x0 = this.boardX + lane * this.laneW;
    // Genişlik %55'in altına inmez: perspektif ölçeği sadece Y sıkışmasında etkili olsun
    const s = Math.max(0.55, scale);
    const w = this.laneW * s;
    const x = cx + (x0 + this.laneW / 2 - cx) * s - w / 2;
    return { x, w };
  }

  /* ---------- Ses ---------- */
  async loadAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = new Ctx();
    this.musicVolume = (this.settings.audio.master ?? 80) / 100 * (this.settings.audio.music ?? 85) / 100;
    try {
      const res = await fetch(this.chart.audio, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Ses dosyası yüklenemedi.');
      const buf = await res.arrayBuffer();
      this.audioBuffer = await this.audioCtx.decodeAudioData(buf);
    } catch (e) {
      this.showError('Ses dosyası yüklenemedi. Grafik çalınamıyor.');
      return;
    }
    this.duration = this.audioBuffer.duration * 1000;
    this.chartLength = Math.max(this.duration, this.chart.lengthMs);
    this.state = 'ready';
    this.showStart();
    this.loop();
  }

  showError(msg) {
    this.state = 'error';
    this.el.overlay.classList.add('open');
    this.el.overlay.innerHTML = `<div class="overlay-card"><h2>Ses Hatası</h2><p class="muted" style="margin:10px 0 20px">${esc(msg)}</p>
      <div class="row"><button class="btn btn-ghost" id="ov-back">Geri Dön</button><button class="btn btn-primary" id="ov-retry">Yeniden Dene</button></div></div>`;
    this.el.overlay.querySelector('#ov-back').onclick = () => this.exit();
    this.el.overlay.querySelector('#ov-retry').onclick = () => { this.destroy(); launchGame({ chartId: this.chart.id, test: this.test, onExit: this.onExit }); };
  }

  showStart() {
    this.el.overlay.classList.add('open');
    this.el.overlay.innerHTML = `
      <div class="overlay-card">
        <div class="eyebrow">${this.test ? 'Test Modu' : 'Oynanış'}</div>
        <h2 style="margin:6px 0 4px">${esc(this.chart.songTitle)}</h2>
        <p class="muted small">${esc(this.chart.artist || '')} · Lv.${this.chart.difficultyLevel} ${esc(this.chart.difficulty)} · ${this.notes.length} nota${this.chart.isAutoChart ? ' · <span class="ai-tag">✨ AI ile oluşturuldu</span>' : ''}</p>
        <div class="card" style="margin:18px 0;background:rgba(11,13,18,.5)">
          <div class="row" style="justify-content:center;gap:16px">
            ${[0, 1, 2, 3].map((i) => `<span class="rank-badge" style="min-width:44px;height:38px;font-size:1rem;color:${this.laneColors[i]};border-color:${this.laneColors[i]}55">${(this.settings.keys[i] || LANE_KEYS[i]).toUpperCase()}</span>`).join('')}
          </div>
          <p class="muted small" style="text-align:center;margin-top:12px">Hatlar: 1 · 2 · 3 · 4</p>
        </div>
        ${this.test ? '<p class="muted small" style="margin-bottom:12px">Test oynanışı skor olarak kaydedilmez.</p>' : (auth.user ? '' : '<p class="muted small" style="margin-bottom:12px">Misafir olarak oynuyorsun; skorun kaydedilmeyecek. <a href="/giris" data-link>Oturum aç</a></p>')}
        <div class="row" style="gap:10px">
          <button class="btn btn-primary btn-lg" id="ov-start" style="flex:1">${icon('play')} Başla</button>
          <button class="btn btn-ghost" id="ov-back">${icon('x')} Çık</button>
        </div>
        <p class="muted small" style="margin-top:14px">Esc ile duraklat · <a href="/ayarlar" id="ov-settings">Ayarlar</a> (oynanış sırasında değişiklik için önce çık)</p>
      </div>`;
    this.el.overlay.querySelector('#ov-start').onclick = () => this.beginCountdown();
    this.el.overlay.querySelector('#ov-back').onclick = () => this.exit();
    this.el.overlay.querySelector('#ov-settings').onclick = (e) => { e.preventDefault(); this.exit('/ayarlar'); };
  }

  beginCountdown() {
    this.el.overlay.classList.remove('open');
    this.state = 'countdown';
    let n = 3;
    const show = () => {
      this.el.overlay.classList.add('open');
      this.el.overlay.innerHTML = `<div style="text-align:center"><div class="countdown-num">${n > 0 ? n : 'BAŞLA'}</div></div>`;
      if (n > 0) { n--; this._cdTimer = setTimeout(show, 600); }
      else { this._cdTimer = setTimeout(() => { this.el.overlay.classList.remove('open'); this.startPlayback(); }, 350); }
    };
    show();
  }

  startPlayback() {
    this.resetPlayState();
    const ctx = this.audioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = this.audioBuffer;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(this.musicVolume, now + 0.25);
    src.connect(gain).connect(ctx.destination);
    // Grafik ofseti: offset_ms kadar sessizlik ekleyerek notaları hizalıyoruz
    const offset = Number(this.chart.offsetMs) || 0;
    this.startCtxTime = now + Math.max(0, offset) / 1000;
    this.playbackOffset = Math.max(0, offset);
    if (offset >= 0) src.start(this.startCtxTime);
    else src.start(now, -offset / 1000);
    this.source = src;
    this.gainNode = gain;
    this.startedAt = performance.now();
    this.state = 'playing';
    this.playStartWall = performance.now();
    window.__rxNow = () => this.currentTimeMs();
    window.__rxGame = this;
    src.onended = () => { if (this.state === 'playing') this.finish(); };
  }

  /** Oynanış zamanı (ms) — AudioContext saatine dayalı */
  currentTimeMs() {
    if (!this.audioCtx) return 0;
    return (this.audioCtx.currentTime - this.startCtxTime) * 1000;
  }

  /* ---------- Girdi ---------- */
  bindInput() {
    this._onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (this.state === 'playing') this.togglePause();
        else if (this.state === 'paused') this.resume();
        return;
      }
      if (this.state !== 'playing') return;
      const keys = this.settings.keys || {};
      for (let lane = 0; lane < 4; lane++) {
        const k = (keys[lane] || LANE_KEYS[lane]).toLowerCase();
        if (e.key.toLowerCase() === k) {
          e.preventDefault();
          if (!this.pressed[lane]) this.pressLane(lane);
          return;
        }
      }
    };
    this._onKeyUp = (e) => {
      const keys = this.settings.keys || {};
      for (let lane = 0; lane < 4; lane++) {
        const k = (keys[lane] || LANE_KEYS[lane]).toLowerCase();
        if (e.key.toLowerCase() === k) { this.releaseLane(lane); return; }
      }
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  pressLane(lane) {
    this.pressed[lane] = true;
    const now = this.currentTimeMs() - (this.settings.gameplay.inputOffset || 0);
    this.effects.push({ lane, at: performance.now(), kind: 'press' });

    // 1) Devam eden hold'ları kontrol et
    for (const n of this.notes) {
      if (n.lane !== lane || n.type !== 'hold') continue;
      const st = this.noteState.get(n.id);
      if (!st || !st.hit || st.holdActive) continue;
      if (now >= n.time - 10 && now <= n.time + n.duration + this.windows.bad) {
        st.holdActive = true;
        st.holdStart = now;
      }
    }

    // 2) En yakın notayı bul (vurulmamış, penceredeki)
    let best = null;
    let bestDiff = Infinity;
    for (const n of this.notes) {
      const st = this.noteState.get(n.id);
      if (st && (st.hit || st.missed)) continue;
      if (n.lane !== lane) continue;
      const diff = now - n.time;
      if (Math.abs(diff) > this.windows.bad) continue;
      if (Math.abs(diff) < Math.abs(bestDiff)) { best = n; bestDiff = diff; }
    }
    if (best) this.hitNote(best, bestDiff);
  }

  releaseLane(lane) {
    this.pressed[lane] = false;
    const now = this.currentTimeMs() - (this.settings.gameplay.inputOffset || 0);
    for (const n of this.notes) {
      if (n.lane !== lane || n.type !== 'hold') continue;
      const st = this.noteState.get(n.id);
      if (!st || !st.holdActive) continue;
      const endTime = n.time + n.duration;
      st.holdActive = false;
      if (now < endTime - this.windows.bad) {
        // Erken bırakma → miss
        st.missed = true;
        this.registerJudgment('miss', lane);
      } else {
        st.released = true;
      }
    }
  }

  hitNote(n, diff) {
    const a = Math.abs(diff);
    let kind = 'bad';
    if (a <= this.windows.perfect) kind = 'perfect';
    else if (a <= this.windows.great) kind = 'great';
    else if (a <= this.windows.good) kind = 'good';
    else kind = 'bad';
    const st = this.noteState.get(n.id) || {};
    st.hit = true;
    if (n.type === 'hold') {
      st.holdActive = true;
      st.holdStart = this.currentTimeMs();
      // Kısa hold: tuş basılı tutuluyorsa otomatik tamamlanır
    }
    this.noteState.set(n.id, st);
    this.registerJudgment(kind, n.lane);
    if (n.type === 'hold' && !this.pressed[n.lane]) {
      // Tuş bırakıldıysa hold yarıda kalır
      st.holdActive = false;
    }
  }

  registerJudgment(kind, lane) {
    this.judgments.push(kind);
    this.counts[kind]++;
    if (kind === 'miss') {
      this.combo = 0;
    } else {
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    }
    const meta = JUDGMENT_META[kind];
    const bonus = Math.round(Math.min(this.combo, 100) / 100 * 300 * (1 / 6));
    if (kind !== 'miss') this.score += meta.score + bonus;
    this.lastJudgment = kind;
    this.lastJudgmentAt = performance.now();
    this.lastJudgmentLane = lane;
    this.effects.push({ lane, at: performance.now(), kind });
    if (this.settings.visual.hitEffects) sfx.judge(kind);
    if (kind === 'miss' && this.settings.visual.screenShake) this.shake = 6;
  }

  /* ---------- Döngü ---------- */
  loop() {
    const frame = () => {
      this.raf = requestAnimationFrame(frame);
      const nowPerf = performance.now();
      this._fpsFrames++;
      if (nowPerf - this._fpsLast > 500) {
        this.fps = Math.round((this._fpsFrames * 1000) / (nowPerf - this._fpsLast));
        this._fpsFrames = 0; this._fpsLast = nowPerf;
        if (this.el.fps && this.settings.visual.showFps) this.el.fps.textContent = `FPS ${this.fps}`;
      }
      this.update();
      this.draw();
    };
    this.raf = requestAnimationFrame(frame);
  }

  update() {
    if (this.state !== 'playing') return;
    const t = this.currentTimeMs() - (this.settings.gameplay.inputOffset || 0);

    // Miss tespiti
    for (const n of this.notes) {
      const st = this.noteState.get(n.id);
      if (st && (st.hit || st.missed)) continue;
      if (t - n.time > this.windows.bad) {
        this.noteState.set(n.id, { ...(st || {}), missed: true });
        this.registerJudgment('miss', n.lane);
      }
    }
    // Hold tamamlanması
    for (const n of this.notes) {
      if (n.type !== 'hold') continue;
      const st = this.noteState.get(n.id);
      if (!st || !st.holdActive) continue;
      if (!this.pressed[n.lane]) {
        // tuş bırakıldı ama release yakalanmadı
        st.holdActive = false;
        if (t < n.time + n.duration - this.windows.bad) { st.missed = true; this.registerJudgment('miss', n.lane); }
      } else if (t >= n.time + n.duration) {
        st.holdActive = false;
        st.completed = true;
        st.released = true;
      }
    }

    // HUD
    const totalJudged = this.counts.perfect + this.counts.great + this.counts.good + this.counts.bad + this.counts.miss;
    const acc = totalJudged ? computeAccuracy(this.counts) : 100;
    this.el.score.textContent = fmtNum(this.score);
    this.el.acc.textContent = `${acc.toFixed(2)}% · ${fmtNum(this.combo)} kombo`;
    this.el.miss.textContent = `Miss: ${this.counts.miss}`;
    this.el.progress.style.width = `${Math.min(100, Math.max(0, (t / this.chartLength) * 100))}%`;

    if (this.shake > 0) this.shake *= 0.85;

    // Tüm notalar işlendi mi?
    if (totalJudged >= this.notes.length && t > this.chartLength - 200) this.finish();
  }

  draw() {
    const ctx = this.ctx;
    const w = this.w, h = this.h;
    const dim = (this.settings.visual.backgroundDim ?? 60) / 100;
    ctx.save();
    if (this.shake > 0.3) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    // Arka plan: notalar yukarıdan gelir, alt taraf koyulaşır
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    const dark = (v) => Math.round(v + 8 * (1 - dim));
    bg.addColorStop(0, `rgba(${dark(11)}, ${dark(13)}, ${dark(18)}, 1)`);
    bg.addColorStop(1, '#05070b');
    ctx.fillStyle = bg;
    ctx.fillRect(-20, -20, w + 40, h + 40);

    const bx = this.boardX, bw = this.boardW, lw = this.laneW;
    const laneOpacity = (this.settings.gameplay.laneOpacity ?? 100) / 100;
    const P = this.persp;
    // 3D'de hatların görünen uzak ucu: perspektif dönüşümünden sonraki gerçek Y
    // (perspY(farY) ekranın üstünde kalabiliyordu → hatlar yukarı taşıyordu)
    const visTop = P ? Math.min(0, this.farScreenY()) : 0;
    const farEdge = visTop;
    const t = this.currentTimeMs();
    const msPerPx = this.scrollMsPerPx();
    const jy = this.judgmentY;

    // Yardımcılar: düz Y → perspektifli Y; genişlik ölçeği
    const py = (yFlat) => this.perspY(yFlat);
    // Ölçek: judgment'tan uzaklaşan her yönde küçülür (yön bağımsız)
    const sc = (yFlat) => this.perspScaleAt(yFlat);
    const laneBox = (lane, scale) => this.perspLaneX(lane, scale);

    /* ---------- 3D perspektif: ufuk ve derinlik sütunları ---------- */
    if (P) {
      const farY = this.farY();
      // Ufuk ışıması
      const hg = ctx.createRadialGradient(this.w / 2, farY, 0, this.w / 2, farY, Math.max(this.w * 0.55, 320));
      hg.addColorStop(0, `rgba(139,92,246,${0.16 + 0.1 * this.persp})`);
      hg.addColorStop(0.45, `rgba(56,189,248,${0.05 + 0.04 * this.persp})`);
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hg;
      ctx.fillRect(0, Math.min(farY, jy) - 200, this.w, Math.abs(jy - farY) + 400);

      // Ufuk çizgisi
      ctx.strokeStyle = `rgba(167,139,250,${0.16 + 0.14 * this.persp})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, farY);
      ctx.lineTo(this.w, farY);
      ctx.stroke();
    }

    // Hat arka planları
    for (let i = 0; i < 4; i++) {
      if (P) {
        const nearScale = sc(jy);
        const farScale = sc(visTop);
        const aN = laneBox(i, nearScale);
        const bN = laneBox(i + 1, nearScale);
        const yNear = this.judgmentY - (P ? Math.max(26, h * 0.03) : 0);
        const aF = laneBox(i, farScale);
        const bF = laneBox(i + 1, farScale);
        const g = ctx.createLinearGradient(0, jy, 0, farEdge);
        const laneColor = this.laneColors[i];
        const strong = 0.95;
        const mid = 0.7;
        const mid2 = 0.4;
        const weak = 0.06;
        g.addColorStop(0, `rgba(34,42,60,${strong * laneOpacity})`);
        g.addColorStop(0.25, `rgba(24,30,44,${mid * laneOpacity})`);
        g.addColorStop(0.65, `rgba(17,22,33,${mid2 * laneOpacity})`);
        g.addColorStop(1, `rgba(10,13,21,${weak * laneOpacity})`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(aN.x + 1, yNear);
        ctx.lineTo(aF.x + 1, farEdge);
        ctx.lineTo(bF.x + bF.w - 1, farEdge);
        ctx.lineTo(bN.x + bN.w - 1, yNear);
        ctx.closePath();
        ctx.fill();

        // Basılı hat: renkli iç ışıma (perspektife uygun trapez)
        if (this.pressed[i]) {
          const pg = ctx.createLinearGradient(0, jy, 0, visTop);
          pg.addColorStop(0, `${laneColor}44`);
          pg.addColorStop(0.5, `${laneColor}18`);
          pg.addColorStop(1, `${laneColor}00`);
          ctx.fillStyle = pg;
          ctx.fill();
        }
      } else {
        const x = bx + i * lw;
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, 'rgba(15,20,30,0.0)');
        g.addColorStop(0.6, `rgba(20,26,38,${0.55 * laneOpacity})`);
        g.addColorStop(1, `rgba(28,34,48,${0.8 * laneOpacity})`);
        ctx.fillStyle = g;
        ctx.fillRect(x + 1, 0, lw - 2, h);
        if (this.pressed[i]) {
          const pg = ctx.createLinearGradient(0, jy, 0, h);
          pg.addColorStop(0, `${this.laneColors[i]}33`);
          pg.addColorStop(1, `${this.laneColors[i]}00`);
          ctx.fillStyle = pg;
          ctx.fillRect(x + 1, 0, lw - 2, h);
        }
      }
    }

    // Hat ayırıcıları
    ctx.lineWidth = 1;
    const farYSep = this.farY();
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      if (P) {
        const near = laneBox(i, sc(jy));
        const far = laneBox(i, sc(visTop));
        const g = ctx.createLinearGradient(0, jy, 0, visTop);
        g.addColorStop(0, 'rgba(148,163,184,0.30)');
        g.addColorStop(0.55, 'rgba(148,163,184,0.12)');
        g.addColorStop(1, 'rgba(148,163,184,0.02)');
        ctx.strokeStyle = g;
        ctx.moveTo(near.x, jy);
        ctx.lineTo(far.x, farEdge);
      } else {
        const x = bx + i * lw;
        const g = ctx.createLinearGradient(0, jy, 0, 0);
        g.addColorStop(0, 'rgba(148,163,184,0.30)');
        g.addColorStop(0.6, 'rgba(148,163,184,0.12)');
        g.addColorStop(1, 'rgba(148,163,184,0.02)');
        ctx.strokeStyle = g;
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, jy);
      }
      ctx.stroke();
    }

    // Beat çizgileri (BPM tabanlı) — perspektifte uzaklaştıkça soluklaşır
    if (this.state === 'playing' || this.state === 'paused' || this.state === 'countdown') {
      const beatMs = 60000 / this.chart.bpm;
      const spanPx = jy;
      const firstBeat = Math.floor((t - 50) / beatMs);
      for (let b = firstBeat; b < firstBeat + 48; b++) {
        const bt = b * beatMs + (this.chart.offsetMs || 0);
        const dist = (bt - t) / msPerPx;
        const yFlat = jy - dist;   // notalar yukarıdan gelir
        if (yFlat < -20 || yFlat > this.h + 20) continue;
        const y = P ? py(yFlat) : yFlat;
        const fade = Math.max(0, 1 - Math.abs(yFlat - jy) / (spanPx * 1.15));
        const isBar = b % 4 === 0;
        const alpha = (isBar ? 0.26 : 0.09) * (P ? 0.35 + fade * 0.85 : 1);
        if (P) {
          const s2 = sc(yFlat);
          const a = laneBox(0, s2);
          const z = laneBox(4, s2);
          ctx.strokeStyle = isBar ? `rgba(167,139,250,${alpha})` : `rgba(148,163,184,${alpha})`;
          ctx.beginPath();
          ctx.moveTo(a.x, y);
          ctx.lineTo(z.x + z.w, y);
          ctx.stroke();
        } else {
          ctx.strokeStyle = isBar ? `rgba(167,139,250,${alpha})` : `rgba(148,163,184,${alpha})`;
          ctx.beginPath();
          ctx.moveTo(bx, y);
          ctx.lineTo(bx + bw, y);
          ctx.stroke();
        }
      }
    }

    /* ---------- Judgment bölgesi ---------- */
    // 3D'de judgment çizgisi istenmiyor: çizgiyle birlikte ekrandaki en yakın
    // hattın genişliği de 1'e sabitlenir; aksi hâlde hat kenarları ekrana tam
    // değdiği için çizgi gibi görünür.
    const sNear = P ? 1 : sc(jy);
    const aN0 = laneBox(0, sNear);
    const aN4 = laneBox(4, sNear);
    // 3D modda judgment bölgesi (bant + çizgi) tamamen kapalı
    if (!P) {
    const bandTop = jy - 38;
    const bandBot = jy;
    const sBand = sc(jy - 38);
    const bB0 = laneBox(0, sBand);
    const bB4 = laneBox(4, sBand);
    const bandFarY = P ? py(bandTop) : bandTop;
    const grad = ctx.createLinearGradient(0, jy, 0, Number.isFinite(bandFarY) ? bandFarY : jy);
    grad.addColorStop(0, 'rgba(139,92,246,0.20)');
    grad.addColorStop(1, 'rgba(139,92,246,0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    if (P) {
      ctx.moveTo(aN0.x, jy);
      ctx.lineTo(bB0.x, bandFarY);
      ctx.lineTo(bB4.x + bB4.w, bandFarY);
      ctx.lineTo(aN4.x + aN4.w, jy);
    } else {
      ctx.moveTo(bx, jy);
      ctx.lineTo(bx, bandFarY);
      ctx.lineTo(bx + bw, bandFarY);
      ctx.lineTo(bx + bw, jy);
    }
    ctx.closePath();
    ctx.fill();

    // Judgment çizgisi (+ parıltı) — YALNIZCA 4 hattın genişliği kadar
    // Sınırlar oyun alanından hesaplanır (perspektifte de doğru kalır)
    // 4 hattın GERÇEK kenarları: ilk hattın solu → son hattın sağı
    const laneEdgeL = (i) => laneBox(i, sc(jy));
    const firstLane = laneEdgeL(0);
    const lastLane = laneEdgeL(3);
    const jl0 = firstLane.x;
    const jl1 = lastLane.x + lastLane.w;
    const drawJudgeLine = () => {
      ctx.beginPath();
      ctx.moveTo(jl0, jy);
      ctx.lineTo(jl1, jy);
      ctx.stroke();
      ctx.lineWidth = 1; // devreden geniş stroke taşmasın
    };
    ctx.lineCap = 'butt'; // çizgi uçları hattın dışına taşmasın
    // 2D'de tam çizgi; 3D'de yalnızca sağ/sol kenar işaretleri (çizgi istenmiyor)
    if (!P) {
      // yumuşak dış parıltı
      ctx.save();
      ctx.shadowColor = 'rgba(167,139,250,0.85)';
      ctx.shadowBlur = 18;
      ctx.strokeStyle = 'rgba(167,139,250,0.55)';
      ctx.lineWidth = 5;
      drawJudgeLine();
      ctx.restore();
    }
    // keskin ana çizgi
    const glow = ctx.createLinearGradient(0, jy - 8, 0, jy + 8);
    glow.addColorStop(0, 'rgba(167,139,250,0)');
    glow.addColorStop(0.5, 'rgba(199,180,255,0.95)');
    glow.addColorStop(1, 'rgba(167,139,250,0)');
    if (!P) {
      ctx.save();
      ctx.strokeStyle = 'rgba(199,180,255,0.9)';
      ctx.lineWidth = 3;
      drawJudgeLine();
      ctx.strokeStyle = glow;
      ctx.lineWidth = 7;
      drawJudgeLine();
      ctx.restore();
    } else {
      // 3D: hattın yalnızca kenarlarında kısa ışık işaretleri
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(199,180,255,0.85)';
      ctx.shadowColor = 'rgba(167,139,250,0.9)';
      ctx.shadowBlur = 12;
      ctx.lineWidth = 4;
      const edgeLen = 26;
      ctx.beginPath();
      ctx.moveTo(jl0, jy); ctx.lineTo(jl0 + edgeLen, jy);
      ctx.moveTo(jl1, jy); ctx.lineTo(jl1 - edgeLen, jy);
      ctx.stroke();
      ctx.restore();
    }
    } // if (!P) — judgment bölgesi

    // Receptörler (klavye tuş yuvaları)
    for (let i = 0; i < 4; i++) {
      const rect = laneBox(i, sNear);
      const x = rect.x;
      const wL = rect.w;
      const active = this.pressed[i];
      const pad = Math.max(3, 6 * (wL / lw));
      const hgt = active ? 11 : 7;
      ctx.fillStyle = active ? this.laneColors[i] : 'rgba(203,213,225,0.3)';
      ctx.globalAlpha = active ? 1 : 0.7;
      roundRect(ctx, x + pad, jy - hgt / 2, wL - pad * 2, hgt, hgt / 2);
      ctx.fill();
      if (active) {
        ctx.shadowColor = this.laneColors[i];
        ctx.shadowBlur = 18;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = active ? '#F1F5F9' : 'rgba(241,245,249,0.6)';
      ctx.font = '600 12px Inter, Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      const keyY = h - 18;
      ctx.fillText((this.settings.keys[i] || LANE_KEYS[i]).toUpperCase(), x + wL / 2, keyY);
    }

    /* ---------- Notalar ---------- */
    if (this.state === 'playing' || this.state === 'paused' || this.state === 'countdown') {
      const noteH = Math.max(14, lw * 0.24) * ((this.settings.gameplay.noteSize ?? 100) / 100);
      const spanPx = jy;
      const visibleMs = spanPx * msPerPx;
      const drawFrom = t - 250;
      const drawTo = t + visibleMs * 1.25 + 200;
      for (const n of this.notes) {
        const st = this.noteState.get(n.id);
        if (st && (st.hit || st.missed)) continue;
        if (n.time + (n.duration || 0) < drawFrom) continue;
        if (n.time > drawTo) break;
        const distHead = (n.time - t) / msPerPx;
        const yFlat = jy - distHead;   // notalar yukarıdan gelir
        if (yFlat < -60 || yFlat > this.h + 60) continue;
        const scale = P ? sc(yFlat) : 1;
        const rect = laneBox(n.lane, scale);
        const pad = Math.max(2, 8 * scale);
        const hNote = noteH * (P ? 0.55 + 0.45 * scale : 1);
        const yRaw = P ? py(yFlat) : yFlat;
        const laneColor = this.laneColors[n.lane];
        if (!Number.isFinite(yRaw) || !Number.isFinite(rect.x) || !Number.isFinite(rect.w) || !Number.isFinite(hNote)) continue;
        const y = yRaw;

        if (n.type === 'hold') {
          const durRaw = Number(n.duration) || 0;
          const endFlatRaw = jy - ((n.time + durRaw - t) / msPerPx);
          const endFlat = Number.isFinite(endFlatRaw) ? Math.max(-4000, Math.min(this.h + 4000, endFlatRaw)) : yFlat;
          const endY = P ? py(endFlat) : endFlat;
          const endScale = P ? sc(endFlat) : 1;
          const endRect = laneBox(n.lane, endScale);
          const yA = y;
          const yB = Number.isFinite(endY) ? endY : y + 1;
          if (!Number.isFinite(endRect.x) || !Number.isFinite(endRect.w) || !Number.isFinite(endScale)) { ctx.globalAlpha = 1; continue; }
          const fading = st && st.hit ? 0.4 : st && st.missed ? 0.2 : 1;
          ctx.globalAlpha = fading;
          // gövde: iki hattın ortalamasıyla trapez
          const bodyGrad = ctx.createLinearGradient(0, yA, 0, Number.isFinite(yB) ? yB : yA + 1);
          bodyGrad.addColorStop(0, `${laneColor}cc`);
          bodyGrad.addColorStop(1, `${laneColor}55`);
          ctx.fillStyle = bodyGrad;
          ctx.beginPath();
          ctx.moveTo(rect.x + pad, yA);
          ctx.lineTo(endRect.x + pad, yB);
          ctx.lineTo(endRect.x + endRect.w - pad, yB);
          ctx.lineTo(rect.x + rect.w - pad, yA);
          ctx.closePath();
          ctx.fill();
          // baş notası
          roundRect(ctx, rect.x + pad, y - hNote / 2, rect.w - pad * 2, hNote, 4 * scale);
          ctx.fillStyle = laneColor;
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          roundRect(ctx, rect.x + pad + 2, y - hNote / 2 + 1.5, Math.max(2, rect.w - pad * 2 - 4), Math.max(1, 2 * scale), 1);
          ctx.fill();
          // kuyruk
          ctx.fillStyle = laneColor;
          roundRect(ctx, endRect.x + pad, endY - 4 * endScale, endRect.w - pad * 2, Math.max(3, 7 * endScale), 3 * endScale);
          ctx.fill();
          ctx.globalAlpha = 1;
        } else {
          // kuyruk izi (yaklaşırken hafif iz)
          if (!P) {
            ctx.globalAlpha = 0.12;
            ctx.fillStyle = laneColor;
            roundRect(ctx, rect.x + pad, y - hNote * 2.4, rect.w - pad * 2, hNote * 1.9, 4);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          ctx.fillStyle = laneColor;
          roundRect(ctx, rect.x + pad, y - hNote / 2, rect.w - pad * 2, hNote, 4 * scale);
          ctx.fill();
          // parlama
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          roundRect(ctx, rect.x + pad + 2, y - hNote / 2 + 1.5, Math.max(2, rect.w - pad * 2 - 4), Math.max(1, 2 * scale), 1);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    // Vuruş efektleri (judgment bölgesinde, yöne göre)
    const nowPerf = performance.now();
    this.effects = this.effects.filter((e) => nowPerf - e.at < 320);
    for (const e of this.effects) {
      const age = (nowPerf - e.at) / 320;
      const r = laneBox(e.lane, sNear);
      const x = r.x + r.w / 2;
      if (e.kind === 'press') {
        ctx.globalAlpha = (1 - age) * 0.4;
        ctx.fillStyle = this.laneColors[e.lane];
        roundRect(ctx, r.x + 5, jy - 8, r.w - 10, 16, 8);
        ctx.fill();
      } else if (this.settings.visual.hitEffects && e.kind !== 'miss') {
        // halka
        ctx.globalAlpha = (1 - age) * 0.9;
        ctx.strokeStyle = this.laneColors[e.lane];
        ctx.lineWidth = 2.5 * (1 - age) + 0.8;
        ctx.beginPath();
        ctx.arc(x, jy, 8 + age * 40, 0, Math.PI * 2);
        ctx.stroke();
        // iç halka
        ctx.globalAlpha = (1 - age) * 0.4;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, jy, 4 + age * 22, 0, Math.PI * 2);
        ctx.stroke();
        // yatay ışık çizgisi (receptor üzerinde)
        const spread = r.w * (0.4 + age * 0.7);
        const lg = ctx.createLinearGradient(x - spread, jy, x + spread, jy);
        lg.addColorStop(0, 'rgba(0,0,0,0)');
        lg.addColorStop(0.5, this.laneColors[e.lane]);
        lg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = (1 - age) * 0.85;
        ctx.strokeStyle = lg;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x - spread, jy);
        ctx.lineTo(x + spread, jy);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // Judgment yazısı — notanın basıldığı hattın ortasında (ortada değil)
    if (this.lastJudgment && nowPerf - this.lastJudgmentAt < 460) {
      const age = (nowPerf - this.lastJudgmentAt) / 460;
      const colors = { perfect: '#E9E2FF', great: '#D8B4FE', good: '#4ADE80', bad: '#FDE047', miss: '#F87171' };
      const laneIdx = Math.max(0, Math.min(3, this.lastJudgmentLane | 0));
      const own = laneBox(laneIdx, sNear);
      const laneCx = own.x + own.w / 2;
      // yazı hattın içinde kalsın: taşarsa küçült
      let size = 24 + age * 5;
      const label = JUDGMENT_META[this.lastJudgment].label;
      ctx.font = `800 ${size}px Inter, Segoe UI, sans-serif`;
      const maxW = own.w - 10;
      let tw = ctx.measureText(label).width;
      if (tw > maxW) {
        size = Math.max(11, size * (maxW / tw));
        ctx.font = `800 ${size}px Inter, Segoe UI, sans-serif`;
        tw = ctx.measureText(label).width;
      }
      const rise = 40 + age * 26; // yukarı doğru süzülür
      const ty = jy - rise;
      ctx.globalAlpha = Math.max(0, 1 - age);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // okunurluk için koyu kontur
      ctx.lineWidth = Math.max(2.5, size * 0.16);
      ctx.strokeStyle = 'rgba(6,8,14,0.85)';
      ctx.strokeText(label, laneCx, ty);
      ctx.fillStyle = colors[this.lastJudgment];
      if (this.lastJudgment === 'perfect') {
        ctx.shadowColor = colors.perfect;
        ctx.shadowBlur = 20 * (1 - age);
      } else if (this.lastJudgment === 'miss') {
        ctx.shadowColor = 'rgba(239,68,68,0.7)';
        ctx.shadowBlur = 10 * (1 - age);
      }
      ctx.fillText(label, laneCx, ty);
      ctx.shadowBlur = 0;
      ctx.textBaseline = 'alphabetic';
    }
    ctx.globalAlpha = 1;

    // Kombo
    if (this.combo > 2) {
      const comboY = jy - 130;
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = 'rgba(241,245,249,0.95)';
      ctx.font = '800 40px Inter, Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(this.combo), w / 2, comboY);
      ctx.font = '700 12px Inter, Segoe UI, sans-serif';
      ctx.fillStyle = 'rgba(148,163,184,0.9)';
      ctx.fillText('COMBO', w / 2, comboY + 16);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  /**
   * Piksel başına milisaniye. Hız 1..12 arasıdır ve gerçek bir hız çarpanıdır:
   * 1 → 2 px/ms (yavaş), 5 → 10 px/ms, 12 → 24 px/ms (çok hızlı).
   * Nota akışı px/ms = speed * 2 olduğundan ms/px = 1 / (speed * 2).
   */
  scrollMsPerPx() {
    const speed = Math.min(12, Math.max(0.5, Number(this.settings.gameplay.scrollSpeed) || 2.5));
    return 1 / (speed * 1.2);
  }

  /* ---------- Duraklatma / bitiş ---------- */
  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      if (this.audioCtx) this.audioCtx.suspend();
      this.showPause();
    } else if (this.state === 'paused') {
      this.resume();
    }
  }

  showPause() {
    this.el.overlay.classList.add('open');
    this.el.overlay.innerHTML = `
      <div class="overlay-card">
        <div class="eyebrow">Duraklatıldı</div>
        <h2 style="margin:6px 0 16px">${esc(this.chart.songTitle)}</h2>
        <div class="row wrap" style="gap:10px">
          <button class="btn btn-primary" id="ov-resume" style="flex:1">${icon('play')} Devam Et</button>
          <button class="btn btn-ghost" id="ov-restart">${icon('refresh')} Yeniden Başlat</button>
          <button class="btn btn-danger" id="ov-exit">${icon('logout')} Çık</button>
        </div>
        <p class="muted small" style="margin-top:16px">Esc ile devam edebilirsin.</p>
      </div>`;
    this.el.overlay.querySelector('#ov-resume').onclick = () => this.resume();
    this.el.overlay.querySelector('#ov-restart').onclick = () => this.restart();
    this.el.overlay.querySelector('#ov-exit').onclick = () => this.exit();
  }

  resume() {
    this.el.overlay.classList.remove('open');
    this.el.overlay.innerHTML = '';
    if (this.audioCtx) this.audioCtx.resume();
    this.state = 'playing';
  }

  restart() {
    this.destroyAudio();
    this.resetPlayState();
    this.el.overlay.classList.remove('open');
    this.el.overlay.innerHTML = '';
    this.state = 'ready';
    this.showStart();
  }

  destroyAudio() {
    try { if (this.source) { this.source.onended = null; this.source.stop(); } } catch { /* yoksay */ }
    this.source = null;
    if (this.audioCtx && this.audioCtx.state === 'suspended') this.audioCtx.resume();
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    this.state = 'finished';
    this.destroyAudio();
    const totalJudged = this.counts.perfect + this.counts.great + this.counts.good + this.counts.bad + this.counts.miss;
    // Kalan notaları miss say
    if (totalJudged < this.notes.length) {
      const remaining = this.notes.length - totalJudged;
      this.counts.miss += remaining;
      for (let i = 0; i < remaining; i++) this.judgments.push('miss');
    }
    const seq = scoreFromSequence(this.judgments);
    this.score = seq.score;
    this.maxCombo = seq.maxCombo;
    this.accuracy = computeAccuracy(this.counts);
    this.rank = computeRank(this.accuracy, this.counts);
    this.durationMs = Math.round(this.chartLength);
    this.submitResult();
  }

  async submitResult() {
    const payload = {
      chartId: this.chart.id,
      score: this.score,
      accuracy: Number(this.accuracy.toFixed(4)),
      maxCombo: this.maxCombo,
      rank: this.rank,
      durationMs: this.durationMs,
      judgments: this.counts,
      test: this.test,
    };
    let result = null;
    let error = null;
    if (!auth.user) {
      error = 'Misafir oynanışı kaydedilmedi. Skorunu kaydetmek için oturum aç.';
    } else {
      try {
        result = await api('/scores', { method: 'POST', body: payload });
        if (!result.accepted) error = 'Skor doğrulanamadı: ' + (result.validation.reasons.join(' ') || 'geçersiz oynanış.');
      } catch (e) { error = e.message; }
    }
    this.showResults({ result, error, payload });
  }

  showResults({ result, error, payload }) {
    const c = this.counts;
    const isBest = result && result.isNewBest;
    const prev = result && result.previousBest;
    const diff = prev ? payload.score - prev.score : null;
    this.el.overlay.classList.add('open');
    this.el.overlay.innerHTML = `
      <div class="overlay-card results-card">
        <div class="row between wrap" style="align-items:flex-start">
          <div>
            <div class="eyebrow">${this.test ? 'Test Sonucu' : 'Sonuç'}</div>
            <h2 style="margin:4px 0 0">${esc(this.chart.songTitle)}</h2>
            <p class="muted small">${esc(this.chart.artist || '')} · Lv.${this.chart.difficultyLevel} ${esc(this.chart.difficulty)}</p>
          </div>
          <div style="text-align:right">
            ${isBest ? '<span class="new-record">' + icon('award') + ' YENİ REKOR</span>' : ''}
            ${result && !isBest && result.position ? `<div class="badge accent">Sıralama #${result.position}</div>` : ''}
          </div>
        </div>

        <div class="row wrap" style="gap:26px;align-items:flex-end;margin-top:22px">
          <div>
            <div class="muted small" style="text-transform:uppercase;letter-spacing:.1em;font-weight:700">Skor</div>
            <div class="results-score">${fmtNum(payload.score)}</div>
            ${diff !== null ? `<div class="small" style="color:${diff >= 0 ? 'var(--success)' : 'var(--error)'}">${diff >= 0 ? '+' : ''}${fmtNum(diff)} (önceki ${fmtNum(prev.score)})</div>` : ''}
          </div>
          <div>
            <div class="muted small" style="text-transform:uppercase;letter-spacing:.1em;font-weight:700">Derece</div>
            <div class="results-rank rank-${esc(this.rank)}" style="color:inherit">${esc(this.rank)}</div>
          </div>
          <div style="flex:1;min-width:150px">
            <div class="muted small" style="text-transform:uppercase;letter-spacing:.1em;font-weight:700">Doğruluk</div>
            <div class="results-score" style="font-size:1.9rem">${fmtAcc(this.accuracy)}</div>
          </div>
          <div>
            <div class="muted small" style="text-transform:uppercase;letter-spacing:.1em;font-weight:700">Maks. Kombo</div>
            <div class="mono" style="font-size:1.4rem;font-weight:800">${fmtNum(this.maxCombo)}</div>
          </div>
        </div>

        <div class="judge-grid">
          <div class="judge-cell judge-perfect"><div class="k">KUSURSUZ</div><div class="v">${c.perfect}</div></div>
          <div class="judge-cell judge-great"><div class="k">MÜKEMMEL</div><div class="v">${c.great}</div></div>
          <div class="judge-cell judge-good"><div class="k">İYİ</div><div class="v">${c.good}</div></div>
          <div class="judge-cell judge-bad"><div class="k">ZAYIF</div><div class="v">${c.bad}</div></div>
          <div class="judge-cell judge-miss"><div class="k">KAÇTI :(</div><div class="v">${c.miss}</div></div>
        </div>

        ${error ? `<p class="small" style="color:#fca5a5;margin-top:14px">${esc(error)}</p>` : ''}
        ${result && result.validation.status === 'valid' ? `<p class="small" style="color:#86efac;margin-top:14px">Skor doğrulandı ve kaydedildi.${result.ratingDelta ? ` Rating +${result.ratingDelta.toFixed(2)}` : ''}</p>` : ''}

        <div class="row wrap" style="gap:10px;margin-top:22px">
          <button class="btn btn-primary" id="res-retry">${icon('refresh')} Tekrar Oyna</button>
          <button class="btn btn-ghost" id="res-back">${icon('library')} Şarkı Seçimi</button>
          <button class="btn btn-ghost" id="res-lb">${icon('trophy')} Liderlik Tablosu</button>
          ${auth.user ? `<button class="btn btn-ghost" id="res-profile">${icon('user')} Profil</button>` : `<a class="btn btn-ghost" href="/giris" id="res-login">${icon('login')} Oturum Aç</a>`}
          ${this.test ? `<button class="btn btn-accent" id="res-editor">${icon('edit')} Editöre Dön</button>` : ''}
        </div>
      </div>`;
    this.el.overlay.querySelector('#res-retry').onclick = () => this.restart();
    this.el.overlay.querySelector('#res-back').onclick = () => this.exit('/oyna');
    this.el.overlay.querySelector('#res-lb').onclick = () => this.exit(`/chart/${this.chart.id}`);
    const prof = this.el.overlay.querySelector('#res-profile');
    if (prof) prof.onclick = () => this.exit('/profil');
    const ed = this.el.overlay.querySelector('#res-editor');
    if (ed) ed.onclick = () => this.exit(`/editor/${this.chart.id}`);
  }

  exit(path) {
    this.destroy();
    if (this.onExit) this.onExit(path);
    else if (path) navigate(path);
    else history.length > 1 ? history.back() : navigate('/oyna');
  }

  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    clearTimeout(this._cdTimer);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('resize', this._onResize);
    this.destroyAudio();
    try { if (this.audioCtx) this.audioCtx.close(); } catch { /* yoksay */ }
    this.audioCtx = null;
    this.root.classList.remove('active');
    this.root.innerHTML = '';
    document.body.classList.remove('in-game');
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
