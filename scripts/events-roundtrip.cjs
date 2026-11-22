const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 160)));
  const uname = 'rt' + Date.now().toString(36).slice(-6);
  const dismiss = async () => { await p.waitForTimeout(700); if (await p.locator('#legal-host:not([hidden])').count()) { await p.click('#legal-dont'); await p.click('#legal-accept'); await p.waitForTimeout(250); } };
  await p.goto('http://127.0.0.1:4321/kayit', { waitUntil: 'networkidle' });
  await dismiss();
  await p.fill('#username', uname); await p.fill('#email', uname + '@example.com');
  await p.fill('#password', 'parola1234'); await p.fill('#passwordConfirm', 'parola1234');
  await p.click('#submit-btn'); await p.waitForTimeout(2000);
  await p.goto('http://127.0.0.1:4321/editor', { waitUntil: 'networkidle' });
  await dismiss(); await p.waitForTimeout(700);
  await p.fill('#nf-title', 'Event Roundtrip ' + uname);
  await p.fill('#nf-bpm', '120');
  const fs = require('fs'), path = require('path');
  const wav = path.join(process.env.TMPDIR || '.', 'ev-rt.wav');
  const sr = 8000, n = sr * 4;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((i / sr) * 440 * 2 * Math.PI) * 8000), 44 + i * 2);
  fs.writeFileSync(wav, buf);
  await p.setInputFiles('#nf-audio', wav);
  await p.click('#new-form button[type="submit"]');
  await p.waitForTimeout(4000);
  const url = p.url();
  const chartId = url.split('/').pop();
  // Eventler sekmesi -> 3 event ekle
  await p.click('.ed-tab[data-tab="events"]');
  await p.waitForTimeout(400);
  for (const t of ['laneflash', 'glitch', 'wave']) {
    await p.click(`.ev-item[data-ev="${t}"]`);
    await p.click('#ev-add');
    await p.waitForTimeout(200);
  }
  await p.click('#ed-save');
  await p.waitForTimeout(2000);
  // Sunucudan doğrula
  const api = await p.evaluate(async (id) => (await (await fetch(`/api/charts/${id}`)).json()).chart.chartData.events, chartId);
  // Sayfayı yenile: eventler geri geliyor mu?
  await p.reload({ waitUntil: 'networkidle' });
  await dismiss(); await p.waitForTimeout(1500);
  await p.click('.ed-tab[data-tab="events"]');
  await p.waitForTimeout(500);
  const rows = await p.locator('.ev-row').count();
  console.log(JSON.stringify({ chartId, apiEvents: api?.length, apiSample: api?.[0], editorRows: rows }, null, 1));
  console.log('hatalar:', errs);
  await b.close();
})();
