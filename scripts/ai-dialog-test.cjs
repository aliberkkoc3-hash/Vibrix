const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 950 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 200)); });
  await p.goto('http://127.0.0.1:4321/giris', { waitUntil: 'networkidle' });
  await p.fill('#identifier', 'editor_test');
  await p.fill('#password', 'parola1234');
  await p.click('#submit-btn');
  await p.waitForTimeout(1200);
  await p.goto('http://127.0.0.1:4321/editor/7', { waitUntil: 'networkidle' });
  await p.waitForSelector('#ed-ai', { timeout: 15000 });
  await p.waitForTimeout(2500);
  await p.click('#ed-ai');
  await p.waitForSelector('#ai-run');
  await p.screenshot({ path: 'data/screenshots/24-ai-dialog.png' });
  // ayarları değiştir
  await p.selectOption('#ai-style', 'tech');
  await p.click('#ai-chords');
  await p.fill('#ai-chords', '60').catch(()=>{});
  await p.evaluate(() => { const el = document.querySelector('#ai-chords'); el.value = 60; el.dispatchEvent(new Event('input')); });
  await p.evaluate(() => { const el = document.querySelector('#ai-stairs'); el.checked = true; });
  await p.evaluate(() => { const el = document.querySelector('#ai-diff'); el.value = 12; el.dispatchEvent(new Event('input')); });
  await p.screenshot({ path: 'data/screenshots/25-ai-dialog-tech.png' });
  await p.click('#ai-run');
  await p.waitForSelector('#modal-host.open', { state: 'detached', timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const toastText = await p.locator('.toast').first().innerText().catch(() => 'toast yok');
  console.log('bilgi:', toastText.replace(/\n/g, ' '));
  const info = await p.evaluate(() => ({
    bpm: document.querySelector('#ed-bpm').value,
    offset: document.querySelector('#ed-offset').value,
    notes: window.__ed ? window.__ed.notes.length : null,
  }));
  console.log('editör:', JSON.stringify(info));
  await p.screenshot({ path: 'data/screenshots/26-ai-tech-result.png' });
  console.log('hatalar:', errs.length ? errs.join(' | ') : 'yok');
  await b.close();
})();
