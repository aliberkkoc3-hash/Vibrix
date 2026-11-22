const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 160)));
  const uname = 'pc' + Date.now().toString(36).slice(-6);
  const dismiss = async () => { await p.waitForTimeout(700); if (await p.locator('#legal-host:not([hidden])').count()) { await p.click('#legal-dont'); await p.click('#legal-accept'); await p.waitForTimeout(250); } };
  await p.goto('http://127.0.0.1:4321/kayit', { waitUntil: 'networkidle' });
  await dismiss();
  await p.fill('#username', uname); await p.fill('#email', uname + '@example.com');
  await p.fill('#password', 'parola1234'); await p.fill('#passwordConfirm', 'parola1234');
  await p.click('#submit-btn'); await p.waitForTimeout(1800);
  await p.goto('http://127.0.0.1:4321/chart/1', { waitUntil: 'networkidle' });
  await dismiss(); await p.waitForTimeout(700);
  await p.click('#play-btn'); await p.waitForTimeout(1500);
  await p.click('#ov-start'); await p.waitForTimeout(2200); // 3-2-1 + BAŞLA

  console.log('başlangıç durumu:', await p.evaluate(() => window.__rxGame.state));
  await p.waitForTimeout(1500);
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  console.log('duraklatıldı:', await p.evaluate(() => ({ state: window.__rxGame.state, audio: window.__rxGame.audioCtx.state, t: Math.round(window.__rxGame.currentTimeMs()) })));

  const seen = [];
  await p.click('#ov-resume');
  for (let i = 0; i < 6; i++) {
    seen.push(await p.evaluate(() => {
      const g = window.__rxGame;
      const el = g.el.overlay.querySelector('.countdown-num');
      return { state: g.state, txt: el ? el.textContent.trim() : null, audio: g.audioCtx.state };
    }));
    await p.waitForTimeout(380);
  }
  const before = await p.evaluate(() => Math.round(window.__rxGame.currentTimeMs()));
  await p.waitForTimeout(1200);
  const after = await p.evaluate(() => ({ state: window.__rxGame.state, t: Math.round(window.__rxGame.currentTimeMs()), audio: window.__rxGame.audioCtx.state }));
  console.log('sıra:', JSON.stringify(seen));
  console.log('geri sayım sonrası:', JSON.stringify(after), '| önce t:', before);
  console.log('hatalar:', errs);
  await b.close();
})();
