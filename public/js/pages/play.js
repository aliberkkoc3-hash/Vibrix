/* Vibrix — oynanacak grafik seçimi */
import { api, $, esc, ensureEngine, fmtNum, fmtDuration, diffBadge, coverHtml, navigate, debounce, paginationHtml } from '../app.js';
import { icon } from '../icons.js';

const state = { q: '', sort: 'popular', difficulty: '', offset: 0, limit: 18 };

export async function render({ main }) {
  const params = new URLSearchParams(location.search);
  if (params.get('chart')) return navigate(`/chart/${params.get('chart')}`, { replace: true });
  if (params.get('q')) state.q = params.get('q');
  if (params.get('sort')) state.sort = params.get('sort');

  main.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Oyna</div>
          <h1>Grafik Seç</h1>
          <p class="sub">Bir grafik seç ve oynamaya başla. Tuşlar: <b class="mono">D F J K</b></p>
        </div>
        <a class="btn btn-ghost" href="/kesfet" data-link>${icon('compass')} Keşfet</a>
      </div>
      <div class="toolbar">
        <div class="search-box">${icon('search')}<input class="input" id="q" placeholder="Şarkı, sanatçı veya oluşturucu ara…" value="${esc(state.q)}"></div>
        <select class="select" id="sort" style="max-width:200px">
          <option value="popular">En Çok Oynanan</option>
          <option value="newest">En Yeni</option>
          <option value="trending">Trend</option>
          <option value="alpha">Alfabetik</option>
          <option value="best">En Yüksek Skor</option>
        </select>
        <select class="select" id="difficulty" style="max-width:170px">
          <option value="">Tüm Zorluklar</option>
          <option>Kolay</option><option>Normal</option><option>Zor</option><option>Uzman</option><option>Ustaca</option>
        </select>
      </div>
      <div id="results"></div>
    </div>`;

  $('#sort').value = state.sort;
  $('#difficulty').value = state.difficulty;
  const load = async () => {
    const host = $('#results');
    host.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
    const qs = new URLSearchParams({ sort: state.sort, limit: String(state.limit), offset: String(state.offset) });
    if (state.q) qs.set('q', state.q);
    if (state.difficulty) qs.set('difficulty', state.difficulty);
    const data = await api(`/charts?${qs}`);
    if (!data.charts.length) {
      host.innerHTML = `<div class="card empty-state">${icon('music')}<h3>Grafik bulunamadı</h3><p>Farklı bir arama veya filtre deneyin.</p></div>`;
      return;
    }
    host.innerHTML = `
      <div class="chart-grid">
        ${data.charts.map((c) => `
          <article class="chart-card">
            <a href="/chart/${c.id}" data-link class="chart-cover">${coverHtml(c)}
              <div class="top-badges"><span class="badge accent">Lv.${c.difficultyLevel}</span>${c.isDemo ? '<span class="badge demo">Demo</span>' : ''}${c.isAutoChart ? '<span class="badge ai">AI</span>' : ''}</div>
              <div class="overlay"><span class="btn btn-primary btn-sm">${icon('play')} Oyna</span></div>
            </a>
            <div class="chart-body">
              <div class="chart-title">${esc(c.songTitle)}</div>
              <div class="chart-artist">${esc(c.artist || 'Bilinmeyen sanatçı')}</div>
              <div class="row wrap" style="gap:8px">${diffBadge(c.difficulty)}<span class="muted small">${c.noteCount} nota · ${fmtDuration(c.lengthMs)}</span></div>
              <div class="chart-meta"><span>BPM <b>${esc(String(c.bpm))}</b></span><span>Oynanma <b>${fmtNum(c.playCount)}</b></span></div>
              <div class="chart-foot"><span class="muted small">${esc(c.owner || '')}</span>
                <button class="btn btn-sm btn-primary" data-play="${c.id}">${icon('play')} Oyna</button></div>
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
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; state.offset = 0; load(); });
  $('#difficulty').addEventListener('change', (e) => { state.difficulty = e.target.value; state.offset = 0; load(); });
  await load();
}
