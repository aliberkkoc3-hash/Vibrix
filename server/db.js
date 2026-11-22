'use strict';
/**
 * Vibrix veritabanı katmanı (SQLite / better-sqlite3)
 * Tüm tablolar, indeksler ve kısıtlar burada tanımlanır.
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Veritabanı: vibrix.db (eski rhythmx.db varsa otomatik olarak ona geçilir)
const NEW_DB = path.join(DATA_DIR, 'vibrix.db');
const OLD_DB = path.join(DATA_DIR, 'rhythmx.db');
const DB_FILE = process.env.VIBRIX_DB || (fs.existsSync(NEW_DB) || !fs.existsSync(OLD_DB) ? NEW_DB : OLD_DB);

// VIBRIX_DB bir klasör yolu gösteriyorsa (ör. /var/data/vibrix.db) o klasörü aç.
// Render gibi ortamlarda disk bağlanmamış olsa bile uygulama açılabilsin.
const DB_DIR = path.dirname(DB_FILE);
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

function migrate() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    username_lower TEXT NOT NULL UNIQUE,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    avatar        TEXT,
    bio           TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at);

  CREATE TABLE IF NOT EXISTS sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at  TEXT NOT NULL,
    last_used_at TEXT NOT NULL DEFAULT (datetime('now')),
    user_agent  TEXT,
    ip          TEXT,
    revoked_at  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS charts (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    song_title         TEXT NOT NULL,
    artist             TEXT NOT NULL DEFAULT '',
    bpm                REAL NOT NULL,
    offset_ms          REAL NOT NULL DEFAULT 0,
    difficulty         TEXT NOT NULL DEFAULT 'Normal',
    difficulty_level   INTEGER NOT NULL DEFAULT 5,
    description        TEXT NOT NULL DEFAULT '',
    cover              TEXT,
    audio_reference    TEXT NOT NULL,
    chart_data         TEXT NOT NULL,
    note_count         INTEGER NOT NULL DEFAULT 0,
    length_ms          INTEGER NOT NULL DEFAULT 0,
    publication_status TEXT NOT NULL DEFAULT 'draft' CHECK (publication_status IN ('draft','published')),
    is_demo            INTEGER NOT NULL DEFAULT 0,
    is_auto_chart      INTEGER NOT NULL DEFAULT 0,
    play_count         INTEGER NOT NULL DEFAULT 0,
    published_at       TEXT,
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_charts_status ON charts(publication_status);
  CREATE INDEX IF NOT EXISTS idx_charts_owner ON charts(owner_id);
  CREATE INDEX IF NOT EXISTS idx_charts_published ON charts(published_at);

  CREATE TABLE IF NOT EXISTS score_attempts (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chart_id           INTEGER NOT NULL REFERENCES charts(id) ON DELETE CASCADE,
    score              INTEGER NOT NULL,
    accuracy           REAL NOT NULL,
    max_combo          INTEGER NOT NULL,
    misses             INTEGER NOT NULL,
    perfect            INTEGER NOT NULL DEFAULT 0,
    great              INTEGER NOT NULL DEFAULT 0,
    good               INTEGER NOT NULL DEFAULT 0,
    bad                INTEGER NOT NULL DEFAULT 0,
    miss               INTEGER NOT NULL DEFAULT 0,
    total_notes        INTEGER NOT NULL,
    full_combo         INTEGER NOT NULL DEFAULT 0,
    perfect_full_combo INTEGER NOT NULL DEFAULT 0,
    rank               TEXT NOT NULL,
    is_test            INTEGER NOT NULL DEFAULT 0,
    validation_status  TEXT NOT NULL DEFAULT 'valid' CHECK (validation_status IN ('valid','suspicious')),
    validation_note    TEXT,
    submitted_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_attempts_user ON score_attempts(user_id);
  CREATE INDEX IF NOT EXISTS idx_attempts_chart ON score_attempts(chart_id);
  CREATE INDEX IF NOT EXISTS idx_attempts_valid ON score_attempts(chart_id, validation_status, score);
  CREATE INDEX IF NOT EXISTS idx_attempts_date ON score_attempts(submitted_at);

  CREATE TABLE IF NOT EXISTS personal_bests (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chart_id       INTEGER NOT NULL REFERENCES charts(id) ON DELETE CASCADE,
    best_score     INTEGER NOT NULL,
    best_accuracy  REAL NOT NULL,
    max_combo      INTEGER NOT NULL,
    misses         INTEGER NOT NULL,
    rank           TEXT NOT NULL,
    attempt_id     INTEGER REFERENCES score_attempts(id) ON DELETE SET NULL,
    play_count     INTEGER NOT NULL DEFAULT 1,
    achieved_at    TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, chart_id)
  );
  CREATE INDEX IF NOT EXISTS idx_pb_user ON personal_bests(user_id);
  CREATE INDEX IF NOT EXISTS idx_pb_chart ON personal_bests(chart_id);

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id            INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    audio_settings     TEXT NOT NULL DEFAULT '{}',
    gameplay_settings  TEXT NOT NULL DEFAULT '{}',
    visual_settings    TEXT NOT NULL DEFAULT '{}',
    key_bindings       TEXT NOT NULL DEFAULT '{}',
    updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS competitive_ratings (
    user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    rating      REAL NOT NULL DEFAULT 0,
    peak_rating REAL NOT NULL DEFAULT 0,
    rated_plays INTEGER NOT NULL DEFAULT 0,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS rating_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating     REAL NOT NULL,
    delta      REAL NOT NULL,
    chart_id   INTEGER REFERENCES charts(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_rating_hist_user ON rating_history(user_id, created_at);

  CREATE TABLE IF NOT EXISTS favorites (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chart_id   INTEGER NOT NULL REFERENCES charts(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, chart_id)
  );

  CREATE TABLE IF NOT EXISTS app_meta (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
  `);

  // --- Kolon ekleyen migration'lar (eski veritabanları için) ---
  const chartCols = db.prepare('PRAGMA table_info(charts)').all().map((c) => c.name);
  if (!chartCols.includes('is_auto_chart')) {
    db.exec('ALTER TABLE charts ADD COLUMN is_auto_chart INTEGER NOT NULL DEFAULT 0');
  }
}

migrate();

module.exports = { db, DB_FILE, DATA_DIR };
