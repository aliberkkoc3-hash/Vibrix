/**
 * Stüdyo hesabı: demo hesabı "Prism Crew" olur, sahibi BFAli olur.
 * Kullanım: node scripts/studio-migrate.cjs
 */
'use strict';
const { db } = require('../server/db');

const STUDIO_NAME = 'Prism Crew';
const OWNER_USERNAME = 'BFAli';

const owner = db.prepare('SELECT * FROM users WHERE username_lower = ?').get(OWNER_USERNAME.toLowerCase());
if (!owner) { console.error(`Kullanıcı bulunamadı: ${OWNER_USERNAME}`); process.exit(1); }

// 1) demo hesabı varsa stüdyo adına çevir
let studio = db.prepare('SELECT * FROM users WHERE username_lower = ?').get(STUDIO_NAME.toLowerCase());
const demo = db.prepare("SELECT * FROM users WHERE username_lower = 'demo'").get();
if (!studio && demo) {
  db.prepare('UPDATE users SET username = ?, username_lower = ?, bio = ? WHERE id = ?')
    .run(STUDIO_NAME, STUDIO_NAME.toLowerCase(),
      'RhythmX resmi içerik stüdyosu. Buradaki grafikler telifsiz olarak sentezlenmiş örnek şarkılardır.', demo.id);
  studio = db.prepare('SELECT * FROM users WHERE id = ?').get(demo.id);
  console.log(`demo → ${STUDIO_NAME} (id ${demo.id})`);
}
if (!studio) { console.error('Stüdyo hesabı oluşturulamadı.'); process.exit(1); }

// 2) stüdyo hesabının girişi kapatılır (şifre rastgele)
const crypto = require('crypto');
db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
  .run(crypto.randomBytes(32).toString('hex'), studio.id);

// 3) grafiklerin sahibi BFAli olur, yapımcı adı stüdyo
const before = db.prepare('SELECT COUNT(*) c FROM charts WHERE owner_id = ?').get(studio.id).c;
db.prepare('UPDATE charts SET owner_id = ? WHERE owner_id = ?').run(owner.id, studio.id);
const renamed = db.prepare("UPDATE charts SET artist = ? WHERE artist LIKE '%demo%'").run(STUDIO_NAME).changes;
console.log(`${before} grafik ${OWNER_USERNAME} hesabına devredildi, ${renamed} sanatçı adı güncellendi.`);

// 4) eski test kullanıcıları silinir
const testUsers = db.prepare(`
  SELECT id, username FROM users
  WHERE username_lower LIKE 'oyuncur%' OR username_lower LIKE 'tmwr%' OR username_lower = 'editor_test'
`).all();
for (const u of testUsers) {
  db.prepare('DELETE FROM score_attempts WHERE user_id = ?').run(u.id);
  db.prepare('DELETE FROM personal_bests WHERE user_id = ?').run(u.id);
  db.prepare('DELETE FROM favorites WHERE user_id = ?').run(u.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  db.prepare('DELETE FROM charts WHERE owner_id = ?').run(u.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
}
console.log(`${testUsers.length} test kullanıcı silindi.`);

console.log('Kalan hesaplar:', db.prepare('SELECT username FROM users ORDER BY id').all().map((u) => u.username).join(', '));
console.log('Grafik sahipleri:', db.prepare(`
  SELECT u.username, COUNT(*) c FROM charts c JOIN users u ON u.id=c.owner_id GROUP BY u.id
`).all().map((r) => `${r.username}: ${r.c}`).join(' | '));
