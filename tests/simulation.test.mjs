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
    const result = runScenario(FloorPlan, cafe, environment);
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
