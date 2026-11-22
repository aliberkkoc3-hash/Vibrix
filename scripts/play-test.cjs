const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0,300)));
  await p.goto('http://127.0.0.1:4321/chart/1', { waitUntil: 'networkidle' });
  await p.click('#play-btn');
  await p.waitForSelector('#ov-start', { timeout: 15000 });
  await p.click('#ov-start');
  await p.waitForTimeout(5000);
  // demo grafik ofsetini al
  const chart = await p.evaluate(async () => (await (await fetch('/api/charts/1')).json()).chart);
  console.log('offset', chart.offsetMs, 'notes', chart.noteCount);
  const notes = chart.chartData.notes.slice(0, 30).map(n => ({ lane: n.lane, time: n.time }));
  const keys = ['d','f','j','k'];
  const t0 = await p.evaluate(() => window.__rxNow ? window.__rxNow() : null);
  console.log('engine clock:', t0);
  for (const n of notes) {
    const nowMs = await p.evaluate(() => window.__rxNow ? window.__rxNow() : 0);
    const wait = n.time - nowMs - 25;
    if (wait > 0) await p.waitForTimeout(Math.min(wait, 3000));
    await p.keyboard.down(keys[n.lane]);
    await p.waitForTimeout(45);
    await p.keyboard.up(keys[n.lane]);
  }
  await p.waitForTimeout(600);
  console.log('HUD:', (await p.locator('#game-root').innerText()).replace(/\n/g,' | ').slice(0,200));
  await p.screenshot({ path: 'data/screenshots/17-playtest.png' });
  await b.close();
})();
