import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runScenario, simulationEnvironment } from './support/simulation.mjs';

Object.assign(globalThis, simulationEnvironment().globals);
globalThis.localStorage = { getItem() { return null; } };
const { FloorPlan } = await import('../js/simulation/floor-plan.js');
const { getCafes } = await import('../js/cafes.js');
const { Snd } = await import('../js/audio.js');
Snd.ui = () => {};
const fixtures = JSON.parse(await readFile(new URL('./fixtures/simulation.json', import.meta.url), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');

for (const cafe of getCafes().filter(cafe => cafe.open)) {
  test(`${cafe.name}: original movement, ordering, seats, forecast and reduced motion`, () => {
    const environment = simulationEnvironment();
    Object.assign(globalThis, environment.globals);
    // The fixtures were captured from the original interior, kitchen included.
    const result = runScenario(FloorPlan, cafe, environment, { layout: 'legacy' });
    assert.equal(hash(result.initialDraw), fixtures[cafe.id].initialDrawHash, 'Canvas drawing commands changed');
    assert.equal(hash(JSON.stringify(result)), fixtures[cafe.id].scenarioHash, 'Seeded simulation behavior changed');
    assert.equal(environment.frames.size, 0, 'Destroy must cancel its animation frame');
  });
}

test('destroy cancels both rendering and a pending resize', () => {
  const environment = simulationEnvironment();
  Object.assign(globalThis, environment.globals);
  const sim = new FloorPlan(environment.wrap, getCafes()[0], {});
  environment.observers[0].callback();
  assert.equal(environment.frames.size, 2);
  sim.destroy();
  assert.equal(environment.frames.size, 0);
  assert.equal(environment.observers[0].disconnected, true);
  assert.equal(sim.events.signal.aborted, true);
  environment.observers[0].callback();
  assert.equal(environment.frames.size, 0);
});

test('draw avoids filtered people arrays and staff object copies', () => {
  const environment = simulationEnvironment();
  Object.assign(globalThis, environment.globals);
  const sim = new FloorPlan(environment.wrap, getCafes()[0], {});
  let filters = 0, copies = 0;
  sim.people.filter = (...args) => { filters++; return Array.prototype.filter.apply(sim.people, args); };
  sim.staff = sim.staff.map(person => new Proxy(person, { ownKeys(target) { copies++; return Reflect.ownKeys(target); } }));
  for (let frame = 0; frame < 60; frame++) sim.draw();
  assert.equal(filters, 0);
  assert.equal(copies, 0);
  sim.destroy();
});

function realCafe(count, overrides = {}) {
  return { ...getCafes()[0], live: { mode: 'live', sensor: { dataSource: 'real', status: 'online', observedPeople: count, peopleTimestamp: new Date().toISOString(), peopleStale: false, ...overrides } } };
}

test('real telemetry synchronizes 0 → 5 → 2 → 0 without inferring seats or random visitors', () => {
  const environment = simulationEnvironment(); Object.assign(globalThis, environment.globals);
  const sim = new FloorPlan(environment.wrap, realCafe(0), {});
  for (const count of [0, 5, 2, 0]) {
    sim.syncTelemetry(realCafe(count));
    assert.equal(sim.people.length, count);
    for (let i = 0; i < 600; i++) sim.update(1 / 60, i * 1000 / 60);
    assert.equal(sim.people.length, count);
    assert.equal(sim.observedPeople, count);
    assert.ok(sim.people.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && !p.seat));
    assert.ok(sim.seats.every(s => s.state === 'unknown' && !s.person && !s.res));
    assert.equal(sim.stats().total, 0);
    assert.equal(sim.arrive(true), false); assert.equal(sim.depart(true), false);
    sim.setTarget(90, true); assert.equal(sim.target, count);
  }
  sim.destroy();
});

test('offline, stale, missing and invalid counts are unknown, including local expiry', () => {
  const environment = simulationEnvironment(); Object.assign(globalThis, environment.globals);
  const sim = new FloorPlan(environment.wrap, realCafe(5), {});
  for (const overrides of [{ status: 'offline' }, { status: 'stale' }, { peopleStale: true }, { observedPeople: null }, { observedPeople: -1 }, { observedPeople: '0' }, { peopleTimestamp: 'invalid' }, { peopleTimestamp: new Date(Date.now() - 31000).toISOString() }]) {
    sim.syncTelemetry(realCafe(5, overrides));
    assert.equal(sim.observedPeople, null); assert.equal(sim.people.length, 0); assert.equal(sim.target, null);
  }
  sim.syncTelemetry(realCafe(5));
  sim.telemetrySensor.peopleTimestamp = new Date(Date.now() - 31000).toISOString();
  sim.update(.016, 16);
  assert.equal(sim.observedPeople, null); assert.equal(sim.people.length, 0);
  sim.destroy();
});

test('switching real and simulated modes restores autonomous simulation on the same canvas', () => {
  const environment = simulationEnvironment(); Object.assign(globalThis, environment.globals);
  const sim = new FloorPlan(environment.wrap, realCafe(5), {}), canvas = sim.cv;
  const simulated = { ...getCafes()[0], occ: 50, live: { mode: 'test', sensor: { dataSource: 'simulated' } } };
  sim.syncTelemetry(simulated);
  assert.equal(sim.telemetryControlled, false);
  assert.ok(sim.seats.some(s => s.state === 'free'));
  assert.equal(sim.arrive(true), true);
  sim.syncTelemetry(realCafe(0));
  assert.equal(sim.people.length, 0); assert.equal(sim.telemetryControlled, true);
  sim.syncTelemetry(simulated); sim.update(1, 1000);
  assert.ok(sim.people.length > 0);
  assert.equal(sim.cv, canvas);
  sim.destroy();
});

test('real visitors enter and leave using paths; zero clears transitions and real mode draws no extra staff', () => {
  const environment = simulationEnvironment(); Object.assign(globalThis, environment.globals);
  const sim = new FloorPlan(environment.wrap, realCafe(0), {});
  sim.syncTelemetry(realCafe(5));
  assert.ok(sim.people.every(p => p.state === 'illustrativeEnter' && p.path.length));
  const first = sim.people[0], originalY = first.y;
  for (let i = 0; i < 30; i++) sim.update(1 / 60, i * 1000 / 60);
  assert.notEqual(first.y, originalY);
  sim.syncTelemetry(realCafe(2));
  assert.equal(sim.people.length, 2); assert.equal(sim.departures.length, 3);
  for (let i = 0; i < 90; i++) sim.update(1 / 60, i * 1000 / 60);
  assert.equal(sim.departures.length, 0);
  let rendered = 0; sim.person = () => rendered++; sim.draw(); assert.equal(rendered, 2);
  sim.syncTelemetry(realCafe(0)); sim.draw(); assert.equal(rendered, 2);
  assert.equal(sim.departures.length, 0);
  sim.reduced = true; sim.syncTelemetry(realCafe(5)); assert.ok(sim.people.every(p => p.state === 'illustrative'));
  sim.syncTelemetry(realCafe(2)); assert.equal(sim.departures.length, 0);
  sim.destroy();
});
