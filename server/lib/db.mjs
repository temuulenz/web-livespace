import {RESOURCES_SCHEMA} from '../../shared/business/resources-schema.mjs';
import {NOTIFICATIONS_SCHEMA} from '../../shared/business/notifications-schema.mjs';
import {BEHAVIOR_SCHEMA} from '../../shared/business/behavior-schema.mjs';
import { PROMOTIONS_SCHEMA } from '../../shared/business/promotions-schema.mjs';
import { REVIEWS_SCHEMA } from '../../shared/business/reviews-schema.mjs';
import { INVENTORY_SCHEMA } from '../../shared/business/inventory-schema.mjs';
import { MENU_HARDENING_SCHEMA } from '../../shared/business/menu-hardening-schema.mjs';
// SQLite storage (node:sqlite, built into Node ≥ 22.5; no external packages).
import { MENU_SCHEMA } from '../../shared/business/menu-schema.mjs';
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
   CREATE INDEX measurements_device ON measurements(device_id, id DESC);`,
  // Android telemetry is additive: preserve the original tables and HTTP history.
  `ALTER TABLE devices ADD COLUMN connection_status TEXT NOT NULL DEFAULT 'offline'
     CHECK (connection_status IN ('online', 'stale', 'offline'));
   CREATE INDEX devices_token ON devices(token_hash);
   ALTER TABLE measurements ADD COLUMN message_id TEXT;
   ALTER TABLE measurements ADD COLUMN data_source TEXT NOT NULL DEFAULT 'real'
     CHECK (data_source IN ('real', 'simulated', 'manual'));
   ALTER TABLE measurements ADD COLUMN observed_people INTEGER;
   ALTER TABLE measurements ADD COLUMN occupancy_confidence REAL;
   ALTER TABLE measurements ADD COLUMN noise_rms REAL;
   ALTER TABLE measurements ADD COLUMN noise_dbfs REAL;
   ALTER TABLE measurements ADD COLUMN noise_calibrated INTEGER;
   ALTER TABLE measurements ADD COLUMN battery_pct REAL;
   ALTER TABLE measurements ADD COLUMN battery_temperature_c REAL;
   ALTER TABLE measurements ADD COLUMN charging INTEGER;
   ALTER TABLE measurements ADD COLUMN inference_ms REAL;
   ALTER TABLE measurements ADD COLUMN uptime_seconds INTEGER;
   UPDATE measurements SET data_source = 'simulated', is_test = 1
     WHERE is_test = 1 OR device_id IN (SELECT id FROM devices WHERE kind = 'simulator');
   UPDATE devices SET is_test = 1 WHERE kind = 'simulator';
   CREATE UNIQUE INDEX measurements_message ON measurements(device_id, message_id) WHERE message_id IS NOT NULL;
   CREATE INDEX measurements_sensor_latest ON measurements(device_id, cafe_id, data_source, ts DESC, id DESC);
   CREATE INDEX measurements_source_ts ON measurements(data_source, ts);
   -- Keep small receipts even when optional history retention is enabled.
   CREATE TABLE sensor_receipts (
     device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
     message_id TEXT NOT NULL,
     payload_hash TEXT NOT NULL,
     accepted_at TEXT NOT NULL,
     PRIMARY KEY (device_id, message_id)
   );
   CREATE VIEW sensor_latest_readings AS
     SELECT * FROM (
       SELECT m.*, ROW_NUMBER() OVER (
         PARTITION BY device_id, cafe_id, data_source ORDER BY ts DESC, id DESC
       ) AS latest_rank FROM measurements m WHERE message_id IS NOT NULL
     ) WHERE latest_rank = 1;`,
  `ALTER TABLE devices ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1));`,
  `-- Additive user access controls. Existing accounts and password hashes are preserved.
ALTER TABLE users ADD COLUMN disabled_at TEXT;
ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN user_auth_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN authenticated_at TEXT;
CREATE TABLE super_admin_identity (
 singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
 user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
 bound_at TEXT NOT NULL
);
CREATE TABLE user_audit_log (
 id TEXT PRIMARY KEY,
 actor_id TEXT NOT NULL,
 target_id TEXT NOT NULL,
 action TEXT NOT NULL,
 at TEXT NOT NULL,
 details TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX user_audit_at ON user_audit_log(at DESC);
CREATE TRIGGER super_admin_valid_binding BEFORE INSERT ON super_admin_identity
WHEN NOT EXISTS (SELECT 1 FROM users WHERE id=NEW.user_id AND email='temuulenbayarjargal@icloud.com' COLLATE NOCASE AND role='admin' AND disabled_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'invalid_super_admin_binding'); END;
CREATE TRIGGER super_admin_binding_immutable BEFORE UPDATE ON super_admin_identity
BEGIN SELECT RAISE(ABORT, 'super_admin_binding_immutable'); END;
CREATE TRIGGER super_admin_binding_no_delete BEFORE DELETE ON super_admin_identity
BEGIN SELECT RAISE(ABORT, 'super_admin_binding_immutable'); END;
CREATE TRIGGER super_admin_user_protected BEFORE UPDATE ON users
WHEN EXISTS (SELECT 1 FROM super_admin_identity WHERE user_id=OLD.id)
 AND (NEW.id<>OLD.id OR NEW.email<>OLD.email OR NEW.role<>'admin' OR NEW.disabled_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'super_admin_protected'); END;
CREATE TRIGGER super_admin_user_no_delete BEFORE DELETE ON users
WHEN EXISTS (SELECT 1 FROM super_admin_identity WHERE user_id=OLD.id)
BEGIN SELECT RAISE(ABORT, 'super_admin_protected'); END;
CREATE TRIGGER user_audit_immutable BEFORE UPDATE ON user_audit_log
BEGIN SELECT RAISE(ABORT, 'audit_immutable'); END;
CREATE TRIGGER user_audit_no_delete BEFORE DELETE ON user_audit_log
BEGIN SELECT RAISE(ABORT, 'audit_immutable'); END;
CREATE TRIGGER super_admin_binding_audit AFTER INSERT ON super_admin_identity
BEGIN
 UPDATE users SET auth_version=auth_version+1 WHERE id=NEW.user_id;
 DELETE FROM sessions WHERE user_id=NEW.user_id;
 INSERT INTO user_audit_log(id,actor_id,target_id,action,at,details)
 VALUES('super-admin-bind:' || NEW.user_id,'operator-bootstrap',NEW.user_id,'super_admin.bind',NEW.bound_at,'{}');
END;
`
, MENU_SCHEMA, MENU_HARDENING_SCHEMA, INVENTORY_SCHEMA, REVIEWS_SCHEMA, PROMOTIONS_SCHEMA, BEHAVIOR_SCHEMA, NOTIFICATIONS_SCHEMA, RESOURCES_SCHEMA];

export function openDatabase(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = FULL;'); // Acks follow a durable commit.
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
