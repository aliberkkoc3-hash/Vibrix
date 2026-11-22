const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0,300)));
  p.on('console', m => { if (m.type()==='error') console.log('CONSOLE', m.text().slice(0,300)); });
  // giriş
  await p.goto('http://127.0.0.1:4321/giris', { waitUntil: 'networkidle' });
  await p.fill('#identifier', 'editor_test');
  await p.fill('#password', 'parola1234');
  await p.click('#submit-btn');
  await p.waitForTimeout(1200);
  // editörde AI çalıştır
  await p.goto('http://127.0.0.1:4321/editor/7', { waitUntil: 'networkidle' });
  await p.waitForSelector('#ed-ai', { timeout: 15000 });
  await p.waitForTimeout(2000);
  console.log('rozet başlangıçta görünür:', await p.locator('#ed-ai-badge').isVisible());
  await p.click('#ed-ai');
  await p.waitForSelector('#ai-run');
  await p.click('#ai-run');
  await p.waitForTimeout(5000);
  console.log('AI sonrası rozet görünür:', await p.locator('#ed-ai-badge').isVisible());
  await p.click('#ed-save');
  await p.waitForTimeout(1500);
  const flag = await p.evaluate(async () => (await (await fetch('/api/charts/7')).json()).chart.isAutoChart);
  console.log('sunucuda isAutoChart:', flag);
  // grafik detay sayfası
  await p.goto('http://127.0.0.1:4321/chart/7', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  const badge = await p.locator('.badge.ai').first().innerText().catch(() => 'YOK');
  console.log('detay sayfası rozeti:', badge);
  await p.screenshot({ path: 'data/screenshots/22-ai-badge-detail.png' });
  // oynanış HUD
  await p.click('#play-btn');
  await p.waitForSelector('#ov-start', { timeout: 15000 });
  await p.waitForTimeout(500);
  const hud = await p.locator('.hud-song').innerText();
  console.log('HUD:', hud.replace(/\n/g, ' | '));
  await p.screenshot({ path: 'data/screenshots/23-ai-badge-game.png' });
  await b.close();
})();
