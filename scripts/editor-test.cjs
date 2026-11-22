const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 950 } });
  p.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0,300)));
  p.on('console', m => { if (m.type()==='error') console.log('CONSOLE', m.text().slice(0,300)); });
  await p.goto('http://127.0.0.1:4321/giris', { waitUntil: 'networkidle' });
  await p.fill('#identifier', 'editor_test');
  await p.fill('#password', 'parola1234');
  await p.click('#submit-btn');
  await p.waitForTimeout(1500);
  await p.goto('http://127.0.0.1:4321/editor/7', { waitUntil: 'networkidle' });
  await p.waitForSelector('#editor-canvas', { timeout: 15000 });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'data/screenshots/18-editor.png' });
  // notaları görsel olarak doğrula
  const n = await p.evaluate(() => document.querySelector('#ed-note-count').textContent);
  console.log('nota sayısı:', n);
  // canvas'a tıkla -> yeni nota
  const box = await p.locator('#editor-canvas').boundingBox();
  await p.mouse.click(box.x + box.width * 0.35, box.y + 200);
  await p.waitForTimeout(300);
  console.log('tıklama sonrası:', await p.locator('#ed-note-count').textContent());
  await p.screenshot({ path: 'data/screenshots/19-editor-note.png' });
  await b.close();
})();
