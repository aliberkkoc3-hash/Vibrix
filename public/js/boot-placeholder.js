/* Vibrix — açılış ekranı için ilk animasyon (modüllerden bağımsız, klasik script).
 * Arayüz modülleri yüklenene kadar çubuğu hafifçe ilerletir; main.js hazır
 * olduğunda window.__vibrixBootReady işaretini görüp kendini durdurur. */
(function () {
  var fill = document.getElementById('boot-fill');
  var pct = document.getElementById('boot-pct');
  var step = document.getElementById('boot-step');
  var v = 6;
  var t = setInterval(function () {
    if (window.__vibrixBootReady) { clearInterval(t); return; }
    v = Math.min(42, v + Math.random() * 4);
    if (fill) fill.style.width = v.toFixed(1) + '%';
    if (pct) pct.textContent = Math.round(v) + '%';
    if (v > 18 && step) step.textContent = 'Arayüz yükleniyor…';
  }, 220);
  window.addEventListener('error', function () {
    if (step) step.textContent = 'Bir şeyler ters gitti, devam ediliyor…';
  });
})();
