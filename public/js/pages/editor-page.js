/* Vibrix — Chart Editor: yerleştirme, hold notaları, grid, undo/redo, otomatik kayıt, test oynanışı */
import { api, auth, site, $, esc, ensureEngine, toast, navigate, settings, setCleanup } from '../app.js';
import { icon } from '../icons.js';
import { GAME_EVENTS, EVENT_TYPES } from '../game/engine.js';

/** Event türü simgeleri (editor paleti) */
const EVENT_ICON = {
  laneflash: '⚡', zoom: '⤢', invert: '⇅', shake: '〰', glitch: '▚', wave: '◈', blackout: '◐',
};
import { generateChart } from '../editor/autochart.js';

/** Paket (seri) önerileri — serbest yazmaya da izin verilir */
const SERIES_OPTIONS = ['Vibrix', 'Vibrix Apocalypse'];

const DIFFICULTIES = [
  { name: 'Kolay', level: 3 }, { name: 'Normal', level: 6 }, { name: 'Zor', level: 9 },
  { name: 'Uzman', level: 12 }, { name: 'Ustaca', level: 15 },
];
const GRID_DIVS = [4, 8, 16, 32];

// Editör paleti: hat renkleri oyunla aynı
const LANE_META = [
  { key: 'D', label: 'Sol 1', color: '#A78BFA' },
  { key: 'F', label: 'Sol 2', color: '#C084FC' },
  { key: 'J', label: 'Sağ 1', color: '#22C55E' },
  { key: 'K', label: 'Sağ 2', color: '#F472B6' },
];

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}
const LANE_COLORS = ['#C4B5FD', '#C084FC', '#22C55E', '#F472B6'];
const LANE_KEYS = ['d', 'f', 'j', 'k'];

export async function renderNew({ main }) {
  if (!auth.user) { sessionStorage.setItem('vibrix.redirect', '/editor'); navigate('/giris'); return; }
  await site.loadEditorStatus();
  if (!site.editorOpen && !site.isOwner) { renderLocked(main); return; }
  main.innerHTML = renderShell(`
    <div class="card">
      <div class="card-title">${icon('plus')} Yeni Grafik</div>
      <form id="new-form">
        <div class="grid cols-2">
          <div class="field"><label for="nf-title">Şarkı Adı *</label><input class="input" id="nf-title" required maxlength="120" placeholder="Örn. Neon Pulse"></div>
          <div class="field"><label for="nf-artist">Sanatçı</label><input class="input" id="nf-artist" maxlength="120" placeholder="Örn. Vibrix Studio"></div>
          <div class="field"><label for="nf-bpm">BPM *</label><input class="input" id="nf-bpm" type="number" min="20" max="400" step="0.01" value="120" required></div>
          <div class="field"><label for="nf-offset">Ofset (ms)</label><input class="input" id="nf-offset" type="number" step="1" value="0"><span class="hint">Şarkının ilk vuruşunun başladığı an. Genelde 0-800 arası.</span></div>
          <div class="field"><label for="nf-series">Paket</label><input class="input" id="nf-series" maxlength="60" list="nf-series-list" placeholder="Örn. Vibrix Apocalypse"><datalist id="nf-series-list">${SERIES_OPTIONS.map((x) => `<option value="${esc(x)}">`).join('')}</datalist><span class="hint">Boş bırakırsan hiçbir pakete ait olmaz.</span></div>
          <div class="field"><label for="nf-diff">Zorluk</label><select class="select" id="nf-diff">${DIFFICULTIES.map((d) => `<option value="${d.name}" data-level="${d.level}">${d.name} (Lv.${d.level})</option>`).join('')}</select></div>
          <div class="field"><label for="nf-level">Zorluk Seviyesi (1-15)</label><input class="input" id="nf-level" type="number" min="1" max="15" value="6"></div>
        </div>
        <div class="field"><label for="nf-desc">Açıklama</label><textarea class="textarea" id="nf-desc" maxlength="500" placeholder="Grafik hakkında kısa bir açıklama…"></textarea></div>
        <div class="grid cols-2">
          <div class="field"><label for="nf-audio">Ses Dosyası * (mp3, ogg, wav, m4a · maks. 25 MB)</label><input class="input" id="nf-audio" type="file" accept=".mp3,.ogg,.wav,.m4a,.flac,.aac,.webm,audio/*" required></div>
          <div class="field"><label for="nf-cover">Kapak Görseli (isteğe bağlı)</label><input class="input" id="nf-cover" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></div>
        </div>
        <div class="form-error" id="nf-error"></div>
        <div class="row">
          <button class="btn btn-primary" type="submit" id="nf-submit">${icon('plus')} Grafiği Oluştur ve Düzenle</button>
          <a class="btn btn-ghost" href="/chartlarim" data-link>Vazgeç</a>
        </div>
        <p class="muted small" style="margin-top:12px">Ses ve kapak dosyaları sunucuya yüklenir. Grafik başlangıçta <b>taslak</b> olarak kaydedilir; editörde notaları yerleştirdikten sonra yayınlayabilirsin.</p>
      </form>
    </div>`);

  $('#nf-diff').addEventListener('change', (e) => {
    const opt = e.target.selectedOptions[0];
    $('#nf-level').value = opt.dataset.level;
  });

  $('#new-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#nf-error');
    err.textContent = '';
    const title = $('#nf-title').value.trim();
    const bpm = Number($('#nf-bpm').value);
    const audio = $('#nf-audio').files[0];
    if (!title) { err.textContent = 'Şarkı adı gerekli.'; return; }
    if (!(bpm >= 20 && bpm <= 400)) { err.textContent = 'BPM 20-400 arasında olmalı.'; return; }
    if (!audio) { err.textContent = 'Bir ses dosyası seçin.'; return; }
    const fd = new FormData();
    fd.append('songTitle', title);
    fd.append('artist', $('#nf-artist').value.trim());
    fd.append('bpm', String(bpm));
    fd.append('offsetMs', String(Number($('#nf-offset').value) || 0));
    fd.append('difficulty', $('#nf-diff').value);
    fd.append('difficultyLevel', String(Number($('#nf-level').value) || 6));
    fd.append('description', $('#nf-desc').value.trim());
    fd.append('audio', audio);
    const cover = $('#nf-cover').files[0];
    if (cover) fd.append('cover', cover);
    // Başlangıçta boş grafik yerine tek bir referans nota koymuyoruz; sunucu en az 1 nota istiyor.
    const bpmOffset = Number($('#nf-offset').value) || 0;
    const series = ($('#nf-series')?.value || '').trim();
    fd.append('chartData', JSON.stringify({ version: 1, bpm, offset: bpmOffset, lanes: 4, ...(series ? { series } : {}), notes: [{ id: 'n0', lane: 0, time: Math.max(0, bpmOffset), type: 'tap', duration: 0 }] }));

    const btn = $('#nf-submit');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Yükleniyor…';
    try {
      const r = await api('/charts', { method: 'POST', form: fd });
      toast('Grafik oluşturuldu. Notaları yerleştirmeye başlayabilirsin.', 'success');
      navigate(`/editor/${r.chart.id}`);
    } catch (ex) {
      err.textContent = ex.message;
      btn.disabled = false;
      btn.innerHTML = `${icon('plus')} Grafiği Oluştur ve Düzenle`;
    }
  });
}

function renderShell(inner) {
  return `
    <div class="page">
      <div class="page-head">
        <div><div class="eyebrow">Chart Editor</div><h1>Yeni Grafik</h1>
          <p class="sub">Şarkı bilgilerini gir, ses dosyasını yükle ve notaları yerleştirmeye başla.</p></div>
        <a class="btn btn-ghost" href="/chartlarim" data-link>${icon('library')} Chartlarım</a>
      </div>
      ${inner}
    </div>`;
}

/* ====================================================================== */
/* Kilit ekranı                                                            */
/* ====================================================================== */

/** Editör kapalıyken gösterilecek ekran; sahibe açma düğmesi verir. */
function renderLocked(main) {
  main.innerHTML = `
    <div class="page narrow">
      <div class="card empty-state" style="text-align:center">
        ${icon('lock')}
        <h3>Chart Editor şimdilik kapalı</h3>
        <p style="max-width:420px;margin:10px auto 0">Yeni şarkılar ekleneceği için şimdilik kapalı.</p>
        <div style="margin-top:20px;max-width:320px;margin-left:auto;margin-right:auto">
          <div class="field" style="margin:0 0 10px;text-align:left"><label for="ed-unlock-pass">Site şifresi</label><input class="input" id="ed-unlock-pass" type="password" placeholder="Yalnızca site sahibi" autocomplete="current-password"></div>
          <button class="btn btn-primary" id="ed-unlock">${icon('unlock')} Chart Editor'ü aç</button>
        </div>
        <div style="margin-top:20px"><a class="btn btn-ghost" href="/kesfet" data-link>Keşfet'e dön</a></div>
      </div>
    </div>`;
  const btn = $('#ed-unlock');
  if (btn) {
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        const pass = $('#ed-unlock-pass')?.value || site.sitePass;
        await site.setEditorOpen(true, pass);
        if (pass) site.setSitePass(pass);
        toast('Chart Editor açıldı.', 'success');
        navigate('/editor');
      } catch (e) {
        toast(e.message, 'error');
        btn.disabled = false;
      }
    };
  }
}

/* ====================================================================== */
/* Düzenleme sayfası                                                       */
/* ====================================================================== */

export async function renderEdit({ params, main }) {
  if (!auth.user) { sessionStorage.setItem('vibrix.redirect', `/editor/${params.id}`); navigate('/giris'); return; }
  let data;
  try { data = await api(`/charts/${params.id}`); } catch (e) {
    main.innerHTML = `<div class="page narrow"><div class="card empty-state">${icon('alert')}<h3>Grafik açılamadı</h3><p>${esc(e.message)}</p><div style="margin-top:16px"><a class="btn btn-primary" href="/chartlarim" data-link>Chartlarıma dön</a></div></div></div>`;
    return;
  }
  if (!data.chart.isOwner) {
    await site.loadEditorStatus();
    if (!site.editorOpen && !site.isOwner) { renderLocked(main); return; }
    main.innerHTML = `<div class="page narrow"><div class="card empty-state">${icon('alert')}<h3>Yetkisiz işlem</h3><p>Yalnızca kendi grafiklerini düzenleyebilirsin.</p></div></div>`;
    return;
  }
  const editor = new ChartEditor({ main, chart: data.chart });
  editor.mount();
  setCleanup(() => editor.destroy());
}

class ChartEditor {
  constructor({ main, chart }) {
    this.main = main;
    this.chart = chart;
    this.notes = (chart.chartData?.notes || []).map((n, i) => ({ ...n, id: `n${i}` }));
    // Oynanış eventleri (chart ile birlikte kaydedilir)
    this.events = (chart.chartData?.events || []).map((e, i) => ({ ...e, id: e.id || `e${i}` }));
    this.bpm = chart.bpm;
    this.offset = chart.offsetMs;
    this.gridDiv = 16;
    this.snap = true;
    this.zoom = 0.32; // ms başına piksel (0.32 ≈ saniyede 320px)
    this.scrollTime = 0; // görünür alanın üstündeki zaman (ms)
    this.selected = null;
    this.history = [];
    this.future = [];
    this.autoChart = !!chart.isAutoChart;
    this.tool = 'tap'; // tap | hold | select | erase
    this.dirty = false;
    this.playing = false;
    this.audio = null;
    this.audioCtx = null;
    this.audioBuffer = null;
    this.waveform = null;
    this.duration = Math.max(chart.lengthMs, 30000) + 5000;
    this._bound = false;
  }

  mount() {
    const c = this.chart;
    this.main.innerHTML = `
      <div class="page">
        <div class="page-head">
          <div style="min-width:0">
            <div class="eyebrow">Chart Editor</div>
            <h1 style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.songTitle)}</h1>
            <p class="sub">${esc(c.artist || '')} · ${c.status === 'published' ? '<span class="badge success">Yayında</span>' : '<span class="badge warn">Taslak</span>'} <span id="ed-ai-badge" class="badge ai" ${c.isAutoChart ? '' : 'hidden'}>✨ AI ile oluşturuldu</span> <span id="ed-status" class="small"></span></p>
          </div>
          <div class="row wrap" style="gap:8px">
            <button class="btn btn-ghost btn-sm" id="ed-ai">${icon('sparkles')} AI Grafik</button>
            <button class="btn btn-ghost btn-sm" id="ed-test">${icon('play')} Test Et</button>
            <button class="btn btn-primary btn-sm" id="ed-save">${icon('save')} Kaydet</button>
            <button class="btn btn-accent btn-sm" id="ed-publish">${icon('upload')} ${c.status === 'published' ? 'Güncelle' : 'Yayınla'}</button>
            <a class="btn btn-ghost btn-sm" href="/chartlarim" data-link>${icon('library')}</a>
          </div>
        </div>

        <div class="editor-layout">
          <div class="editor-main">
            <div class="editor-toolbar">
              <button class="btn btn-sm btn-ghost btn-icon" id="ed-play" title="Çal / Durdur (Space)">${icon('play')}</button>
              <button class="btn btn-sm btn-ghost btn-icon" id="ed-stop" title="Başa dön">${icon('skipBack')}</button>
              <span class="sep"></span>
              <label class="checkbox" style="font-size:.82rem"><input type="checkbox" id="ed-snap" checked> Izgaraya yapış</label>
              <select class="select" id="ed-grid" style="max-width:110px;padding:6px 28px 6px 10px;font-size:.82rem">
                ${GRID_DIVS.map((d) => `<option value="${d}" ${d === 16 ? 'selected' : ''}>1/${d}</option>`).join('')}
              </select>
              <span class="sep"></span>
              <button class="btn btn-sm btn-ghost btn-icon" id="ed-zoom-out" title="Uzaklaştır">${icon('zoomOut')}</button>
              <button class="btn btn-sm btn-ghost btn-icon" id="ed-zoom-in" title="Yakınlaştır">${icon('zoomIn')}</button>
              <span class="sep"></span>
              <button class="btn btn-sm btn-ghost btn-icon" id="ed-undo" title="Geri (Ctrl+Z)">${icon('undo')}</button>
              <button class="btn btn-sm btn-ghost btn-icon" id="ed-redo" title="İleri">${icon('redo')}</button>
              <span class="sep"></span>
              <span class="editor-status" style="margin-left:auto">
                <span id="ed-note-count">${this.notes.length} nota</span>
                <span class="mono" id="ed-time">0:00.000</span>
                <span><span class="dot" id="ed-dot"></span><span id="ed-save-state">Kaydedildi</span></span>
              </span>
            </div>

            <canvas class="waveform" id="ed-wave"></canvas>
            <div class="editor-canvas-wrap"><canvas id="editor-canvas"></canvas></div>
            <p class="muted small">Nota eklemek için bir hatta tıklayın. Hold notası için nota üzerinde sürükleyin. Bir notayı taşımak için seçip sürükleyin.</p>
          </div>

          <aside class="editor-panel">
            <div class="ed-palette">
              <div class="ed-tools">
                <button class="ed-tool active" data-tool="tap" title="Nota ekle (tıkla)"><span class="ed-tool-ico">▬</span><span>Nota</span></button>
                <button class="ed-tool" data-tool="hold" title="Uzun nota: bas ve sürükle"><span class="ed-tool-ico">▮</span><span>Uzun</span></button>
                <button class="ed-tool" data-tool="select" title="Seç / taşı"><span class="ed-tool-ico">✥</span><span>Seç</span></button>
                <button class="ed-tool" data-tool="erase" title="Sil (tıkla)"><span class="ed-tool-ico">⌫</span><span>Sil</span></button>
              </div>
              <div class="ed-lanes" id="ed-lanes">
                ${LANE_META.map((m, i) => `<button class="ed-lane${i === 0 ? ' active' : ''}" data-lane="${i}" style="--lc:${m.color}"><b>${m.key}</b><span>${m.label}</span></button>`).join('')}
              </div>
              <p class="ed-hint" id="ed-hint">Hat seç, ızgarada tıklayarak nota ekle.</p>
            </div>

            <div class="ed-tabs">
              <button class="ed-tab active" data-tab="song">Şarkı</button>
              <button class="ed-tab" data-tab="note">Nota</button>
              <button class="ed-tab" data-tab="events">Eventler</button>
              <button class="ed-tab" data-tab="help">Yardım</button>
            </div>

            <div class="card ed-tabpane" data-pane="song">
              <div class="card-title">${icon('music')} Şarkı Bilgileri</div>
              <div class="field"><label>Şarkı Adı</label><input class="input" id="ed-title" value="${esc(c.songTitle)}" maxlength="120"></div>
              <div class="field"><label>Sanatçı</label><input class="input" id="ed-artist" value="${esc(c.artist || '')}" maxlength="120"></div>
              <div class="field"><label>Paket</label><input class="input" id="ed-series" maxlength="60" list="ed-series-list" value="${esc(c.series || '')}" placeholder="Örn. Vibrix Apocalypse"><datalist id="ed-series-list">${SERIES_OPTIONS.map((x) => `<option value="${esc(x)}">`).join('')}</datalist><span class="hint">Keşfet'teki seri sekmeleri bu alana göre çalışır.</span></div>
              <div class="grid cols-2" style="gap:10px">
                <div class="field" style="margin:0"><label>BPM</label><input class="input" id="ed-bpm" type="number" min="20" max="400" step="0.01" value="${c.bpm}"></div>
                <div class="field" style="margin:0"><label>Ofset (ms)</label><input class="input" id="ed-offset" type="number" step="1" value="${c.offsetMs}"></div>
              </div>
              <div class="grid cols-2" style="gap:10px;margin-top:10px">
                <div class="field" style="margin:0"><label>Zorluk</label><select class="select" id="ed-diff">${DIFFICULTIES.map((d) => `<option ${d.name === c.difficulty ? 'selected' : ''}>${d.name}</option>`).join('')}</select></div>
                <div class="field" style="margin:0"><label>Seviye</label><input class="input" id="ed-level" type="number" min="1" max="15" value="${c.difficultyLevel}"></div>
              </div>
              <div class="field" style="margin-top:10px"><label>Açıklama</label><textarea class="textarea" id="ed-desc" maxlength="500" style="min-height:70px">${esc(c.description || '')}</textarea></div>
            </div>

            <div class="card ed-tabpane" data-pane="note" hidden>
              <div class="card-title">${icon('layers')} Seçili Nota</div>
              <div id="ed-inspector" class="muted small">Bir nota seçin.</div>
            </div>

            <div class="card ed-tabpane" data-pane="events" hidden>
              <div class="card-title">${icon('sparkles')} Oynanış Eventleri</div>
              <p class="muted small" style="margin-top:-4px">Oynanışı renklendiren efektler. Seç, zamanı gelince oyunda tetiklenir.</p>
              <div class="ev-list">
                ${EVENT_TYPES.map((t) => `
                  <button class="ev-item" data-ev="${t}" style="--ec:${GAME_EVENTS[t].color}">
                    <span class="ev-ico">${EVENT_ICON[t] || '◆'}</span>
                    <span class="ev-body"><b>${esc(GAME_EVENTS[t].name)}</b><small>${esc(GAME_EVENTS[t].desc)}</small></span>
                  </button>`).join('')}
              </div>
              <div class="field" style="margin-top:12px">
                <label>Yoğunluk</label>
                <div class="range-row"><input type="range" id="ev-intensity" min="10" max="100" step="5" value="70"><span class="range-value" id="ev-intensity-val">70%</span></div>
              </div>
              <div class="field">
                <label>Hat (sadece Hat Parıltısı)</label>
                <select class="select" id="ev-lane">
                  <option value="">Rastgele</option>
                  ${LANE_META.map((m, i) => `<option value="${i}">${m.key} — ${m.label}</option>`).join('')}
                </select>
              </div>
              <button class="btn btn-primary btn-block btn-sm" id="ev-add">${icon('plus')} Eventi imlece ekle</button>
              <div class="ev-current">
                <div class="hint" style="margin-bottom:6px">Bu grafikteki eventler (<span id="ev-count">${this.events.length}</span>)</div>
                <div id="ev-list" class="ev-current-list"></div>
              </div>
            </div>

            <div class="card ed-tabpane" data-pane="help" hidden>
              <div class="card-title">${icon('info')} Kısayollar</div>
              <p class="muted small" style="line-height:1.9">
                <b class="mono">1-4</b> hat seç · <b class="mono">D F J K</b> nota yerleştir<br>
                <b class="mono">Delete</b> seçili notayı sil · <b class="mono">Ctrl+Z</b> geri<br>
                <b class="mono">Ctrl+Shift+Z</b> ileri · <b class="mono">Space</b> çal / durdur<br>
                <b class="mono">Ctrl+S</b> kaydet · Fare tekerleği ile kaydır
              </p>
            </div>
          </aside>

        </div>
      </div>`;

    this.canvas = $('#editor-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.waveCanvas = $('#ed-wave');
    this.waveCtx = this.waveCanvas.getContext('2d');
    this.bind();
    this.setTool('tap');
    this.activeLane = 0;
    this.loadAudio();
    this.resize();
    this.renderInspector();
    this.startAutosave();
    this.raf = requestAnimationFrame(() => this.loop());
    window.addEventListener('resize', this._onResize = () => this.resize());
    this._keyHandler = (e) => this.onKey(e);
    window.addEventListener('keydown', this._keyHandler);
  }

  /* ---------- Ses ---------- */
  async loadAudio() {
    try {
      const res = await fetch(this.chart.audio, { credentials: 'same-origin' });
      const buf = await res.arrayBuffer();
      this.audioBuffer = buf;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new Ctx();
      this.decoded = await this.audioCtx.decodeAudioData(buf.slice(0));
      this.duration = Math.max(this.decoded.duration * 1000, this.duration);
      this.buildWaveform();
    } catch (e) {
      toast('Ses dosyası yüklenemedi; zaman çizelgesi boş çalışacak.', 'error');
    }
  }

  buildWaveform() {
    const ch = this.decoded.getChannelData(0);
    const buckets = 1600;
    const step = Math.floor(ch.length / buckets) || 1;
    const peaks = new Float32Array(buckets);
    for (let i = 0; i < buckets; i++) {
      let max = 0;
      const start = i * step;
      for (let j = 0; j < step; j += 8) {
        const v = Math.abs(ch[start + j] || 0);
        if (v > max) max = v;
      }
      peaks[i] = max;
    }
    this.waveform = peaks;
  }

  playAudio() {
    if (!this.audioCtx || !this.decoded) return;
    this.stopAudio();
    const src = this.audioCtx.createBufferSource();
    src.buffer = this.decoded;
    const g = this.audioCtx.createGain();
    const vol = (settings.data.audio.master / 100) * (settings.data.audio.music / 100);
    g.gain.value = vol;
    src.connect(g).connect(this.audioCtx.destination);
    const startSec = Math.max(0, (this.scrollTime - this.offset) / 1000);
    src.start(0, startSec);
    this.source = src;
    this.audioStartCtx = this.audioCtx.currentTime;
    this.audioStartMs = this.scrollTime;
    this.playing = true;
    $('#ed-play').innerHTML = icon('pause');
  }

  stopAudio() {
    try { if (this.source) this.source.stop(); } catch { /* yoksay */ }
    this.source = null;
    this.playing = false;
    const b = $('#ed-play');
    if (b) b.innerHTML = icon('play');
  }

  nowMs() {
    if (!this.playing || !this.audioCtx) return this.scrollTime;
    return this.audioStartMs + (this.audioCtx.currentTime - this.audioStartCtx) * 1000;
  }

  /* ---------- Çizim ---------- */
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    const cw = this.canvas.clientWidth || 900;
    const chh = this.canvas.clientHeight || 520;
    this.cw = cw; this.chh = chh;
    this.canvas.width = Math.floor(cw * dpr);
    this.canvas.height = Math.floor(chh * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.waveCanvas.width = Math.floor(cw * dpr);
    this.waveCanvas.height = Math.floor(64 * dpr);
    this.waveCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Hatlar oynatma alanını doldurur: tahtayı 4 eşit sütuna böl
    this.laneW = Math.max(70, Math.min(190, (cw - 120) / 4));
    this.boardW = this.laneW * 4;
    this.boardX = (cw - this.boardW) / 2;
    this.drawWave();
  }

  drawWave() {
    const ctx = this.waveCtx;
    const w = this.cw, h = 64;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#080b11';
    ctx.fillRect(0, 0, w, h);
    if (!this.waveform) return;
    const totalMs = this.duration;
    ctx.fillStyle = 'rgba(56,189,248,0.45)';
    const step = w / this.waveform.length;
    for (let i = 0; i < this.waveform.length; i++) {
      const hh = Math.max(1, this.waveform[i] * (h - 8));
      ctx.fillRect(i * step, (h - hh) / 2, Math.max(1, step - 0.4), hh);
    }
    // oynatma başı
    const x = (this.nowMs() / totalMs) * w;
    ctx.fillStyle = '#A78BFA';
    ctx.fillRect(x, 0, 1.5, h);
  }

  loop() {
    if (!this.canvas || !this.canvas.isConnected) return;
    this.raf = requestAnimationFrame(() => this.loop());
    if (this.playing) {
      const t = this.nowMs();
      if (t >= this.duration - 200) this.stopAudio();
      // oynatma çubuğu görünümü takip etsin
      const visibleMs = this.chh / this.zoom;
      if (t > this.scrollTime + visibleMs * 0.9) this.scrollTime = t - visibleMs * 0.3;
    }
    this.draw();
    this.drawWave();
    const tEl = $('#ed-time');
    if (tEl) tEl.textContent = this.fmtTime(this.nowMs());
  }

  fmtTime(ms) {
    const total = Math.max(0, ms);
    const m = Math.floor(total / 60000);
    const s = Math.floor((total % 60000) / 1000);
    const mss = Math.floor(total % 1000);
    return `${m}:${String(s).padStart(2, '0')}.${String(mss).padStart(3, '0')}`;
  }

  yFor(timeMs) {
    return (timeMs - this.scrollTime) * this.zoom;
  }

  timeFor(y) {
    return this.scrollTime + y / this.zoom;
  }

  beatMs() { return 60000 / this.bpm; }
  gridMs() { return this.beatMs() * (4 / this.gridDiv); }

  snapTime(t) {
    if (!this.snap) return Math.max(0, Math.round(t));
    const g = this.gridMs();
    const rel = t - this.offset;
    return Math.max(0, Math.round(this.offset + Math.round(rel / g) * g));
  }

  draw() {
    const ctx = this.ctx;
    const w = this.cw, h = this.chh;
    ctx.fillStyle = '#080b11';
    ctx.fillRect(0, 0, w, h);
    const bx = this.boardX, lw = this.laneW;

    // Izgara
    const beat = this.beatMs();
    const grid = this.gridMs();
    const startT = this.scrollTime;
    const endT = this.timeFor(h);
    let effGrid = grid;
    while (effGrid * this.zoom < 4) effGrid *= 2; // 4px'ten yakın çizgileri atla
    const firstLine = Math.floor((startT - this.offset) / effGrid) * effGrid + this.offset;
    for (let t = firstLine; t < endT; t += effGrid) {
      const y = this.yFor(t);
      if (y < 0 || y > h) continue;
      const beatPos = (t - this.offset) / beat;
      const isBeat = Math.abs(beatPos - Math.round(beatPos)) < 0.001;
      const isBar = isBeat && Math.round(beatPos) % 4 === 0;
      ctx.strokeStyle = isBar ? 'rgba(167,139,250,0.32)' : isBeat ? 'rgba(148,163,184,0.20)' : 'rgba(148,163,184,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5); ctx.stroke();
      if (isBar) {
        ctx.fillStyle = 'rgba(148,163,184,0.55)';
        ctx.font = '10px Inter, Segoe UI, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`Ölçü ${Math.round(beatPos) / 4 + 1}`, 8, y - 4);
      }
    }

    // Hatlar — renk tonlu, oynatma alanını dolduracak genişlikte
    ctx.fillStyle = 'rgba(10,13,20,0.65)';
    ctx.fillRect(bx, 0, this.boardW, h);
    for (let i = 0; i < 4; i++) {
      const x = bx + i * lw;
      ctx.fillStyle = LANE_COLORS[i];
      ctx.globalAlpha = 0.055;
      ctx.fillRect(x + 1, 0, lw - 2, h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(148,163,184,0.13)';
      ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
      // Üstte hat rengi şeridi
      ctx.fillStyle = LANE_COLORS[i];
      ctx.globalAlpha = 0.75;
      ctx.fillRect(x + 1, 0, lw - 2, 2.5);
      ctx.globalAlpha = 1;
      ctx.fillStyle = LANE_COLORS[i];
      ctx.font = '700 11px Inter, Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText((settings.data.keys[i] || LANE_KEYS[i]).toUpperCase(), x + lw / 2, 18);
    }
    ctx.strokeStyle = 'rgba(148,163,184,0.12)';
    ctx.beginPath(); ctx.moveTo(bx + this.boardW + 0.5, 0); ctx.lineTo(bx + this.boardW + 0.5, h); ctx.stroke();

    // Hat rehber sütunları: hat renklerini üstte ince şerit olarak göster
    for (let i = 0; i < 4; i++) {
      const x = bx + i * lw;
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = LANE_COLORS[i];
      ctx.fillRect(x + 1, 0, lw - 2, 3);
      ctx.globalAlpha = 1;
    }

    // Aktif hat vurgusu
    if (typeof this.activeLane === 'number' && this.activeLane >= 0 && this.activeLane < 4) {
      const ax = bx + this.activeLane * lw;
      ctx.fillStyle = LANE_COLORS[this.activeLane];
      ctx.globalAlpha = 0.06;
      ctx.fillRect(ax, 0, lw, h);
      ctx.globalAlpha = 1;
    }

    // Notalar
    const noteH = Math.max(10, lw * 0.2);
    for (const n of this.notes) {
      const y = this.yFor(n.time);
      const x = bx + n.lane * lw;
      if (n.type === 'hold') {
        const endY = this.yFor(n.time + n.duration);
        if (endY < 0 || y > h) continue;
        ctx.fillStyle = LANE_COLORS[n.lane];
        ctx.globalAlpha = 0.35;
        ctx.fillRect(x + 8, Math.min(y, endY), lw - 16, Math.abs(endY - y));
        ctx.globalAlpha = 1;
        ctx.fillStyle = LANE_COLORS[n.lane];
        ctx.fillRect(x + 8, y - noteH / 2, lw - 16, noteH);
        ctx.fillRect(x + 8, endY - 3, lw - 16, 6);
      } else {
        if (y < -20 || y > h + 20) continue;
        ctx.fillStyle = LANE_COLORS[n.lane];
        ctx.globalAlpha = 0.95;
        roundRectPath(ctx, x + 8, y - noteH / 2, lw - 16, noteH, 4);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(x + 10, y - noteH / 2 + 1.5, lw - 20, 1.5);
      }
      if (this.selected === n.id) {
        ctx.strokeStyle = '#F1F5F9';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 5, y - noteH / 2 - 3, lw - 10, noteH + 6);
      }
    }

    // İmleç
    if (!this.playing) {
      const y = this.yFor(this.scrollTime);
      if (y >= 0 && y <= h) {
        ctx.strokeStyle = 'rgba(239,68,68,0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
    }
  }

  /* ---------- Palet ---------- */
  setTool(tool) {
    this.tool = tool;
    this.main.querySelectorAll('.ed-tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
    this.canvas.style.cursor = tool === 'erase' ? 'not-allowed' : tool === 'select' ? 'grab' : 'crosshair';
    const hints = {
      tap: 'Izgarada tıkla: nota ekle. Notayı sürükleyerek taşı.',
      hold: 'Tıkla ve aşağı sürükle: uzun nota oluştur.',
      select: 'Notaya tıkla ve sürükle: taşı. Boşluğa tıkla: seçimi bırak.',
      erase: 'Notaya tıkla: sil.',
    };
    const h = $('#ed-hint');
    if (h) h.textContent = hints[tool] || '';
  }

  setLane(lane) {
    this.activeLane = lane;
    this.main.querySelectorAll('.ed-lane').forEach((b) => b.classList.toggle('active', Number(b.dataset.lane) === lane));
    // Seçili nota varsa hatlar arası taşıma da yapılabilir
    const n = this.notes.find((x) => x.id === this.selected);
    if (n && n.lane !== lane) {
      this.pushHistory();
      n.lane = lane;
      this.markDirty();
      this.renderInspector();
    }
  }

  /* ---------- Fare / tuş ---------- */
  bind() {
    const canvas = this.canvas;
    let drag = null;

    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    canvas.addEventListener('mousedown', (e) => {
      const { x, y } = pos(e);
      const lane = Math.floor((x - this.boardX) / this.laneW);
      if (lane < 0 || lane > 3) { this.selected = null; this.renderInspector(); return; }
      const t = this.timeFor(y);
      const existing = this.findNoteAt(lane, t);

      // Araç: sil
      if (this.tool === 'erase') {
        if (existing) {
          this.pushHistory();
          this.notes = this.notes.filter((x2) => x2 !== existing);
          if (this.selected === existing.id) this.selected = null;
          this.markDirty();
          this.renderInspector();
          this.updateStatus();
        }
        e.preventDefault();
        return;
      }
      // Araç: seç / taşı — boş yere tıklanınca sadece seçimi bırakır
      if (this.tool === 'select') {
        this.selected = existing ? existing.id : null;
        this.renderInspector();
        if (existing) drag = { note: existing, startY: y, startTime: existing.time, startDur: existing.duration, mode: 'move' };
        e.preventDefault();
        return;
      }

      if (existing) {
        this.selected = existing.id;
        this.renderInspector();
        drag = { note: existing, startY: y, startTime: existing.time, startDur: existing.duration, mode: 'move' };
      } else {
        this.pushHistory();
        const note = { id: `n${Date.now()}${Math.random().toString(36).slice(2, 6)}`, lane, time: this.snapTime(t), type: 'tap', duration: 0 };
        this.notes.push(note);
        this.notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
        this.selected = note.id;
        this.markDirty();
        this.renderInspector();
        drag = { note, startY: y, startTime: note.time, startDur: 0, mode: this.tool === 'hold' ? 'hold' : 'none' };
      }
      e.preventDefault();
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!drag) return;
      const { y } = pos(e);
      const dy = y - drag.startY;
      if (drag.mode === 'hold') {
        const dt = dy / this.zoom;
        if (dt > 40) {
          drag.note.type = 'hold';
          drag.note.duration = Math.max(40, Math.round(this.snapTime(drag.startTime + dt) - drag.startTime));
          this.markDirty();
        }
      } else if (drag.mode === 'move') {
        const dt = dy / this.zoom;
        const nt = this.snapTime(drag.startTime + dt);
        if (this.notes.some((n) => n !== drag.note && n.lane === drag.note.lane && n.time === nt)) return;
        drag.note.time = Math.max(0, nt);
        this.markDirty();
      }
      this.notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
    });

    canvas.addEventListener('mouseup', () => { if (drag) { drag = null; this.renderInspector(); this.updateStatus(); } });
    canvas.addEventListener('mouseleave', () => { drag = null; });
    canvas.addEventListener('dblclick', (e) => {
      const { x, y } = pos(e);
      const lane = Math.floor((x - this.boardX) / this.laneW);
      const n = this.findNoteAt(lane, this.timeFor(y));
      if (n) { this.pushHistory(); this.notes = this.notes.filter((x2) => x2 !== n); this.selected = null; this.markDirty(); this.renderInspector(); this.updateStatus(); }
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey) {
        this.zoom = Math.min(1.6, Math.max(0.06, this.zoom * (e.deltaY < 0 ? 1.15 : 0.87)));
      } else {
        this.scrollTime = Math.max(0, this.scrollTime + e.deltaY / this.zoom);
      }
    }, { passive: false });

    // Palet: araç seçimi
    this.main.querySelectorAll('.ed-tool').forEach((btn) => {
      btn.addEventListener('click', () => this.setTool(btn.dataset.tool));
    });
    // Palet: hat seçimi (tıklayınca o hatta nota eklenir)
    this.main.querySelectorAll('.ed-lane').forEach((btn) => {
      btn.addEventListener('click', () => this.setLane(Number(btn.dataset.lane)));
    });
    // Sekmeler
    /* ---------- Oynanış eventleri ---------- */
    const evIntensity = () => Number($('#ev-intensity')?.value || 70);
    const evLane = () => ($('#ev-lane')?.value === '' ? null : Number($('#ev-lane').value));

    if ($('#ev-intensity')) {
      $('#ev-intensity').addEventListener('input', () => {
        const el = $('#ev-intensity-val');
        if (el) el.textContent = `${evIntensity()}%`;
      });
    }

    const renderEventList = () => {
      const box = $('#ev-list');
      const cnt = $('#ev-count');
      if (cnt) cnt.textContent = String(this.events.length);
      if (!box) return;
      if (!this.events.length) {
        box.innerHTML = '<span class="hint">Henüz event yok.</span>';
        return;
      }
      const sorted = this.events.slice().sort((a, b) => a.time - b.time);
      box.innerHTML = sorted.map((e) => `
        <div class="ev-row">
          <span class="ev-dot" style="background:${GAME_EVENTS[e.type]?.color || '#888'}"></span>
          <span class="ev-row-name">${esc(GAME_EVENTS[e.type]?.name || e.type)}</span>
          <span class="mono small">${this.fmtTime(e.time)}</span>
          <button class="btn btn-ghost btn-sm ev-del" data-id="${esc(e.id)}" title="Sil">${icon('trash')}</button>
        </div>`).join('');
      box.querySelectorAll('.ev-del').forEach((b) => {
        b.addEventListener('click', () => {
          this.pushHistory();
          this.events = this.events.filter((x) => x.id !== b.dataset.id);
          this.markDirty();
          renderEventList();
          this.draw?.();
        });
      });
    };

    const addEvent = (type) => {
      const time = Math.max(0, Math.round(this.nowMs ? this.nowMs() : this.scrollTime));
      const ev = {
        id: `e${Date.now().toString(36)}${Math.floor(Math.random() * 999)}`,
        type,
        time,
        duration: type === 'blackout' ? 2000 : 1200,
        intensity: evIntensity(),
        lane: GAME_EVENTS[type]?.needsLane ? (evLane() ?? null) : null,
      };
      this.pushHistory();
      this.events.push(ev);
      this.markDirty();
      renderEventList();
      toast(`${GAME_EVENTS[type].name} eklendi · ${this.fmtTime(time)}`, 'success');
    };

    if ($('#ev-add')) {
      let selType = 'laneflash';
      this.main.querySelectorAll('.ev-item').forEach((b) => {
        b.addEventListener('click', () => {
          selType = b.dataset.ev;
          this.main.querySelectorAll('.ev-item').forEach((x) => x.classList.toggle('active', x === b));
        });
      });
      this.main.querySelector('.ev-item')?.classList.add('active');
      $('#ev-add').addEventListener('click', () => addEvent(selType));
    }
    renderEventList();
    this._renderEventList = renderEventList;

    this.main.querySelectorAll('.ed-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.main.querySelectorAll('.ed-tab').forEach((b) => b.classList.toggle('active', b === btn));
        this.main.querySelectorAll('.ed-tabpane').forEach((pane) => {
          pane.hidden = pane.dataset.pane !== btn.dataset.tab;
        });
      });
    });

    $('#ed-play').addEventListener('click', () => { if (this.playing) this.stopAudio(); else this.playAudio(); });
    $('#ed-stop').addEventListener('click', () => { this.stopAudio(); this.scrollTime = 0; });
    $('#ed-snap').addEventListener('change', (e) => { this.snap = e.target.checked; });
    $('#ed-grid').addEventListener('change', (e) => { this.gridDiv = Number(e.target.value); });
    $('#ed-zoom-in').addEventListener('click', () => { this.zoom = Math.min(1.6, this.zoom * 1.25); });
    $('#ed-zoom-out').addEventListener('click', () => { this.zoom = Math.max(0.06, this.zoom / 1.25); });
    $('#ed-undo').addEventListener('click', () => this.undo());
    $('#ed-redo').addEventListener('click', () => this.redo());
    $('#ed-save').addEventListener('click', () => this.save());
    $('#ed-publish').addEventListener('click', () => this.publish());
    $('#ed-ai').addEventListener('click', () => this.openAiDialog());
    $('#ed-test').addEventListener('click', async () => {
      const okSaved = await this.save(true);
      if (!okSaved) return;
      const launch = await ensureEngine();
      this.destroy();
      await launch({ chartId: this.chart.id, test: true });
    });
    for (const id of ['ed-title', 'ed-artist', 'ed-series', 'ed-bpm', 'ed-offset', 'ed-diff', 'ed-level', 'ed-desc']) {
      $(`#${id}`).addEventListener('change', () => this.markDirty());
    }
    $('#ed-bpm').addEventListener('change', (e) => { const v = Number(e.target.value); if (v >= 20 && v <= 400) this.bpm = v; });
    $('#ed-offset').addEventListener('change', (e) => { this.offset = Number(e.target.value) || 0; });

    const ins = $('#ed-inspector');
    ins.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ins]');
      if (!btn) return;
      const n = this.notes.find((x) => x.id === this.selected);
      if (!n) return;
      this.pushHistory();
      if (btn.dataset.ins === 'delete') { this.notes = this.notes.filter((x) => x !== n); this.selected = null; }
      if (btn.dataset.ins === 'hold') { n.type = 'hold'; n.duration = Math.max(200, Math.round(this.beatMs())); }
      if (btn.dataset.ins === 'tap') { n.type = 'tap'; n.duration = 0; }
      if (btn.dataset.ins === 'longer') { n.type = 'hold'; n.duration = (n.duration || 200) + Math.round(this.gridMs()); }
      if (btn.dataset.ins === 'shorter') { n.duration = Math.max(40, (n.duration || 200) - Math.round(this.gridMs())); if (n.duration <= 40) { n.type = 'tap'; n.duration = 0; } }
      if (btn.dataset.ins === 'laneL') n.lane = Math.max(0, n.lane - 1);
      if (btn.dataset.ins === 'laneR') n.lane = Math.min(3, n.lane + 1);
      this.markDirty();
      this.renderInspector();
      this.updateStatus();
    });
  }


  /* ---------- AI grafik üretimi ---------- */
  openAiDialog() {
    let host = document.getElementById('modal-host');
    if (!host) { host = document.createElement('div'); host.id = 'modal-host'; host.className = 'modal-host'; document.body.appendChild(host); }
    host.innerHTML = `
      <div class="modal">
        <div class="modal-head"><h3>${icon('sparkles')} AI Grafik Oluştur</h3><button class="btn btn-ghost btn-icon" data-act="close">${icon('x')}</button></div>
        <div class="modal-body">
          <p class="muted small" style="margin-bottom:14px">Şarkıdaki vuruşlar (kick, snare, hi-hat, melodi) gerçek zamanlı analiz edilir ve seçtiğin zorluğa göre 4K grafik üretilir. Analiz tamamen bu tarayıcıda çalışır, ses dosyası hiçbir yere gönderilmez. Mevcut notalar <b>değiştirilir</b> (Ctrl+Z ile geri alınabilir).</p>
          <div class="field"><label>Zorluk seviyesi: <b id="ai-diff-label">6</b> <span class="muted" id="ai-diff-desc">Normal</span></label><input type="range" id="ai-diff" min="1" max="15" step="1" value="6"></div>
          <div class="grid cols-2" style="gap:10px">
            <div class="field"><label>Stil</label>
              <select class="input" id="ai-style">
                <option value="balanced">Dengeli</option>
                <option value="stream">Akış (stream)</option>
                <option value="jack">Jack (tekrar nota)</option>
                <option value="tech">Teknik (merdiven + akor)</option>
              </select>
            </div>
            <div class="field"><label>Vuruş hassasiyeti: <b id="ai-sens-label">100</b></label><input type="range" id="ai-sens" min="50" max="150" step="5" value="100"></div>
          </div>
          <div class="grid cols-2" style="gap:10px">
            <div class="field"><label>Akor yoğunluğu: <b id="ai-chord-label">20</b>%</label><input type="range" id="ai-chords" min="0" max="100" step="5" value="20"></div>
            <div class="field"><label>Merdiven (stairs)</label>
              <label class="check"><input type="checkbox" id="ai-stairs" checked> Merdiven desenlerini kullan</label>
            </div>
          </div>
          <div class="grid cols-2" style="gap:10px">
            <div class="field"><label>BPM (boş bırak = otomatik)</label><input class="input" id="ai-bpm" type="number" min="20" max="400" step="0.01" placeholder="otomatik"></div>
            <div class="field"><label>Ofset ms (boş = otomatik)</label><input class="input" id="ai-offset" type="number" step="1" placeholder="otomatik"></div>
          </div>
          <div class="ai-progress" id="ai-progress" hidden>
            <div class="ai-bar"><span id="ai-bar-fill"></span></div>
            <p class="muted small" id="ai-status">Hazırlanıyor…</p>
          </div>
          <div id="ai-report" hidden></div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" data-act="cancel">Vazgeç</button>
          <button class="btn btn-primary" id="ai-run">${icon('sparkles')} Oluştur</button>
        </div>
      </div>`;
    host.classList.add('open');
    const close = () => { host.classList.remove('open'); host.innerHTML = ''; };
    host.querySelector('[data-act="close"]').onclick = close;
    host.querySelector('[data-act="cancel"]').onclick = close;

    const descs = { 1: 'Çok kolay', 2: 'Kolay', 3: 'Kolay', 4: 'Hafif', 5: 'Normal', 6: 'Normal', 7: 'Orta', 8: 'Zor', 9: 'Zor', 10: 'Çok zor', 11: 'Uzman', 12: 'Uzman', 13: 'Aşırı', 14: 'Aşırı', 15: 'İmkânsız' };
    host.querySelector('#ai-diff').oninput = (e) => {
      host.querySelector('#ai-diff-label').textContent = e.target.value;
      host.querySelector('#ai-diff-desc').textContent = '· ' + (descs[e.target.value] || '');
    };
    host.querySelector('#ai-diff').oninput({ target: host.querySelector('#ai-diff') });
    host.querySelector('#ai-sens').oninput = (e) => { host.querySelector('#ai-sens-label').textContent = e.target.value; };
    host.querySelector('#ai-chords').oninput = (e) => { host.querySelector('#ai-chord-label').textContent = e.target.value; };

    host.querySelector('#ai-run').onclick = async () => {
      if (!this.decoded) { toast('Ses dosyası henüz hazır değil, birkaç saniye bekleyip tekrar dene.', 'info'); return; }
      const btn = host.querySelector('#ai-run');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Oluşturuluyor…';
      host.querySelector('#ai-progress').hidden = false;
      host.querySelector('#ai-report').hidden = true;
      const fill = host.querySelector('#ai-bar-fill');
      const status = host.querySelector('#ai-status');
      const bpmVal = Number(host.querySelector('#ai-bpm').value);
      const offVal = Number(host.querySelector('#ai-offset').value);
      try {
        const result = await generateChart(this.decoded, {
          difficulty: Number(host.querySelector('#ai-diff').value),
          style: host.querySelector('#ai-style').value,
          sensitivity: Number(host.querySelector('#ai-sens').value),
          chords: Number(host.querySelector('#ai-chords').value),
          stairs: host.querySelector('#ai-stairs').checked,
          bpm: bpmVal > 0 ? bpmVal : 0,
          offset: Number.isFinite(offVal) && host.querySelector('#ai-offset').value !== '' ? offVal : null,
          onProgress: (p, msg) => { fill.style.width = `${Math.round(p * 100)}%`; status.textContent = msg; },
        });
        this.pushHistory();
        this.notes = result.chartData.notes.map((n, i) => ({ ...n, id: `n${Date.now()}${i}` }));
        this.autoChart = true;
        this.updateAiBadge();
        this.bpm = result.chartData.bpm;
        this.offset = result.chartData.offset;
        const bpmInput = $('#ed-bpm'); if (bpmInput) bpmInput.value = this.bpm;
        const offInput = $('#ed-offset'); if (offInput) offInput.value = this.offset;
        this.selected = null;
        this.scrollTime = Math.max(0, this.offset - 500);
        this.markDirty();
        this.renderInspector();
        this.updateStatus();
        close();
        const st = result.stats;
        toast(`AI grafik: ${st.noteCount} nota · ${st.bpm} BPM · ${st.holdCount} hold · ${st.chordCount} akor · ${st.stairsCount} merdiven. Ctrl+Z ile geri alabilirsin.`, 'success');
      } catch (e) {
        toast('Grafik oluşturulamadı: ' + e.message, 'error');
        btn.disabled = false;
        btn.innerHTML = `${icon('sparkles')} Oluştur`;
      }
    };
  }

  findNoteAt(lane, timeMs) {
    const tol = Math.max(12, 18 / this.zoom);
    let best = null; let bestD = tol;
    for (const n of this.notes) {
      if (n.lane !== lane) continue;
      const end = n.type === 'hold' ? n.time + n.duration : n.time;
      const d = timeMs >= n.time - tol && timeMs <= end + tol ? Math.min(Math.abs(timeMs - n.time), Math.abs(timeMs - end)) : Infinity;
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  onKey(e) {
    if (e.target.matches('input, textarea, select')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
    if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); this.save(); return; }
    if (e.key === ' ') { e.preventDefault(); if (this.playing) this.stopAudio(); else this.playAudio(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (!this.selected) return;
      e.preventDefault();
      this.pushHistory();
      this.notes = this.notes.filter((n) => n.id !== this.selected);
      this.selected = null;
      this.markDirty();
      this.renderInspector();
      this.updateStatus();
      return;
    }
    if (['1', '2', '3', '4'].includes(e.key)) { this.activeLane = Number(e.key) - 1; return; }
    const keys = settings.data.keys || {};
    for (let i = 0; i < 4; i++) {
      if (e.key.toLowerCase() === (keys[i] || LANE_KEYS[i])) {
        e.preventDefault();
        // imleç zamanına nota ekle
        const t = this.snapTime(this.scrollTime);
        if (this.notes.some((n) => n.lane === i && n.time === t)) return;
        this.pushHistory();
        const note = { id: `n${Date.now()}${Math.random().toString(36).slice(2, 6)}`, lane: i, time: t, type: 'tap', duration: 0 };
        this.notes.push(note);
        this.notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
        this.selected = note.id;
        this.markDirty();
        this.renderInspector();
        this.updateStatus();
        return;
      }
    }
  }

  /* ---------- Geçmiş ---------- */
  snapshot() { return JSON.stringify(this.notes); }
  pushHistory() {
    this.history.push(this.snapshot());
    if (this.history.length > 60) this.history.shift();
    this.future = [];
  }
  undo() {
    if (!this.history.length) return;
    this.future.push(this.snapshot());
    this.notes = JSON.parse(this.history.pop());
    this.selected = null;
    this.markDirty();
    this.renderInspector();
    this.updateStatus();
  }
  redo() {
    if (!this.future.length) return;
    this.history.push(this.snapshot());
    this.notes = JSON.parse(this.future.pop());
    this.selected = null;
    this.markDirty();
    this.renderInspector();
    this.updateStatus();
  }

  renderInspector() {
    const el = $('#ed-inspector');
    if (!el) return;
    const n = this.notes.find((x) => x.id === this.selected);
    if (!n) { el.innerHTML = '<span class="muted small">Bir nota seçin veya boş bir alana tıklayarak yeni nota ekleyin.</span>'; return; }
    el.innerHTML = `
      <div class="note-inspector">
        <div><div class="hint">Hat</div><strong>${(settings.data.keys[n.lane] || LANE_KEYS[n.lane]).toUpperCase()}</strong></div>
        <div><div class="hint">Zaman</div><strong class="mono">${this.fmtTime(n.time)}</strong></div>
        <div><div class="hint">Tür</div><strong>${n.type === 'hold' ? 'Hold' : 'Tap'}</strong></div>
        <div><div class="hint">Süre</div><strong class="mono">${n.type === 'hold' ? n.duration + 'ms' : '—'}</strong></div>
      </div>
      <div class="row wrap" style="gap:6px;margin-top:12px">
        <button class="btn btn-sm btn-ghost" data-ins="laneL">←</button>
        <button class="btn btn-sm btn-ghost" data-ins="laneR">→</button>
        <button class="btn btn-sm btn-ghost" data-ins="tap">Tap</button>
        <button class="btn btn-sm btn-ghost" data-ins="hold">Hold</button>
        <button class="btn btn-sm btn-ghost" data-ins="longer">Uzat</button>
        <button class="btn btn-sm btn-ghost" data-ins="shorter">Kısalt</button>
        <button class="btn btn-sm btn-danger" data-ins="delete">${icon('trash')}</button>
      </div>`;
  }

  updateAiBadge() {
    const el = $('#ed-ai-badge');
    if (!el) return;
    if (this.autoChart) el.removeAttribute('hidden');
    else el.setAttribute('hidden', '');
  }

  updateStatus() {
    const el = $('#ed-note-count');
    if (el) el.textContent = `${this.notes.length} nota`;
  }

  markDirty() {
    this.dirty = true;
    const s = $('#ed-save-state');
    if (s) s.textContent = 'Kaydedilmedi';
    const dot = $('#ed-dot');
    if (dot) dot.classList.add('dirty');
  }

  startAutosave() {
    this._autosave = setInterval(() => { if (this.dirty) this.save(true); }, 20000);
    this._onUnload = (e) => { if (this.dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', this._onUnload);
    // Sayfadan ayrılırken (rota değişimi) temizlik
    const cleanup = this._cleanup = () => {
      clearInterval(this._autosave);
      window.removeEventListener('beforeunload', this._onUnload);
      window.removeEventListener('keydown', this._keyHandler);
      window.removeEventListener('resize', this._onResize);
      if (this.raf) cancelAnimationFrame(this.raf);
      this.stopAudio();
      try { if (this.audioCtx) this.audioCtx.close(); } catch { /* yoksay */ }
    };
  }

  collectMeta() {
    const bpm = Number($('#ed-bpm').value);
    const offset = Number($('#ed-offset').value) || 0;
    return {
      songTitle: $('#ed-title').value.trim(),
      artist: $('#ed-artist').value.trim(),
      bpm: bpm >= 20 && bpm <= 400 ? bpm : this.bpm,
      offsetMs: offset,
      difficulty: $('#ed-diff').value,
      difficultyLevel: Number($('#ed-level').value) || 6,
      description: $('#ed-desc').value.trim(),
      series: ($('#ed-series')?.value || '').trim(),
    };
  }

  async save(silent = false) {
    const meta = this.collectMeta();
    if (!meta.songTitle) { toast('Şarkı adı boş olamaz.', 'error'); return false; }
    const chartData = {
      version: 1, bpm: meta.bpm, offset: meta.offsetMs, lanes: 4,
      ...(meta.series ? { series: meta.series } : {}),
      notes: this.notes, events: this.events,
    };
    const fd = new FormData();
    for (const [k, v] of Object.entries(meta)) fd.append(k, String(v));
    fd.append('chartData', JSON.stringify(chartData));
    fd.append('autoChart', this.autoChart ? '1' : '0');
    try {
      const r = await api(`/charts/${this.chart.id}`, { method: 'PUT', form: fd });
      this.chart = { ...this.chart, ...r.chart };
      this.dirty = false;
      const s = $('#ed-save-state');
      if (s) s.textContent = 'Kaydedildi';
      const dot = $('#ed-dot');
      if (dot) dot.classList.remove('dirty');
      if (!silent) toast('Grafik kaydedildi.', 'success');
      return true;
    } catch (e) {
      toast(e.message, 'error');
      return false;
    }
  }

  async publish() {
    if (this.notes.length < 4) { toast('Yayınlamak için en az 4 nota gerekli.', 'error'); return; }
    const ok = await this.save(true);
    if (!ok) return;
    try {
      await api(`/charts/${this.chart.id}/publish`, { method: 'POST' });
      toast('Grafik yayınlandı. Topluluk artık oynayabilir.', 'success');
      navigate(`/chart/${this.chart.id}`);
    } catch (e) { toast(e.message, 'error'); }
  }

  destroy() { if (this._cleanup) this._cleanup(); }
}
