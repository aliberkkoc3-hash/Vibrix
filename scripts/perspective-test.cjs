const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 200)); });

  // Misafir olarak demo grafik oynanışı
  await p.goto('http://127.0.0.1:4321/', { waitUntil: 'networkidle' });
  // 3D kapalı
  await p.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('rhythmx.settings.v1') || '{}');
    raw.gameplay = { ...(raw.gameplay || {}), perspective: false };
    localStorage.setItem('rhythmx.settings.v1', JSON.stringify(raw));
  });
  await p.goto('http://127.0.0.1:4321/chart/1', { waitUntil: 'networkidle' });
  await p.click('#play-btn');
  await p.waitForSelector('#ov-start', { timeout: 15000 });
  await p.click('#ov-start');
  await p.waitForTimeout(3500);
  await p.screenshot({ path: 'data/screenshots/27-2d-play.png' });
  await p.keyboard.press('Escape');
  await p.waitForTimeout(500);
  await p.click('#ov-exit').catch(() => {});
  await p.waitForTimeout(900);

  // 3D açık
  await p.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('rhythmx.settings.v1') || '{}');
    raw.gameplay = { ...(raw.gameplay || {}), perspective: true, perspectiveStrength: 70 };
    localStorage.setItem('rhythmx.settings.v1', JSON.stringify(raw));
  });
  await p.goto('http://127.0.0.1:4321/chart/1', { waitUntil: 'networkidle' });
  await p.click('#play-btn');
  await p.waitForSelector('#ov-start', { timeout: 15000 });
  await p.click('#ov-start');
  await p.waitForTimeout(3500);
  await p.screenshot({ path: 'data/screenshots/28-3d-play.png' });
  const info = await p.evaluate(() => {
    const c = document.querySelector('#rx-canvas');
    return { w: c.width, h: c.height };
  });
  console.log('canvas:', JSON.stringify(info));
  console.log('hatalar:', errs.length ? errs.join(' | ') : 'yok');
  await b.close();
})();
