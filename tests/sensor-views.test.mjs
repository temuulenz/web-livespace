import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { ADMIN, startServer } from './support/server.mjs';
import { sensorPanelHTML, noiseText } from '../js/live/sensor-ui.js';
import { freePct, tone } from '../js/cafe-metrics.js';

test('public projection, private diagnostics, source precedence, enable/disable and owner scope', async () => {
  const server = await startServer(), admin = server.client(); let ws;
  try {
    await admin.post('/api/v1/auth/login', ADMIN);
    await admin.patch('/api/v1/admin/cafes/A', { data_mode: 'live', hours: '00:00–23:59' });
    const created = await admin.post('/api/v1/admin/devices', { id: 'phone', cafe_id: 'A', kind: 'sensor' });
    ws = new WebSocket(server.origin.replace('http', 'ws') + '/ws/sensors', { headers: { Authorization: `Bearer ${created.data.token}` } });
    ws.on('error', () => {}); await once(ws, 'message');
    const input = { schemaVersion: 1, type: 'sensor.telemetry', messageId: randomUUID(), deviceId: 'phone', locationId: 'A', timestamp: new Date().toISOString(),
      occupancy: { observedPeople: 14, confidence: 0.91 }, noise: { rms: 0.01, dbfs: -40, estimatedDbSpl: null, calibrated: false },
      device: { batteryPercent: 73, batteryTemperatureC: 38.2, charging: true, inferenceMs: 900, uptimeSeconds: 30 } };
    const reply = once(ws, 'message'); ws.send(JSON.stringify(input)); assert.equal(JSON.parse((await reply)[0]).status, 'accepted');
    let cafe = (await server.client().get('/api/v1/cafes/A')).data.cafe;
    assert.equal(cafe.live.sensor.observedPeople, 14); assert.equal(cafe.live.sensor.status, 'online');
    assert.equal(cafe.live.sensor.noise.dbfs, -40); assert.equal(cafe.live.sensor.dataSource, 'real');
    assert.equal(cafe.occ, null); assert.equal(freePct(cafe), null); assert.equal(cafe.live.free_pct, undefined);
    assert.ok(!JSON.stringify(cafe).includes('battery')); assert.ok(!JSON.stringify(cafe).includes(created.data.token));
    const updates = (await server.client().get('/api/v1/live')).data.updates;
    assert.equal(updates.find(c => c.id === 'A').live.sensor.observedPeople, 14);
    const owner = server.client(), stranger = server.client();
    const account = await owner.post('/api/v1/auth/register', { email: 'sensor-owner@example.mn', password: 'owner-password' });
    await stranger.post('/api/v1/auth/register', { email: 'sensor-stranger@example.mn', password: 'stranger-password' });
    server.app.deps.db.prepare("UPDATE users SET role = 'owner' WHERE id = ?").run(account.data.user.id);
    server.app.deps.db.prepare('UPDATE cafes SET owner_id = ? WHERE id = ?').run(account.data.user.id, 'A');
    const privateCafe = (await owner.get('/api/v1/owner/cafes')).data.cafes[0];
    assert.equal(privateCafe.id, 'A'); assert.equal(privateCafe.devices[0].last_status.batteryTemperatureC, 38.2);
    assert.equal(privateCafe.devices[0].last_status.batteryPercent, 73); assert.equal(privateCafe.devices[0].token_hash, undefined);
    assert.equal((await stranger.get('/api/v1/owner/cafes')).status, 403);
    assert.equal((await owner.get('/api/v1/admin/devices')).status, 403);
    assert.equal((await admin.patch('/api/v1/admin/devices/phone', { enabled: false })).status, 200);
    const denied = once(ws, 'message'); ws.send(JSON.stringify({ ...input, messageId: randomUUID() }));
    assert.equal(JSON.parse((await denied)[0]).error.code, 'invalid_device_token');
    cafe = (await server.client().get('/api/v1/cafes/A')).data.cafe; assert.equal(cafe.live.sensor.status, 'offline');
    assert.equal(cafe.live.sensor.observedPeople, 14);
    assert.equal((await admin.patch('/api/v1/admin/devices/phone', { enabled: true })).data.device.enabled, true);
    const testDevice = await admin.post('/api/v1/admin/devices', { id: 'sim', cafe_id: 'A', kind: 'simulator' });
    server.app.deps.sensors.ingest(server.app.deps.sensors.authenticate(`Bearer ${testDevice.data.token}`), { ...input, deviceId: 'sim', messageId: randomUUID(), dataSource: 'simulated', occupancy: { observedPeople: 999, confidence: 1 } });
    assert.equal((await server.client().get('/api/v1/cafes/A')).data.cafe.live.sensor.observedPeople, 14, 'simulator does not replace real readings');
  } finally { ws?.terminate(); await server.stop(); }
});

test('sensor presentation preserves units, unavailable values and source/status labels', () => {
  assert.equal(tone({ open: true, occ: null, sound: 0 }), '', 'unknown seats/SPL must not imply a quiet cafe');
  assert.equal(noiseText({ dbfs: -42, calibrated: false, estimatedDbSpl: null }), '-42.0 dBFS');
  assert.equal(noiseText({ dbfs: -42, calibrated: true, estimatedDbSpl: 55 }), '55.0 dB SPL');
  const rendered = String(sensorPanelHTML({ live: { sensor: { dataSource: 'simulated', status: 'offline', timestamp: new Date().toISOString(), observedPeople: 0, confidence: null, noise: { dbfs: null, calibrated: false }, peopleStale: false, noiseStale: true, deviceCount: 1 } } }));
  assert.match(rendered, /SIMULATED/); assert.match(rendered, /data-observed-people>0</); assert.match(rendered, /offline/);
  assert.ok(!rendered.includes('null')); assert.ok(!rendered.includes('undefined'));
});
