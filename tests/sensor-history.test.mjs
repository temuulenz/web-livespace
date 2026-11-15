import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { ADMIN, startServer } from './support/server.mjs';

test('5/15/60-minute aggregates separate sources, reject stale/invalid data, estimate coverage and use Ulaanbaatar features', async () => {
  const server = await startServer(), admin = server.client();
  try {
    await admin.post('/api/v1/auth/login', ADMIN); await admin.patch('/api/v1/admin/cafes/A', { data_mode: 'live' });
    for (const id of ['primary', 'other']) await admin.post('/api/v1/admin/devices', { id, cafe_id: 'A' });
    const start = Date.parse('2026-11-15T23:00:00.000Z');
    const insert = server.app.deps.db.prepare(`INSERT INTO measurements
      (cafe_id, device_id, ts, received_at, raw, message_id, data_source, is_test, observed_people, noise_db, noise_calibrated, battery_pct, battery_temperature_c)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const sample = ({ offset, people, device = 'primary', source = 'real', delay = 1000, noise = 50, calibrated = 1 }) => {
      insert.run('A', device, new Date(start + offset).toISOString(), new Date(start + offset + delay).toISOString(), '{}', randomUUID(), source, source === 'simulated' ? 1 : 0, people, noise, calibrated, 80, 37);
    };
    // Disposable mathematical fixtures, never training observations.
    for (let i = 0; i < 60; i++) sample({ offset: i * 5000, people: i + 6, noise: i % 2 ? 60 : 50 });
    sample({ offset: 150000, people: 999, delay: 120000 }); // stale at arrival
    sample({ offset: 160000, people: -1 }); // invalid count
    sample({ offset: 170000, people: null, noise: null, calibrated: 0 });
    sample({ offset: 290000, people: 9000, device: 'other' }); // not summed with primary
    sample({ offset: 200000, people: 1000, source: 'simulated' });
    const range = `since=${encodeURIComponent(new Date(start).toISOString())}&until=${encodeURIComponent(new Date(start + 3600000).toISOString())}`;
    for (const interval of [5, 15, 60]) {
      const response = await server.client().get(`/api/v1/cafes/A/sensor-history?${range}&interval=${interval}&limit=1`);
      assert.equal(response.status, 200);
      const data = response.data, row = data.aggregates[0];
      assert.equal(data.source, 'real'); assert.equal(data.readings.length, 1); assert.equal(data.deviceId, undefined);
      assert.equal(row.sampleCount, 60); assert.equal(row.totalSamples, 61);
      assert.equal(row.averageObservedPeople, 35.5); assert.equal(row.minimumObservedPeople, 6); assert.equal(row.maximumObservedPeople, 65);
      assert.equal(row.averageCalibratedDbSpl, 55); assert.equal(row.calibratedNoiseSamples, 60);
      assert.equal(row.localHour, 7); assert.equal(row.dayOfWeek, 1); assert.equal(row.coverage, 5 / interval);
      assert.equal(row.eligibleForForecast, interval === 5);
      assert.ok(!JSON.stringify(data).includes('battery')); assert.ok(!JSON.stringify(data).includes('Temperature'));
    }
    const simulated = (await admin.get(`/api/v1/admin/cafes/A/sensor-history?${range}&source=simulated`)).data;
    assert.equal(simulated.aggregates[0].averageObservedPeople, 1000); assert.equal(simulated.aggregates[0].eligibleForForecast, false);
    assert.equal(simulated.readings[0].batteryTemperatureC, 37);
    const other = (await admin.get(`/api/v1/admin/cafes/A/sensor-history?${range}&device_id=other`)).data;
    assert.equal(other.aggregates[0].sampleCount, 1); assert.equal(other.aggregates[0].averageObservedPeople, 9000);
    const raw = (await admin.get(`/api/v1/admin/cafes/A/sensor-history?${range}`)).data;
    assert.ok(raw.readings.some(row => row.staleAtArrival));
  } finally { await server.stop(); }
});

test('history endpoints enforce ownership, role, active/live cafe visibility and bounded query validation', async () => {
  const server = await startServer(), admin = server.client(), owner = server.client(), stranger = server.client();
  try {
    await admin.post('/api/v1/auth/login', ADMIN); await admin.patch('/api/v1/admin/cafes/A', { data_mode: 'live' });
    const account = await owner.post('/api/v1/auth/register', { email: 'history-owner@cafe.mn', password: 'history-password' });
    const other = await stranger.post('/api/v1/auth/register', { email: 'history-stranger@cafe.mn', password: 'history-password' });
    for (const id of [account.data.user.id, other.data.user.id]) server.app.deps.db.prepare("UPDATE users SET role = 'owner' WHERE id = ?").run(id);
    server.app.deps.db.prepare("UPDATE cafes SET owner_id = ? WHERE id = 'A'").run(account.data.user.id);
    assert.equal((await owner.get('/api/v1/owner/cafes/A/sensor-history')).status, 200);
    assert.equal((await stranger.get('/api/v1/owner/cafes/A/sensor-history')).status, 404);
    assert.equal((await owner.get('/api/v1/admin/cafes/A/sensor-history')).status, 403);
    assert.equal((await server.client().get('/api/v1/owner/cafes/A/sensor-history')).status, 401);
    assert.equal((await server.client().get('/api/v1/cafes/B/sensor-history')).status, 404, 'demo cafes do not publish sensor history');
    for (const query of ['source=all', 'interval=7', 'limit=1.5', 'limit=999999', 'since=yesterday', 'since=2020-01-01T00:00:00Z', 'device_id=../../private']) {
      assert.equal((await server.client().get('/api/v1/cafes/A/sensor-history?' + query)).status, 422, query);
    }
    const empty = (await server.client().get('/api/v1/cafes/A/sensor-history')).data;
    assert.deepEqual(empty.aggregates, []); assert.deepEqual(empty.readings, []);
    assert.equal(empty.source, 'real');
  } finally { await server.stop(); }
});
