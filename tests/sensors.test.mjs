import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import WebSocket from 'ws';
import { DatabaseSync } from 'node:sqlite';
import { ADMIN, startServer } from './support/server.mjs';
import { createApp } from '../server/app.mjs';
import { openDatabase } from '../server/lib/db.mjs';
import { validateTelemetry } from '../server/lib/telemetry-schema.mjs';
import { simulatorOptions, runSimulator } from '../scripts/sensor-simulator.mjs';

let server, admin;
before(async () => {
  server = await startServer(); admin = server.client();
  assert.equal((await admin.post('/api/v1/auth/login', ADMIN)).status, 200);
  await admin.patch('/api/v1/admin/cafes/A', { data_mode: 'live' });
});
after(async () => { await server?.stop(); });
async function register(client = admin, options = {}) {
  const response = await client.post('/api/v1/admin/devices', { id: 'dev_' + randomUUID(), cafe_id: 'A', ...options });
  assert.equal(response.status, 201);
  return { id: response.data.device.id, token: response.data.token, location: options.cafe_id || 'A' };
}
function telemetry(device, overrides = {}) {
  return { schemaVersion: 1, type: 'sensor.telemetry', messageId: randomUUID(), deviceId: device.id, locationId: device.location,
    timestamp: new Date().toISOString(), occupancy: { observedPeople: 8, confidence: 0.87 },
    noise: { rms: 0.014, dbfs: -37.1, estimatedDbSpl: null, calibrated: false },
    device: { batteryPercent: 85, batteryTemperatureC: 36.5, charging: true, inferenceMs: 1200, uptimeSeconds: 3600 }, ...overrides };
}
async function connect(device, target = server, options = {}) {
  const ws = new WebSocket(target.origin.replace('http', 'ws') + '/ws/sensors', { headers: { Authorization: `Bearer ${device.token}` }, ...options });
  const queue = [], waiting = [];
  ws.on('error', () => {});
  ws.on('message', data => { const value = JSON.parse(data.toString()); if (waiting.length) waiting.shift()(value); else queue.push(value); });
  const take = () => new Promise((resolve, reject) => {
    if (queue.length) { resolve(queue.shift()); return; }
    const timer = setTimeout(() => reject(new Error('Sensor message timeout')), 3000);
    waiting.push(value => { clearTimeout(timer); resolve(value); });
  });
  const ready = await take();
  return { ws, ready, take, async send(value) { const result = take(); ws.send(typeof value === 'string' ? value : JSON.stringify(value)); return result; },
    async close() { if (ws.readyState === WebSocket.CLOSED) return; const closed = once(ws, 'close'); ws.close(); await closed; } };
}
function rejectedUpgrade(token, target = server, path = '/ws/sensors', headers = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(target.origin.replace('http', 'ws') + path, { headers: { Authorization: `Bearer ${token}`, ...headers } });
    ws.on('error', () => {});
    ws.once('open', () => { ws.terminate(); reject(new Error('Unexpected successful upgrade')); });
    ws.once('unexpected-response', (_req, res) => {
      let body = ''; res.on('data', chunk => { body += chunk; });
      res.on('end', () => { ws.terminate(); resolve({ status: res.statusCode, body: JSON.parse(body) }); });
    });
  });
}
async function stream(target = server) {
  const controller = new AbortController();
  const response = await fetch(target.origin + '/api/v1/stream', { signal: controller.signal });
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '';
  return {
    async event(name) {
      const timer = setTimeout(() => controller.abort(), 4000);
      try {
        for (;;) {
          let end;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
            if (block.startsWith(`event: ${name}\n`)) return JSON.parse(block.split('\ndata: ')[1]);
          }
          const { value, done } = await reader.read(); if (done) throw new Error('SSE stream ended');
          buffer += decoder.decode(value, { stream: true });
        }
      } finally { clearTimeout(timer); }
    }, close: () => reader.cancel()
  };
}
const count = device => server.app.deps.db.prepare('SELECT COUNT(*) n FROM measurements WHERE device_id = ?').get(device.id).n;

test('authentication binds device/location, hashes tokens, rejects invalid tokens, URLs and duplicate connections', async () => {
  assert.equal((await rejectedUpgrade('lsd_wrong')).status, 401);
  const device = await register();
  assert.equal((await rejectedUpgrade(device.token, server, '/ws/unknown')).status, 404);
  assert.equal((await rejectedUpgrade(device.token, server, '/ws/sensors?token=hidden')).status, 403);
  const client = await connect(device);
  try {
    assert.deepEqual(client.ready, { type: 'sensor.ready', schemaVersion: 1, deviceId: device.id, locationId: 'A', dataSource: 'real', maxPayloadBytes: 16384 });
    assert.equal((await rejectedUpgrade(device.token)).status, 409);
    assert.equal(server.app.deps.sensorGateway.size, 1);
    const hash = server.app.deps.db.prepare('SELECT token_hash FROM devices WHERE id = ?').get(device.id).token_hash;
    assert.notEqual(hash, device.token); assert.equal(hash.length, 64);
  } finally { await client.close(); }
});
test('telemetry commits before ack, persists diagnostics, and delivers sanitized SSE', async () => {
  const device = await register(), client = await connect(device), live = await stream();
  try {
    const payload = telemetry(device), ack = await client.send(payload);
    assert.equal(ack.type, 'sensor.ack'); assert.equal(ack.status, 'accepted'); assert.equal(ack.messageId, payload.messageId);
    const independent = new DatabaseSync(server.config.dbFile);
    try {
      const row = independent.prepare('SELECT * FROM measurements WHERE device_id = ?').get(device.id);
      assert.equal(row.message_id, ack.messageId); assert.equal(row.received_at, ack.serverTimestamp);
      assert.equal(row.observed_people, 8); assert.equal(row.occupancy_confidence, 0.87);
      assert.equal(row.noise_dbfs, -37.1); assert.equal(row.noise_db, null);
      assert.equal(row.occupied_seats, null); assert.equal(row.available_seats, null);
      assert.equal(row.battery_temperature_c, 36.5); assert.equal(row.charging, 1); assert.equal(row.data_source, 'real');
    } finally { independent.close(); }
    const event = await live.event('sensor.telemetry');
    assert.equal(event.locationId, 'A'); assert.equal(event.occupancy.observedPeople, 8); assert.equal(event.noise.dbfs, -37.1);
    assert.equal(event.deviceId, undefined); assert.equal(event.device, undefined); assert.ok(!JSON.stringify(event).includes(device.token));
    assert.equal((await live.event('measurement')).id, 'A');
    assert.equal(server.app.deps.db.prepare('SELECT message_id FROM sensor_latest_readings WHERE device_id = ?').get(device.id).message_id, payload.messageId);
  } finally { await live.close(); await client.close(); }
});
test('duplicate IDs are idempotent, conflicts fail and older uploads do not replace latest state', async () => {
  const device = await register(), client = await connect(device);
  try {
    const payload = telemetry(device), first = await client.send(payload), duplicate = await client.send(payload);
    assert.equal(duplicate.status, 'duplicate'); assert.equal(duplicate.serverTimestamp, first.serverTimestamp); assert.equal(count(device), 1);
    assert.equal((await client.send({ ...payload, occupancy: { observedPeople: 9, confidence: 0.9 } })).error.code, 'message_id_conflict');
    assert.equal(count(device), 1);
    assert.equal((await client.send(telemetry(device, { timestamp: new Date(Date.now() - 3600000).toISOString() }))).status, 'accepted');
    assert.equal(server.app.deps.db.prepare('SELECT message_id FROM sensor_latest_readings WHERE device_id = ?').get(device.id).message_id, payload.messageId);
  } finally { await client.close(); }
});
test('unauthorized cafe and device identifiers cannot write', async () => {
  for (const overrides of [{ locationId: 'B' }, { deviceId: 'somebody_else' }]) {
    const device = await register(), client = await connect(device);
    try { assert.equal((await client.send(telemetry(device, overrides))).error.code, 'unauthorized_location'); assert.equal(count(device), 0); }
    finally { await client.close(); }
  }
});
test('invalid JSON, binary recordings and invalid measurement ranges are rejected', async () => {
  const device = await register(), client = await connect(device);
  try {
    assert.equal((await client.send('{')).error.code, 'invalid_json');
    const reply = client.take(); client.ws.send(Buffer.from('image bytes')); assert.equal((await reply).error.code, 'json_only');
    const error = (await client.send(telemetry(device, { occupancy: { observedPeople: -1, confidence: 3 } }))).error;
    assert.equal(error.code, 'validation_failed'); assert.equal(error.details.length, 2); assert.equal(count(device), 0);
  } finally { await client.close(); }
});
test('schema validates nulls, calendar/timezones, versions, IDs, numeric limits and privacy whitelist', () => {
  const good = telemetry({ id: 'LS-001', location: 'CAFE-001' });
  assert.deepEqual(validateTelemetry(good).errors, []);
  assert.deepEqual(validateTelemetry({ ...good, occupancy: { observedPeople: null, confidence: null }, noise: { rms: null, dbfs: null, estimatedDbSpl: null, calibrated: false }, device: { batteryPercent: null, batteryTemperatureC: null, charging: null, inferenceMs: null, uptimeSeconds: null } }).errors, []);
  for (const patch of [
    { schemaVersion: '1' }, { type: 'sensor.image' }, { deviceId: '../sensor' }, { messageId: '' }, { timestamp: '2026-02-30T00:00:00Z' },
    { timestamp: new Date().toISOString().slice(0, -1) }, { timestamp: new Date(Date.now() + 120000).toISOString() },
    { timestamp: new Date(Date.now() - 8 * 86400000).toISOString() }, { occupancy: { observedPeople: 2.5, confidence: -1 } },
    { noise: { rms: 2, dbfs: 1, estimatedDbSpl: 50, calibrated: false } }, { noise: { calibrated: true, estimatedDbSpl: 141 } },
    { device: { batteryPercent: 101, batteryTemperatureC: 101, charging: 'yes', inferenceMs: -1, uptimeSeconds: 1.5 } },
    { camera: 'data:binary' }, { device: { image: 'secret' } }, { dataSource: 'manual' }
  ]) assert.ok(validateTelemetry({ ...good, ...patch }).errors.length, JSON.stringify(patch));
});
test('only calibrated SPL populates the existing cafe noise API', async () => {
  const device = await register(), client = await connect(device);
  try {
    assert.equal((await client.send(telemetry(device, { noise: { rms: 0.01, dbfs: -40, estimatedDbSpl: 51, calibrated: true } }))).status, 'accepted');
    const row = server.app.deps.db.prepare('SELECT noise_db, noise_calibrated FROM measurements WHERE device_id = ?').get(device.id);
    assert.equal(row.noise_db, 51); assert.equal(row.noise_calibrated, 1);
    assert.equal((await server.client().get('/api/v1/cafes/A')).data.cafe.live.noise_db, 51);
  } finally { await client.close(); }
});
test('simulator source is forced in both transports and real devices reject simulated telemetry', async () => {
  const device = await register(admin, { kind: 'simulator', is_test: false }), client = await connect(device);
  try {
    assert.equal(client.ready.dataSource, 'simulated'); assert.equal((await client.send(telemetry(device))).status, 'accepted');
    const row = server.app.deps.db.prepare('SELECT is_test, data_source FROM measurements WHERE device_id = ?').get(device.id);
    assert.equal(row.is_test, 1); assert.equal(row.data_source, 'simulated');
    await admin.patch(`/api/v1/admin/devices/${device.id}`, { is_test: false });
    assert.equal(server.app.deps.db.prepare('SELECT is_test FROM devices WHERE id = ?').get(device.id).is_test, 1);
    const http = await fetch(server.origin + '/api/v1/ingest/measurements', { method: 'POST', headers: { Authorization: `Bearer ${device.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ cafe_id: 'A', device_id: device.id, timestamp: new Date().toISOString(), measurements: { occupied_seats: 3 } }) });
    assert.equal(http.status, 202);
    assert.equal(server.app.deps.db.prepare("SELECT COUNT(*) n FROM measurements WHERE device_id = ? AND data_source != 'simulated'").get(device.id).n, 0);
  } finally { await client.close(); }
  const real = await register(), c = await connect(real);
  try { assert.equal((await c.send(telemetry(real, { dataSource: 'simulated' }))).error.code, 'simulation_not_allowed'); assert.equal(count(real), 0); }
  finally { await c.close(); }
});
test('rotation, revocation and reassignment invalidate existing connections', async () => {
  for (const action of ['rotate', 'revoke', 'reassign']) {
    const device = await register(), client = await connect(device);
    try {
      if (action === 'rotate') await admin.post(`/api/v1/admin/devices/${device.id}/token`);
      if (action === 'revoke') await admin.del(`/api/v1/admin/devices/${device.id}`);
      if (action === 'reassign') await admin.patch(`/api/v1/admin/devices/${device.id}`, { cafe_id: 'B' });
      assert.equal((await client.send(telemetry(device))).type, 'sensor.error'); assert.equal(count(device), 0);
      if (action !== 'reassign') assert.equal((await rejectedUpgrade(device.token)).status, 401);
    } finally { await client.close(); }
  }
});
test('failed SQLite transaction creates no ack, partial measurement, receipt, last seen or SSE; retry succeeds', async () => {
  const device = await register(), client = await connect(device), db = server.app.deps.db, payload = telemetry(device);
  db.exec("CREATE TEMP TRIGGER fail_receipt BEFORE INSERT ON sensor_receipts BEGIN SELECT RAISE(ABORT, 'injected failure'); END");
  const original = server.app.deps.hub.broadcast, events = [];
  server.app.deps.hub.broadcast = (...args) => events.push(args);
  try {
    const result = await client.send(payload);
    assert.equal(result.type, 'sensor.error'); assert.equal(result.error.code, 'storage_failed'); assert.equal(count(device), 0);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM sensor_receipts WHERE device_id = ?').get(device.id).n, 0);
    assert.equal(db.prepare('SELECT last_seen_at FROM devices WHERE id = ?').get(device.id).last_seen_at, null); assert.deepEqual(events, []);
    db.exec('DROP TRIGGER fail_receipt'); assert.equal((await client.send(payload)).status, 'accepted');
  } finally { db.exec('DROP TRIGGER IF EXISTS fail_receipt'); server.app.deps.hub.broadcast = original; await client.close(); }
});
test('connection, rate and payload limits reject excess traffic', async () => {
  const short = await startServer({ sensorRatePerMinute: 1, sensorMaxPayloadBytes: 1024, sensorMaxConnections: 1 });
  const a = short.client(); await a.post('/api/v1/auth/login', ADMIN);
  try {
    const device = await register(a), client = await connect(device, short);
    assert.equal((await rejectedUpgrade((await register(a)).token, short)).status, 503);
    assert.equal((await client.send(telemetry(device))).status, 'accepted');
    assert.equal((await client.send(telemetry(device))).error.code, 'rate_limited'); await client.close();
    const large = await connect(await register(a), short), closed = once(large.ws, 'close'); large.ws.send('x'.repeat(2048));
    assert.equal((await closed)[0], 1009);
  } finally { await short.stop(); }
});
test('heartbeat handles stale/offline/recovery, disconnects and missing pong while normal pong keeps transport alive', async () => {
  const short = await startServer({ sensorHeartbeatMs: 25, sensorStaleAfterSec: 0.05, deviceOfflineSec: 0.15 });
  const a = short.client(); await a.post('/api/v1/auth/login', ADMIN); await a.patch('/api/v1/admin/cafes/A', { data_mode: 'live' });
  try {
    const device = await register(a), client = await connect(device, short), live = await stream(short);
    assert.equal((await client.send(telemetry(device))).status, 'accepted');
    assert.equal((await live.event('sensor.status')).status, 'stale'); assert.equal(short.app.deps.sensorGateway.size, 1);
    assert.equal((await live.event('sensor.status')).status, 'offline');
    assert.equal((await client.send(telemetry(device))).status, 'accepted'); assert.equal((await live.event('sensor.status')).status, 'online');
    await client.close(); assert.equal((await live.event('sensor.status')).status, 'offline'); await live.close();
    const silent = await connect(await register(a), short, { autoPong: false }); assert.equal((await once(silent.ws, 'close'))[0], 1006);
  } finally { await short.stop(); }
});
test('production enforces WSS and ignores forwarded HTTPS unless proxy trust is explicit', async () => {
  const short = await startServer({ production: true }), a = short.client(); await a.post('/api/v1/auth/login', ADMIN);
  try {
    const device = await register(a);
    assert.equal((await rejectedUpgrade(device.token, short)).body.error.code, 'wss_required');
    assert.equal((await rejectedUpgrade(device.token, short, '/ws/sensors', { 'X-Forwarded-Proto': 'https' })).status, 403);
    short.config.trustProxy = true;
    const client = await connect(device, short, { headers: { Authorization: `Bearer ${device.token}`, 'X-Forwarded-Proto': 'https' } }); await client.close();
  } finally { await short.stop(); }
});
test('restart preserves receipts; graceful shutdown closes open WebSockets and SSE', async () => {
  const short = await startServer(), a = short.client(); await a.post('/api/v1/auth/login', ADMIN);
  let restarted;
  try {
    const device = await register(a), client = await connect(device, short), live = await stream(short), payload = telemetry(device);
    assert.equal((await client.send(payload)).status, 'accepted');
    const closed = once(client.ws, 'close'); await short.app.close(); assert.equal((await closed)[0], 1001); await live.close();
    restarted = await createApp(short.config); const { port } = await restarted.listen(0, '127.0.0.1');
    const next = await connect(device, { origin: `http://127.0.0.1:${port}` });
    assert.equal((await next.send(payload)).status, 'duplicate');
    assert.equal(restarted.deps.db.prepare('SELECT COUNT(*) n FROM measurements WHERE device_id = ?').get(device.id).n, 1); await next.close();
  } finally { await restarted?.close(); await short.stop(); }
});
test('opt-in retention preserves latest, legacy rows and receipts and prevents replay after history deletion', async () => {
  const device = await register(), client = await connect(device), db = server.app.deps.db, payload = telemetry(device);
  try {
    await client.send(payload); await client.send(telemetry(device, { timestamp: new Date(Date.now() + 1000).toISOString() }));
    db.prepare('UPDATE measurements SET received_at = ? WHERE device_id = ?').run('2020-01-01T00:00:00.000Z', device.id);
    const legacy = db.prepare('INSERT INTO measurements (cafe_id, device_id, ts, received_at, raw) VALUES (?, ?, ?, ?, ?)').run('A', device.id, '2020-01-01', '2020-01-01', '{}');
    assert.equal(server.app.deps.sensors.retain(), 0); server.config.sensorRetentionDays = 30;
    assert.equal(server.app.deps.sensors.retain(), 1); assert.ok(db.prepare('SELECT id FROM measurements WHERE id = ?').get(legacy.lastInsertRowid));
    assert.equal((await client.send(payload)).status, 'duplicate'); assert.equal(count(device), 2);
  } finally { server.config.sensorRetentionDays = 0; await client.close(); }
});
test('migration upgrades a real v1 database without losing cafe, device or measurement data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'livespace-migration-')), file = join(directory, 'legacy.db'), legacy = new DatabaseSync(file);
  legacy.exec(await readFile(new URL('./fixtures/database-v1.sql', import.meta.url), 'utf8'));
  legacy.prepare('INSERT INTO cafes (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('old-cafe', 'Existing cafe', '2020-01-01', '2020-01-01');
  legacy.prepare('INSERT INTO devices (id, cafe_id, token_hash, kind, created_at) VALUES (?, ?, ?, ?, ?)').run('old-sim', 'old-cafe', 'hash', 'simulator', '2020-01-01');
  legacy.prepare('INSERT INTO measurements (device_id, cafe_id, ts, received_at, raw, occupied_seats) VALUES (?, ?, ?, ?, ?, ?)').run('old-sim', 'old-cafe', '2020-01-01', '2020-01-01', '{"legacy":true}', 12); legacy.close();
  const db = openDatabase(file);
  try {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 8); assert.equal(db.prepare('PRAGMA synchronous').get().synchronous, 2);
    const row = db.prepare('SELECT * FROM measurements').get(); assert.equal(row.occupied_seats, 12); assert.equal(row.raw, '{"legacy":true}'); assert.equal(row.data_source, 'simulated');
    assert.equal(db.prepare('SELECT name FROM cafes').get().name, 'Existing cafe'); assert.equal(db.prepare('SELECT is_test FROM devices').get().is_test, 1);
  } finally { db.close(); await rm(directory, { recursive: true, force: true }); }
});
test('people-only Android frames do not displace existing HTTP seats and Wi-Fi', async () => {
  const device = await register(admin, { cafe_id: 'B' }), db = server.app.deps.db;
  await admin.patch('/api/v1/admin/cafes/B', { data_mode: 'live' });
  db.prepare('INSERT INTO measurements (cafe_id, device_id, ts, received_at, occupied_seats, available_seats, total_seats, wifi_quality, raw) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('B', device.id, new Date(Date.now() - 60000).toISOString(), new Date().toISOString(), 5, 15, 20, 80, '{}');
  const current = server.app.deps.sensors.authenticate(`Bearer ${device.token}`);
  for (let n = 0; n < 35; n++) server.app.deps.sensors.ingest(current, telemetry(device));
  const cafe = (await server.client().get('/api/v1/cafes/B')).data.cafe; assert.equal(cafe.live.available_seats, 15); assert.equal(cafe.live.wifi_quality, 80);
});
test('standalone simulator verifies WebSocket auth, failures, duplicate/invalid payloads, SQLite and SSE end to end', async () => {
  const device = await register(admin, { kind: 'simulator' }), live = await stream();
  try {
    const child = spawn(process.execPath, ['scripts/sensor-simulator.mjs', '--url', server.origin.replace('http', 'ws') + '/ws/sensors', '--device', device.id, '--location', 'A', '--interval', '10', '--count', '3', '--disconnect-every', '2', '--duplicate-every', '1', '--invalid-every', '3', '--reconnect-ms', '40'], { env: { ...process.env, LS_SENSOR_TOKEN: device.token }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = ''; child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    const timer = setTimeout(() => child.kill(), 10000), [code] = await once(child, 'exit'); clearTimeout(timer); assert.equal(code, 0, stderr);
    const events = stdout.trim().split('\n').map(line => JSON.parse(line));
    assert.equal(events.filter(e => e.event === 'ack').length, 3); assert.equal(events.filter(e => e.event === 'duplicate').length, 3);
    assert.ok(events.some(e => e.event === 'retry')); assert.ok(events.some(e => e.event === 'expected_error')); assert.equal(count(device), 3);
    assert.equal(server.app.deps.db.prepare("SELECT COUNT(*) n FROM measurements WHERE device_id = ? AND data_source = 'real'").get(device.id).n, 0);
    assert.equal((await live.event('sensor.telemetry')).dataSource, 'simulated'); assert.ok(!stdout.includes(device.token)); assert.ok(!stderr.includes(device.token));
  } finally { await live.close(); }
});
test('manual simulation accepts commands and refuses real sensor registrations', async () => {
  const device = await register(admin, { is_test: true }), input = new PassThrough(), output = new PassThrough();
  const options = simulatorOptions(['--device', device.id, '--location', 'A', '--url', server.origin.replace('http', 'ws') + '/ws/sensors', '--mode', 'manual'], { LS_SENSOR_TOKEN: device.token });
  input.end('people 12\nnoise -45\nbattery 70\nsend\nquit\n');
  assert.equal((await runSimulator(options, { input, output, log: () => {} })).sent, 1);
  assert.equal(server.app.deps.db.prepare('SELECT observed_people FROM measurements WHERE device_id = ?').get(device.id).observed_people, 12);
  const real = await register(); await assert.rejects(runSimulator({ ...options, device: real.id, token: real.token }, { log: () => {} }), /refusing to send/); assert.equal(count(real), 0);
});

test('Node accepts client-originated control pings without changing telemetry freshness', async () => {
 const device=await register();const client=await connect(device);
 try {
  await client.send(telemetry(device));
  const before=server.app.deps.db.prepare('SELECT last_seen_at FROM devices WHERE id=?').get(device.id).last_seen_at;
  const pong=once(client.ws,'pong');client.ws.ping('android-heartbeat');
  assert.equal((await pong)[0].toString(),'android-heartbeat');
  const after=server.app.deps.db.prepare('SELECT last_seen_at FROM devices WHERE id=?').get(device.id).last_seen_at;
  assert.equal(after,before);
 }finally{await client.close();}
});
