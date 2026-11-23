/* Vibrix — Güncelleme Notları */
import { $ } from '../app.js';
import { icon } from '../icons.js';

/**
 * Sürüm notları. En yeni sürüm en üstte.
 * Yeni bir sürüm eklerken diziye başa bir nesne eklemek yeterlidir.
 */
const RELEASES = [
  {
    version: '1.4',
    date: '23 Kasım 2026',
    title: 'Yeni Arayüz & Oyun İçi HUD',
    tag: 'Arayüz',
    highlights: [
      'Logoya uyumlu yeni mor palet — tüm site baştan renklendirildi.',
      'Sayfa geçişleri, kart hover\'ları ve sıralı belirme animasyonları eklendi.',
      'Oyun içi HUD tamamen yenilendi: şarkı kartı, üst-orta kombo sayacı, skor paneli.',
      'Vuruşlara halka, kıvılcım ve ekran ışıması efektleri eklendi.',
      'Sonuç ekranı yeniden tasarlandı: derece rozeti, skor animasyonu, judgment dağılımı.',
    ],
  },
  {
    version: '1.3',
    date: '23 Kasım 2026',
    title: 'Paketler & Nota Renkleri',
    tag: 'İçerik',
    highlights: [
      'Grafikler artık paketlere (Vibrix Apocalypse, Vibrix Scrapped, Vibrix Retakes…) ayrıldı.',
      'Chart Editor\'daki paket alanı dinamik: boş bırakılırsa pakete girmez, yeni ad yazılırsa paket otomatik oluşur.',
      'Boş paketler listede görünmüyor.',
      'Üç yeni nota paleti: Vibrix Apocalypse, Vibrix Scrapped, Vibrix Retakes.',
      'Ayarlar → Oyun İçi HUD: cam panel / sade düzen ve panel açma-kapama seçenekleri.',
    ],
  },
  {
    version: '1.2',
    date: '22 Kasım 2026',
    title: 'AI Grafik Üretici',
    tag: 'Chart Editor',
    highlights: [
      'Ses dosyası tarayıcıda spektral analizden geçirilip otomatik grafik üretiliyor.',
      'Tempo takibi, ofset hizalama, merdiven desenleri ve akor üretimi.',
      'AI ile oluşturulan grafikler rozetle işaretleniyor.',
    ],
  },
  {
    version: '1.1',
    date: '20 Kasım 2026',
    title: 'Skor Doğrulama',
    tag: 'Düzeltme',
    highlights: [
      'Skor doğrulaması aralık tabanlı hâle getirildi; geçerli oynanışlar artık reddedilmiyor.',
      'Hold notalarda çift judgment sayımı düzeltildi.',
      'Liderlik tablosunda oynanma sayısı sütunu düzeltildi.',
    ],
  },
  {
    version: '1.0',
    date: '18 Kasım 2026',
    title: 'Vibrix yayında',
    tag: 'Sürüm',
    highlights: [
      '4 tuşlu ritim oynanışı, Chart Editor ve topluluk grafikleri.',
      'Liderlik tabloları, kişisel rekorlar ve derece (rank) sistemi.',
    ],
  },
];

const TAG_CLASS = {
  'Arayüz': 'accent',
  'İçerik': 'info',
  'Chart Editor': 'demo',
  'Düzeltme': 'success',
  'Sürüm': 'warn',
};

export async function render({ main }) {
  main.innerHTML = `
    <div class="page-head">
      <div>
        <div class="eyebrow">Güncelleme Notları</div>
        <h1>Vibrix'te neler değişti?</h1>
        <p class="muted">Yeni özellikler, iyileştirmeler ve düzeltmeler — en yenisi en üstte.</p>
      </div>
    </div>

    <div class="changelog" id="changelog">
      ${RELEASES.map((r, i) => `
        <article class="card cl-entry ${i === 0 ? 'cl-latest' : ''}" data-i="${Math.min(i, 11)}">
          <div class="cl-rail" aria-hidden="true"><span class="cl-dot"></span></div>
          <div class="cl-body">
            <div class="cl-head">
              <div class="cl-version">
                <span class="cl-ver">v${r.version}</span>
                ${i === 0 ? '<span class="cl-now">en yeni</span>' : ''}
                <span class="badge ${TAG_CLASS[r.tag] || 'accent'}">${r.tag}</span>
              </div>
              <time class="cl-date">${r.date}</time>
            </div>
            <h2 class="cl-title">${r.title}</h2>
            <ul class="cl-list">
              ${r.highlights.map((h) => `<li>${h}</li>`).join('')}
            </ul>
          </div>
        </article>`).join('')}
    </div>

    <div class="card cl-foot">
      <div>
        <strong>Bir önerin mi var?</strong>
        <p class="muted small" style="margin:2px 0 0">Keşfet sayfasından grafik paylaşabilir, Chart Editor ile kendi grafiğini yapabilirsin.</p>
      </div>
      <a class="btn btn-primary" href="/kesfet" data-link>${icon('compass')} Grafikleri Keşfet</a>
    </div>`;

  // Sıralı belirme
  const items = main.querySelectorAll('.cl-entry');
  items.forEach((el, i) => { el.style.animationDelay = `${Math.min(i, 8) * 60}ms`; });
}
