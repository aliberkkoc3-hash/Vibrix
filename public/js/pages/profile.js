/* Vibrix — oyuncu profili (kendi ve genel) */
import { api, auth, $, esc, fmtNum, fmtAcc, fmtDate, timeAgo, avatarHtml, rankBadge, diffBadge, coverHtml, positionBadge, navigate, toast } from '../app.js';
import { icon } from '../icons.js';

function statsGrid(s) {
  return `
    <div class="kpi">
      <div class="card"><div class="stat-tile"><span class="label">Global Sıra</span><span class="value">${s.globalRank ? '#' + s.globalRank : '—'}</span><span class="foot">${s.rankedPlayers} sıralanmış oyuncu</span></div></div>
      <div class="card"><div class="stat-tile"><span class="label">Rating</span><span class="value">${s.rating.toFixed(1)}</span><span class="foot">Zirve ${s.peakRating.toFixed(1)}</span></div></div>
      <div class="card"><div class="stat-tile"><span class="label">Toplam Skor</span><span class="value">${fmtNum(s.totalScore)}</span><span class="foot">${fmtNum(s.plays)} oynanış</span></div></div>
      <div class="card"><div class="stat-tile"><span class="label">En İyi Doğruluk</span><span class="value">${fmtAcc(s.bestAccuracy)}</span><span class="foot">En iyi derece: ${s.bestRank || '—'}</span></div></div>
      <div class="card"><div class="stat-tile"><span class="label">Maks. Kombo</span><span class="value">${fmtNum(s.bestCombo)}</span><span class="foot">${fmtNum(s.fullCombos)} full combo</span></div></div>
      <div class="card"><div class="stat-tile"><span class="label">Perfect FC</span><span class="value">${fmtNum(s.perfectFullCombos)}</span><span class="foot">${fmtNum(s.misses)} toplam miss</span></div></div>
      <div class="card"><div class="stat-tile"><span class="label">Grafik</span><span class="value sm">${s.chartsPlayed} / ${s.chartsCreated}</span><span class="foot">oynanan / oluşturulan</span></div></div>
      <div class="card"><div class="stat-tile"><span class="label">Oynama Süresi</span><span class="value sm">${s.playtimeMs ? Math.round(s.playtimeMs / 60000) + ' dk' : '0 dk'}</span><span class="foot">${fmtNum(s.notesHit)} nota isabet</span></div></div>
    </div>`;
}

function recordsTable(records) {
  if (!records.length) {
    return `<div class="card empty-state">${icon('award')}<h3>Henüz rekor yok</h3><p>Grafik oynayarak kişisel rekorlarını oluştur.</p></div>`;
  }
  return `
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>Grafik</th><th>Zorluk</th><th>Skor</th><th>Doğruluk</th><th>Kombo</th><th>Derece</th><th>Tarih</th></tr></thead>
        <tbody>
          ${records.map((r) => `
            <tr>
              <td><a href="/chart/${r.chartId}" data-link class="player-cell"><span style="width:34px;height:34px;border-radius:8px;overflow:hidden;display:block">${coverHtml(r)}</span><span>${esc(r.songTitle)}</span></a></td>
              <td>${diffBadge(r.difficulty)}</td>
              <td class="num"><strong>${fmtNum(r.score)}</strong></td>
              <td class="num">${fmtAcc(r.accuracy)}</td>
              <td class="num">${fmtNum(r.maxCombo)}</td>
              <td>${rankBadge(r.rank)}</td>
              <td class="muted small">${fmtDate(r.achievedAt)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function recentList(recent) {
  if (!recent.length) return `<div class="card empty-state">${icon('clock')}<h3>Henüz oynanış yok</h3></div>`;
  return `<div class="card">${recent.map((r) => `
    <div class="list-row">
      <a href="/chart/${r.chartId}" data-link style="width:42px;height:42px;border-radius:10px;overflow:hidden;display:block;flex:0 0 auto">${coverHtml(r)}</a>
      <div class="grow"><div class="title">${esc(r.songTitle)}</div>
        <div class="meta">${esc(r.difficulty)} · ${fmtAcc(r.accuracy)} · ${timeAgo(r.submittedAt)}${r.validationStatus === 'suspicious' ? ' · <span style="color:#fca5a5">şüpheli</span>' : ''}</div></div>
      <div style="text-align:right"><div class="mono" style="font-weight:700">${fmtNum(r.score)}</div>${rankBadge(r.rank)}</div>
    </div>`).join('')}</div>`;
}

function publishedList(charts) {
  if (!charts.length) return `<div class="card empty-state">${icon('library')}<h3>Yayınlanmış grafik yok</h3></div>`;
  return `<div class="grid cols-2">${charts.map((c) => `
    <a href="/chart/${c.id}" data-link class="card hoverable" style="display:flex;gap:14px;align-items:center">
      <span style="width:58px;height:58px;border-radius:12px;overflow:hidden;flex:0 0 auto;display:block">${coverHtml(c)}</span>
      <span style="min-width:0">
        <span class="title" style="display:block;font-weight:700">${esc(c.song_title)}</span>
        <span class="muted small">${esc(c.artist || '')} · BPM ${c.bpm} · ${c.note_count} nota</span>
        <span class="row" style="gap:8px;margin-top:4px">${diffBadge(c.difficulty)}<span class="muted small">${fmtNum(c.play_count)} oynanma</span></span>
      </span>
    </a>`).join('')}</div>`;
}

export async function renderMine({ main }) {
  if (!auth.user) { navigate('/giris'); return; }
  const data = await api('/me/overview');
  const [pub, hist] = await Promise.all([api('/charts?limit=50'), api('/me/history?limit=20')]);
  const myCharts = pub.charts.filter((c) => c.ownerId === auth.user.id);
  const u = data.user;
  main.innerHTML = `
    <div class="page">
      <div class="card" style="display:flex;gap:22px;align-items:center;flex-wrap:wrap;margin-bottom:20px">
        ${avatarHtml(u, 'lg')}
        <div style="flex:1;min-width:220px">
          <div class="row wrap" style="gap:10px;align-items:center"><h1 style="margin-bottom:2px">${esc(u.username)}</h1>${esc(u.username).toLowerCase() === 'prism crew' ? '<span class="badge studio" title="Vibrix içerik stüdyosu">Stüdyo</span>' : ''}</div>
          <p class="muted small">Katılım: ${fmtDate(u.createdAt)} · <span class="badge accent">Standart Üye</span></p>
          <p style="margin-top:8px;color:var(--text-2)" id="bio-text">${esc(u.bio || 'Henüz biyografi yok.')}</p>
        </div>
        <div class="row" style="gap:8px">
          <a class="btn btn-ghost btn-sm" href="/ayarlar" data-link>${icon('settings')} Ayarlar</a>
          <button class="btn btn-ghost btn-sm" id="edit-profile">${icon('edit')} Profili Düzenle</button>
        </div>
      </div>
      <div id="edit-panel"></div>
      ${statsGrid(data.stats)}
      <section class="section">
        <div class="section-head"><h2>${icon('award')} Kişisel Rekorlar</h2><a class="btn btn-sm btn-ghost" href="/liderlik" data-link>Tüm sıralamalar</a></div>
        ${recordsTable(data.records)}
      </section>
      <section class="section grid cols-2" style="align-items:start">
        <div>
          <div class="section-head"><h2>${icon('clock')} Son Oynanışlar</h2></div>
          ${recentList(data.recent)}
        </div>
        <div>
          <div class="section-head"><h2>${icon('library')} Yayınladığım Grafikler</h2><a class="btn btn-sm btn-ghost" href="/chartlarim" data-link>Yönet</a></div>
          ${publishedList(myCharts)}
        </div>
      </section>
      <section class="section">
        <div class="section-head"><h2>${icon('chart')} Oynanış Geçmişi</h2></div>
        ${hist.attempts.length ? `<div class="table-wrap"><table class="data">
          <thead><tr><th>Grafik</th><th>Skor</th><th>Doğruluk</th><th>Derece</th><th>Durum</th><th>Tarih</th></tr></thead>
          <tbody>${hist.attempts.map((a) => `
            <tr>
              <td><a href="/chart/${a.chartId}" data-link>${esc(a.songTitle)}</a></td>
              <td class="num">${fmtNum(a.score)}</td>
              <td class="num">${fmtAcc(a.accuracy)}</td>
              <td>${rankBadge(a.rank)}</td>
              <td>${a.isTest ? '<span class="badge warn">Test</span>' : a.validationStatus === 'valid' ? '<span class="badge success">Geçerli</span>' : '<span class="badge error">Şüpheli</span>'}</td>
              <td class="muted small">${timeAgo(a.submittedAt)}</td>
            </tr>`).join('')}</tbody>
        </table></div>` : '<div class="card empty-state"><h3>Kayıt yok</h3></div>'}
      </section>
    </div>`;

  $('#edit-profile').addEventListener('click', () => {
    const panel = $('#edit-panel');
    if (panel.innerHTML) { panel.innerHTML = ''; return; }
    panel.innerHTML = `
      <div class="card" style="margin-bottom:20px">
        <div class="card-title">${icon('edit')} Profili Düzenle</div>
        <div class="grid cols-2">
          <div class="field"><label>Biyografi</label><textarea class="textarea" id="bio-input" maxlength="280" placeholder="Kendinden bahset…">${esc(u.bio || '')}</textarea></div>
          <div class="field"><label>Profil Resmi URL (isteğe bağlı)</label><input class="input" id="avatar-input" placeholder="https://…" value="${esc(u.avatar || '')}"><span class="hint">Boş bırakırsan baş harflerinden avatar oluşturulur.</span></div>
        </div>
        <div class="row"><button class="btn btn-primary" id="save-profile">${icon('save')} Kaydet</button></div>
      </div>`;
    $('#save-profile').addEventListener('click', async () => {
      try {
        const r = await api('/auth/me', { method: 'PATCH', body: { bio: $('#bio-input').value.trim(), avatar: $('#avatar-input').value.trim() || null } });
        auth.user = r.user;
        $('#bio-text').textContent = r.user.bio || 'Henüz biyografi yok.';
        toast('Profil güncellendi.', 'success');
        panel.innerHTML = '';
      } catch (e) { toast(e.message, 'error'); }
    });
  });
}

export async function renderPublic({ params, main }) {
  const data = await api(`/users/${encodeURIComponent(params.username)}`);
  const u = data.user;
  const isMe = auth.user && auth.user.id === u.id;
  main.innerHTML = `
    <div class="page">
      <div class="card" style="display:flex;gap:22px;align-items:center;flex-wrap:wrap;margin-bottom:20px">
        ${avatarHtml(u, 'lg')}
        <div style="flex:1;min-width:220px">
          <div class="row" style="gap:10px"><h1 style="margin:0">${esc(u.username)}</h1>${isMe ? '<span class="badge info">Bu sensin</span>' : ''}${esc(u.username).toLowerCase() === 'prism crew' ? '<span class="badge studio" title="Vibrix içerik stüdyosu">Stüdyo</span>' : ''}</div>
          <p class="muted small">Katılım: ${fmtDate(u.createdAt)} · Son görülme: ${u.lastSeenAt ? timeAgo(u.lastSeenAt) : '—'}</p>
          <p style="margin-top:8px;color:var(--text-2)">${esc(u.bio || 'Bu oyuncu henüz biyografi eklememiş.')}</p>
        </div>
        ${isMe ? `<a class="btn btn-ghost btn-sm" href="/profil" data-link>${icon('settings')} Profilimi Düzenle</a>` : ''}
      </div>
      ${statsGrid(data.stats)}
      ${data.ratingHistory.length > 1 ? `<section class="section"><div class="card"><div class="card-title">${icon('chart')} Rating Geçmişi</div>${ratingSpark(data.ratingHistory)}</div></section>` : ''}
      <section class="section">
        <div class="section-head"><h2>${icon('award')} Kişisel Rekorlar</h2></div>
        ${recordsTable(data.records)}
      </section>
      <section class="section grid cols-2" style="align-items:start">
        <div><div class="section-head"><h2>${icon('clock')} Son Oynanışlar</h2></div>${recentList(data.recent)}</div>
        <div><div class="section-head"><h2>${icon('library')} Yayınladığı Grafikler</h2></div>${publishedList(data.publishedCharts)}</div>
      </section>
    </div>`;
}

function ratingSpark(history) {
  const w = 640, h = 120, pad = 8;
  const values = history.map((h) => h.rating);
  const min = Math.min(...values), max = Math.max(...values);
  const span = Math.max(1, max - min);
  const pts = history.map((p, i) => {
    const x = pad + (i / Math.max(1, history.length - 1)) * (w - pad * 2);
    const y = h - pad - ((p.rating - min) / span) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:120px" preserveAspectRatio="none">
    <polyline points="${pts}" fill="none" stroke="#A78BFA" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
  </svg><p class="muted small">Son ${history.length} rating değişimi · güncel ${values[values.length - 1].toFixed(2)}</p>`;
}
