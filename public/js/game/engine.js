/* Vibrix — oynanış motoru (Canvas 2D, AudioContext tabanlı senkronizasyon) */
import { api, auth, settings, sfx, toast, navigate, esc, fmtNum, fmtAcc, fmtDuration } from '../app.js';
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
/** ---------- Oynanış eventleri ----------
 * Chart editor'da eklenir, oyun motoru zamanı gelince uygular.
 */
export const GAME_EVENTS = {
  laneflash: { name: 'Hat Parıltısı', icon: 'flash', desc: 'Seçili hatta ışık dalgası geçer.', color: '#8B5CF6', needsLane: true },
  zoom: { name: 'Kamera Yaklaş', icon: 'zoom', desc: 'Oyun alanı kısa süre yaklaşır.', color: '#22D3EE', needsLane: false },
  invert: { name: 'Ters Çevir', icon: 'invert', desc: 'Notalar bir an ters yöne akar.', color: '#E879F9', needsLane: false },
  shake: { name: 'Ekran Sarsıntısı', icon: 'shake', desc: 'Şiddetli sarsıntı.', color: '#F97316', needsLane: false },
  glitch: { name: 'Glitch', icon: 'glitch', desc: 'RGB kayması ve bozulma.', color: '#EF4444', needsLane: false },
  wave: { name: 'Dalga', icon: 'wave', desc: 'Hatlarda sıralı ışık dalgası.', color: '#34D399', needsLane: false },
  blackout: { name: 'Karartma', icon: 'blackout', desc: 'Ekran kararır, sadece notalar kalır.', color: '#64748B', needsLane: false },
};

export const EVENT_TYPES = Object.keys(GAME_EVENTS);

export const NOTE_PALETTES = {
  default: { name: 'Vibrix (Varsayılan)', colors: LANE_COLORS },
  bflec: { name: 'BFLec — Sarı & Siyah', colors: ['#FFD400', '#1A1A1A', '#FFC000', '#3A3A3A'] },
  bfali: { name: 'BFAli — Mavi & Kırmızı', colors: ['#2F6BFF', '#E11D48', '#7F1D1D', '#1E293B'] },
  prism: { name: 'Prism Crew — Prizma', colors: ['#8B5CF6', '#22D3EE', '#E879F9', '#34D399'] },
  neon: { name: 'Neon Gece', colors: ['#22D3EE', '#A3E635', '#F472B6', '#FBBF24'] },
  mono: { name: 'Tek Renk (Beyaz)', colors: ['#F8FAFC', '#F8FAFC', '#F8FAFC', '#F8FAFC'] },
  // --- Paket paletleri (mevcut hazır paletlere dokunulmadı) ---
  apocalypse: {
    name: 'Vibrix Apocalypse',
    colors: ['#7A0F1E', '#FF2D55', '#FF7A1A', '#FFD166'],
  },
  scrapped: {
    name: 'Vibrix Scrapped',
    colors: ['#2E1065', '#6D28D9', '#A78BFA', '#D8C7FF'],
  },
  retakes: {
    name: 'Vibrix Retakes',
    colors: ['#0B3D2E', '#10B981', '#5EEAD4', '#ECFDF5'],
  },
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
    data = await api(`/charts/${chartId}?play=1`);
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

  const game = new Game({
    root, chart, notes, test, onExit,
  });
  // Test/geliştirme kancası: sonuç ekranını konsoldan inceleyebilmek için
  window.__vibrixGame = game;
  return game.start();
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
    // Eventler (chart'tan gelir)
    this.events = Array.isArray(chart.chartData?.events) ? chart.chartData.events.slice().sort((a, b) => a.time - b.time) : [];
    this.eventIndex = 0;
    this.activeEvents = [];
    this.zoomK = 0;        // kamera yaklaşma (0..1)
    this.invertK = 0;      // ters akış (0..1)
    this.glitchK = 0;      // glitch yoğunluğu
    this.blackoutK = 0;    // karartma
    this.laneFlash = [0, 0, 0, 0];
    this.waveK = 0;
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
    // Vuruş efektleri (canvas) — kısa ömürlü, sabit kapasiteli havuz
    this.hitFx = [];
    this.hitFxMax = 44;
    this.pressed = [false, false, false, false];
    this.nextNoteIdx = 0;
    this.score = 0;
    this.finished = false;
    this.startedAt = 0;
  }

  /** Kullanıcının HUD tercihlerini kök elemana sınıf olarak uygular. */
  applyHudPrefs() {
    const v = settings.data.visual || {};
    const r = this.root;
    r.classList.toggle('hud-compact', v.hudStyle === 'compact');
    r.classList.toggle('hud-no-combo', v.hudCombo === false);
    r.classList.toggle('hud-no-progress', v.hudProgress === false);
    r.classList.toggle('hud-no-jacket', v.hudJacket === false);
    r.classList.toggle('hud-no-pulse', v.comboPulse === false);
  }

  buildUi() {
    const c = this.chart;
    this.root.innerHTML = `
      <canvas id="rx-canvas"></canvas>
      <div class="game-hud">
        <div class="hud-combo" id="hud-combo">
          <div class="num" id="hud-combo-num">0</div>
          <div class="lbl">KOMBO</div>
          <div class="bar"><i id="hud-combo-bar"></i></div>
        </div>
        <div class="hud-top">
          <div class="hud-song">
            <div class="hud-jacket${c.cover ? '' : ' brand-jacket'}">${c.cover ? `<img src="${esc(c.cover)}" alt="">` : '<img src="/brand/mark-128.png" alt="">'}</div>
            <div>
              <div class="t">${esc(c.songTitle)}</div>
              <div class="a">${esc(c.artist || 'Bilinmeyen sanatçı')}<span class="pill">Lv.${c.difficultyLevel}</span>${c.isAutoChart ? '<span class="ai-tag" title="Bu grafik AI ile oluşturuldu">✨ AI</span>' : ''}</div>
            </div>
          </div>
          <div class="hud-score">
            <div class="s" id="hud-score">0</div>
            <div class="acc"><b id="hud-acc">100.00%</b><span class="dot"></span><span id="hud-maxcombo">0 maks</span></div>
            <div class="m zero" id="hud-miss">0 miss</div>
            <div class="mono" id="hud-fps" style="display:${this.settings.visual.showFps ? 'block' : 'none'}">FPS --</div>
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
      combo: this.root.querySelector('#hud-combo'),
      comboNum: this.root.querySelector('#hud-combo-num'),
      comboBar: this.root.querySelector('#hud-combo-bar'),
      maxCombo: this.root.querySelector('#hud-maxcombo'),
    };
    // HUD değerleri değiştiğinde "bump" animasyonu için son değerler
    this._hudLast = { score: -1, combo: -1, miss: -1 };
    this.applyHudPrefs();
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
        else if (this.state === 'countdown') { /* geri sayımı bölme */ }
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

  /**
   * Vuruş efektleri. Canvas tarafı (halka + kıvılcım) her zaman çalışır;
   * HUD tarafında yalnızca DOM düğümü bir kez oluşturulup yeniden kullanılır
   * (animationend'de sınıf sıfırlanır) — böylece kare başına yeni düğüm yok.
   */
  spawnHitFx(lane, kind, now) {
    if (kind === 'miss') return;
    if (this.hitFx.length >= this.hitFxMax) this.hitFx.shift();
    const hot = this.combo >= 50;
    this.hitFx.push({ lane, kind, at: now, hot });
    this.flashHud(kind);
  }

  flashHud(kind) {
    const r = this.root;
    if (!r) return;
    const cls = `fx-${kind}`;
    if (r.classList.contains(cls)) {
      // aynı karede tekrar tetiklenirse animasyonu yeniden başlat
      r.classList.remove(cls);
      void r.offsetWidth;
    }
    r.classList.add(cls);
    clearTimeout(this._fxTimer);
    this._fxTimer = setTimeout(() => r.classList.remove('fx-perfect', 'fx-great', 'fx-good', 'fx-bad'), 260);
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
    const nowP = performance.now();
    this.effects.push({ lane, at: nowP, kind });
    if (this.settings.visual.hitEffects) {
      this.spawnHitFx(lane, kind, nowP);
      sfx.judge(kind);
    }
    if (this.settings.visual.screenShake) {
      if (kind === 'miss') this.shake = 6;
      else if (kind === 'perfect') this.shake = Math.max(this.shake, 2.2);
    }
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

  /* ---------- Eventler ---------- */
  /** Zamanı gelen eventleri tetikle ve aktif olanların etkisini hesapla */
  updateEvents(t, dtMs) {
    const now = performance.now();
    while (this.eventIndex < this.events.length && this.events[this.eventIndex].time <= t + 16) {
      const ev = this.events[this.eventIndex++];
      this.triggerEvent(ev);
    }
    // Etkileri yaşlandır
    const decay = (v, ms) => Math.max(0, v - dtMs / ms);
    this.zoomK = decay(this.zoomK, 420);
    this.invertK = decay(this.invertK, 380);
    this.glitchK = decay(this.glitchK, 360);
    this.blackoutK = decay(this.blackoutK, 700);
    this.waveK = decay(this.waveK, 900);
    for (let i = 0; i < 4; i++) this.laneFlash[i] = decay(this.laneFlash[i], 420);
    this.activeEvents = this.activeEvents.filter((e) => now - e.at < e.duration);
  }

  triggerEvent(ev) {
    if (!ev || !GAME_EVENTS[ev.type]) return;
    const power = Math.min(1, Math.max(0.1, (Number(ev.intensity) || 70) / 100));
    this.activeEvents.push({ ...ev, at: performance.now(), power });
    switch (ev.type) {
      case 'laneflash': {
        const lane = Number.isInteger(ev.lane) ? ev.lane : Math.floor(Math.random() * 4);
        this.laneFlash[lane] = power;
        this.effects.push({ lane, at: performance.now(), kind: 'press' });
        break;
      }
      case 'zoom':
        this.zoomK = power;
        break;
      case 'invert':
        this.invertK = power;
        break;
      case 'glitch':
        this.glitchK = power;
        break;
      case 'shake':
        this.shake = Math.max(this.shake || 0, 4 + power * 10);
        break;
      case 'wave':
        this.waveK = power;
        break;
      case 'blackout':
        this.blackoutK = power;
        break;
      default: break;
    }
    if (this.settings.visual.hitEffects) {
      const f = { laneflash: 880, zoom: 520, invert: 300, shake: 160, glitch: 240, wave: 700, blackout: 120 }[ev.type];
      if (f) sfx.tone(f, 0.09, 'triangle', 0.12);
    }
  }

  update() {
    if (this.state !== 'playing') return;
    const t = this.currentTimeMs() - (this.settings.gameplay.inputOffset || 0);
    // Event zamanlayıcı
    const nowPerf = performance.now();
    const dtMs = Math.min(80, this._lastUpdate ? nowPerf - this._lastUpdate : 16);
    this._lastUpdate = nowPerf;
    this.updateEvents(t, dtMs);

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
    this.updateHud(acc, t);

    if (this.shake > 0) this.shake *= 0.85;

    // Tüm notalar işlendi mi?
    if (totalJudged >= this.notes.length && t > this.chartLength - 200) this.finish();
  }

  /**
   * HUD'u günceller. Değerler değiştiğinde ilgili alan kısa bir "bump"
   * animasyonu alır; kombo 50'yi geçince kombo paneli "hot" sınıfına girer.
   */
  updateHud(acc, t) {
    const e = this.el;
    const L = this._hudLast;

    if (this.score !== L.score) {
      e.score.textContent = fmtNum(this.score);
      e.score.classList.remove('bump');
      void e.score.offsetWidth; // animasyonu yeniden başlat
      e.score.classList.add('bump');
      L.score = this.score;
    }
    if (this.combo !== L.combo) {
      e.comboNum.textContent = fmtNum(this.combo);
      e.combo.classList.remove('bump');
      void e.combo.offsetWidth;
      e.combo.classList.add('bump');
      e.combo.classList.toggle('hot', this.combo >= 50);
      e.comboBar.style.width = `${Math.min(100, (this.combo / 100) * 100)}%`;
      L.combo = this.combo;
    }
    if (this.counts.miss !== L.miss) {
      e.miss.textContent = this.counts.miss ? `${this.counts.miss} miss` : '0 miss';
      e.miss.classList.toggle('zero', !this.counts.miss);
      L.miss = this.counts.miss;
    }
    e.acc.textContent = `${acc.toFixed(2)}%`;
    e.maxCombo.textContent = `${fmtNum(this.maxCombo)} maks`;
    e.progress.style.width = `${Math.min(100, Math.max(0, (t / this.chartLength) * 100))}%`;
  }

  draw() {
    const ctx = this.ctx;
    const w = this.w, h = this.h;
    const dim = (this.settings.visual.backgroundDim ?? 60) / 100;
    ctx.save();
    // Kamera yaklaşma eventi: merkeze doğru büyüt
    if (this.zoomK > 0.01) {
      const z = 1 + this.zoomK * 0.085;
      ctx.translate(w / 2, this.judgmentY);
      ctx.scale(z, z);
      ctx.translate(-w / 2, -this.judgmentY);
    }
    const shakeAmt = (this.shake || 0) + (this.glitchK > 0.2 ? this.glitchK * 5 : 0);
    if (shakeAmt > 0.3) ctx.translate((Math.random() - 0.5) * shakeAmt, (Math.random() - 0.5) * shakeAmt);

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
        // Invert eventi: akış yönü bir an tersine döner (aşağıdan yukarı)
        const yFlat = this.invertK > 0.05 ? jy + distHead : jy - distHead;
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
        // kıvılcımlar: yalnızca perfect/great ve kombo yüksekken (ucuz, sabit sayı)
        if (this.settings.visual.comboEffects !== false && (e.kind === 'perfect' || e.kind === 'great')) {
          const n = e.kind === 'perfect' ? 5 : 3;
          ctx.globalAlpha = (1 - age) * 0.75;
          ctx.fillStyle = this.laneColors[e.lane];
          const rad = age * 46;
          for (let k = 0; k < n; k++) {
            const ang = (Math.PI / (n + 1)) * (k + 1);
            const px = x + Math.cos(ang) * rad * (k % 2 ? 1 : -1);
            const pjy = jy - Math.sin(ang) * rad;
            const sz = 2.2 * (1 - age) + 0.6;
            ctx.fillRect(px - sz / 2, pjy - sz / 2, sz, sz);
          }
        }
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

    // Kombo: HUD'daki büyük sayaç artık ana gösterge. Burada yalnızca
    // 25+ komboda oyun alanının içinde hafif bir "nabız" halkası çizilir,
    // sahneyi kapatmamak için çok düşük opaklıkta.
    if (this.combo >= 25 && this.settings.visual.comboEffects !== false) {
      const pulse = 0.5 + 0.5 * Math.sin(nowPerf / 260);
      const hot = this.combo >= 50;
      const cw = bx + bw / 2;
      const cy = jy - 6;
      ctx.globalAlpha = 0.1 + 0.1 * pulse;
      const rg = ctx.createRadialGradient(cw, cy, 0, cw, cy, bw * 0.75);
      rg.addColorStop(0, hot ? 'rgba(244,114,182,0.55)' : 'rgba(124,92,255,0.5)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(bx - 40, cy - 90, bw + 80, 120);
      ctx.globalAlpha = 1;
    }

    // ---- Event görsel katmanları ----
    this.drawEventLayers(ctx, w, h, bx, bw, lw);

    ctx.restore();
  }

  /** Eventlerin ekran efektleri: karartma, glitch, ters akış, dalga, hat parıltısı */
  drawEventLayers(ctx, w, h, bx, bw, lw) {
    const jy = this.judgmentY;
    const now = performance.now();

    // Karartma: sadece notalar ve judgment bölgesi görünsün
    if (this.blackoutK > 0.01) {
      const a = this.blackoutK * 0.97;
      const g = ctx.createRadialGradient(w / 2, jy, bw * 0.1, w / 2, jy, bw * 0.9);
      g.addColorStop(0, `rgba(0,0,2,${a * 0.55})`);
      g.addColorStop(0.55, `rgba(0,0,2,${a * 0.9})`);
      g.addColorStop(1, `rgba(0,0,2,${a})`);
      ctx.save();
      ctx.fillStyle = g;
      ctx.fillRect(-40, -40, w + 80, h + 80);
      ctx.restore();
    }

    // Hat parıltısı: hattın tüm yüksekliğinde ışık sütunu
    for (let i = 0; i < 4; i++) {
      const k = this.laneFlash[i];
      if (k <= 0.01) continue;
      const x = bx + i * lw;
      const col = this.laneColors[i];
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, `${col}00`);
      g.addColorStop(0.75, `${col}${Math.round(k * 60).toString(16).padStart(2, '0')}`);
      g.addColorStop(1, `${col}${Math.round(k * 200).toString(16).padStart(2, '0')}`);
      ctx.save();
      ctx.fillStyle = g;
      ctx.fillRect(x + 2, 0, lw - 4, h);
      ctx.restore();
    }

    // Dalga: hatlarda sıralı parlak bant
    if (this.waveK > 0.01) {
      const phase = (now / 240) % 4;
      for (let i = 0; i < 4; i++) {
        const d = Math.abs(i - phase);
        const k = Math.max(0, 1 - d) * this.waveK;
        if (k <= 0.02) continue;
        const x = bx + i * lw;
        const g = ctx.createLinearGradient(0, h, 0, jy - 420);
        g.addColorStop(0, `rgba(52,211,153,${k * 0.85})`);
        g.addColorStop(0.55, `rgba(52,211,153,${k * 0.35})`);
        g.addColorStop(1, 'rgba(52,211,153,0)');
        ctx.save();
        ctx.fillStyle = g;
        ctx.fillRect(x + 1, jy - 420, lw - 2, h - jy + 420);
        // hat kenarına parlak çizgi
        ctx.globalAlpha = k * 0.9;
        ctx.fillStyle = '#34D399';
        ctx.fillRect(x + 1, jy - 6, lw - 2, 3);
        ctx.restore();
      }
    }

    // Ters çevir: akış yönünü hissettiren üst-orta vurgu
    if (this.invertK > 0.01) {
      const k = this.invertK;
      ctx.save();
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, `rgba(232,121,249,${k * 0.28})`);
      g.addColorStop(0.55, `rgba(232,121,249,0)`);
      ctx.fillStyle = g;
      ctx.fillRect(bx, 0, bw, h);
      // ok yönü göstergesi
      ctx.globalAlpha = k * 0.9;
      ctx.strokeStyle = '#E879F9';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      const cy = jy - 120;
      ctx.beginPath();
      ctx.moveTo(bx - 26, cy + 10); ctx.lineTo(bx - 26, cy - 10);
      ctx.moveTo(bx - 32, cy - 4); ctx.lineTo(bx - 26, cy - 10); ctx.lineTo(bx - 20, cy - 4);
      ctx.moveTo(bx + bw + 26, cy - 10); ctx.lineTo(bx + bw + 26, cy + 10);
      ctx.moveTo(bx + bw + 20, cy + 4); ctx.lineTo(bx + bw + 26, cy + 10); ctx.lineTo(bx + bw + 32, cy + 4);
      ctx.stroke();
      ctx.restore();
    }

    // Glitch: ekranın kendisini kaydırıp renk bozulması ekler
    if (this.glitchK > 0.01) {
      const k = this.glitchK;
      const bands = 4 + Math.round(k * 7);
      ctx.save();
      // Ekranın bir kopyasını alıp yatay dilimler halinde kaydır
      try {
        const snap = document.createElement('canvas');
        snap.width = ctx.canvas.width; snap.height = ctx.canvas.height;
        snap.getContext('2d').drawImage(ctx.canvas, 0, 0);
        const dpr = ctx.canvas.width / w;
        for (let i = 0; i < bands; i++) {
          const sy = Math.random() * ctx.canvas.height;
          const sh = (6 + Math.random() * 40 * k) * dpr;
          const dx = (Math.random() - 0.5) * 70 * k * dpr;
          ctx.globalAlpha = 0.85;
          ctx.drawImage(snap, 0, sy, snap.width, sh, dx, sy / dpr, w, sh / dpr);
        }
      } catch { /* yoksay */ }
      // Renk ayrışması bantları
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < bands * 2; i++) {
        const y = Math.random() * h;
        const bh = 2 + Math.random() * 22 * k;
        const off = (Math.random() - 0.5) * 40 * k;
        ctx.globalAlpha = 0.3 * k;
        ctx.fillStyle = i % 3 === 0 ? '#EF4444' : i % 3 === 1 ? '#22D3EE' : '#A3E635';
        ctx.fillRect(off, y, w, bh);
      }
      // Tarama çizgileri
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.16 * k;
      ctx.fillStyle = '#000';
      for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
      ctx.restore();
    }
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
    if (this.state !== 'paused') return;
    // Ses askıda kalsın: geri sayım bitene kadar şarkı da durur
    this.el.overlay.classList.remove('open');
    this.el.overlay.innerHTML = '';
    this.beginResumeCountdown();
  }

  /** Duraklatmadan dönüşte 3-2-1 geri sayımı */
  beginResumeCountdown() {
    this.state = 'countdown';
    let n = 3;
    const show = () => {
      this.el.overlay.classList.add('open');
      this.el.overlay.innerHTML = `<div class="countdown-wrap"><div class="countdown-num">${n}</div></div>`;
      if (n > 1) { n--; this._cdTimer = setTimeout(show, 700); }
      else { this._cdTimer = setTimeout(() => this.finishResume(), 700); }
    };
    show();
  }

  finishResume() {
    if (this.state !== 'countdown') return;
    this.el.overlay.classList.remove('open');
    this.el.overlay.innerHTML = '';
    this.state = 'playing';
    if (this.audioCtx && this.audioCtx.state === 'suspended') this.audioCtx.resume();
    this.clearInputState();
  }

  /** Geri sayım sırasında basılı kalan tuşlar nota kaçırmasın */
  clearInputState() {
    this.pressed = [false, false, false, false];
    if (this.effects) this.effects = this.effects.filter((e) => e.kind !== 'press');
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

  /**
   * Sonuç ekranı animasyonları: skor sayacı + derece rozeti.
   * Tek bir requestAnimationFrame zinciri kullanır, iş bitince kendini durdurur.
   */
  animateResults(target) {
    const scoreEl = this.el.overlay.querySelector('#rc-score');
    if (!scoreEl) return;
    const dur = 900;
    const t0 = performance.now();
    const step = (now) => {
      if (!scoreEl.isConnected) return; // ekran kapandıysa dur
      const k = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      scoreEl.textContent = fmtNum(Math.round(target * eased));
      if (k < 1) this._rcRaf = requestAnimationFrame(step);
      else scoreEl.textContent = fmtNum(target);
    };
    cancelAnimationFrame(this._rcRaf || 0);
    this._rcRaf = requestAnimationFrame(step);
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

  /** Sonuç ekranı — skor sayacı, derece rozeti, kombo/dağılım çubukları, sıralı giriş */
  showResults({ result, error, payload }) {
    const c = this.counts;
    const total = c.perfect + c.great + c.good + c.bad + c.miss;
    const isBest = result && result.isNewBest;
    const prev = result && result.previousBest;
    const diff = prev ? payload.score - prev.score : null;
    const rank = this.rank || 'D';
    const pct = (v) => (total ? (v / total) * 100 : 0);
    const stat = (label, value, sub = '') => `
      <div class="rc-stat">
        <span class="rc-stat-k">${label}</span>
        <span class="rc-stat-v">${value}</span>
        ${sub ? `<span class="rc-stat-s">${sub}</span>` : ''}
      </div>`;
    const judge = (key, label, value) => `
      <div class="rc-judge rc-${key}">
        <span class="rc-judge-k">${label}</span>
        <span class="rc-judge-v" data-count="${value}">${value}</span>
        <span class="rc-judge-bar"><i style="width:${pct(value).toFixed(1)}%"></i></span>
      </div>`;

    this.el.overlay.classList.add('open');
    this.el.overlay.innerHTML = `
      <div class="overlay-card results-card rc-card">
        <div class="rc-glow" aria-hidden="true"></div>

        <header class="rc-head">
          <div class="rc-head-main">
            <span class="rc-eyebrow">${this.test ? 'Test Sonucu' : 'Oynanış Sonucu'}</span>
            <h2 class="rc-title">${esc(this.chart.songTitle)}</h2>
            <p class="rc-sub">${esc(this.chart.artist || 'Bilinmeyen sanatçı')}
              <span class="rc-pill">Lv.${this.chart.difficultyLevel}</span>
              <span class="rc-pill">${esc(this.chart.difficulty || '')}</span>
              <span class="rc-pill rc-pill-mono">${fmtDuration(payload.durationMs)}</span>
            </p>
          </div>
          <div class="rc-badges">
            ${isBest ? `<span class="rc-record">${icon('award')} YENİ REKOR</span>` : ''}
            ${result && !isBest && result.position ? `<span class="rc-pos">#${result.position}</span>` : ''}
          </div>
        </header>

        <section class="rc-hero">
          <div class="rc-rank rank-${esc(rank)}">
            <span class="rc-rank-letter">${esc(rank)}</span>
            <span class="rc-rank-label">DERECE</span>
          </div>
          <div class="rc-score-wrap">
            <span class="rc-stat-k">SKOR</span>
            <div class="rc-score" id="rc-score" data-target="${payload.score}">0</div>
            ${diff !== null
              ? `<div class="rc-diff ${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '▲' : '▼'} ${fmtNum(Math.abs(diff))} <span class="rc-diff-muted">önceki ${fmtNum(prev.score)}</span></div>`
              : '<div class="rc-diff muted">İlk kayıt</div>'}
          </div>
        </section>

        <section class="rc-stats">
          ${stat('DOĞRULUK', fmtAcc(this.accuracy))}
          ${stat('MAKS. KOMBO', fmtNum(this.maxCombo), total ? `/${total}` : '')}
          ${stat('NOTA', fmtNum(total))}
          ${stat('KAÇAN', fmtNum(c.miss), total ? `%${pct(c.miss).toFixed(1)}` : '')}
        </section>

        <section class="rc-judges">
          ${judge('perfect', 'KUSURSUZ', c.perfect)}
          ${judge('great', 'MÜKEMMEL', c.great)}
          ${judge('good', 'İYİ', c.good)}
          ${judge('bad', 'ZAYIF', c.bad)}
          ${judge('miss', 'KAÇTI', c.miss)}
        </section>

        ${error ? `<p class="rc-note rc-note-error">${esc(error)}</p>` : ''}
        ${result && result.validation && result.validation.status === 'valid'
          ? `<p class="rc-note rc-note-ok">${icon('check')} Skor doğrulandı ve kaydedildi.${result.ratingDelta ? ` <b>Rating +${result.ratingDelta.toFixed(2)}</b>` : ''}</p>`
          : ''}

        <footer class="rc-actions">
          <button class="btn btn-primary" id="res-retry">${icon('refresh')} Tekrar Oyna</button>
          <button class="btn btn-ghost" id="res-back">${icon('library')} Şarkı Seçimi</button>
          <button class="btn btn-ghost" id="res-lb">${icon('trophy')} Liderlik Tablosu</button>
          ${auth.user ? `<button class="btn btn-ghost" id="res-profile">${icon('user')} Profil</button>` : `<a class="btn btn-ghost" href="/giris" id="res-login">${icon('login')} Oturum Aç</a>`}
          ${this.test ? `<button class="btn btn-accent" id="res-editor">${icon('edit')} Editöre Dön</button>` : ''}
        </footer>
      </div>`;
    this.animateResults(payload.score);
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
    clearTimeout(this._fxTimer);
    cancelAnimationFrame(this._rcRaf || 0);
    this.root.classList.remove('active', 'fx-perfect', 'fx-great', 'fx-good', 'fx-bad');
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
