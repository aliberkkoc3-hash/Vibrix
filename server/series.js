'use strict';
/**
 * Paket (seri) yardımcıları.
 *
 * - Bir grafik ya bir pakete aittir ya da hiçbirine (paket adı boş).
 * - Paket listesi sabit değildir: editörde yazılan bir paket adı ilk kez
 *   kaydedildiğinde `series` tablosuna eklenir, böylece paket otomatik oluşur.
 * - Aynı paketin farklı yazımları (büyük/küçük harf, boşluk) tek paket sayılır.
 */
const { db } = require('./db');

const MAX_SERIES_LEN = 60;

/** Paket adını normalize et: boşlukları sadeleştir, 60 karakterle sınırla */
function normalizeSeries(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_SERIES_LEN);
}

/**
 * Paket adı karşılaştırma anahtarı (büyük/küçük harf ve boşluk farkı yok).
 * Türkçe 'I' → 'ı' dönüşümü kullanılmaz: aynı paket "YENI" ve "yeni" diye
 * yazıldığında iki ayrı paket oluşmasın.
 */
function seriesKey(name) {
  return normalizeSeries(name).toLowerCase();
}

/** SQL karşılaştırması için: metni küçük harfe çevir (ASCII büyük harfler) */
function sqlLower(value) {
  return String(value || '').replace(/[A-Z]/g, (c) => c.toLowerCase());
}

/** Paket tabloya kayıtlı mı */
function seriesExists(name) {
  const key = seriesKey(name);
  if (!key) return false;
  return !!db.prepare('SELECT 1 AS x FROM series WHERE name_lower = ?').get(key);
}

/**
 * Paketi oluştur (varsa hiçbir şey yapmaz).
 * Dönüş: true → paket bu çağrıda oluşturuldu (yani daha önce yoktu).
 */
function ensureSeries(name) {
  const clean = normalizeSeries(name);
  if (!clean) return false;
  const key = seriesKey(clean);
  const info = db.prepare('INSERT OR IGNORE INTO series (name, name_lower) VALUES (?, ?)').run(clean, key);
  return info.changes > 0;
}

/**
 * Paket listesi: kayıtlı paketler + grafiklerde geçen adlar (eski veriler için).
 * Grafik sayıları grafik verisindeki "series" alanından hesaplanır.
 */
function listSeries() {
  // 1) Tabloda kayıtlı paketler (adıyla birlikte)
  const map = new Map();
  for (const row of db.prepare('SELECT name FROM series ORDER BY id').all()) {
    const key = seriesKey(row.name);
    if (!key || map.has(key)) continue;
    map.set(key, { key, name: row.name, charts: 0, published: 0 });
  }
  // 2) Grafiklerdeki paket adları ve sayıları
  const rows = db.prepare('SELECT chart_data, song_title, publication_status FROM charts').all();
  const names = [...map.values()].map((v) => v.name);
  for (const row of rows) {
    // Grafikte "series" alanı boşsa başlıktan da çıkarılabilir; aksi hâlde
    // paket adı başlıkta geçtiği hâlde sayı 0'da kalıyordu.
    const name = seriesOfChart(row.chart_data, row.song_title, names);
    if (!name) continue;
    const key = seriesKey(name);
    if (!map.has(key)) {
      map.set(key, { key, name, charts: 0, published: 0 });
      names.push(name);
    }
    const entry = map.get(key);
    entry.charts++;
    if (row.publication_status === 'published') entry.published++;
  }
  // 3) Hiç grafiği olmayan paketler listelenmez (boş paket görünmesin).
  return [...map.values()]
    .filter((v) => v.charts > 0)
    .sort((a, b) => b.charts - a.charts || a.name.localeCompare(b.name, 'tr'));
}

/**
 * Bir grafik hangi pakete ait? Grafik verisindeki "series" alanı esastır.
 * Alan boşsa eski grafikler için başlıktan çıkarılır: başlıkta geçen en uzun
 * paket adı kazanır ("...-Vibrix-Apocalypse" → Vibrix Apocalypse, Vibrix değil).
 * Hiçbiri geçmiyorsa grafik hiçbir pakete ait değildir.
 */
function seriesOfChart(chartData, songTitle, seriesNames) {
  let name = '';
  try { name = normalizeSeries(JSON.parse(chartData).series || ''); } catch { name = ''; }
  if (name) return name;
  const key = seriesKey(songTitle || '').replace(/\s+/g, '');
  if (!key) return '';
  let best = '';
  for (const candidate of seriesNames) {
    const needle = seriesKey(candidate).replace(/\s+/g, '');
    if (needle && key.includes(needle) && needle.length > seriesKey(best).replace(/\s+/g, '').length) best = candidate;
  }
  return best;
}

module.exports = { normalizeSeries, seriesKey, sqlLower, seriesExists, ensureSeries, listSeries, seriesOfChart, MAX_SERIES_LEN };
