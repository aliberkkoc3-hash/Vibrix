const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  const uname = 'nc' + Date.now().toString(36);
  await p.goto('http://127.0.0.1:4321/kayit', { waitUntil: 'networkidle' });
  await p.fill('#username', uname); await p.fill('#email', uname + '@example.com');
  await p.fill('#password', 'parola1234'); await p.fill('#passwordConfirm', 'parola1234');
  await p.click('#submit-btn'); await p.waitForTimeout(1600);
  await p.goto('http://127.0.0.1:4321/ayarlar', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);

  const chips = await p.locator('.nc-chip .nc-chip-name').allTextContents();
  // BFAli paletini seç
  await p.click('.nc-chip[data-preset="bfali"]');
  await p.waitForTimeout(1300);
  const savedBfali = await p.evaluate(() => JSON.parse(localStorage.getItem('vibrix.settings.v1')).visual.noteColors);
  // Kendi rengim
  await p.selectOption('#nc-preset', 'custom');
  await p.waitForTimeout(200);
  await p.evaluate(() => {
    const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    set('nc-c0', '#00ff88'); set('nc-c1', '#ff0055'); set('nc-c2', '#ffee00'); set('nc-c3', '#00aaff');
  });
  await p.waitForTimeout(300);
  const savedCustom = await p.evaluate(() => {
    const v = JSON.parse(localStorage.getItem('vibrix.settings.v1')).visual;
    return { noteColors: v.noteColors, custom: v.customNoteColors };
  });
  await p.screenshot({ path: 'data/screenshots/63-note-colors-settings.png', fullPage: true });

  // Oyun içinde gerçekten uygulanıyor mu?
  await p.goto('http://127.0.0.1:4321/chart/1', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1000);
  await p.click('button:has-text("Oyna")');
  await p.waitForTimeout(1500);
  await p.click('#ov-start').catch(() => {});
  await p.waitForTimeout(2600);
  const inGame = await p.evaluate(() => window.__rxGame.laneColors);
  await p.screenshot({ path: 'data/screenshots/64-note-colors-ingame.png' });

  // Hazır palet oyun içinde
  await p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('vibrix.settings.v1'));
    s.visual.noteColors = 'bflec';
    localStorage.setItem('vibrix.settings.v1', JSON.stringify(s));
  });
  await p.goto('http://127.0.0.1:4321/chart/1', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1000);
  await p.click('button:has-text("Oyna")');
  await p.waitForTimeout(1500);
  await p.click('#ov-start').catch(() => {});
  await p.waitForTimeout(2600);
  const inGame2 = await p.evaluate(() => window.__rxGame.laneColors);
  await p.screenshot({ path: 'data/screenshots/65-note-colors-bflec.png' });

  console.log(JSON.stringify({ chips, savedBfali, savedCustom, inGame, inGame2 }, null, 1), 'hatalar:', errs);
  await b.close();
})();
