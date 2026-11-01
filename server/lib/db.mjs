// SQLite storage (node:sqlite, built into Node ≥ 22.5; no external packages).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const MIGRATIONS = [
  `CREATE TABLE users (
     id TEXT PRIMARY KEY,
     email TEXT NOT NULL UNIQUE COLLATE NOCASE,
     password_hash TEXT NOT NULL,
     name TEXT NOT NULL DEFAULT '',
     role TEXT NOT NULL CHECK (role IN ('user', 'owner', 'admin')),
     created_at TEXT NOT NULL
   );
   CREATE TABLE sessions (
     token_hash TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at TEXT NOT NULL,
     expires_at TEXT NOT NULL
   );
   CREATE INDEX sessions_user ON sessions(user_id);

   -- Static café information and the setup workflow. Live values are in measurements.
   CREATE TABLE cafes (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
     status TEXT NOT NULL DEFAULT 'submitted',
     data_mode TEXT NOT NULL DEFAULT 'live' CHECK (data_mode IN ('demo', 'live')),
     category TEXT NOT NULL DEFAULT 'Кафе',
     district TEXT NOT NULL DEFAULT '',
     address TEXT NOT NULL DEFAULT '',
     lat REAL, lng REAL, map_x REAL, map_y REAL,
     hours TEXT NOT NULL DEFAULT '',
     phone TEXT NOT NULL DEFAULT '',
     contact_name TEXT NOT NULL DEFAULT '',
     email TEXT NOT NULL DEFAULT '',
     description TEXT NOT NULL DEFAULT '',
     tags TEXT NOT NULL DEFAULT '[]',
     total_seats INTEGER,
     demo TEXT,
     visualization TEXT NOT NULL DEFAULT '{"status":"not_started"}',
     sort_order INTEGER NOT NULL DEFAULT 1000,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );

   CREATE TABLE applications (
     id TEXT PRIMARY KEY,
     cafe_id TEXT NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
     claim_token_hash TEXT,
     owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
     form TEXT NOT NULL,
     created_at TEXT NOT NULL
   );
   CREATE TABLE application_photos (
     id TEXT PRIMARY KEY,
     application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
     file TEXT NOT NULL,
     mime TEXT NOT NULL,
     size INTEGER NOT NULL,
     position INTEGER NOT NULL,
     created_at TEXT NOT NULL
   );

   CREATE TABLE status_history (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     cafe_id TEXT NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
     from_status TEXT,
     to_status TEXT NOT NULL,
     note TEXT NOT NULL DEFAULT '',
     actor_id TEXT,
     at TEXT NOT NULL
   );

   CREATE TABLE favorites (
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     cafe_id TEXT NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
     created_at TEXT NOT NULL,
     PRIMARY KEY (user_id, cafe_id)
   );

   CREATE TABLE devices (
     id TEXT PRIMARY KEY,
     cafe_id TEXT NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
     label TEXT NOT NULL DEFAULT '',
     kind TEXT NOT NULL DEFAULT 'sensor',
     is_test INTEGER NOT NULL DEFAULT 0,
     token_hash TEXT NOT NULL,
     last_seen_at TEXT,
     last_status TEXT,
     revoked_at TEXT,
     created_at TEXT NOT NULL
   );
   CREATE INDEX devices_cafe ON devices(cafe_id);

   CREATE TABLE measurements (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     cafe_id TEXT NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
     device_id TEXT NOT NULL,
     ts TEXT NOT NULL,
     received_at TEXT NOT NULL,
     available_seats INTEGER, occupied_seats INTEGER, total_seats INTEGER,
     noise_db REAL, wifi_quality REAL, wifi_down_mbps REAL, wifi_up_mbps REAL, wifi_latency_ms REAL,
     temperature_c REAL, humidity_pct REAL, co2_ppm REAL,
     is_test INTEGER NOT NULL DEFAULT 0,
     raw TEXT NOT NULL
   );
   CREATE INDEX measurements_cafe_ts ON measurements(cafe_id, ts DESC);
   CREATE INDEX measurements_device ON measurements(device_id, id DESC);`
];

export function openDatabase(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  const version = db.prepare('PRAGMA user_version').get().user_version;
  for (let i = version; i < MIGRATIONS.length; i++) {
    db.exec('BEGIN');
    try { db.exec(MIGRATIONS[i]); db.exec(`PRAGMA user_version = ${i + 1}`); db.exec('COMMIT'); }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  return db;
}

// Run `fn` in a transaction; nested calls join the outer one.
export function transaction(db, fn) {
  if (db.isTransaction) return fn();
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

export const now = () => new Date().toISOString();
export const json = (text, fallback = null) => { try { return text == null ? fallback : JSON.parse(text); } catch { return fallback; } };
