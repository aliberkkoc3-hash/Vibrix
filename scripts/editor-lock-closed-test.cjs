const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 160)));
  const uname = 'lc' + Date.now().toString(36).slice(-6);
  const dismiss = async () => { await p.waitForTimeout(700); if (await p.locator('#legal-host:not([hidden])').count()) { await p.click('#legal-dont'); await p.click('#legal-accept'); await p.waitForTimeout(250); } };
  await p.goto('http://127.0.0.1:4321/kayit', { waitUntil: 'networkidle' });
  await dismiss();
  await p.fill('#username', uname); await p.fill('#email', uname + '@example.com');
  await p.fill('#password', 'parola1234'); await p.fill('#passwordConfirm', 'parola1234');
  await p.click('#submit-btn'); await p.waitForTimeout(2000);
  await p.goto('http://127.0.0.1:4321/editor', { waitUntil: 'networkidle' });
  await dismiss(); await p.waitForTimeout(1200);
  console.log('kapalıyken nav editör linki:', await p.locator('.nav-link[data-path="/editor"]').count());
  console.log('kapalıyken form:', await p.locator('#new-form').count());
  console.log('mesaj:', (await p.locator('.empty-state').innerText().catch(() => '')).replace(/\n+/g, ' | '));
  await p.screenshot({ path: 'data/screenshots/76-editor-locked.png' });
  // API'den grafik oluşturma denemesi
  const st = await p.evaluate(async () => {
    const fd = new FormData();
    fd.append('songTitle', 'Deneme'); fd.append('bpm', '120');
    fd.append('chartData', JSON.stringify({ version: 1, bpm: 120, offset: 0, lanes: 4, notes: [{ id: 'n0', lane: 0, time: 0, type: 'tap', duration: 0 }] }));
    const r = await fetch('/api/charts', { method: 'POST', body: fd });
    return { status: r.status, body: await r.json().catch(() => null) };
  });
  console.log('kapalıyken grafik oluşturma:', JSON.stringify(st));
  console.log('hatalar:', errs);
  await b.close();
})();
