'use strict';
/**
 * Vibrix veritabanı geri yükleme — backup-export.cjs çıktısını geri yükler.
 * Kullanım: node scripts/backup-import.cjs yedek.json
 * NOT: Önce mevcut veriyi temizler, sonra yedeği yazar.
 */
const fs = require('fs');
const { db } = require('../server/db');

const file = process.argv[2];
if (!file || !fs.existsSync(file)) { console.error('Kullanım: node scripts/backup-import.cjs yedek.json'); process.exit(1); }
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
if (data.version !== 1 || !data.tables) { console.error('Geçersiz yedek dosyası.'); process.exit(1); }

const ORDER = ['users', 'charts', 'score_attempts', 'personal_bests', 'user_settings', 'competitive_ratings', 'rating_history', 'favorites', 'app_meta'];

const restore = db.transaction(() => {
  for (const t of [...ORDER].reverse()) db.prepare(`DELETE FROM ${t}`).run();
  for (const t of ORDER) {
    const rows = data.tables[t] || [];
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]);
    const sql = `INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`;
    const stmt = db.prepare(sql);
    for (const r of rows) stmt.run(...cols.map((c) => r[c]));
    console.log(`  ${t}: ${rows.length} satır`);
  }
});
restore();
console.log('Geri yükleme tamamlandı.');
