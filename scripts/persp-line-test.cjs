const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  const uname = 'pl' + Date.now().toString(36);
  await p.goto('http://127.0.0.1:4321/kayit', { waitUntil: 'networkidle' });
  await p.fill('#username', uname); await p.fill('#email', uname + '@example.com');
  await p.fill('#password', 'parola1234'); await p.fill('#passwordConfirm', 'parola1234');
  await p.click('#submit-btn'); await p.waitForTimeout(1600);
  // 3D perspektif ON
  await p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('vibrix.settings.v1') || '{}');
    s.gameplay = { ...(s.gameplay || {}), perspective: true, perspectiveStrength: 65 };
    localStorage.setItem('vibrix.settings.v1', JSON.stringify(s));
  });
  await p.goto('http://127.0.0.1:4321/chart/1', { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);
  await p.click('button:has-text("Oyna")');
  await p.waitForTimeout(1500);
  await p.click('#ov-start').catch(() => {});
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => {
    const g = window.__rxGame;
    const c = document.querySelector('canvas');
    const ctx = c.getContext('2d');
    const dpr = c.width / c.clientWidth;
    // jy satırında yatay parlak çizgi var mı? (orta bölgede)
    const y = Math.round((g.judgmentY - 2) * dpr);
    const d = ctx.getImageData(Math.round(g.boardX * dpr) + 40, y, Math.round(g.laneW * 2 * dpr), 1).data;
    let bright = 0, maxV = 0;
    for (let i = 0; i < d.length; i += 4) { const v = d[i]+d[i+1]+d[i+2]; if (v > 300) bright++; if (v > maxV) maxV = v; }
    // Kenarlar (ilk 20px / son 20px)
    const edgeRow = ctx.getImageData(0, y, c.width, 1).data;
    return {
      persp: g.persp, jy: Math.round(g.judgmentY), farScreenY: Math.round(g.farScreenY()),
      middleBrightPx: bright, middleMax: maxV,
      laneW: g.laneW, boardX: g.boardX,
    };
  });
  await p.screenshot({ path: 'data/screenshots/61-3d-no-line.png' });
  console.log(JSON.stringify(r, null, 1), 'hatalar:', errs);
  await b.close();
})();
