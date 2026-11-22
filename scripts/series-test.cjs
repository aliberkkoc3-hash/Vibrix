const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 160)));
  const dismiss = async () => { await p.waitForTimeout(700); if (await p.locator('#legal-host:not([hidden])').count()) { await p.click('#legal-dont'); await p.click('#legal-accept'); await p.waitForTimeout(250); } };
  await p.goto('http://127.0.0.1:4321/kesfet', { waitUntil: 'networkidle' });
  await dismiss(); await p.waitForTimeout(1200);
  const chips = await p.locator('.series-chip').allTextContents();
  console.log('sekmeler:', chips);
  for (const label of ['Hepsi', 'Vibrix Apocalypse', 'Vibrix']) {
    await p.click(`.series-chip:text-is("${label}")`);
    await p.waitForTimeout(1200);
    const count = await p.locator('.chart-card').count();
    const counter = await p.locator('#results > .row.between .muted.small').first().textContent().catch(() => '(yok)');
    const titles = await p.locator('.chart-title').allTextContents();
    console.log(label, '→ kart:', count, '| sayaç:', counter.trim(), '| apocalypse var mı:', titles.some(t => /apocalypse/i.test(t)));
    await p.screenshot({ path: `data/screenshots/74-series-${label.replace(/ /g, '-').toLowerCase()}.png` });
  }
  console.log('hatalar:', errs);
  await b.close();
})();
