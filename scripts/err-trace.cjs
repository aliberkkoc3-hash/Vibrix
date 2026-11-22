const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => console.log('PAGEERROR\n' + e.stack.slice(0, 1200)));
  await p.goto('http://127.0.0.1:4321/', { waitUntil: 'networkidle' });
  await p.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('rhythmx.settings.v1') || '{}');
    raw.gameplay = { ...(raw.gameplay || {}), perspective: true, perspectiveStrength: 80, upscroll: true };
    localStorage.setItem('rhythmx.settings.v1', JSON.stringify(raw));
  });
  await p.goto('http://127.0.0.1:4321/chart/2', { waitUntil: 'networkidle' });
  await p.click('#play-btn');
  await p.waitForSelector('#ov-start', { timeout: 15000 });
  await p.click('#ov-start');
  await p.waitForTimeout(2500);
  await b.close();
})();
