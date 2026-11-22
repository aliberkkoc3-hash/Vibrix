const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = [];
  p.on('pageerror', e => errs.push('P:' + e.message.slice(0, 160)));
  p.on('console', m => { if (m.type() === 'error') errs.push('C:' + m.text().slice(0, 140)); });
  // Liderlik tablosu boş mu?
  await p.goto('http://127.0.0.1:4321/liderlik', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  const lbEmpty = await p.locator('.empty-state').count();
  const lbText = (await p.locator('#lb-body').textContent()).slice(0, 120);
  await p.screenshot({ path: 'data/screenshots/48-leaderboard-empty.png' });
  // Yapımcılar sekmesi yok mu?
  const navHasCreators = await p.locator('a[href="/yapimcilar"]').count();
  // Grafik detayı: sahip + stüdyo
  await p.goto('http://127.0.0.1:4321/chart/1', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  const bodyText = await p.locator('body').textContent();
  const hasOwner = bodyText.includes('BFAli');
  const hasStudio = bodyText.includes('Prism Crew');
  await p.screenshot({ path: 'data/screenshots/49-chart-studio.png' });
  // Profil: stüdyo rozeti
  await p.goto('http://127.0.0.1:4321/oyuncu/' + encodeURIComponent('Prism Crew'), { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  const studioBadge = await p.locator('.badge.studio').count();
  await p.screenshot({ path: 'data/screenshots/50-studio-profile.png' });
  console.log(JSON.stringify({ lbEmpty, lbText, navHasCreators, hasOwner, hasStudio, studioBadge, errs }));
  await b.close();
})();
