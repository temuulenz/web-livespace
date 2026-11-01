// Sensor ingestion: devices POST JSON measurements with their own bearer token.
//
//   POST /api/v1/ingest/measurements
//   Authorization: Bearer lsd_…
//   Content-Type: application/json
//   { "schema_version": "1.0", "cafe_id": "…", "device_id": "…", "timestamp": "…Z", "measurements": { … } }
//   or { "measurements_batch": [ …up to 100 of the above… ] }
//
// Each payload is validated, stored, and — when it changes a public café — pushed to
// browsers over the event stream.
import { readJson, sendJson, HttpError } from '../lib/http.mjs';
import { sha256 } from '../lib/auth.mjs';
import { now, transaction } from '../lib/db.mjs';
import { validateMeasurement } from '../lib/sensor-schema.mjs';
import { liveUpdate } from './public.mjs';

export function register(router, { db, cafes, hub, limit }) {
  const insert = db.prepare(`INSERT INTO measurements (cafe_id, device_id, ts, received_at, available_seats, occupied_seats, total_seats, noise_db, wifi_quality, wifi_down_mbps, wifi_up_mbps, wifi_latency_ms, temperature_c, humidity_pct, co2_ppm, is_test, raw)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  function authenticate(ctx) {
    const match = /^Bearer\s+(lsd_[A-Za-z0-9_-]+)$/.exec(ctx.req.headers.authorization || '');
    const device = match && db.prepare('SELECT * FROM devices WHERE token_hash = ? AND revoked_at IS NULL').get(sha256(match[1]));
    if (!device) throw new HttpError(401, 'invalid_device_token', 'Unknown or revoked device token');
    return device;
  }

  router.post('/api/v1/ingest/measurements', async ctx => {
    const device = authenticate(ctx);
    limit(`ingest:${device.id}`, 120, 60 * 1000);
    const body = await readJson(ctx, 512 * 1024);
    const batch = Array.isArray(body.measurements_batch) ? body.measurements_batch.slice(0, 100) : [body];
    const results = [];
    const accepted = [];
    for (const [index, payload] of batch.entries()) {
      const { value, errors } = validateMeasurement(payload);
      if (errors.length) { results.push({ index, accepted: false, errors }); continue; }
      // A token only speaks for its own device and the café it is installed in.
      if (value.device_id !== device.id) { results.push({ index, accepted: false, errors: [{ path: 'device_id', message: 'does not match the token' }] }); continue; }
      if (value.cafe_id !== device.cafe_id) { results.push({ index, accepted: false, errors: [{ path: 'cafe_id', message: 'device is not registered to this café' }] }); continue; }
      accepted.push(value);
      results.push({ index, accepted: true });
    }
    if (accepted.length) {
      const received = now();
      transaction(db, () => {
        for (const v of accepted) {
          const m = v.measurements;
          insert.run(v.cafe_id, v.device_id, v.timestamp, received, m.available_seats ?? null, m.occupied_seats ?? null, m.total_seats ?? null, m.noise_level_db ?? null, m.wifi_quality ?? null, m.wifi_download_mbps ?? null, m.wifi_upload_mbps ?? null, m.wifi_latency_ms ?? null, m.temperature_c ?? null, m.humidity_pct ?? null, m.co2_ppm ?? null, device.is_test, JSON.stringify(v));
        }
        const last = accepted.at(-1);
        db.prepare('UPDATE devices SET last_seen_at = ?, last_status = ? WHERE id = ?').run(received, JSON.stringify(last.device_status || { state: 'online' }), device.id);
      });
      const row = cafes.get(device.cafe_id);
      if (row?.status === 'active' && row.data_mode === 'live') hub.broadcast('measurement', liveUpdate(cafes.publicCafe(row)));
    }
    const status = accepted.length === batch.length ? 202 : accepted.length ? 207 : 422;
    sendJson(ctx.res, status, { accepted: accepted.length, rejected: batch.length - accepted.length, results });
  });
}
