/* Vibrix — ana sayfa (dashboard) */
import { api, auth, $, esc, ensureEngine, fmtNum, fmtAcc, fmtDuration, avatarHtml, rankBadge, diffBadge, coverHtml, navigate, positionBadge } from '../app.js';
import { icon } from '../icons.js';

function chartCard(c) {
  return `
    <article class="chart-card">
      <a href="/chart/${c.id}" data-link class="chart-cover" aria-label="${esc(c.songTitle)} grafiğini aç">
        ${coverHtml(c)}
        <div class="top-badges">
          <span class="badge accent">Lv.${c.difficultyLevel}</span>
          ${c.isDemo ? '<span class="badge demo">Demo</span>' : ''}
          ${c.isAutoChart ? '<span class="badge ai">AI</span>' : ''}
        </div>
        <div class="overlay"><span class="btn btn-primary btn-sm">${icon('play')} Oyna</span></div>
      </a>
      <div class="chart-body">
        <div class="chart-title" title="${esc(c.songTitle)}">${esc(c.songTitle)}</div>
        <div class="chart-artist">${esc(c.artist || 'Bilinmeyen sanatçı')}</div>
        <div class="row wrap" style="gap:8px">${diffBadge(c.difficulty)}<span class="muted small">${c.noteCount} nota · ${fmtDuration(c.lengthMs)}</span></div>
        <div class="chart-meta">
          <span>BPM <b>${esc(String(c.bpm))}</b></span>
          <span>Oynanma <b>${fmtNum(c.playCount)}</b></span>
          ${c.topScore ? `<span>En iyi <b>${fmtNum(c.topScore)}</b></span>` : ''}
        </div>
        <div class="chart-foot">
          <span class="muted small">${esc(c.owner || '')}</span>
          <button class="btn btn-sm btn-ghost" data-play="${c.id}" title="Hemen oyna">${icon('play')}</button>
        </div>
      </div>
    </article>`;
}

function bindPlayButtons(root) {
  root.querySelectorAll('[data-play]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const launch = await ensureEngine();
      await launch({ chartId: Number(btn.getAttribute('data-play')) });
    });
  });
}

export async function render({ main }) {
  const user = auth.user;
  const [trending, fresh, stats] = await Promise.all([
    api('/charts?sort=trending&limit=4'),
    api('/charts?sort=newest&limit=4'),
    api('/leaderboard?period=all&limit=5'),
  ]);
  let me = null;
  let overview = null;
  if (user) {
    try {
      [overview] = await Promise.all([api('/me/overview')]);
      me = overview;
    } catch { me = null; }
  }

  const greeting = user ? `Tekrar hoş geldin, <span class="gradient-text">${esc(user.username)}</span>` : 'Ritmi hisset. <span class="gradient-text">Rekabet et.</span>';
  const sub = user
    ? 'En iyi performansın seni bekliyor. Yeni bir rekor kırmaya hazır mısın?'
    : 'Vibrix, 4K ritim oyunu ve topluluk grafikleriyle rekabetçi bir ritim platformudur. Oyna, kendi grafiklerini yap, liderlik tablolarında yüksel.';

  const statTiles = user && me ? `
    <div class="kpi">
      <div class="card"><div class="stat-tile">
        <span class="label">Toplam Skor</span><span class="value">${fmtNum(me.stats.totalScore)}</span>
        <span class="foot">${fmtNum(me.stats.plays)} oynanış</span>
      </div></div>
      <div class="card"><div class="stat-tile">
        <span class="label">En İyi Doğruluk</span><span class="value">${fmtAcc(me.stats.bestAccuracy)}</span>
        <span class="foot">${fmtNum(me.stats.bestCombo)} maks. kombo</span>
      </div></div>
      <div class="card"><div class="stat-tile">
        <span class="label">Rekabetçi Rating</span><span class="value">${me.stats.rating.toFixed(1)}</span>
        <span class="foot">${me.stats.globalRank ? `#${me.stats.globalRank} / ${me.stats.rankedPlayers} oyuncu` : 'Henüz sıralanmadı'}</span>
      </div></div>
      <div class="card"><div class="stat-tile">
        <span class="label">Oynama Süresi</span><span class="value sm">${me.stats.playtimeMs ? Math.round(me.stats.playtimeMs / 60000) + ' dk' : '0 dk'}</span>
        <span class="foot">${me.stats.chartsPlayed} farklı grafik</span>
      </div></div>
    </div>` : '';

  const recentPlays = user && me && me.recent.length ? `
    <div class="card">
      <div class="card-title">${icon('clock')} Son Oynanışlar</div>
      ${me.recent.slice(0, 6).map((r) => `
        <div class="list-row">
          <a href="/chart/${r.chartId}" data-link style="width:44px;height:44px;border-radius:10px;overflow:hidden;flex:0 0 auto;display:block">${coverHtml(r)}</a>
          <div class="grow">
            <div class="title">${esc(r.songTitle)}</div>
            <div class="meta">${esc(r.difficulty)} · ${fmtAcc(r.accuracy)} · ${fmtNum(r.maxCombo)} kombo</div>
          </div>
          <div style="text-align:right">
            <div class="mono" style="font-weight:700">${fmtNum(r.score)}</div>
            ${rankBadge(r.rank)}
          </div>
        </div>`).join('')}
    </div>` : '';

  const records = user && me && me.records.length ? `
    <div class="card">
      <div class="card-title">${icon('award')} Kişisel Rekorlar</div>
      ${me.records.slice(0, 6).map((r) => `
        <div class="list-row">
          <a href="/chart/${r.chartId}" data-link style="width:44px;height:44px;border-radius:10px;overflow:hidden;flex:0 0 auto;display:block">${coverHtml(r)}</a>
          <div class="grow">
            <div class="title">${esc(r.songTitle)}</div>
            <div class="meta">${esc(r.difficulty)} · ${fmtAcc(r.accuracy)}</div>
          </div>
          <div style="text-align:right">
            <div class="mono" style="font-weight:700">${fmtNum(r.score)}</div>
            ${rankBadge(r.rank)}
          </div>
        </div>`).join('')}
    </div>` : '';

  const lbPreview = `
    <div class="card">
      <div class="card-title">${icon('trophy')} Global Liderlik Tablosu</div>
      ${stats.entries.length ? stats.entries.map((e) => `
        <div class="list-row">
          ${positionBadge(e.position)}
          <a href="/oyuncu/${encodeURIComponent(e.username)}" data-link class="player-cell" style="flex:1;min-width:0">
            ${avatarHtml(e, 'sm')}<span style="font-weight:600">${esc(e.username)}</span>
          </a>
          <span class="mono" style="font-weight:700">${fmtNum(e.totalScore)}</span>
        </div>`).join('') : '<p class="muted small">Henüz sıralanmış oyuncu yok. İlk sen ol!</p>'}
      <a class="btn btn-ghost btn-sm btn-block" href="/liderlik" data-link style="margin-top:12px">Tümünü gör</a>
    </div>`;

  main.innerHTML = `
    <div class="page">
      <section class="hero">
        <svg class="hero-art" viewBox="0 0 400 400" fill="none" aria-hidden="true">
          <circle cx="240" cy="160" r="120" stroke="#8B5CF6" stroke-opacity=".35" stroke-width="1.5"/>
          <circle cx="240" cy="160" r="80" stroke="#C084FC" stroke-opacity=".3" stroke-width="1.5"/>
          <circle cx="240" cy="160" r="40" stroke="#A78BFA" stroke-opacity=".4" stroke-width="1.5"/>
          <path d="M120 260 L200 60 L260 200 L340 100" stroke="#A78BFA" stroke-opacity=".5" stroke-width="2"/>
        </svg>
        <div class="eyebrow">Rekabetçi ritim platformu</div>
        <h1>${greeting}</h1>
        <p class="lead">${esc(sub)}</p>
        <div class="actions">
          <a class="btn btn-primary btn-lg" href="/oyna" data-link>${icon('play')} Oynamaya Başla</a>
          <a class="btn btn-ghost btn-lg" href="/kesfet" data-link>${icon('compass')} Grafikleri Keşfet</a>
          ${user ? '' : `<a class="btn btn-ghost btn-lg" href="/kayit" data-link>${icon('user')} Hesap Oluştur</a>`}
        </div>
        <div class="hero-stats">
          <div class="stat-tile"><span class="label">Yayınlanan Grafik</span><span class="value sm">${fmtNum(fresh.total)}</span></div>
          <div class="stat-tile"><span class="label">Sıralanmış Oyuncu</span><span class="value sm">${fmtNum(stats.total)}</span></div>
          <div class="stat-tile"><span class="label">Mod</span><span class="value sm">4K VSRG</span></div>
        </div>
      </section>

      ${statTiles ? `<section class="section">${statTiles}</section>` : ''}

      <section class="section">
        <div class="section-head">
          <h2>${icon('flame')} Trend Olanlar</h2>
          <a class="btn btn-sm btn-ghost" href="/kesfet?sort=trending" data-link>Keşfet</a>
        </div>
        ${trending.charts.length ? `<div class="chart-grid">${trending.charts.map(chartCard).join('')}</div>` : `<div class="card empty-state">${icon('music')}<h3>Henüz grafik yok</h3><p>İlk grafiği sen oluştur.</p></div>`}
      </section>

      <section class="section">
        <div class="grid cols-2" style="align-items:start">
          <div class="grid" style="gap:18px">
            ${user ? (recentPlays || `<div class="card empty-state">${icon('clock')}<h3>Henüz oynanış yok</h3><p>Bir grafik seç ve ilk skorunu kaydet.</p><div style="margin-top:14px"><a class="btn btn-primary btn-sm" href="/kesfet" data-link>Grafik Bul</a></div></div>`) : `
              <div class="card">
                <div class="card-title">${icon('sparkles')} Neler Yapabilirsin?</div>
                <div class="list-row"><div class="grow"><div class="title">Rekabetçi oyna</div><div class="meta">4K ritim oynanışı, KUSURSUZ'dan KAÇTI'ya zamanlama tabanlı yargılama.</div></div></div>
                <div class="list-row"><div class="grow"><div class="title">Kendi grafiğini yap</div><div class="meta">Gelişmiş chart editörü ile nota yerleştir, test et ve yayınla.</div></div></div>
                <div class="list-row"><div class="grow"><div class="title">Liderlik tablolarında yüksel</div><div class="meta">Harita bazlı ve global sıralamalarda yerini al.</div></div></div>
                <a class="btn btn-primary btn-sm btn-block" href="/kayit" data-link style="margin-top:14px">Ücretsiz Kayıt Ol</a>
              </div>`}
            ${records}
          </div>
          ${lbPreview}
        </div>
      </section>

      <section class="section">
        <div class="section-head">
          <h2>${icon('music')} Yeni Yayınlananlar</h2>
          <a class="btn btn-sm btn-ghost" href="/kesfet?sort=newest" data-link>Keşfet</a>
        </div>
        ${fresh.charts.length ? `<div class="chart-grid">${fresh.charts.map(chartCard).join('')}</div>` : ''}
      </section>

      <section class="section">
        <div class="card" style="display:flex;gap:18px;align-items:center;justify-content:space-between;flex-wrap:wrap">
          <div>
            <div class="eyebrow">Chart Editor</div>
            <h2 style="margin:6px 0 4px">Kendi grafiğini oluştur</h2>
            <p class="muted small">Ses dosyanı yükle, notaları yerleştir, hold notaları düzenle, test et ve topluluğa yayınla.</p>
          </div>
          <a class="btn btn-accent" href="/editor" data-link>${icon('edit')} Editörü Aç</a>
        </div>
      </section>
    </div>`;

  bindPlayButtons(main);
}
