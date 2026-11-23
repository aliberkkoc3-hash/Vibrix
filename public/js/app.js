/* Vibrix — çekirdek yardımcılar: API, router, auth, ayarlar, toast, modal, biçimlendirme */
import { icon } from './icons.js';

/* ---------------- API ---------------- */
export class ApiError extends Error {
  constructor(message, status, data) { super(message); this.status = status; this.data = data || {}; }
}

export async function api(path, { method = 'GET', body, form, signal } = {}) {
  const opts = { method, credentials: 'same-origin', signal, headers: {} };
  if (form) {
    opts.body = form;
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`/api${path}`, opts);
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError('Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.', 0);
  }
  const ct = res.headers.get('content-type') || '';
  let data = null;
  if (ct.includes('application/json')) {
    try { data = await res.json(); } catch { data = null; }
  }
  if (!res.ok) {
    const msg = (data && data.error) || (res.status === 401 ? 'Oturum açmanız gerekiyor.' : `İstek başarısız (${res.status}).`);
    throw new ApiError(msg, res.status, data);
  }
  return data;
}

/* ---------------- Yardımcılar ---------------- */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmtNum(n) {
  if (n == null || Number.isNaN(n)) return '0';
  return Math.round(Number(n)).toLocaleString('tr-TR');
}

export function fmtScore(n) { return fmtNum(n); }

export function fmtAcc(a) {
  if (a == null) return '—';
  return `${Number(a).toFixed(2)}%`;
}

export function fmtDuration(ms) {
  if (!ms && ms !== 0) return '—';
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtPlaytime(ms) {
  if (!ms) return '0 dk';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} sa ${m} dk` : `${m} dk`;
}

export function fmtDate(iso, { time = false } = {}) {
  if (!iso) return '—';
  const d = new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z'));
  if (Number.isNaN(d.getTime())) return '—';
  const opts = { day: '2-digit', month: 'short', year: 'numeric' };
  if (time) { opts.hour = '2-digit'; opts.minute = '2-digit'; }
  return d.toLocaleDateString('tr-TR', opts);
}

export function timeAgo(iso) {
  if (!iso) return '—';
  const d = new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z'));
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'az önce';
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} sa önce`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} gün önce`;
  return fmtDate(iso);
}

export function initials(name) {
  return String(name || '?').slice(0, 2).toUpperCase();
}

export function avatarHtml(user, size = '') {
  const name = user && (user.username || user);
  const av = user && user.avatar;
  if (av) return `<span class="avatar ${size}"><img src="${esc(av)}" alt=""></span>`;
  return `<span class="avatar ${size}">${esc(initials(name))}</span>`;
}

export function rankBadge(rank) {
  if (!rank) return '<span class="rank-badge">—</span>';
  return `<span class="rank-badge rank-${esc(rank)}">${esc(rank)}</span>`;
}

export function diffBadge(diff) {
  return `<span class="diff diff-${esc(diff)}">${esc(diff)}</span>`;
}

export function coverHtml(chart, cls = '') {
  if (chart.cover) return `<img class="${cls}" src="${esc(chart.cover)}" alt="${esc(chart.songTitle || '')} kapağı" loading="lazy">`;
  const letter = (chart.songTitle || '?').slice(0, 1).toUpperCase();
  return `<div class="cover-fallback ${cls}">${esc(letter)}</div>`;
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/* ---------------- Toast ---------------- */
function toastHost() {
  let host = document.getElementById('toast-host');
  if (!host) { host = document.createElement('div'); host.id = 'toast-host'; host.className = 'toast-host'; document.body.appendChild(host); }
  return host;
}

export function toast(message, type = 'info', ms = 3600) {
  const host = toastHost();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const ic = type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info';
  el.innerHTML = `${icon(ic, 't-icon')}<div>${esc(message)}</div>`;
  host.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 220); }, ms);
}

/* ---------------- Modal ---------------- */
export function confirmDialog({ title, message, confirmText = 'Onayla', cancelText = 'Vazgeç', danger = false }) {
  return new Promise((resolve) => {
    let host = document.getElementById('modal-host');
    if (!host) { host = document.createElement('div'); host.id = 'modal-host'; host.className = 'modal-host'; document.body.appendChild(host); }
    host.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h3>${esc(title)}</h3>
        <p>${esc(message)}</p>
        <div class="actions">
          <button class="btn btn-ghost" data-act="cancel">${esc(cancelText)}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${esc(confirmText)}</button>
        </div>
      </div>`;
    host.classList.add('open');
    const close = (val) => { host.classList.remove('open'); host.innerHTML = ''; document.removeEventListener('keydown', onKey); resolve(val); };
    const onKey = (e) => { if (e.key === 'Escape') close(false); if (e.key === 'Enter') close(true); };
    document.addEventListener('keydown', onKey);
    host.querySelector('[data-act="cancel"]').onclick = () => close(false);
    host.querySelector('[data-act="ok"]').onclick = () => close(true);
    host.onclick = (e) => { if (e.target === host) close(false); };
    host.querySelector('[data-act="ok"]').focus();
  });
}

/* ---------------- Ayarlar (yerel + sunucu) ---------------- */
export const DEFAULT_SETTINGS = {
  audio: { master: 80, music: 85, sfx: 60 },
  gameplay: {
    scrollSpeed: 1.2, inputOffset: 0, noteSize: 100,
    laneOpacity: 100, laneStyle: 'gradient', judgementWindows: 'normal',
    perspective: false, perspectiveStrength: 65,
  },
  visual: {
    backgroundDim: 60, hitEffects: true, comboEffects: true, screenShake: true,
    animations: true, showFps: false, uiScale: 1, noteColors: 'default',
    hudStyle: 'cards', hudCombo: true, hudProgress: true, hudJacket: true, comboPulse: true,
    customNoteColors: ['#C4B5FD', '#C084FC', '#22C55E', '#F472B6'], notePalettes: [],
  },
  keys: { 0: 'd', 1: 'f', 2: 'j', 3: 'k' },
  general: { fullscreen: false },
};

const SETTINGS_KEY = 'vibrix.settings.v1';

function deepMerge(base, extra) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(extra || {})) {
    const v = extra[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') out[k] = deepMerge(base[k], v);
    else if (v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

export const settings = {
  data: load(),
  load,
  save(partial = {}, { remote = true } = {}) {
    settings.data = deepMerge(settings.data, partial);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings.data));
    applyVisual(settings.data);
    if (remote) queueRemoteSave(partial);
    return settings.data;
  },
  reset() {
    settings.data = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings.data));
    applyVisual(settings.data);
    queueRemoteSave(settings.data);
  },
};

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return deepMerge(DEFAULT_SETTINGS, raw);
  } catch { return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); }
}

let remoteTimer = null;
let remotePending = null;
let remoteInFlight = 0;

function queueRemoteSave(partial) {
  if (!auth.user) return;
  remotePending = partial;
  clearTimeout(remoteTimer);
  remoteTimer = setTimeout(() => { flushRemoteSave(); }, 800);
}

/**
 * Bekleyen ayar yazımını hemen gönderir ve bitmesini bekler.
 * Yerel ayarlar sunucudan gelen değerle ezilmeden önce çağrılmalı.
 */
export function flushRemoteSave() {
  clearTimeout(remoteTimer);
  remoteTimer = null;
  const payload = remotePending;
  remotePending = null;
  if (!payload || !auth.user) return Promise.resolve();
  remoteInFlight += 1;
  return api('/me/settings', { method: 'PUT', body: payload })
    .catch(() => {})
    .finally(() => { remoteInFlight -= 1; });
}

/** Şu an gönderilmeyi bekleyen ya da yolda olan ayar var mı? */
export function hasPendingSave() {
  return Boolean(remotePending) || remoteInFlight > 0;
}

/** Bekleyen yazım bitene kadar bekle (en fazla 2 sn) */
export async function waitForPendingSave(maxMs = 2000) {
  const until = Date.now() + maxMs;
  while (hasPendingSave() && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 60));
  }
}

export function applyVisual(s = settings.data) {
  document.documentElement.style.setProperty('--ui-scale', String(s.visual.uiScale || 1));
  document.body.classList.toggle('no-anim', !s.visual.animations);
}

/* ---------------- Ses ---------------- */
export const sfx = {
  ctx: null,
  ensure() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) this.ctx = new Ctx();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  gain() {
    const s = settings.data.audio;
    return ((s.master ?? 80) / 100) * ((s.sfx ?? 60) / 100);
  },
  tone(freq, dur = 0.06, type = 'sine', vol = 0.25) {
    const ctx = this.ensure();
    if (!ctx) return;
    const g = this.gain() * vol;
    if (g <= 0) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(g, ctx.currentTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  },
  click() { this.tone(520, 0.05, 'triangle', 0.18); },
  hover() { this.tone(760, 0.03, 'sine', 0.06); },
  success() { this.tone(660, 0.09, 'sine', 0.22); setTimeout(() => this.tone(990, 0.12, 'sine', 0.18), 80); },
  error() { this.tone(200, 0.16, 'sawtooth', 0.16); },
  judge(kind) {
    const map = { perfect: 1180, great: 880, good: 660, bad: 440, miss: 180 };
    this.tone(map[kind] || 600, kind === 'miss' ? 0.14 : 0.045, kind === 'miss' ? 'sawtooth' : 'sine', kind === 'miss' ? 0.12 : 0.1);
  },
};

/* ---------------- Chart Editor kilidi ---------------- */
/** Site sahibi mi? (sunucudan gelir) */
export const site = {
  editorOpen: true,
  isOwner: false,
  async loadEditorStatus() {
    try {
      // api() sarmalayıcısı gövdeyi döndürmez; doğrudan fetch kullan
      const res = await fetch('/api/editor/status', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('durum alınamadı');
      const r = await res.json();
      this.editorOpen = !!r.open;
      this.isOwner = !!r.isOwner;
    } catch {
      this.editorOpen = true;
      this.isOwner = false;
    }
    return this;
  },
  async setEditorOpen(open, pass) {
    const r = await api('/editor/status', { method: 'PUT', body: { open, ...(pass ? { pass } : {}) } });
    this.editorOpen = !!r.open;
    return this.editorOpen;
  },
  /** Site şifresi localStorage'da tutulur (yalnızca sahibin tarayıcısında) */
  get sitePass() { try { return localStorage.getItem('vibrix.sitePass') || ''; } catch { return ''; } },
  setSitePass(v) { try { if (v) localStorage.setItem('vibrix.sitePass', v); else localStorage.removeItem('vibrix.sitePass'); } catch { /* yoksay */ } },
};

/* ---------------- Auth ---------------- */
export const auth = {
  user: null,
  stats: null,
  ready: false,
  listeners: [],
  onChange(fn) { this.listeners.push(fn); },
  emit() { this.listeners.forEach((fn) => fn(this.user)); },
  async refresh() {
    try {
      const data = await api('/auth/me');
      this.user = data.user;
      this.stats = data.stats || null;
    } catch {
      this.user = null;
      this.stats = null;
    }
    this.ready = true;
    this.emit();
    // Sunucudan ayarları çekmeden ÖNCE yazılmayı bekle: aksi hâlde az önce
    // kaydedilmiş yerel değişiklikler eski sunucu değeriyle eziliyordu.
    await flushRemoteSave();
    if (this.user) {
      try {
        const s = await api('/me/settings');
        // Bu arada kullanıcı bir ayarı değiştirdiyse sunucudaki eski değeri yazma
        if (s && s.settings && !hasPendingSave()) {
          const merged = deepMerge(settings.data, s.settings);
          settings.data = merged;
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
          applyVisual(merged);
        }
      } catch { /* yoksay */ }
    }
    return this.user;
  },
  async login(identifier, password, remember) {
    const data = await api('/auth/login', { method: 'POST', body: { identifier, password, remember } });
    this.user = data.user; this.stats = data.stats; this.emit();
    return data.user;
  },
  async register(payload) {
    const data = await api('/auth/register', { method: 'POST', body: payload });
    this.user = data.user; this.stats = data.stats; this.emit();
    return data.user;
  },
  async logout() {
    await flushRemoteSave();
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    this.user = null; this.stats = null; this.emit();
  },
  requireLogin(redirect = location.pathname + location.search) {
    if (this.user) return true;
    sessionStorage.setItem('vibrix.redirect', redirect);
    navigate('/giris');
    return false;
  },
};

/* ---------------- Router ---------------- */
const routes = [];
let currentCleanup = null;
let activeGame = null;
let launchGame = null;

/** Oyun motorunu bir kez yükler ve bellekte tutar */
export async function ensureEngine() {
  if (!launchGame) {
    const mod = await import('./game/engine.js');
    launchGame = mod.launchGame;
  }
  return launchGame;
}

export function route(pattern, handler) {
  const keys = [];
  const regex = new RegExp('^' + pattern.replace(/:[a-zA-Z]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }).replace(/\//g, '\\/') + '$');
  routes.push({ regex, keys, handler });
}

export function navigate(path, { replace = false } = {}) {
  flushRemoteSave();
  if (replace) history.replaceState({}, '', path);
  else history.pushState({}, '', path);
  renderRoute();
}

export function setCleanup(fn) { currentCleanup = fn; }

export async function renderRoute() {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  if (typeof currentCleanup === 'function') { try { currentCleanup(); } catch { /* yoksay */ } }
  currentCleanup = null;
  // Oynanış ekranı açıksa kapat
  if (activeGame && activeGame.destroy) {
    try { activeGame.destroy(); } catch { /* yoksay */ }
    activeGame = null;
  }
  const gameRoot = document.getElementById('game-root');
  if (gameRoot && gameRoot.classList.contains('active')) {
    gameRoot.classList.remove('active');
    gameRoot.innerHTML = '';
    document.body.classList.remove('in-game');
  }
  const main = document.getElementById('app-main');
  for (const r of routes) {
    const m = path.match(r.regex);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      updateNavActive(path);
      main.innerHTML = '<div class="loading-screen"><div class="spinner"></div><div>Yükleniyor…</div></div>';
      window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
      // Sayfa geçiş animasyonu: içerik gelince yeniden oynat
      main.classList.remove('is-leaving');
      window.dispatchEvent(new CustomEvent('vibrix:route', { detail: { path } }));
      try {
        await r.handler({ params, main, path });
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        console.error(e);
        main.innerHTML = `<div class="page narrow"><div class="card empty-state">${icon('alert')}<h3>Sayfa yüklenemedi</h3><p>${esc(e.message || 'Beklenmeyen bir hata oluştu.')}</p><div class="row" style="justify-content:center;margin-top:18px"><button class="btn btn-ghost" onclick="location.reload()">Yeniden dene</button></div></div></div>`;
      }
      return;
    }
  }
  main.innerHTML = `<div class="page narrow"><div class="card empty-state">${icon('compass')}<h3>Sayfa bulunamadı</h3><p>Aradığınız sayfa mevcut değil.</p><div style="margin-top:18px"><a class="btn btn-primary" href="/" data-link>Ana Sayfaya Dön</a></div></div></div>`;
}

function updateNavActive(path) {
  $$('.nav-link[data-path]').forEach((el) => {
    const p = el.getAttribute('data-path');
    const active = p === '/' ? path === '/' : path === p || path.startsWith(p + '/');
    el.classList.toggle('active', active);
  });
}

/* Global tıklama yakalama: data-link ve sesler */
export function initGlobalHandlers() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-link]');
    if (a && a.getAttribute('href') && !a.getAttribute('target') && a.origin === location.origin) {
      e.preventDefault();
      navigate(a.getAttribute('href'));
      return;
    }
    if (e.target.closest('.btn, .nav-link, .tab, .chart-card a, button')) sfx.click();
  });
  window.addEventListener('popstate', renderRoute);
}

/* ---------------- Liderlik tablosu ortak bileşenleri ---------------- */
export function positionBadge(pos) {
  const cls = pos === 1 ? 'p1' : pos === 2 ? 'p2' : pos === 3 ? 'p3' : '';
  return `<span class="pos ${cls}">${pos}</span>`;
}

export function paginationHtml({ total, limit, offset }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.floor(offset / limit) + 1;
  return `
    <div class="pagination">
      <button class="btn btn-sm btn-ghost" data-page="${Math.max(1, page - 1)}" ${page <= 1 ? 'disabled' : ''}>${icon('chevronLeft')}</button>
      <span class="page-info">Sayfa ${page} / ${pages}</span>
      <button class="btn btn-sm btn-ghost" data-page="${Math.min(pages, page + 1)}" ${page >= pages ? 'disabled' : ''}>${icon('chevronRight')}</button>
    </div>`;
}

/* ---------------- Oynanış oturumu başlatıcı ---------------- */
export async function startGame({ chartId, test = false, onExit } = {}) {
  const launch = await ensureEngine();
  if (activeGame && activeGame.destroy) { try { activeGame.destroy(); } catch { /* yoksay */ } }
  activeGame = await launch({ chartId, test, onExit });
  return activeGame;
}
