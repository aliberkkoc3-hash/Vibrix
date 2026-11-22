const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('P:' + e.message.slice(0, 160)));
  p.on('console', m => { if (m.type() === 'error') errs.push('C:' + m.text().slice(0, 140)); });
  await p.goto('http://127.0.0.1:4321/giris', { waitUntil: 'networkidle' });
  await p.fill('#identifier', 'editor_test');
  await p.fill('#password', 'parola1234');
  await p.click('#submit-btn');
  await p.waitForTimeout(1500);
  await p.goto('http://127.0.0.1:4321/editor/7', { waitUntil: 'networkidle' });
  await p.waitForSelector('#editor-canvas', { timeout: 15000 });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: 'data/screenshots/38-editor-new.png' });
  // palet testleri
  await p.click('.ed-tool[data-tool="hold"]');
  await p.click('.ed-lane[data-lane="2"]');
  const hint = await p.textContent('#ed-hint');
  await p.click('.ed-tab[data-tab="note"]');
  const notePaneVisible = await p.isVisible('[data-pane="note"]');
  const songPaneHidden = await p.isHidden('[data-pane="song"]');
  // ızgaraya nota ekle
  const box = await p.locator('#editor-canvas').boundingBox();
  await p.click('.ed-tool[data-tool="tap"]');
  await p.mouse.click(box.x + box.width / 2, box.y + 120);
  await p.waitForTimeout(300);
  const cnt = await p.textContent('#ed-note-count');
  await p.screenshot({ path: 'data/screenshots/39-editor-tools.png' });
  // erase
  await p.click('.ed-tool[data-tool="erase"]');
  await p.mouse.click(box.x + box.width / 2, box.y + 120);
  await p.waitForTimeout(300);
  const cnt2 = await p.textContent('#ed-note-count');
  console.log(JSON.stringify({ hint, notePaneVisible, songPaneHidden, cnt, cnt2, errs }, null, 1));
  await b.close();
})();
