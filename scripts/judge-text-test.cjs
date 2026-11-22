/** Judgment yazısı notanın basıldığı hattın ortasında mı? */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('P:' + e.message.slice(0, 140)));
  const uname = 'jtx' + Date.now().toString(36);
  await p.goto('http://127.0.0.1:4321/kayit', { waitUntil: 'networkidle' });
  await p.fill('#username', uname); await p.fill('#email', uname + '@example.com');
  await p.fill('#password', 'parola1234'); await p.fill('#passwordConfirm', 'parola1234');
  await p.click('#submit-btn'); await p.waitForTimeout(1600);
  await p.goto('http://127.0.0.1:4321/chart/1', { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);
  await p.click('button:has-text("Oyna")');
  await p.waitForTimeout(1500);
  await p.click('#ov-start').catch(() => {});
  await p.waitForTimeout(2500);

  const LANE_CX = [503, 647, 791, 935];
  const out = [];
  for (let lane = 0; lane < 4; lane++) {
    // Motoru doğrudan tetikle: registerJudgment + kayıt anı
    await p.evaluate((lane) => {
      const g = window.__rxGame;
      g.state = 'paused'; // canlı loop judgment'ı ezmesin
      g.registerJudgment('perfect', lane);
      g.lastJudgmentAt = performance.now();
      g.draw();
    }, lane);
    // Yazının piksel merkezini ölç (yalnızca bu hattın bölgesinde, parlak menekşe metin)
    const m = await p.evaluate(({ lane, cx }) => {
      const g = window.__rxGame;
      const c = document.querySelector('canvas');
      const ctx = c.getContext('2d');
      const dpr = c.width / c.clientWidth;
      const half = g.laneW / 2;
      const x0 = Math.round((cx - half) * dpr), x1 = Math.round((cx + half) * dpr);
      const yy0 = Math.round((g.judgmentY - 120) * dpr), yy1 = Math.round((g.judgmentY - 5) * dpr);
      const d = ctx.getImageData(x0, yy0, x1 - x0, yy1 - yy0).data;
      const W = x1 - x0;
      let sum = 0, n = 0, minX = -1, maxX = -1;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], gg = d[i+1], bb = d[i+2];
        // metin: açık menekşe/beyaz, kontur koyu
        if (r > 190 && bb > 190 && gg > 160) {
          const x = i / 4 % W;
          sum += x; n++;
          if (minX < 0 || x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
      return { px: n, textCx: n ? Math.round((x0 + sum / n) / dpr) : null, left: minX < 0 ? null : Math.round((x0 + minX) / dpr), right: maxX < 0 ? null : Math.round((x0 + maxX) / dpr) };
    }, { lane, cx: LANE_CX[lane] });
    out.push({ lane: ['D', 'F', 'J', 'K'][lane], laneCx: LANE_CX[lane], ...m });
    await p.waitForTimeout(120);
  }
  // Görsel kanıt: son hatta PERFECT yazısı
  // Görsel kanıt: 3 ayrı hatta aynı anda değil, son hatta PERFECT + hemen kare çek
  await p.evaluate(() => { const g = window.__rxGame; g.state = 'paused'; g.registerJudgment('perfect', 3); g.lastJudgmentAt = performance.now(); g.draw(); });
  await p.screenshot({ path: 'data/screenshots/60-judge-lane-text.png' });
  console.log(JSON.stringify(out, null, 1));
  console.log('hatalar:', errs);
  await b.close();
})();
