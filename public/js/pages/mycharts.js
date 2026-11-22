/* Vibrix — chartlarım: taslak / yayınlanan yönetimi */
import { api, auth, $, esc, ensureEngine, fmtNum, fmtDuration, timeAgo, diffBadge, coverHtml, navigate, toast, confirmDialog } from '../app.js';
import { icon } from '../icons.js';

const state = { tab: 'all' };

export async function render({ main }) {
  if (!auth.user) { navigate('/giris'); return; }
  main.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Grafiklerim</div>
          <h1>Chartlarım</h1>
          <p class="sub">Oluşturduğun grafikleri yönet, düzenle ve yayınla.</p>
        </div>
        <a class="btn btn-primary" href="/editor" data-link>${icon('plus')} Yeni Grafik</a>
      </div>
      <div class="tabs" id="tabs">
        <button class="tab active" data-tab="all">Tümü</button>
        <button class="tab" data-tab="draft">Taslaklar</button>
        <button class="tab" data-tab="published">Yayınlananlar</button>
      </div>
      <div id="list" style="margin-top:18px"></div>
    </div>`;

  const load = async () => {
    const host = $('#list');
    host.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
    const data = await api('/charts/mine');
    let charts = data.charts;
    if (state.tab === 'draft') charts = charts.filter((c) => c.status === 'draft');
    if (state.tab === 'published') charts = charts.filter((c) => c.status === 'published');
    if (!charts.length) {
      host.innerHTML = `<div class="card empty-state">${icon('library')}<h3>Grafik yok</h3><p>${state.tab === 'draft' ? 'Taslak grafiğin bulunmuyor.' : state.tab === 'published' ? 'Henüz yayınlanmış grafiğin yok.' : 'Henüz grafik oluşturmadın.'}</p><div style="margin-top:16px"><a class="btn btn-primary btn-sm" href="/editor" data-link>${icon('plus')} İlk grafiğini oluştur</a></div></div>`;
      return;
    }
    host.innerHTML = `
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Şarkı</th><th>BPM</th><th>Zorluk</th><th>Nota</th><th>Süre</th><th>Oyuncu</th><th>Durum</th><th>Güncelleme</th><th style="text-align:right">İşlem</th></tr></thead>
          <tbody>
            ${charts.map((c) => `
              <tr data-id="${c.id}">
                <td><div class="player-cell"><span style="width:36px;height:36px;border-radius:8px;overflow:hidden;display:block;flex:0 0 auto">${coverHtml(c)}</span>
                  <span><span style="font-weight:600;display:block">${esc(c.songTitle)}</span><span class="muted small">${esc(c.artist || '')}</span></span></div></td>
                <td class="num">${esc(String(c.bpm))}</td>
                <td>${diffBadge(c.difficulty)}</td>
                <td class="num">${fmtNum(c.noteCount)}</td>
                <td class="num">${fmtDuration(c.lengthMs)}</td>
                <td class="num">${fmtNum(c.playerCount)}</td>
                <td>${c.status === 'published' ? '<span class="badge success">Yayında</span>' : '<span class="badge warn">Taslak</span>'}</td>
                <td class="muted small">${timeAgo(c.updatedAt)}</td>
                <td><div class="row" style="justify-content:flex-end;gap:6px;flex-wrap:nowrap">
                  <a class="btn btn-sm btn-ghost" href="/editor/${c.id}" data-link title="Düzenle">${icon('edit')}</a>
                  ${c.status === 'published' ? `<a class="btn btn-sm btn-ghost" href="/chart/${c.id}" data-link title="Aç">${icon('eye')}</a>` : `<button class="btn btn-sm btn-ghost" data-act="test" title="Test et">${icon('play')}</button>`}
                  ${c.status === 'published'
                    ? `<button class="btn btn-sm btn-ghost" data-act="unpublish" title="Yayından kaldır">${icon('eyeOff')}</button>`
                    : `<button class="btn btn-sm btn-primary" data-act="publish" title="Yayınla">${icon('upload')}</button>`}
                  <button class="btn btn-sm btn-danger" data-act="delete" title="Sil">${icon('trash')}</button>
                </div></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    host.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.closest('tr').dataset.id;
        const chart = charts.find((c) => String(c.id) === id);
        const act = btn.dataset.act;
        try {
          if (act === 'publish') {
            await api(`/charts/${id}/publish`, { method: 'POST' });
            toast('Grafik yayınlandı.', 'success');
            load();
          } else if (act === 'unpublish') {
            const ok = await confirmDialog({ title: 'Yayından kaldır', message: `"${chart.songTitle}" grafiği yayından kaldırılacak. Mevcut skorlar korunur ancak grafik keşfette görünmez.`, confirmText: 'Yayından kaldır' });
            if (!ok) return;
            await api(`/charts/${id}/unpublish`, { method: 'POST' });
            toast('Grafik yayından kaldırıldı.', 'info');
            load();
          } else if (act === 'delete') {
            const ok = await confirmDialog({ title: 'Grafiği sil', message: `"${chart.songTitle}" grafiği ve tüm skorları kalıcı olarak silinecek. Bu işlem geri alınamaz.`, confirmText: 'Kalıcı olarak sil', danger: true });
            if (!ok) return;
            await api(`/charts/${id}`, { method: 'DELETE' });
            toast('Grafik silindi.', 'info');
            load();
          } else if (act === 'test') {
            const launch = await ensureEngine();
            await launch({ chartId: id, test: true });
          }
        } catch (e) { toast(e.message, 'error'); }
      });
    });
  };

  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('.tab'); if (!b) return;
    state.tab = b.dataset.tab;
    $('#tabs').querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === b));
    load();
  });
  await load();
}
