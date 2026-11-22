const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 160)));
  const uname = 'lk' + Date.now().toString(36).slice(-6);
  const dismiss = async () => { await p.waitForTimeout(700); if (await p.locator('#legal-host:not([hidden])').count()) { await p.click('#legal-dont'); await p.click('#legal-accept'); await p.waitForTimeout(250); } };

  // Normal kullanıcı kaydı
  await p.goto('http://127.0.0.1:4321/kayit', { waitUntil: 'networkidle' });
  await dismiss();
  await p.fill('#username', uname); await p.fill('#email', uname + '@example.com');
  await p.fill('#password', 'parola1234'); await p.fill('#passwordConfirm', 'parola1234');
  await p.click('#submit-btn'); await p.waitForTimeout(2000);

  // Kilit AÇIK iken
  await p.goto('http://127.0.0.1:4321/editor', { waitUntil: 'networkidle' });
  await dismiss(); await p.waitForTimeout(900);
  console.log('açıkken nav editör linki:', await p.locator('.nav-link[data-path="/editor"]').count());
  console.log('açıkken form:', await p.locator('#new-form').count());

  // Kilidi kapat (API üzerinden sahip olmadan -> 403 beklenir)
  const forbidden = await p.evaluate(async () => {
    const r = await fetch('/api/editor/status', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ open: false }) });
    return r.status;
  });
  console.log('sahip olmayan kilit değiştirebiliyor mu:', forbidden === 403 ? 'hayır (403) ✓' : forbidden);

  await b.close();
})();
