'use strict';
/**
 * Vibrix veritabanı yedeği — tüm veriyi JSON olarak dışa aktarır.
 * Kullanım: node scripts/backup-export.cjs [dosya.json]
 */
const fs = require('fs');
const path = require('path');
const { db } = require('../server/db');

const out = process.argv[2] || path.join(process.cwd(), `vibrix-backup-${new Date().toISOString().slice(0, 10)}.json`);

const TABLES = ['users', 'charts', 'score_attempts', 'personal_bests', 'user_settings', 'competitive_ratings', 'rating_history', 'favorites', 'app_meta'];
const data = { version: 1, exportedAt: new Date().toISOString(), tables: {} };

for (const t of TABLES) {
  try {
    data.tables[t] = db.prepare(`SELECT * FROM ${t}`).all();
  } catch (e) {
    data.tables[t] = [];
  }
}

fs.writeFileSync(out, JSON.stringify(data, null, 2));
const counts = Object.entries(data.tables).map(([k, v]) => `${k}=${v.length}`).join(', ');
console.log(`Yedek yazıldı: ${out}`);
console.log(counts);
