/* Vibrix — üst navigasyon ve kullanıcı menüsü */
import { auth, $, esc, avatarHtml, toast, navigate } from './app.js';
import { icon } from './icons.js';

const NAV_ITEMS = [
  { path: '/', label: 'Ana Sayfa', icon: 'home' },
  { path: '/oyna', label: 'Oyna', icon: 'play' },
  { path: '/kesfet', label: 'Keşfet', icon: 'compass' },
  { path: '/liderlik', label: 'Liderlik Tablosu', icon: 'trophy' },
  { path: '/editor', label: 'Chart Editor', icon: 'edit' },
  { path: '/chartlarim', label: 'Chartlarım', icon: 'library', authOnly: true },
  { path: '/profil', label: 'Profil', icon: 'user', authOnly: true },
];

export function renderNav() {
  const links = $('#nav-links');
  const actions = $('#nav-actions');
  const user = auth.user;
  const current = location.pathname.replace(/\/+$/, '') || '/';

  links.innerHTML = NAV_ITEMS
    .filter((i) => !i.authOnly || user)
    .map((i) => `<a class="nav-link ${current === i.path || (i.path !== '/' && current.startsWith(i.path + '/')) ? 'active' : ''}" href="${i.path}" data-path="${i.path}" data-link>${icon(i.icon)}<span>${esc(i.label)}</span></a>`)
    .join('');

  if (user) {
    actions.innerHTML = `
      <a class="btn btn-primary btn-sm" href="/oyna" data-link>${icon('play')}<span>Hızlı Oyna</span></a>
      <div class="user-menu">
        <button class="user-chip" id="user-chip" aria-haspopup="true" aria-expanded="false">
          ${avatarHtml(user, 'sm')}
          <span class="name">${esc(user.username)}</span>
          ${icon('chevronDown')}
        </button>
        <div class="dropdown" id="user-dropdown" role="menu">
          <div class="dd-head">
            <strong>${esc(user.username)}</strong>
            <small>${esc(user.email)}</small>
          </div>
          <div class="sep"></div>
          <a href="/profil" data-link>${icon('user')} Profilim</a>
          <a href="/chartlarim" data-link>${icon('library')} Chartlarım</a>
          <a href="/ayarlar" data-link>${icon('settings')} Ayarlar</a>
          <div class="sep"></div>
          <button id="logout-btn" type="button">${icon('logout')} Oturumu Kapat</button>
        </div>
      </div>`;
    const chip = $('#user-chip');
    const dd = $('#user-dropdown');
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = dd.classList.toggle('open');
      chip.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', () => { dd.classList.remove('open'); chip.setAttribute('aria-expanded', 'false'); });
    $('#logout-btn').addEventListener('click', async () => {
      await auth.logout();
      toast('Oturumunuz kapatıldı.', 'info');
      navigate('/');
    });
  } else {
    actions.innerHTML = `
      <a class="btn btn-ghost btn-sm" href="/giris" data-link>${icon('login')}<span>Oturum Aç</span></a>
      <a class="btn btn-primary btn-sm" href="/kayit" data-link>${icon('user')}<span>Kayıt Ol</span></a>`;
  }
  const toggle = $('#nav-toggle');
  if (toggle && !toggle.dataset.bound) {
    toggle.dataset.bound = '1';
    toggle.addEventListener('click', () => $('#nav-links').classList.toggle('open'));
  }
}

export function initNav() {
  auth.onChange(() => renderNav());
  renderNav();
}
