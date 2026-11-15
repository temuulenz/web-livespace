import { sha256 } from '../lib/auth.mjs';
import { transaction, now } from '../lib/db.mjs';
import { HttpError } from '../lib/http.mjs';
import { validateTelemetry } from '../lib/telemetry-schema.mjs';
import { liveUpdate } from '../routes/public.mjs';

export function createSensorService({ db, config, hub, cafes }) {
  const byToken = db.prepare('SELECT * FROM devices WHERE token_hash = ? AND revoked_at IS NULL');
  const receipt = db.prepare('SELECT * FROM sensor_receipts WHERE device_id = ? AND message_id = ?');
  const insert = db.prepare(`INSERT INTO measurements (
    cafe_id, device_id, ts, received_at, is_test, raw, message_id, data_source,
    observed_people, occupancy_confidence, noise_rms, noise_dbfs, noise_db, noise_calibrated,
    battery_pct, battery_temperature_c, charging, inference_ms, uptime_seconds
  ) VALUES (${Array(19).fill('?').join(', ')})`);
  const source = device => device.is_test || device.kind === 'simulator' ? 'simulated' : 'real';
  function authenticate(authorization) {
    const match = /^Bearer (lsd_[A-Za-z0-9_-]{1,128})$/.exec(authorization || '');
    const device = match && byToken.get(sha256(match[1]));
    if (!device) throw new HttpError(401, 'invalid_device_token', 'Unknown or revoked device token');
    return device;
  }
  function ingest(device, input) {
    // Committed replays may be older than the normal offline-upload window.
    const { value, errors } = validateTelemetry(input, Date.now(), { checkAge: false });
    if (errors.length) throw new HttpError(422, 'validation_failed', 'Invalid telemetry', errors);
    if (value.deviceId !== device.id || value.locationId !== device.cafe_id) throw new HttpError(403, 'unauthorized_location', 'Device and location must match the server assignment');
    const dataSource = source(device);
    if (value.dataSource === 'simulated' && dataSource !== 'simulated') throw new HttpError(403, 'simulation_not_allowed', 'Simulator requires a test or simulator registration');
    value.dataSource = dataSource;
    const hash = sha256(JSON.stringify(value)), saved = receipt.get(device.id, value.messageId);
    if (saved) {
      if (saved.payload_hash !== hash) throw new HttpError(409, 'message_id_conflict', 'Message ID was already used for different telemetry');
      return { ack: { type: 'sensor.ack', messageId: value.messageId, status: 'duplicate', serverTimestamp: saved.accepted_at } };
    }
    const ageErrors = validateTelemetry(input).errors;
    if (ageErrors.length) throw new HttpError(422, 'validation_failed', 'Invalid telemetry', ageErrors);
    const received = now();
    transaction(db, () => {
      insert.run(device.cafe_id, device.id, value.timestamp, received, dataSource === 'simulated' ? 1 : 0,
        JSON.stringify(value), value.messageId, dataSource, value.occupancy.observedPeople, value.occupancy.confidence,
        value.noise.rms, value.noise.dbfs, value.noise.calibrated ? value.noise.estimatedDbSpl : null, Number(value.noise.calibrated),
        value.device.batteryPercent, value.device.batteryTemperatureC, value.device.charging == null ? null : Number(value.device.charging), value.device.inferenceMs, value.device.uptimeSeconds);
      db.prepare('INSERT INTO sensor_receipts (device_id, message_id, payload_hash, accepted_at) VALUES (?, ?, ?, ?)').run(device.id, value.messageId, hash, received);
      const latest = db.prepare('SELECT raw FROM sensor_latest_readings WHERE device_id = ? AND cafe_id = ? AND data_source = ?').get(device.id, device.cafe_id, dataSource);
      const diagnostics = JSON.parse(latest.raw).device;
      db.prepare('UPDATE devices SET last_seen_at = ?, last_status = ? WHERE id = ?')
        .run(received, JSON.stringify({ state: 'online', battery_pct: diagnostics.batteryPercent, ...diagnostics }), device.id);
    });
    return { ack: { type: 'sensor.ack', messageId: value.messageId, status: 'accepted', serverTimestamp: received }, telemetry: value, received };
  }
  function publish(result) {
    if (!result.telemetry) return;
    const value = result.telemetry, cafe = cafes.get(value.locationId);
    if (cafe?.status !== 'active' || cafe.data_mode !== 'live') return;
    hub.broadcast('sensor.telemetry', {
      locationId: cafe.id, timestamp: value.timestamp, receivedAt: result.received, dataSource: value.dataSource,
      stale: Date.now() - Date.parse(value.timestamp) > config.sensorStaleAfterSec * 1000, occupancy: value.occupancy, noise: value.noise
    });
    hub.broadcast('measurement', liveUpdate(cafes.publicCafe(cafe)));
  }
  function setStatus(device, status) {
    const result = db.prepare('UPDATE devices SET connection_status = ? WHERE id = ? AND connection_status != ?').run(status, device.id, status);
    if (!result.changes) return;
    const cafe = cafes.get(device.cafe_id), dataSource = source(device);
    if (cafe?.status !== 'active' || cafe.data_mode !== 'live') return;
    const states = db.prepare(`SELECT connection_status FROM devices WHERE cafe_id = ? AND revoked_at IS NULL
      AND CASE WHEN is_test = 1 OR kind = 'simulator' THEN 'simulated' ELSE 'real' END = ?`).all(device.cafe_id, dataSource);
    const publicStatus = states.some(d => d.connection_status === 'online') ? 'online' : states.some(d => d.connection_status === 'stale') ? 'stale' : 'offline';
    hub.broadcast('sensor.status', { locationId: cafe.id, status: publicStatus, dataSource, updatedAt: now() });
  }
  function retain() {
    if (!config.sensorRetentionDays) return 0;
    const cutoff = new Date(Date.now() - config.sensorRetentionDays * 86400000).toISOString();
    // Never delete legacy HTTP rows, latest state or durable replay receipts.
    return db.prepare(`DELETE FROM measurements WHERE message_id IS NOT NULL AND received_at < ?
      AND id NOT IN (SELECT id FROM sensor_latest_readings)`).run(cutoff).changes;
  }
  return { authenticate, ingest, publish, source, setStatus, retain };
}
