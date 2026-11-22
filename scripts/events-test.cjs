const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 160)));
  const uname = 'ev' + Date.now().toString(36).slice(-6);
  await p.goto('http://127.0.0.1:4321/kayit', { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  if (await p.locator('#legal-host:not([hidden])').count()) { await p.click('#legal-dont'); await p.click('#legal-accept'); await p.waitForTimeout(250); }
  await p.fill('#username', uname); await p.fill('#email', uname + '@example.com');
  await p.fill('#password', 'parola1234'); await p.fill('#passwordConfirm', 'parola1234');
  await p.click('#submit-btn'); await p.waitForTimeout(2000);

  // Editor: kendi grafiðini oluþtur
  await p.goto('http://127.0.0.1:4321/editor', { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);
  if (await p.locator('#legal-host:not([hidden])').count()) { await p.click('#legal-dont'); await p.click('#legal-accept'); await p.waitForTimeout(250); }
  await p.waitForTimeout(900);
  await p.fill('#nf-title', 'Event Testi ' + uname);
  await p.fill('#nf-artist', 'Vibrix Studio');
  await p.fill('#nf-bpm', '120');
  // Ses dosyasý: küçük bir wav üret
  const fs = require('fs');
  const path = require('path');
  const wav = path.join(process.env.TMPDIR || '.', 'ev-test.wav');
  if (!fs.existsSync(wav)) {
    const sr = 8000, secs = 3, n = sr * secs;
    const buf = Buffer.alloc(44 + n * 2);
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
    buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
    buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((i / sr) * 440 * 2 * Math.PI) * 8000), 44 + i * 2);
    fs.writeFileSync(wav, buf);
  }
  await p.setInputFiles('#nf-audio', wav);
  await p.click('#new-form button[type="submit"]');
  await p.waitForTimeout(4000);
  console.log('editor url:', p.url());

  // Eventler sekmesi
  await p.click('.ed-tab[data-tab="events"]');
  await p.waitForTimeout(400);
  const evItems = await p.locator('.ev-item').count();
  console.log('event tÃ¼rÃ¼ sayÄ±sÄ±:', evItems);
  await p.screenshot({ path: 'data/screenshots/69-editor-events.png', fullPage: false });

  // BirkaÃ§ event ekle
  await p.click('.ev-item[data-ev="laneflash"]');
  await p.click('#ev-add');
  await p.waitForTimeout(250);
  await p.click('.ev-item[data-ev="glitch"]');
  await p.click('#ev-add');
  await p.waitForTimeout(250);
  await p.click('.ev-item[data-ev="zoom"]');
  await p.click('#ev-add');
  await p.waitForTimeout(300);
  const evRows = await p.locator('.ev-row').count();
  console.log('eklenen event sayÄ±sÄ±:', evRows);

  // Kaydet
  await p.click('#ed-save').catch(() => {});
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'data/screenshots/70-editor-events-list.png', fullPage: false });
  console.log('hatalar:', errs);
  await b.close();
})();
