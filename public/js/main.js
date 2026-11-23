/* Vibrix — giriş noktası: rotalar, oturum ve navigasyon */
import {
  route, renderRoute, auth, site, initGlobalHandlers, api, toast, esc, fmtNum, fmtAcc, fmtDuration,
  avatarHtml, rankBadge, diffBadge, coverHtml, positionBadge, paginationHtml, settings, applyVisual,
} from './app.js';
import { icon } from './icons.js';
import { initNav } from './nav.js';

import * as Home from './pages/home.js';
import * as Auth from './pages/auth.js';
import * as Play from './pages/play.js';
import * as Discover from './pages/discover.js';
import * as ChartDetail from './pages/chart.js';
import * as Leaderboard from './pages/leaderboard.js';
import * as Profile from './pages/profile.js';
import * as MyCharts from './pages/mycharts.js';
import * as Settings from './pages/settings.js';
import * as EditorPage from './pages/editor-page.js';
import * as NotFound from './pages/notfound.js';

/* Rotalar */
route('/', Home.render);
route('/oyna', Play.render);
route('/kesfet', Discover.render);
route('/chart/:id', ChartDetail.render);
route('/liderlik', Leaderboard.render);
route('/giris', Auth.renderLogin);
route('/kayit', Auth.renderRegister);
route('/profil', Profile.renderMine);
route('/oyuncu/:username', Profile.renderPublic);
route('/chartlarim', MyCharts.render);
route('/ayarlar', Settings.render);
route('/editor', EditorPage.renderNew);
route('/editor/:id', EditorPage.renderEdit);

/* Hata sayfası */
route('/404', NotFound.render);

/* Sayfa geçiş animasyonu: her rota değişiminde içerik yeniden belirir */
let _lastRouteKey = '';
window.addEventListener('vibrix:route', (e) => {
  const main = document.getElementById('app-main');
  if (!main) return;
  const key = e.detail && e.detail.path;
  if (key === _lastRouteKey) return;
  _lastRouteKey = key;
  main.classList.remove('is-leaving');
  // animasyonu yeniden başlat
  main.style.animation = 'none';
  void main.offsetWidth;
  main.style.animation = '';
});

applyVisual();
initGlobalHandlers();
// Chart Editor kilidi durumunu sunucudan al (menü ve sayfa erişimi buna bakar)
site.loadEditorStatus().then(() => initNav()).catch(() => initNav());
initLegalNotice();

/* ---------------- Telif ve uyumluluk uyarısı ---------------- */
const LEGAL_KEY = 'vibrix.legal.v1';

function initLegalNotice() {
  const host = document.getElementById('legal-host');
  if (!host) return;
  let stored = null;
  try { stored = localStorage.getItem(LEGAL_KEY); } catch { /* yoksay */ }
  // Yalnızca "Bir daha gösterme" işaretlenip kabul edildiyse kalıcı gizlenir.
  // Aksi hâlde her açılışta yeniden gösterilir.
  if (stored === 'accepted') return;

  const dontShow = document.getElementById('legal-dont');
  const acceptBtn = document.getElementById('legal-accept');
  if (!acceptBtn) return;

  // "Bir daha gösterme" işaretliyse kalıcı olarak hatırla
  const close = () => {
    try {
      if (dontShow && dontShow.checked) localStorage.setItem(LEGAL_KEY, 'accepted');
    } catch { /* yoksay */ }
    host.hidden = true;
    document.body.classList.remove('legal-open');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter') close(); };

  host.hidden = false;
  document.body.classList.add('legal-open');
  acceptBtn.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  setTimeout(() => acceptBtn.focus(), 120);
}

// Test ve tekrar gösterim için
window.__vibrixInit = { initLegalNotice, LEGAL_KEY };

(async () => {
  await auth.refresh();
  // Giriş sonrası geri yönlendirme
  if (auth.user && (location.pathname === '/giris' || location.pathname === '/kayit')) {
    const redirect = sessionStorage.getItem('vibrix.redirect');
    if (redirect) { sessionStorage.removeItem('vibrix.redirect'); history.replaceState({}, '', redirect); }
  }
  await renderRoute();
})();

export { api, toast, esc, fmtNum, fmtAcc, fmtDuration, avatarHtml, rankBadge, diffBadge, coverHtml, positionBadge, paginationHtml, settings, icon };
