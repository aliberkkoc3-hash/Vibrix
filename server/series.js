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
  const map = new Map();
  for (const row of db.prepare('SELECT name FROM series ORDER BY id').all()) {
    const key = seriesKey(row.name);
    if (!key || map.has(key)) continue;
    map.set(key, { key, name: row.name, charts: 0, published: 0 });
  }
  for (const row of db.prepare('SELECT chart_data, publication_status FROM charts').all()) {
    let name = '';
    try { name = normalizeSeries(JSON.parse(row.chart_data).series || ''); } catch { name = ''; }
    if (!name) continue;
    const key = seriesKey(name);
    if (!map.has(key)) map.set(key, { key, name, charts: 0, published: 0 });
    const entry = map.get(key);
    entry.charts++;
    if (row.publication_status === 'published') entry.published++;
  }
  return [...map.values()].sort((a, b) => b.charts - a.charts || a.name.localeCompare(b.name, 'tr'));
}

module.exports = { normalizeSeries, seriesKey, sqlLower, seriesExists, ensureSeries, listSeries, MAX_SERIES_LEN };
