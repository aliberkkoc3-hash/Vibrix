/** Judgment çizgisi 4 hatla sınırlı mı + yazı notanın hattında mı? */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('P:' + e.message.slice(0, 140)));
  p.on('console', m => { if (m.type() === 'error') errs.push('C:' + m.text().slice(0, 120)); });
  const uname = 'jn' + Date.now().toString(36);
  await p.goto('http://127.0.0.1:4321/kayit', { waitUntil: 'networkidle' });
  await p.fill('#username', uname); await p.fill('#email', uname + '@example.com');
  await p.fill('#password', 'parola1234'); await p.fill('#passwordConfirm', 'parola1234');
  await p.click('#submit-btn'); await p.waitForTimeout(1600);
  await p.goto('http://127.0.0.1:4321/chart/1', { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);
  await p.click('button:has-text("Oyna")');
  await p.waitForTimeout(1800);
  await p.click('#ov-start').catch(() => {});
  await p.waitForTimeout(4000);

  // 1) Judgment çizgisi satırında parlaklık nerede başlıyor/bitiyor?
  const line = await p.evaluate(() => {
    const c = document.querySelector('canvas');
    const ctx = c.getContext('2d');
    const dpr = c.width / c.clientWidth;
    // judgment çizgisini bul: SADECE hat bölgesinin ortasındaki x'te en parlak satır
    const midX = Math.round(c.width / 2);
    let best = { y: 0, score: 0 };
    for (let y = Math.round(c.height * 0.6); y < c.height; y++) {
      const d = ctx.getImageData(midX, y, 1, 1).data;
      const s = d[0] + d[1] + d[2];
      if (s > best.score) best = { y, score: s };
    }
    const d = ctx.getImageData(0, best.y, c.width, 1).data;
    let first = -1, last = -1;
    for (let x = 0; x < c.width; x++) {
      const v = d[x*4] + d[x*4+1] + d[x*4+2];
      if (v > 120) { if (first < 0) first = x; last = x; }
    }
    return { lineYCss: Math.round(best.y / dpr), leftCss: Math.round(first / dpr), rightCss: Math.round(last / dpr), w: c.clientWidth };
  });

  // 2) Judgment yazısı nerede çıkıyor? Her hattı tek tek bas, metin konumunu ölç
  const laneCenters = [503, 647, 791, 935];
  const results = [];
  for (let i = 0; i < 4; i++) {
    const key = ['d', 'f', 'j', 'k'][i];
    await p.keyboard.press(key);
    await p.waitForTimeout(120);
    const box = await p.evaluate(() => {
      const c = document.querySelector('canvas');
      const ctx = c.getContext('2d');
      const dpr = c.width / c.clientWidth;
      const y0 = Math.round(560 * dpr), y1 = Math.round(780 * dpr);
      const img = ctx.getImageData(0, y0, c.width, y1 - y0).data;
      const W = c.width, H = y1 - y0;
      let first = -1, last = -1, cnt = 0;
      for (let yy = 0; yy < H; yy++) {
        for (let x = 0; x < W; x++) {
          const idx = (yy * W + x) * 4;
          const r = img[idx], g = img[idx+1], bl = img[idx+2];
          // düşük doygunluklu gri = receptor; parlak ve renkli = judgment yazısı
          if (r > 140 && Math.abs(r - g) < 60 && bl > r) { if (first < 0 || x < first) first = x; if (x > last) last = x; cnt++; }
        }
      }
      return { left: Math.round(first / dpr), right: Math.round(last / dpr), px: cnt };
    });
    results.push({ lane: key.toUpperCase(), center: laneCenters[i], textLeft: box.left, textRight: box.right, px: box.px });
    await p.waitForTimeout(500);
  }
  await p.screenshot({ path: 'data/screenshots/59-judge-lanes.png' });
  console.log(JSON.stringify({ line, results }, null, 1));
  console.log('hatalar:', errs);
  await b.close();
})();
