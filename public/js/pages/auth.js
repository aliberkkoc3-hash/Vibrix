/* Vibrix — oturum açma ve kayıt */
import { api, auth, $, esc, toast, navigate } from '../app.js';
import { icon } from '../icons.js';

function authShell(inner) {
  return `
    <div class="auth-shell">
      <div class="auth-card">
        <a class="brand" href="/" data-link aria-label="Vibrix ana sayfa">
          <span class="brand-mark"><img src="/brand/mark-128.png" alt="" aria-hidden="true"></span>
          <span class="brand-word">Vibri<em>x</em></span>
        </a>
        <div class="card glass">${inner}</div>
      </div>
    </div>`;
}

function afterLoginRedirect() {
  const redirect = sessionStorage.getItem('vibrix.redirect');
  sessionStorage.removeItem('vibrix.redirect');
  navigate(redirect || '/');
}

export async function renderLogin({ main }) {
  if (auth.user) return navigate('/', { replace: true });
  main.innerHTML = authShell(`
    <h2 style="margin-bottom:6px">Oturum Aç</h2>
    <p class="muted small" style="margin-bottom:20px">Hesabına giriş yap ve kaldığın yerden devam et.</p>
    <form id="login-form" novalidate>
      <div class="field">
        <label for="identifier">Kullanıcı Adı veya E-posta</label>
        <input class="input" id="identifier" name="identifier" autocomplete="username" required>
      </div>
      <div class="field">
        <label for="password">Şifre</label>
        <div style="position:relative">
          <input class="input" id="password" name="password" type="password" autocomplete="current-password" required style="padding-right:46px">
          <button type="button" class="btn btn-ghost btn-icon" id="toggle-pw" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);border:none;background:none" aria-label="Şifreyi göster">${icon('eye')}</button>
        </div>
      </div>
      <label class="checkbox" style="margin-bottom:16px"><input type="checkbox" id="remember"> Beni hatırla</label>
      <div class="form-error" id="form-error"></div>
      <button class="btn btn-primary btn-block" type="submit" id="submit-btn">${icon('login')} Giriş Yap</button>
    </form>
    <div class="divider">veya</div>
    <a class="btn btn-ghost btn-block" href="/kayit" data-link>${icon('user')} Yeni Hesap Oluştur</a>
  `);

  const form = $('#login-form');
  const errEl = $('#form-error');
  const btn = $('#submit-btn');
  $('#toggle-pw').addEventListener('click', () => {
    const pw = $('#password');
    pw.type = pw.type === 'password' ? 'text' : 'password';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.textContent = '';
    const identifier = form.identifier.value.trim();
    const password = form.password.value;
    if (!identifier || !password) { errEl.textContent = 'Kullanıcı adı ve şifre girin.'; return; }
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Giriş yapılıyor…';
    try {
      await auth.login(identifier, password, $('#remember').checked);
      toast('Giriş başarılı. Hoş geldin!', 'success');
      afterLoginRedirect();
    } catch (err) {
      errEl.textContent = err.message;
      btn.disabled = false;
      btn.innerHTML = `${icon('login')} Giriş Yap`;
    }
  });
  form.identifier.focus();
}

export async function renderRegister({ main }) {
  if (auth.user) return navigate('/', { replace: true });
  main.innerHTML = authShell(`
    <h2 style="margin-bottom:6px">Kayıt Ol</h2>
    <p class="muted small" style="margin-bottom:20px">Ücretsiz hesap oluştur; oyna, grafik yap, sıralamalara katıl.</p>
    <form id="reg-form" novalidate>
      <div class="field">
        <label for="username">Kullanıcı Adı</label>
        <input class="input" id="username" name="username" autocomplete="username" required minlength="3" maxlength="20">
        <span class="hint">3-20 karakter; harf, rakam ve alt çizgi.</span>
      </div>
      <div class="field">
        <label for="email">E-posta</label>
        <input class="input" id="email" name="email" type="email" autocomplete="email" required>
      </div>
      <div class="field">
        <label for="password">Şifre</label>
        <input class="input" id="password" name="password" type="password" autocomplete="new-password" required minlength="8">
        <span class="hint">En az 8 karakter.</span>
      </div>
      <div class="field">
        <label for="passwordConfirm">Şifre (tekrar)</label>
        <input class="input" id="passwordConfirm" name="passwordConfirm" type="password" autocomplete="new-password" required minlength="8">
      </div>
      <label class="checkbox" style="margin-bottom:16px"><input type="checkbox" id="remember" checked> Oturumumu açık tut</label>
      <div class="form-error" id="form-error"></div>
      <button class="btn btn-primary btn-block" type="submit" id="submit-btn">${icon('user')} Hesap Oluştur</button>
    </form>
    <div class="divider">veya</div>
    <a class="btn btn-ghost btn-block" href="/giris" data-link>${icon('login')} Zaten hesabın var mı? Giriş yap</a>
  `);

  const form = $('#reg-form');
  const errEl = $('#form-error');
  const btn = $('#submit-btn');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.textContent = '';
    const username = form.username.value.trim();
    const email = form.email.value.trim();
    const password = form.password.value;
    const passwordConfirm = form.passwordConfirm.value;
    if (username.length < 3) { errEl.textContent = 'Kullanıcı adı en az 3 karakter olmalı.'; return; }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) { errEl.textContent = 'Kullanıcı adı yalnızca harf, rakam ve alt çizgi içerebilir.'; return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { errEl.textContent = 'Geçerli bir e-posta adresi girin.'; return; }
    if (password.length < 8) { errEl.textContent = 'Şifre en az 8 karakter olmalı.'; return; }
    if (password !== passwordConfirm) { errEl.textContent = 'Şifreler birbiriyle uyuşmuyor.'; return; }
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Hesap oluşturuluyor…';
    try {
      await auth.register({ username, email, password, passwordConfirm, remember: $('#remember').checked });
      toast('Hesabın oluşturuldu. Hoş geldin!', 'success');
      afterLoginRedirect();
    } catch (err) {
      errEl.textContent = err.message;
      btn.disabled = false;
      btn.innerHTML = `${icon('user')} Hesap Oluştur`;
    }
  });
  form.username.focus();
}
