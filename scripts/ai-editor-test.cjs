const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 950 } });
  p.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0,300)));
  p.on('console', m => { if (m.type()==='error') console.log('CONSOLE', m.text().slice(0,300)); });
  await p.goto('http://127.0.0.1:4321/giris', { waitUntil: 'networkidle' });
  await p.fill('#identifier', 'editor_test');
  await p.fill('#password', 'parola1234');
  await p.click('#submit-btn');
  await p.waitForTimeout(1200);
  await p.goto('http://127.0.0.1:4321/editor/7', { waitUntil: 'networkidle' });
  await p.waitForSelector('#ed-ai', { timeout: 15000 });
  await p.waitForTimeout(2000); // ses decode
  const before = await p.locator('#ed-note-count').textContent();
  await p.click('#ed-ai');
  await p.waitForSelector('#ai-run');
  await p.screenshot({ path: 'data/screenshots/20-ai-dialog.png' });
  await p.click('#ai-run');
  await p.waitForTimeout(6000);
  const after = await p.locator('#ed-note-count').textContent();
  console.log('önce:', before, '→ sonra:', after);
  await p.screenshot({ path: 'data/screenshots/21-ai-result.png' });
  // kaydet ve API'den doğrula
  await p.click('#ed-save');
  await p.waitForTimeout(1500);
  const info = await p.evaluate(async () => {
    const r = await fetch('/api/charts/7'); const d = await r.json();
    return { notes: d.chart.chartData.notes.length, bpm: d.chart.bpm, offset: d.chart.offsetMs };
  });
  console.log('sunucuya kaydedilen:', JSON.stringify(info));
  await b.close();
})();
