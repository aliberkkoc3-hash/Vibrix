const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const shot = async (name, vp) => {
    const p = await b.newPage({ viewport: vp });
    p.on('pageerror', e => errs.push('P:' + e.message.slice(0, 150)));
    p.on('console', m => { if (m.type() === 'error') errs.push('C:' + m.text().slice(0, 130)); });
    return { p, name };
  };

  let { p } = await shot('home', { width: 1366, height: 768 });
  await p.goto('http://127.0.0.1:4321/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1400);
  const title = await p.title();
  const brandText = (await p.locator('.brand').first().textContent()).trim();
  const logoOk = await p.locator('.brand-mark img').first().evaluate(el => el.complete && el.naturalWidth > 0);
  await p.screenshot({ path: 'data/screenshots/51-vibrix-home-1366.png' });

  // nav marka yakın çekim
  await p.locator('.brand').first().screenshot({ path: 'data/screenshots/52-vibrix-brand.png' });

  // giriş sayfası
  await p.goto('http://127.0.0.1:4321/giris', { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);
  await p.screenshot({ path: 'data/screenshots/53-vibrix-auth.png' });

  // 1920
  const p2 = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p2.goto('http://127.0.0.1:4321/kesfet', { waitUntil: 'networkidle' });
  await p2.waitForTimeout(1200);
  await p2.screenshot({ path: 'data/screenshots/54-vibrix-discover-1920.png' });

  console.log(JSON.stringify({ title, brandText, logoOk, errs }));
  await b.close();
})();
