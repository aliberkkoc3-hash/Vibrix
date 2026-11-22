const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 160)));
  p.on('console', m => { if (m.type() === 'error') errs.push('C:' + m.text().slice(0, 140)); });
  await p.goto('http://127.0.0.1:4321/', { waitUntil: 'networkidle' });
  await p.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('rhythmx.settings.v1') || '{}');
    raw.gameplay = { ...(raw.gameplay || {}), perspective: true, perspectiveStrength: 70 };
    localStorage.setItem('rhythmx.settings.v1', JSON.stringify(raw));
  });
  await p.goto('http://127.0.0.1:4321/chart/4', { waitUntil: 'networkidle' });
  await p.click('#play-btn');
  await p.waitForSelector('#ov-start', { timeout: 15000 });
  await p.click('#ov-start');
  // Sürekli bas: birkaç nota tuttur
  const t0 = Date.now();
  const keys = ['d', 'f', 'j', 'k'];
  let i = 0;
  const iv = setInterval(() => { p.keyboard.press(keys[i++ % 4]).catch(() => {}); }, 90);
  await p.waitForTimeout(5000);
  clearInterval(iv);
  const score = await p.textContent('#hud-score').catch(() => '');
  await p.screenshot({ path: 'data/screenshots/45-hits.png' });
  console.log(JSON.stringify({ score, errs }));
  await b.close();
})();
