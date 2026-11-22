/* Vibrix — grafik detay sayfası: bilgiler, oyna, liderlik tablosu */
import { api, auth, $, esc, ensureEngine, fmtNum, fmtAcc, fmtDuration, fmtDate, timeAgo, avatarHtml, rankBadge, diffBadge, coverHtml, positionBadge, paginationHtml, navigate, toast } from '../app.js';
import { icon } from '../icons.js';

export async function render({ params, main }) {
  const id = params.id;
  const data = await api(`/charts/${id}`);
  const c = data.chart;
  const isOwner = !!c.isOwner;

  main.innerHTML = `
    <div class="page">
      <div class="row" style="margin-bottom:18px"><a class="btn btn-sm btn-ghost" href="/kesfet" data-link>${icon('chevronLeft')} Keşfet</a></div>
      <div class="card" style="display:grid;grid-template-columns:220px minmax(0,1fr);gap:26px;align-items:start" id="chart-head">
        <div style="position:relative;border-radius:16px;overflow:hidden;aspect-ratio:1/1">${coverHtml(c)}</div>
        <div style="min-width:0">
          <div class="row wrap" style="gap:8px;margin-bottom:8px">
            ${diffBadge(c.difficulty)}<span class="badge accent">Lv.${c.difficultyLevel}</span>
            ${c.isDemo ? '<span class="badge demo">Demo İçerik</span>' : ''}
            ${c.isAutoChart ? '<span class="badge ai">✨ AI ile oluşturuldu</span>' : ''}
            ${c.status === 'draft' ? '<span class="badge warn">Taslak</span>' : ''}
          </div>
          <h1 style="margin-bottom:4px">${esc(c.songTitle)}</h1>
          <p class="muted">${esc(c.artist || 'Bilinmeyen sanatçı')}</p>
          <p style="margin-top:12px;max-width:640px">${esc(c.description || '')}</p>
          <div class="row wrap" style="gap:22px;margin-top:18px">
            <div class="stat-tile"><span class="label">Sahip</span><a href="/oyuncu/${encodeURIComponent(c.owner)}" data-link style="font-weight:600">${esc(c.owner)}</a></div>
            <div class="stat-tile"><span class="label">BPM</span><span class="value sm">${esc(String(c.bpm))}</span></div>
            <div class="stat-tile"><span class="label">Nota</span><span class="value sm">${fmtNum(c.noteCount)}</span></div>
            <div class="stat-tile"><span class="label">Uzunluk</span><span class="value sm">${fmtDuration(c.lengthMs)}</span></div>
            <div class="stat-tile"><span class="label">Oynanma</span><span class="value sm">${fmtNum(c.playCount)}</span></div>
            <div class="stat-tile"><span class="label">Oyuncu</span><span class="value sm">${fmtNum(data.totalPlayers)}</span></div>
          </div>
          <div class="row wrap" style="gap:10px;margin-top:22px">
            <button class="btn btn-primary btn-lg" id="play-btn">${icon('play')} Oyna</button>
            ${isOwner ? `<a class="btn btn-ghost" href="/editor/${c.id}" data-link>${icon('edit')} Düzenle</a>` : ''}
            ${auth.user ? `<button class="btn btn-ghost" id="fav-btn">${icon('heart')} ${c.isFavorite ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}</button>` : ''}
          </div>
        </div>
      </div>

      <div class="section">
        <div class="tabs" id="tabs">
          <button class="tab active" data-tab="lb">Liderlik Tablosu</button>
          <button class="tab" data-tab="mine">Performansım</button>
          <button class="tab" data-tab="info">Bilgiler</button>
        </div>
        <div id="tab-body" style="margin-top:16px"></div>
      </div>
    </div>`;

  const playBtn = $('#play-btn');
  playBtn.addEventListener('click', async () => {
    if (!auth.user) {
      sessionStorage.setItem('vibrix.redirect', `/chart/${c.id}`);
      toast('Skor kaydetmek için oturum açmalısın. Misafir olarak oynayabilirsin.', 'info');
    }
    const launch = await ensureEngine();
    await launch({ chartId: c.id });
  });

  const favBtn = $('#fav-btn');
  if (favBtn) favBtn.addEventListener('click', async () => {
    try {
      const r = await api(`/charts/${c.id}/favorite`, { method: 'POST' });
      c.isFavorite = r.favorite;
      favBtn.innerHTML = `${icon('heart')} ${r.favorite ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}`;
      toast(r.favorite ? 'Favorilere eklendi.' : 'Favorilerden çıkarıldı.', 'success');
    } catch (e) { toast(e.message, 'error'); }
  });

  const tabBody = $('#tab-body');
  let offset = 0;
  const showLb = async () => {
    tabBody.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
    const lb = await api(`/charts/${c.id}/leaderboard?limit=25&offset=${offset}`);
    const myPos = lb.myBest ? lb.myBest.position : null;
    tabBody.innerHTML = `
      <div class="row between wrap" style="margin-bottom:12px">
        <span class="muted small">${fmtNum(lb.total)} kayıtlı oyuncu · Sıralama: skor → doğruluk → kombo → tarih</span>
        ${myPos ? `<span class="badge accent">Sıralaman: #${myPos}</span>` : ''}
      </div>
      ${lb.entries.length ? `
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>#</th><th>Oyuncu</th><th>Skor</th><th>Doğruluk</th><th>Kombo</th><th>Miss</th><th>Derece</th><th>Tarih</th></tr></thead>
          <tbody>
            ${lb.entries.map((e) => `
              <tr class="${auth.user && e.userId === auth.user.id ? 'me' : ''} ${e.position <= 3 ? 'podium-' + e.position : ''}">
                <td>${positionBadge(e.position)}</td>
                <td><a class="player-cell" href="/oyuncu/${encodeURIComponent(e.username)}" data-link>${avatarHtml(e, 'sm')}<span>${esc(e.username)}</span></a></td>
                <td class="num">${fmtNum(e.score)}</td>
                <td class="num">${fmtAcc(e.accuracy)}</td>
                <td class="num">${fmtNum(e.maxCombo)}</td>
                <td class="num">${e.misses}</td>
                <td>${rankBadge(e.rank)}</td>
                <td class="muted small">${fmtDate(e.achievedAt)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${paginationHtml({ total: lb.total, limit: 25, offset })}`
      : `<div class="card empty-state">${icon('trophy')}<h3>Henüz rekor yok</h3><p>Bu grafikte ilk skoru sen kaydet!</p></div>`}`;
    tabBody.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => {
      offset = (Number(b.dataset.page) - 1) * 25; showLb();
    }));
  };

  const showMine = () => {
    const mb = data.myBest;
    tabBody.innerHTML = `
      <div class="grid cols-3">
        <div class="card"><div class="stat-tile"><span class="label">En İyi Skor</span><span class="value">${mb ? fmtNum(mb.score) : '—'}</span><span class="foot">${mb ? `Sıra #${mb.position} · ${mb.playCount} oynanış` : 'Henüz oynamadın'}</span></div></div>
        <div class="card"><div class="stat-tile"><span class="label">Doğruluk</span><span class="value">${mb ? fmtAcc(mb.accuracy) : '—'}</span><span class="foot">${mb ? fmtDate(mb.achievedAt) : ''}</span></div></div>
        <div class="card"><div class="stat-tile"><span class="label">Derece / Kombo</span><span class="value">${mb ? esc(mb.rank) : '—'}</span><span class="foot">${mb ? fmtNum(mb.maxCombo) + ' maks. kombo' : ''}</span></div></div>
      </div>
      ${mb ? '' : `<div class="card empty-state" style="margin-top:16px">${icon('target')}<h3>İlk performansını kaydet</h3><p>Grafiği oynayarak kişisel rekorunu oluştur.</p></div>`}`;
  };

  const showInfo = () => {
    tabBody.innerHTML = `
      <div class="grid cols-2">
        <div class="card">
          <div class="card-title">${icon('info')} Grafik Bilgileri</div>
          <div class="list-row"><span class="muted grow">Grafik No</span><span class="mono">#${c.id}</span></div>
          <div class="list-row"><span class="muted grow">Sahip</span><a href="/oyuncu/${encodeURIComponent(c.owner)}" data-link>${esc(c.owner)}</a></div>
          <div class="list-row"><span class="muted grow">Stüdyo</span><span>Prism Crew</span></div>
          <div class="list-row"><span class="muted grow">BPM / Offset</span><span class="mono">${esc(String(c.bpm))} / ${c.offsetMs}ms</span></div>
          <div class="list-row"><span class="muted grow">Nota sayısı</span><span class="mono">${fmtNum(c.noteCount)}</span></div>
          <div class="list-row"><span class="muted grow">Süre</span><span class="mono">${fmtDuration(c.lengthMs)}</span></div>
          <div class="list-row"><span class="muted grow">Yayınlanma</span><span>${c.publishedAt ? timeAgo(c.publishedAt) : 'Yayınlanmadı'}</span></div>
          <div class="list-row"><span class="muted grow">Son güncelleme</span><span>${timeAgo(c.updatedAt)}</span></div>
        </div>
        <div class="card">
          <div class="card-title">${icon('sliders')} Oynanış Bilgisi</div>
          <p class="muted small">Tuşlar: <b class="mono">D F J K</b> (Ayarlar'dan değiştirilebilir).</p>
          <div class="judge-grid" style="grid-template-columns:repeat(5,1fr)">
            <div class="judge-cell judge-perfect"><div class="k">KUSURSUZ</div><div class="v">±45ms</div></div>
            <div class="judge-cell judge-great"><div class="k">MÜKEMMEL</div><div class="v">±85ms</div></div>
            <div class="judge-cell judge-good"><div class="k">İYİ</div><div class="v">±120ms</div></div>
            <div class="judge-cell judge-bad"><div class="k">ZAYIF</div><div class="v">±165ms</div></div>
            <div class="judge-cell judge-miss"><div class="k">KAÇTI :(</div><div class="v">&gt;165</div></div>
          </div>
          <p class="muted small" style="margin-top:14px">Skor: nota başına 300 (KUSURSUZ) + kombo bonusu (en fazla 50). Derece: SS tüm KUSURSUZ, S ≥98%, A ≥93%, B ≥86%, C ≥75%.</p>
        </div>
      </div>`;
  };

  const tabs = { lb: showLb, mine: showMine, info: showInfo };
  $('#tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    $('#tabs').querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === btn));
    tabs[btn.dataset.tab]();
  });
  await showLb();
}
