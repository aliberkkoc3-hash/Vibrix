/* Vibrix — global liderlik tablosu */
import { api, auth, $, esc, fmtNum, fmtAcc, avatarHtml, positionBadge, paginationHtml, debounce } from '../app.js';
import { icon } from '../icons.js';

const state = { period: 'all', mode: 'score', q: '', offset: 0, limit: 25 };

export async function render({ main }) {
  main.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Rekabet</div>
          <h1>Liderlik Tablosu</h1>
          <p class="sub">Oyuncular dönemdeki en iyi performanslarının toplamıyla sıralanır.</p>
        </div>
        <button class="btn btn-ghost" id="refresh">${icon('refresh')} Yenile</button>
      </div>
      <div class="row between wrap" style="margin-bottom:18px">
        <div class="tabs" id="period-tabs">
          <button class="tab active" data-period="all">Tüm Zamanlar</button>
          <button class="tab" data-period="weekly">Haftalık</button>
          <button class="tab" data-period="monthly">Aylık</button>
        </div>
        <div class="tabs" id="mode-tabs">
          <button class="tab active" data-mode="score">Skor Sıralaması</button>
          <button class="tab" data-mode="rating">Rating Sıralaması</button>
        </div>
      </div>
      <div class="toolbar">
        <div class="search-box">${icon('search')}<input class="input" id="q" placeholder="Oyuncu ara…"></div>
      </div>
      <div id="lb-body"></div>
    </div>`;

  const load = async () => {
    const host = $('#lb-body');
    host.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
    if (state.mode === 'rating') {
      const data = await api(`/rating-leaderboard?limit=${state.limit}&offset=${state.offset}`);
      host.innerHTML = renderRatingTable(data);
      bindPages(host, load, data);
      return;
    }
    const qs = new URLSearchParams({ period: state.period, limit: String(state.limit), offset: String(state.offset) });
    if (state.q) qs.set('q', state.q);
    const data = await api(`/leaderboard?${qs}`);
    host.innerHTML = renderScoreTable(data);
    bindPages(host, load, data);
  };

  const bindPages = (host, reload, data) => {
    host.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => {
      state.offset = (Number(b.dataset.page) - 1) * state.limit;
      reload();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
  };

  const renderScoreTable = (data) => {
    if (!data.entries.length) {
      return `<div class="card empty-state">${icon('trophy')}<h3>Henüz sıralama yok</h3><p>Bu dönemde doğrulanmış oynanış bulunmuyor. İlk sırayı sen al!</p><div style="margin-top:14px"><a class="btn btn-primary btn-sm" href="/kesfet" data-link>Grafik Oyna</a></div></div>`;
    }
    const my = data.myPosition;
    return `
      ${my ? `<div class="card" style="margin-bottom:14px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <span class="badge accent">Senin sıran</span>
        <strong>#${my.position}</strong>
        <span class="mono">${fmtNum(my.totalScore)} puan</span>
        <span class="muted small">${my.plays} oynanış · ${my.chartsPlayed} grafik</span>
      </div>` : ''}
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>#</th><th>Oyuncu</th><th>Toplam Skor</th><th>En İyi</th><th>Doğruluk</th><th>Oynanış</th><th>Rating</th></tr></thead>
          <tbody>
            ${data.entries.map((e) => `
              <tr class="${auth.user && e.userId === auth.user.id ? 'me' : ''} ${e.position <= 3 ? 'podium-' + e.position : ''}">
                <td>${positionBadge(e.position)}</td>
                <td><a class="player-cell" href="/oyuncu/${encodeURIComponent(e.username)}" data-link>${avatarHtml(e, 'sm')}<span>${esc(e.username)}</span></a></td>
                <td class="num"><strong>${fmtNum(e.totalScore)}</strong></td>
                <td class="num muted">${fmtNum(e.bestScore)}</td>
                <td class="num">${fmtAcc(e.bestAccuracy)}</td>
                <td class="num">${e.plays}</td>
                <td class="num">${e.rating ? e.rating.toFixed(1) : '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${paginationHtml({ total: data.total, limit: state.limit, offset: state.offset })}`;
  };

  const renderRatingTable = (data) => {
    if (!data.entries.length) {
      return `<div class="card empty-state">${icon('award')}<h3>Henüz rating yok</h3><p>Rating, yayınlanmış grafiklerde kişisel rekor kırıldığında kazanılır.</p></div>`;
    }
    return `
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>#</th><th>Oyuncu</th><th>Rating</th><th>Zirve</th><th>Dereceli Oynanış</th></tr></thead>
          <tbody>
            ${data.entries.map((e) => `
              <tr class="${auth.user && e.userId === auth.user.id ? 'me' : ''} ${e.position <= 3 ? 'podium-' + e.position : ''}">
                <td>${positionBadge(e.position)}</td>
                <td><a class="player-cell" href="/oyuncu/${encodeURIComponent(e.username)}" data-link>${avatarHtml(e, 'sm')}<span>${esc(e.username)}</span></a></td>
                <td class="num"><strong>${e.rating.toFixed(2)}</strong></td>
                <td class="num muted">${e.peakRating.toFixed(2)}</td>
                <td class="num">${e.ratedPlays}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${paginationHtml({ total: data.total, limit: state.limit, offset: state.offset })}
      <p class="muted small" style="margin-top:12px">Rating yalnızca kişisel rekor gelişimlerinde güncellenir. Hesap detayı için <a href="/ayarlar#scoring" data-link>puanlama sistemi</a>.</p>`;
  };

  $('#period-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('.tab'); if (!b) return;
    state.period = b.dataset.period; state.offset = 0;
    $('#period-tabs').querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === b));
    load();
  });
  $('#mode-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('.tab'); if (!b) return;
    state.mode = b.dataset.mode; state.offset = 0;
    $('#mode-tabs').querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === b));
    $('#q').parentElement.style.display = state.mode === 'rating' ? 'none' : '';
    load();
  });
  $('#q').addEventListener('input', debounce((e) => { state.q = e.target.value.trim(); state.offset = 0; load(); }, 300));
  $('#refresh').addEventListener('click', load);
  await load();
}
