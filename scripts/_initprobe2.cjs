const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('http://127.0.0.1:4321/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1000);
  console.log(await p.evaluate(() => ({ hasInit: typeof window.__vibrixInit, hidden: document.getElementById('legal-host')?.hidden })));
  await b.close();
})();
