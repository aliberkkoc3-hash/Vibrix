const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 160)));
  const uname = 'ep' + Date.now().toString(36).slice(-6);
  const dismiss = async () => {
    await p.waitForTimeout(700);
    if (await p.locator('#legal-host:not([hidden])').count()) { await p.click('#legal-dont'); await p.click('#legal-accept'); await p.waitForTimeout(250); }
  };
  await p.goto('http://127.0.0.1:4321/kayit', { waitUntil: 'networkidle' });
  await dismiss();
  await p.fill('#username', uname); await p.fill('#email', uname + '@example.com');
  await p.fill('#password', 'parola1234'); await p.fill('#passwordConfirm', 'parola1234');
  await p.click('#submit-btn'); await p.waitForTimeout(2000);

  // Chart 1'e eventleri doğrudan API ile yaz (BFAli'nin grafiği değil, kendi grafiğimizi kuralım)
  // Basitçe: chart 1'i oynayıp motorun event desteğini test et
  await p.goto('http://127.0.0.1:4321/chart/1', { waitUntil: 'networkidle' });
  await dismiss();
  await p.waitForTimeout(800);
  await p.click('#play-btn');
  await p.waitForTimeout(1800);
  await p.click('#ov-start').catch(() => {});
  await p.waitForTimeout(2500);

  // Motoru durdur, eventleri elle enjekte et ve her birini çiz
  const results = await p.evaluate(async () => {
    const g = window.__rxGame;
    if (!g) return { error: 'motor yok' };
    g.state = 'paused';
    const out = [];
    const types = ['laneflash', 'zoom', 'invert', 'shake', 'glitch', 'wave', 'blackout'];
    for (const type of types) {
      g.triggerEvent({ id: type, type, time: 0, duration: 1500, intensity: 90, lane: 1 });
      g.draw();
      out.push({ type, active: g.activeEvents.length, zoomK: +g.zoomK.toFixed(2), glitchK: +g.glitchK.toFixed(2), invertK: +g.invertK.toFixed(2), blackoutK: +g.blackoutK.toFixed(2), laneFlash: g.laneFlash.map(v => +v.toFixed(2)) });
      // sonraki event için temizle
      g.zoomK = 0; g.glitchK = 0; g.invertK = 0; g.blackoutK = 0; g.waveK = 0; g.laneFlash = [0,0,0,0]; g.activeEvents = [];
    }
    // Hepsini aynı anda
    for (const type of ['glitch', 'wave', 'zoom']) g.triggerEvent({ id: type + '2', type, time: 0, duration: 2000, intensity: 85, lane: null });
    g.draw();
    return { out, hasEvents: Array.isArray(g.events), eventCount: g.events.length };
  });
  console.log(JSON.stringify(results, null, 1).slice(0, 1600));
  await p.screenshot({ path: 'data/screenshots/71-events-ingame.png' });
  console.log('hatalar:', errs);
  await b.close();
})();
