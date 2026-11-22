const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 140)));

  // 1) İlk açılışta görünmeli
  await p.goto('http://127.0.0.1:4321/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);
  const first = await p.evaluate(() => {
    const h = document.getElementById('legal-host');
    return { hidden: h.hidden, visible: h.offsetParent !== null, title: document.getElementById('legal-title')?.textContent,
      paras: [...document.querySelectorAll('.legal-body p')].map(x => x.textContent.slice(0, 45)) };
  });
  await p.screenshot({ path: 'data/screenshots/67-legal-notice.png' });

  // 2) Onayla -> kapanmalı
  await p.click('#legal-accept');
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => ({ hidden: document.getElementById('legal-host').hidden, ls: localStorage.getItem('vibrix.legal.v1') }));

  // 3) Sayfa yenilenince bir daha çıkmamalı
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  const reload = await p.evaluate(() => document.getElementById('legal-host').hidden);

  // 4) Temiz profil + "bir daha gösterme" işaretli
  const ctx2 = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p2 = await ctx2.newPage();
  await p2.goto('http://127.0.0.1:4321/', { waitUntil: 'networkidle' });
  await p2.waitForTimeout(700);
  await p2.check('#legal-dont');
  await p2.click('#legal-accept');
  await p2.waitForTimeout(300);
  await p2.reload({ waitUntil: 'networkidle' });
  await p2.waitForTimeout(700);
  const dontShow = await p2.evaluate(() => ({ hidden: document.getElementById('legal-host').hidden, ls: localStorage.getItem('vibrix.legal.v1') }));

  // 5) 1366x768'de taşma var mı
  const ctx3 = await b.newContext({ viewport: { width: 1366, height: 768 } });
  const p3 = await ctx3.newPage();
  await p3.goto('http://127.0.0.1:4321/', { waitUntil: 'networkidle' });
  await p3.waitForTimeout(800);
  const small = await p3.evaluate(() => {
    const c = document.querySelector('.legal-card');
    const r = c.getBoundingClientRect();
    return { cardH: Math.round(r.height), viewportH: window.innerHeight, fits: r.height <= window.innerHeight - 20 };
  });
  await p3.screenshot({ path: 'data/screenshots/68-legal-1366.png' });

  console.log(JSON.stringify({ first, after, reload, dontShow, small }, null, 1), 'hatalar:', errs);
  await b.close();
})();
