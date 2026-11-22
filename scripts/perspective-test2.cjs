// 3D perspektif + normal (aşağı akış) görünüm testleri
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const shots = [
    { f: '41-2d-1366', vp: { width: 1366, height: 768 }, g: { perspective: false } },
    { f: '42-3d-70-1366', vp: { width: 1366, height: 768 }, g: { perspective: true, perspectiveStrength: 70 } },
    { f: '43-3d-100-1366', vp: { width: 1366, height: 768 }, g: { perspective: true, perspectiveStrength: 100 } },
    { f: '44-3d-70-1920', vp: { width: 1920, height: 1080 }, g: { perspective: true, perspectiveStrength: 70 } },
  ];
  for (const s of shots) {
    const p = await b.newPage({ viewport: s.vp });
    p.on('pageerror', e => errs.push(e.message.slice(0, 160)));
    p.on('console', m => { if (m.type() === 'error') errs.push('C:' + m.text().slice(0, 140)); });
    await p.goto('http://127.0.0.1:4321/', { waitUntil: 'networkidle' });
    await p.evaluate((g) => {
      const raw = JSON.parse(localStorage.getItem('rhythmx.settings.v1') || '{}');
      raw.gameplay = { ...(raw.gameplay || {}), ...g };
      localStorage.setItem('rhythmx.settings.v1', JSON.stringify(raw));
    }, s.g);
    await p.goto('http://127.0.0.1:4321/chart/4', { waitUntil: 'networkidle' });
    await p.click('#play-btn');
    await p.waitForSelector('#ov-start', { timeout: 15000 });
    await p.click('#ov-start');
    await p.waitForTimeout(6000);
    await p.screenshot({ path: `data/screenshots/${s.f}.png` });
    await p.close();
  }
  console.log('hatalar:', errs.length ? errs.join(' | ') : 'yok');
  await b.close();
})();
