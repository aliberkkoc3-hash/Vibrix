
## AI Grafik Oluşturucu (Chart Editor içinde)

Editörde **✨ AI Grafik** düğmesi, yüklediğin ses dosyasını analiz edip 4K grafiği otomatik üretir.

- Ses dosyası tarayıcıda çözümlenir (Web Audio API), **hiçbir yere gönderilmez**; harici bir yapay zekâ servisi çağrılmaz.
- Analiz hattı:
  1. Mono kanal + 22.05 kHz'e indirme (aliasing önleyici ortalama).
  2. STFT (1024 örnek, %50 örtüşme, Hann penceresi) ve kendi yazdığı radix-2 FFT.
  3. Bas / orta / tiz bant enerjileri + spektral akış (spectral flux).
  4. Tempo: otokorelasyon → tempo oylaması (yarım BPM'e yuvarlama ile 128.0 gibi gerçek değerler).
  5. **Izgara araması**: (BPM, ofset) çifti küçük bir aralıkta taranır, notaların 1/16 ızgarasına en iyi oturan kombinasyon seçilir — uzun şarkılarda biriken kayma önlenir.
  6. Katmanlı vuruş algılama (kick / snare / hi-hat / melodi) ve adaptif eşik.
  7. 1/16 ızgaraya oturtma → zorluk seviyesine göre seyreltme → hat ataması (bas vuruşlar dış hatlar, melodi iç hatlar) → hold notaları.
  8. **Merdiven (stairs)** desenleri: art arda gelen hızlı notalarda 1-2-3-4 / 4-3-2-1 dizileri (zorlukla 4→6 nota).
- Ayarlar: zorluk (1–15), stil (**Dengeli / Akış / Jack / Teknik**), vuruş hassasiyeti, akor yoğunluğu, merdiven açma-kapama, BPM ve ofset (boş = otomatik).
- Deterministik: aynı ses + aynı ayar = aynı grafik.
- Sonuç editöre yazılır, `Ctrl+Z` ile geri alınabilir, "Kaydet" ile sunucuya gider ve grafik "✨ AI ile oluşturuldu" olarak işaretlenir.
- Modül: `public/js/editor/autochart.js` (`generateChart(buffer, { difficulty, style, sensitivity, chords, stairs, bpm, offset, onProgress })`)

## 3D Perspektif

Ayarlar → Oynanış → **3D Perspektif** açıldığında oyun alanı düz 4K yerine
derinlikli bir sahne olur:

- Şeritler ufuk noktasına doğru daralır (trapez), hat ayırıcıları ve beat
  çizgileri perspektife uygun eğilir.
- Notalar uzaklaştıkça küçülür, yaklaştıkça büyür; hold gövdeleri de aynı
  ölçekle çizilir.
- "Perspektif Derinliği" (%10–100) ufkun konumunu ve daralma oranını belirler.

Kapalıyken hiçbir ek hesaplama yapılmaz, oyun klasik düz görünümde kalır.
Ayar `localStorage` + hesap eşitleme ile saklanır (`gameplay.perspective`,
`gameplay.perspectiveStrength`).

## Liderlik tablolarını sıfırlama

```bash
node server/reset-leaderboard.js                 # skorlar + test hesapları
node server/reset-leaderboard.js --keep-test-users  # sadece skorlar
```

Tüm skor denemeleri, kişisel rekorlar, ratingler, rating geçmişi ve favoriler
silinir; grafikler ve hesaplar korunur. Test/otomatik test hesapları
(`oyuncur*`, `tmwr*`, `test*`, `editor_test`) varsayılan olarak silinir.

## Chart Editor (yenilendi)

Editör iki sütuna ayrıldı: solda **zaman çizelgesi**, sağda **palet + ayarlar**.

- **Araç paleti** (sağ üst): `Nota` (tıkla-ekle), `Uzun` (bas-sürükle), `Seç` (taşı), `Sil`.
  Seçili araç vurgulanır ve altındaki ipucu satırı o aracın nasıl kullanıldığını söyler.
- **Hat paleti**: D / F / J / K düğmeleri oyunla aynı renklerde (mor, mavi, yeşil, pembe).
  Bir hatta tıklamak o hattı aktif yapar; seçili nota varsa hatlar arası taşır.
- **Sekmeler**: Şarkı · Nota · Yardım — sağ panel böylece kısa ve okunur kalır.
- **Izgara**: 1/4–1/32 yapıştırma, hat renkleri ve ölçü etiketleri, aktif hat vurgusu,
  yuvarlatılmış notalar, çalarken görünümü takip eden kaydırma.
- Klavye kısayolları korunur: `1-4` hat, `D F J K` nota, `Delete`, `Ctrl+Z/Shift+Z`,
  `Space` çal/durdur, `Ctrl+S` kaydet, `Ctrl`+tekerlek yakınlaştırma.

## Stüdyo hesabı

Tüm resmi grafikler **Prism Crew** stüdyosuna aittir; hesap sahibi **BFAli**'dir.
Stüdyo hesabı yalnızca içerik etiketi için vardır (girişi kapalıdır).

- Stüdyo hesabı: `Prism Crew` (profilde "Stüdyo" rozeti görünür).
- Grafik sahipliği: `BFAli` — tüm grafikler onun hesabında, düzenlenebilir.
- Grafik detayında hem **Sahip** (BFAli) hem **Stüdyo** (Prism Crew) satırı gösterilir.
- Kurulum: `node scripts/studio-migrate.cjs` (demo hesabını stüdyoya çevirir, grafikleri devreder).

## Liderlik tablosu sıfırlama

`node server/reset-leaderboard.js` — tüm skor denemelerini, kişisel rekorları,
rating geçmişini, ratingleri ve favorileri siler. Grafikler ve hesaplar korunur.
`--keep-test-users` test hesaplarını silmez.
