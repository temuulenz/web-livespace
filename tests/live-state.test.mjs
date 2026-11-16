import test from 'node:test';
import assert from 'node:assert/strict';
import { sensorState, mergeLive, rollingNoise, relativeNoise, noiseThresholds } from '../js/live/sensor-state.js';
import { LiveNoise } from '../js/features/sensors/live-noise.js';
const now = Date.now(), iso = offset => new Date(now + offset).toISOString();
const sensor = overrides => ({ dataSource: 'real', timestamp: iso(0), peopleTimestamp: iso(0), noiseTimestamp: iso(0), status: 'online', observedPeople: 5, noise: { dbfs: -40, calibrated: false }, ...overrides });
const live = overrides => ({ mode: 'live', sensor: sensor(overrides) });
const state = overrides => sensorState({ live: live(overrides) }, { now });

test('people and noise availability and clocks are independent; offline is unknown', () => {
  assert.equal(state({}).observedPeople, 5);
  assert.equal(state({ observedPeople: 0 }).observedPeople, 0);
  assert.equal(state({ noise: { dbfs: null, calibrated: false } }).observedPeople, 5);
  assert.equal(state({ noise: { dbfs: null, calibrated: false } }).noiseAvailable, false);
  assert.equal(state({ peopleTimestamp: iso(-31000) }).observedPeople, null);
  assert.equal(state({ peopleTimestamp: iso(-31000) }).noise.dbfs, -40);
  assert.equal(state({ noiseTimestamp: iso(-31000) }).observedPeople, 5);
  assert.equal(state({ noiseTimestamp: null }).noiseTimestamp, null, 'camera timestamps must not become microphone timestamps');
  assert.equal(state({ noiseTimestamp: null }).noiseAvailable, false);
  assert.equal(state({ noiseTimestamp: iso(-31000) }).noise.dbfs, null);
  for (const status of ['offline', 'stale', 'disabled']) { assert.equal(state({ status }).observedPeople, null); assert.equal(state({ status }).noiseAvailable, false); }
  assert.equal(state({ noise: { dbfs: '-40', calibrated: false, estimatedDbSpl: 55 } }).noise.dbfs, null);
  assert.equal(state({ noise: { dbfs: -40, calibrated: false, estimatedDbSpl: 55 } }).noise.estimatedDbSpl, null);
  assert.equal(state({ noise: { dbfs: -40, calibrated: true, estimatedDbSpl: 55 } }).noise.estimatedDbSpl, 55);
});

test('SSE/poll snapshots and reconnect replay cannot regress newer metrics or real precedence', () => {
  const current = live({});
  const older = live({ timestamp: iso(-10000), peopleTimestamp: iso(-10000), noiseTimestamp: iso(-10000), observedPeople: 99, noise: { dbfs: -90 }, status: 'offline' });
  assert.deepEqual(mergeLive(current, older), current);
  const independent = mergeLive(current, live({ timestamp: iso(1000), peopleTimestamp: iso(-1000), observedPeople: 99, noiseTimestamp: iso(1000), noise: { dbfs: -20, calibrated: false } }));
  assert.equal(independent.sensor.observedPeople, 5); assert.equal(independent.sensor.noise.dbfs, -20);
  assert.equal(mergeLive(current, { mode: 'test', sensor: sensor({ dataSource: 'simulated', observedPeople: 1000 }) }), current);
  assert.equal(mergeLive(current, { mode: 'demo' }, { reset: true }).mode, 'demo');
  const offline = mergeLive(current, live({ status: 'offline' })); assert.equal(offline.sensor.status, 'offline');
  const reconnect = mergeLive(offline, live({ timestamp: iso(1000), peopleTimestamp: iso(1000), status: 'online', observedPeople: 2 }));
  assert.equal(reconnect.sensor.observedPeople, 2); assert.equal(reconnect.sensor.status, 'online');
});

test('rolling noise has only actual fresh points, deduplicates polls, rejects replay and expires', () => {
  const first = state({});
  let points = rollingNoise([], first, { now });
  assert.equal(points.length, 1);
  assert.deepEqual(rollingNoise(points, first, { now }), points);
  assert.deepEqual(rollingNoise(points, state({ status: 'offline' }), { now }), points);
  assert.deepEqual(rollingNoise(points, state({ noiseTimestamp: iso(-5000) }), { now }), points);
  points = rollingNoise(points, sensorState({ live: live({ timestamp: iso(1000), noiseTimestamp: iso(1000), noise: { dbfs: -25 } }) }, { now: now + 1000 }), { now: now + 1000 });
  assert.equal(points.length, 2); assert.equal(points[1].dbfs, -25);
  assert.equal(rollingNoise(points, null, { now: now + 302000 }).length, 0);
});

test('relative dBFS thresholds are configurable and never converted to SPL', () => {
  assert.equal(relativeNoise(-40).level, 3);
  assert.equal(relativeNoise(-40, [-80, -70, -60, -50]).level, 5);
  assert.deepEqual(noiseThresholds([-10, -20, -30, -40]), [-60, -45, -30, -15]);
  assert.equal(relativeNoise(null), null);
  const panel = new LiveNoise({ cafe: { id: 'A', live: live({}) } });
  const output = String(panel.render());
  assert.match(output, /-40.0/); assert.match(output, /uncalibrated/); assert.match(output, /data-samples="1"/);
  assert.ok(!output.includes('data-live-spl'));
  panel.props.cafe = { id: 'A', live: live({ noise: { dbfs: null, calibrated: false } }) };
  assert.match(String(panel.render()), /unknown/);
  panel.props.cafe = { id: 'A', live: live({ dataSource: 'simulated' }) };
  panel.render(); assert.equal(panel.points.length, 1, 'changing source resets the chart');
});
