/* Vibrix — açılış (boot) ekranı
 *
 * Bu bir "sahte" yükleme animasyonu değil: ekranda görünen adımlar gerçekten
 * yapılan işlerdir (modül yükleme, sunucu bağlantısı, oturum doğrulama,
 * ayarlar, ilk sayfanın verisi). Her adım tamamlandığında çubuk ilerler.
 * Adımlar bitmeden arayüz gösterilmez; çubuk %100'e ancak iş bittiğinde gelir.
 */

const STEPS = [
  { key: 'modules', label: 'Arayüz yükleniyor…', weight: 10 },
  { key: 'server', label: 'Sunucuya bağlanılıyor…', weight: 18 },
  { key: 'session', label: 'Oturum doğrulanıyor…', weight: 22 },
  { key: 'settings', label: 'Ayarlar hazırlanıyor…', weight: 14 },
  { key: 'data', label: 'Grafikler getiriliyor…', weight: 26 },
  { key: 'ui', label: 'Arayüz hazırlanıyor…', weight: 10 },
];

const MIN_MS = 900;        // açılış ekranı göz kırpması kadar hızlı kaybolmasın
const MAX_MS = 12000;      // bir adım takılırsa sonsuza kadar bekleme

let started = 0;
let done = 0;
let finished = false;
let boot, fill, stepEl, pctEl, barEl;
const listeners = new Set();

const totalWeight = STEPS.reduce((a, s) => a + s.weight, 0);

function paint(progress, label) {
  const pct = Math.max(0, Math.min(100, Math.round(progress)));
  if (fill) fill.style.width = `${pct}%`;
  if (pctEl) pctEl.textContent = `${pct}%`;
  if (barEl) barEl.setAttribute('aria-valuenow', String(pct));
  if (label && stepEl) stepEl.textContent = label;
}

/** Bir adımı tamamla: çubuk o adımın ağırlığı kadar ilerler. */
export function bootStep(key, label) {
  if (finished) return;
  const idx = STEPS.findIndex((s) => s.key === key);
  if (idx >= 0) {
    // Aynı adım iki kez sayılmasın
    if (key === 'modules' && done > 0) return;
    done = Math.max(done, idx + 1);
  }
  const upto = STEPS.slice(0, Math.max(done, 1)).reduce((a, s) => a + s.weight, 0);
  paint((upto / totalWeight) * 100, label);
  listeners.forEach((fn) => { try { fn(key); } catch { /* yoksay */ } });
}

/** Açılış ekranını kapat (adımlar bittiğinde çağrılır). */
export function bootDone() {
  if (finished) return;
  finished = true;
  const elapsed = performance.now() - started;
  const wait = Math.max(0, MIN_MS - elapsed);
  paint(100, 'Hazır');
  setTimeout(() => {
    if (!boot) return;
    boot.classList.add('is-done');
    document.body.classList.remove('booting');
    setTimeout(() => { boot.hidden = true; boot.remove?.(); }, 520);
  }, wait + 160);
}

/** Ekranda kalma süresi bir sınırı aşarsa yine de devam et. */
function armWatchdog() {
  setTimeout(() => {
    if (!finished) {
      // Bir adım askıda kaldı: arayüzü yine de göster, kullanıcı beklemesin.
      bootDone();
    }
  }, MAX_MS);
}

/** HTML'deki #boot öğesini bulur ve çubuğu sıfırlar. */
export function initBoot() {
  boot = document.getElementById('boot');
  if (!boot) { finished = true; document.body.classList.remove('booting'); return false; }
  fill = document.getElementById('boot-fill');
  stepEl = document.getElementById('boot-step');
  pctEl = document.getElementById('boot-pct');
  barEl = document.getElementById('boot-bar');
  started = performance.now();
  paint(2, STEPS[0].label);
  armWatchdog();
  return true;
}

/** Test/geliştirme için: ekranı hemen kapat. */
export function bootSkip() { finished = false; bootDone(); }
