/* Vibrix — keşfet: arama, filtre, sıralama */
import { api, $, esc, ensureEngine, fmtNum, fmtDuration, diffBadge, coverHtml, navigate, debounce, paginationHtml } from '../app.js';
import { icon } from '../icons.js';

const state = { q: '', sort: 'newest', difficulty: '', bpmMin: '', bpmMax: '', lenMax: '', series: '', offset: 0, limit: 18 };

/** Seri (paket) filtreleri — başlıkta geçen paket adına göre */
const SERIES = [
  { key: '', label: 'Hepsi' },
  { key: 'Vibrix Apocalypse', label: 'Vibrix Apocalypse' },
  { key: 'Vibrix', label: 'Vibrix', exclude: 'Apocalypse' },
];

export async function render({ main }) {
  const params = new URLSearchParams(location.search);
  if (params.get('sort')) state.sort = params.get('sort');
  if (params.get('q')) state.q = params.get('q');

  main.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Keşfet</div>
          <h1>Topluluk Grafikleri</h1>
          <p class="sub">Oyuncuların yayınladığı grafikleri ara, filtrele ve oyna.</p>
        </div>
        <a class="btn btn-accent" href="/editor" data-link>${icon('plus')} Yeni Grafik</a>
      </div>
      <div class="series-bar" id="series-bar">
        ${SERIES.map((sr) => `<button class="series-chip${state.series === sr.key ? ' active' : ''}" data-series="${esc(sr.key)}">${esc(sr.label)}</button>`).join('')}
      </div>
      <div class="card" style="margin-bottom:22px">
        <div class="filters">
          <div class="field" style="margin:0;grid-column:span 2;min-width:220px">
            <label>Ara</label>
            <div class="search-box">${icon('search')}<input class="input" id="q" placeholder="Şarkı, sanatçı, oluşturucu…" value="${esc(state.q)}"></div>
          </div>
          <div class="field" style="margin:0"><label>Sıralama</label>
            <select class="select" id="sort">
              <option value="newest">En Yeni</option>
              <option value="popular">En Çok Oynanan</option>
              <option value="trending">Trend</option>
              <option value="alpha">Alfabetik</option>
              <option value="best">En Yüksek Skor</option>
            </select></div>
          <div class="field" style="margin:0"><label>Zorluk</label>
            <select class="select" id="difficulty"><option value="">Tümü</option><option>Kolay</option><option>Normal</option><option>Zor</option><option>Uzman</option><option>Ustaca</option></select></div>
          <div class="field" style="margin:0"><label>BPM (min)</label><input class="input" id="bpmMin" type="number" min="20" max="400" placeholder="—" value="${esc(state.bpmMin)}"></div>
          <div class="field" style="margin:0"><label>BPM (maks)</label><input class="input" id="bpmMax" type="number" min="20" max="400" placeholder="—" value="${esc(state.bpmMax)}"></div>
          <div class="field" style="margin:0"><label>Maks. uzunluk</label>
            <select class="select" id="lenMax"><option value="">Sınırsız</option><option value="60000">1 dakika</option><option value="120000">2 dakika</option><option value="180000">3 dakika</option><option value="300000">5 dakika</option></select></div>
        </div>
      </div>
      <div id="results"></div>
    </div>`;

  $('#series-bar').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-series]');
    if (!btn) return;
    state.series = btn.dataset.series;
    state.offset = 0;
    for (const b of $('#series-bar').querySelectorAll('.series-chip')) b.classList.toggle('active', b.dataset.series === state.series);
    load();
  });

  $('#sort').value = state.sort;
  $('#difficulty').value = state.difficulty;
  $('#lenMax').value = state.lenMax;

  const load = async () => {
    const host = $('#results');
    host.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
    const qs = new URLSearchParams({ sort: state.sort, limit: String(state.limit), offset: String(state.offset) });
    for (const k of ['q', 'difficulty', 'bpmMin', 'bpmMax', 'lenMax']) if (state[k]) qs.set(k, state[k]);
    if (state.series) qs.set('series', state.series);
    const data = await api(`/charts?${qs}`);
    // "Vibrix" sekmesi Apocalypse paketini dışarıda bırakır
    const active = SERIES.find((sr) => sr.key === state.series);
    const charts = active?.exclude
      ? data.charts.filter((c) => !new RegExp(active.exclude, 'i').test(c.songTitle))
      : data.charts;
    if (!charts.length) {
      host.innerHTML = `<div class="card empty-state">${icon('compass')}<h3>Sonuç bulunamadı</h3><p>Arama terimini veya filtreleri değiştirin.</p></div>`;
      return;
    }
    host.innerHTML = `
      <div class="row between" style="margin-bottom:14px"><span class="muted small">${fmtNum(active?.exclude ? charts.length : data.total)} grafik</span></div>
      <div class="chart-grid">
        ${charts.map((c) => `
          <article class="chart-card">
            <a href="/chart/${c.id}" data-link class="chart-cover">${coverHtml(c)}
              <div class="top-badges"><span class="badge accent">Lv.${c.difficultyLevel}</span>${c.isDemo ? '<span class="badge demo">Demo</span>' : ''}${c.isAutoChart ? '<span class="badge ai">AI</span>' : ''}</div>
              <div class="overlay"><span class="btn btn-primary btn-sm">${icon('eye')} İncele</span></div>
            </a>
            <div class="chart-body">
              <div class="chart-title">${esc(c.songTitle)}</div>
              <div class="chart-artist">${esc(c.artist || 'Bilinmeyen sanatçı')}</div>
              <div class="row wrap" style="gap:8px">${diffBadge(c.difficulty)}<span class="muted small">${c.noteCount} nota · ${fmtDuration(c.lengthMs)}</span></div>
              <div class="chart-meta"><span>BPM <b>${esc(String(c.bpm))}</b></span><span>Oynanma <b>${fmtNum(c.playCount)}</b></span>${c.topScore ? `<span>Rekor <b>${fmtNum(c.topScore)}</b></span>` : ''}</div>
              <div class="chart-foot">
                <a class="muted small" href="/oyuncu/${encodeURIComponent(c.owner)}" data-link>${icon('user')} ${esc(c.owner || '')}</a>
                <button class="btn btn-sm btn-primary" data-play="${c.id}">${icon('play')}</button>
              </div>
            </div>
          </article>`).join('')}
      </div>
      ${paginationHtml(data)}`;
    host.querySelectorAll('[data-play]').forEach((b) => b.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
      const launch = await ensureEngine();
      await launch({ chartId: Number(b.dataset.play) });
    }));
    host.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => {
      state.offset = (Number(b.dataset.page) - 1) * state.limit; load();
    }));
  };

  $('#q').addEventListener('input', debounce((e) => { state.q = e.target.value.trim(); state.offset = 0; load(); }, 300));
  for (const id of ['sort', 'difficulty', 'bpmMin', 'bpmMax', 'lenMax']) {
    const el = $(`#${id}`);
    el.addEventListener('change', () => { state[id] = el.value; state.offset = 0; load(); });
  }
  await load();
}
