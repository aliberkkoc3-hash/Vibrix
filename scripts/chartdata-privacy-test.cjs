const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 160)));
  const uname = 'cv' + Date.now().toString(36).slice(-6);
  const dismiss = async () => { await p.waitForTimeout(700); if (await p.locator('#legal-host:not([hidden])').count()) { await p.click('#legal-dont'); await p.click('#legal-accept'); await p.waitForTimeout(250); } };

  // 1) Misafir olarak grafik incele
  await p.goto('http://127.0.0.1:4321/chart/1', { waitUntil: 'networkidle' });
  await dismiss(); await p.waitForTimeout(900);
  const guest = await p.evaluate(async () => {
    const r = await fetch('/api/charts/1'); const j = await r.json();
    return { hasData: 'chartData' in j.chart, noteCount: j.chart.noteCount };
  });
  console.log('misafir detay:', JSON.stringify(guest));
  console.log('sayfa açıldı mı:', (await p.locator('h1').first().textContent()).trim());

  // 2) Misafir olarak oyna
  await p.click('#play-btn'); await p.waitForTimeout(2000);
  await p.click('#ov-start'); await p.waitForTimeout(2500);
  const playing = await p.evaluate(() => window.__rxGame ? { state: window.__rxGame.state, notes: window.__rxGame.notes.length } : null);
  console.log('misafir oynayabiliyor:', JSON.stringify(playing));
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await p.click('#ov-exit').catch(() => {});
  await p.waitForTimeout(1000);

  // 3) Kayıtlı kullanıcı olarak kendi grafiği
  await p.goto('http://127.0.0.1:4321/kayit', { waitUntil: 'networkidle' });
  await dismiss();
  await p.fill('#username', uname); await p.fill('#email', uname + '@example.com');
  await p.fill('#password', 'parola1234'); await p.fill('#passwordConfirm', 'parola1234');
  await p.click('#submit-btn'); await p.waitForTimeout(1800);
  const other = await p.evaluate(async () => {
    const r = await fetch('/api/charts/1'); const j = await r.json();
    return { hasData: 'chartData' in j.chart };
  });
  console.log('başka kullanıcı olarak BFAli grafiği:', JSON.stringify(other));

  // 4) Editör hâlâ çalışıyor mu (kendi grafiği yok -> /editor yeni form)
  await p.goto('http://127.0.0.1:4321/editor', { waitUntil: 'networkidle' });
  await dismiss(); await p.waitForTimeout(900);
  console.log('editör erişimi:', await p.locator('#new-form').count() > 0 ? 'açık' : 'kapalı');
  console.log('hatalar:', errs);
  await b.close();
})();
