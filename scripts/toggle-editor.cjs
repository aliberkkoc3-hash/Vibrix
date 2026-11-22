#!/usr/bin/env node
'use strict';
/**
 * Chart Editor kilidini tek komutla aç/kapat.
 *
 *   node scripts/toggle-editor.cjs off   → kapat (sahip dışında kimse giremez)
 *   node scripts/toggle-editor.cjs on    → aç
 *   node scripts/toggle-editor.cjs       → durumu göster
 *
 * Yerelde çalışırken doğrudan veritabanına yazar.
 * Render'da kullanmak için: Render → Shell → aynı komut.
 */
const { db } = require('../server/db');

const arg = (process.argv[2] || '').toLowerCase();

function read() {
  const row = db.prepare("SELECT value FROM app_meta WHERE key = 'editor_open'").get();
  return !row || row.value !== '0';
}

function write(open) {
  db.prepare(`INSERT INTO app_meta (key, value) VALUES ('editor_open', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(open ? '1' : '0');
}

if (arg === 'off' || arg === 'kapat') {
  write(false);
  console.log('Chart Editor KAPATILDI.');
  console.log('Ziyaretçiler: "Yeni şarkılar ekleneceği için şimdilik kapalı."');
} else if (arg === 'on' || arg === 'ac' || arg === 'aç') {
  write(true);
  console.log('Chart Editor AÇILDI. Herkes yeni grafik oluşturabilir.');
} else if (!arg) {
  const open = read();
  console.log(`Chart Editor şu an: ${open ? 'AÇIK' : 'KAPALI'}`);
  console.log('Değiştirmek için: node scripts/toggle-editor.cjs off | on');
} else {
  console.error('Kullanım: node scripts/toggle-editor.cjs [on|off]');
  process.exit(1);
}
