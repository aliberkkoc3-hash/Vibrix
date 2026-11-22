'use strict';
/** Tarayıcı (Playwright) uçtan uca testi — ekran görüntüleri + konsol hataları */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE || 'http://127.0.0.1:4321';
const SHOTS = path.join(__dirname, '..', 'data', 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const errors = [];
const log = [];

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${page.url()} :: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${page.url()} :: ${e.message}`));
  page.on('requestfailed', (r) => {
    if (!r.url().includes('favicon')) errors.push(`[requestfailed] ${r.url()} :: ${r.failure()?.errorText}`);
  });

  const shot = async (name) => {
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
    log.push(`ekran görüntüsü: ${name}.png`);
  };

  // Telif uyarısı paneli her açılışta çıkıyor: görünürse kapat
  const dismissLegal = async (shotName) => {
    const host = page.locator('#legal-host:not([hidden])');
    if (!(await host.count())) return;
    if (shotName) await page.screenshot({ path: path.join(SHOTS, shotName), fullPage: false });
    await page.click('#legal-dont');
    await page.click('#legal-accept');
    await page.waitForTimeout(250);
  };

  // 0) Telif uyarısı paneli (ilk açılış)
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await dismissLegal('00-legal-notice.png');
  log.push('telif uyarısı paneli kontrol edildi');

  // 1) Ana sayfa (misafir)
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await dismissLegal();
  await page.waitForSelector('.hero');
  log.push('ana sayfa başlık: ' + (await page.locator('.hero h1').innerText()).replace(/\n/g, ' '));
  await shot('01-home-guest');

  // 2) Keşfet
  await page.goto(BASE + '/kesfet', { waitUntil: 'networkidle' });
  await dismissLegal();
  await page.waitForSelector('.chart-grid .chart-card');
  log.push('keşfet kart sayısı: ' + await page.locator('.chart-grid .chart-card').count());
  await shot('02-discover');

  // 3) Kayıt
  await page.goto(BASE + '/kayit', { waitUntil: 'networkidle' });
  await dismissLegal();
  const uname = 'oyuncu' + Date.now().toString(36).slice(-6);
  await page.fill('#username', uname);
  await page.fill('#email', `${uname}@example.com`);
  await page.fill('#password', 'parola1234');
  await page.fill('#passwordConfirm', 'parola1234');
  await shot('03-register');
  await page.click('#submit-btn');
  await page.waitForSelector('.hero', { timeout: 10000 });
  log.push('kayıt sonrası kullanıcı çubuğu: ' + await page.locator('.user-chip .name').innerText());
  await shot('04-home-logged-in');

  // 4) Grafik detay (demo grafik)
  await page.goto(BASE + '/chart/1', { waitUntil: 'networkidle' });
  await dismissLegal();
  await page.waitForSelector('#play-btn', { timeout: 15000 });
  log.push('grafik detay başlık: ' + await page.locator('h1').first().innerText());
  await shot('05-chart-detail');

  // 5) Oynanış: demo grafiği başlat, birkaç tuşa bas, duraklat
  await page.goto(BASE + '/chart/1', { waitUntil: 'networkidle' });
  await dismissLegal();
  await page.waitForSelector('#play-btn', { timeout: 15000 });
  await page.click('#play-btn');
  await page.waitForSelector('#ov-start', { timeout: 15000 });
  await shot('06-game-ready');
  await page.click('#ov-start');
  await page.waitForTimeout(4200); // geri sayım + şarkı başlangıcı
  const keys = ['d', 'f', 'j', 'k'];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press(keys[i % 4]);
    await page.waitForTimeout(110);
  }
  await shot('07-gameplay');
  const scoreText = await page.locator('#hud-score').innerText();
  log.push('oynanış skoru (HUD): ' + scoreText);
  await page.keyboard.press('Escape');
  await page.waitForSelector('#ov-resume', { timeout: 8000 }).catch(() => log.push('DİKKAT: duraklatma menüsü görünmedi'));
  await shot('08-pause');
  log.push('duraklatma: ov-resume=' + await page.locator('#ov-resume').isVisible().catch(()=>'n/a') + ' ov-exit=' + await page.locator('#ov-exit').isVisible().catch(()=>'n/a'));
  if (await page.locator('#ov-exit').isVisible()) await page.click('#ov-exit');
  else { await page.evaluate(() => document.querySelector('#pause-btn')?.click()); await page.waitForTimeout(500); await page.click('#ov-exit'); }
  await page.waitForTimeout(800);

  // 6) Liderlik tablosu
  await page.goto(BASE + '/liderlik', { waitUntil: 'networkidle' });
  await dismissLegal();
  // Tablo boşsa boş durum kartı gösterilir; ikisinden biri beklenir.
  await page.waitForSelector('.table-wrap table, .empty-state', { timeout: 15000 });
  log.push('liderlik satır sayısı: ' + await page.locator('.table-wrap tbody tr').count());
  await shot('09-leaderboard');

  // 7) Profil
  await page.goto(BASE + '/profil', { waitUntil: 'networkidle' });
  await dismissLegal();
  await page.waitForSelector('.kpi');
  await shot('10-profile');

  // 8) Ayarlar
  await page.goto(BASE + '/ayarlar', { waitUntil: 'networkidle' });
  await dismissLegal();
  await page.waitForSelector('#audio-master');
  await shot('11-settings');

  // 9) Editör: yeni grafik formu
  await page.goto(BASE + '/editor', { waitUntil: 'networkidle' });
  await dismissLegal();
  await page.waitForSelector('#new-form');
  await shot('12-editor-new');

  // 10) Editör: var olan grafiği düzenle (demo grafik sahibi değil → yetki kontrolü)
  const chartId = await page.evaluate(async () => {
    const r = await fetch('/api/charts?limit=1');
    const d = await r.json();
    return d.charts[0].id;
  });
  await page.goto(`${BASE}/chart/${chartId}`, { waitUntil: 'networkidle' });
  await dismissLegal();
  await shot('13-chart-public');

  // 11) 404
  await page.goto(BASE + '/olmayan-sayfa', { waitUntil: 'networkidle' });
  await dismissLegal();
  await shot('14-404');

  // 12) Mobil görünüm
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mp = await mobile.newPage();
  mp.on('pageerror', (e) => errors.push(`[mobile pageerror] ${e.message}`));
  await mp.goto(BASE, { waitUntil: 'networkidle' });
  await mp.waitForTimeout(700);
  if (await mp.locator('#legal-host:not([hidden])').count()) {
    await mp.screenshot({ path: path.join(SHOTS, '17-mobile-legal.png') });
    await mp.click('#legal-dont');
    await mp.click('#legal-accept');
    await mp.waitForTimeout(250);
  }
  await mp.waitForSelector('.hero');
  await mp.screenshot({ path: path.join(SHOTS, '15-mobile-home.png') });
  await mp.click('#nav-toggle');
  await mp.waitForTimeout(200);
  await mp.screenshot({ path: path.join(SHOTS, '16-mobile-nav.png') });
  await mobile.close();

  await browser.close();
  console.log(log.join('\n'));
  console.log('\n--- Konsol/JS hataları ---');
  if (!errors.length) console.log('yok');
  else console.log([...new Set(errors)].slice(0, 40).join('\n'));
  process.exit(0);
}

main().catch((e) => { console.log(log.join('\n')); console.log('--- HATALAR ---'); console.log([...new Set(errors)].slice(0,20).join('\n')); console.error('E2E hata:', e.message.slice(0,400)); process.exit(1); });
