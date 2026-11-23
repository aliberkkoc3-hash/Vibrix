/* Vibrix — küçük hareket yardımcıları (arayüz animasyonları) */

/**
 * Liste öğelerine sırayla belirme sınıfı verir.
 * @param {ParentNode} scope  içinde arama yapılacak alan
 * @param {string} selector   öğe seçicisi (örn. '.chart-card')
 */
export function stagger(scope = document, selector = '.vx-auto') {
  if (!scope) return;
  const items = scope.querySelectorAll(selector);
  items.forEach((el, i) => {
    if (el.classList.contains('vx-stagger')) return;
    el.classList.add('vx-stagger');
    el.dataset.i = String(Math.min(i, 11));
  });
}

/** Bir elemanın üzerine gelindiğinde parlama noktasını fareye taşır. */
export function pointerGlow(scope = document, selector = '.chart-card') {
  if (!scope) return;
  scope.querySelectorAll(selector).forEach((el) => {
    if (el.dataset.glowBound) return;
    el.dataset.glowBound = '1';
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
      el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
    });
  });
}
