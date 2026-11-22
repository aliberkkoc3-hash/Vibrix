'use strict';
/**
 * Liderlik tablolarını sıfırlar.
 *
 * Silinen: tüm skor denemeleri, kişisel rekorlar, rating geçmişi, ratingler,
 * favoriler. Grafikler, hesaplar ve ayarlar korunur.
 *
 * Test/otomatik test hesapları (isim kalıbı eşleşenler) de silinir:
 *   oyuncur*, tmwr*, testoyuncu, editor_test, test*
 *
 * Kullanım:  node server/reset-leaderboard.js [--keep-test-users]
 */
const { db } = require('./db');

const keepTestUsers = process.argv.includes('--keep-test-users');
const TEST_PATTERNS = ['oyuncur%', 'tmwr%', 'test%', 'editor\\_test'];

const run = db.transaction(() => {
  db.exec('DELETE FROM score_attempts');
  db.exec('DELETE FROM personal_bests');
  db.exec('DELETE FROM rating_history');
  db.exec('DELETE FROM favorites');
  // Ödül/rating tablosu tamamen boşalır (satır kalmaz), aksi hâlde 0 rating'li
  // kayıtlar sıralamada görünür.
  db.exec('DELETE FROM competitive_ratings');
  if (!keepTestUsers) {
    const where = TEST_PATTERNS.map((p) => `username_lower LIKE '${p.replace(/\\/g, '\\\\')}'`).join(' OR ');
    db.exec(`DELETE FROM users WHERE ${where}`);
  }
  // demo_seeded korunur: silinirse demo grafikler tekrar üretilir
  void 0;; // demo grafikler tekrar üretilmesin diye silinmez
});

const before = {
  attempts: db.prepare('SELECT COUNT(*) c FROM score_attempts').get().c,
  users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
};
run();
const after = {
  attempts: db.prepare('SELECT COUNT(*) c FROM score_attempts').get().c,
  pbs: db.prepare('SELECT COUNT(*) c FROM personal_bests').get().c,
  users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
  charts: db.prepare('SELECT COUNT(*) c FROM charts').get().c,
  ranked: db.prepare('SELECT COUNT(*) c FROM competitive_ratings WHERE rated_plays > 0').get().c,
};
console.log('Önce:', before);
console.log('Sonra:', after);
console.log('Liderlik tabloları temiz. Kalan hesaplar:', db.prepare('SELECT username FROM users').all().map((u) => u.username).join(', '));
