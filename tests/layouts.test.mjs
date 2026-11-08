import assert from 'node:assert/strict';
import test from 'node:test';
import { runScenario, simulationEnvironment } from './support/simulation.mjs';

Object.assign(globalThis, simulationEnvironment().globals);
globalThis.localStorage = { getItem() { return null; } };
const { FloorPlan } = await import('../js/simulation/floor-plan.js');
const { LAYOUTS, LAYOUT_IDS, DEMO_LAYOUT, resolveLayout } = await import('../js/simulation/layouts.js');
const { getCafes } = await import('../js/cafes.js');
const { Snd } = await import('../js/audio.js');
Snd.ui = () => {};

const build = (layout, cafe = getCafes()[0]) => {
  const environment = simulationEnvironment();
  Object.assign(globalThis, environment.globals);
  return { sim: new FloorPlan(environment.wrap, cafe, { layout }), environment };
};

for (const id of LAYOUT_IDS) {
  test(`layout "${id}": the door reaches the counter and every seat has walkable floor beside it`, () => {
    const { sim } = build(id);
    assert.ok(sim.seats.length >= 12, 'a café needs a reasonable number of seats');
    // path() returns a single point when the target is unreachable.
    assert.ok(sim.path(sim.door[0], sim.door[1] + 4, ...sim.order).length >= 2, 'door cannot reach the order counter');
    // The original engine walks the final step onto a seat directly (each seat's own
    // obstacle seals its cell), so check the floor around each seat is connected instead.
    const { g, cols, rows } = sim, cell = (x, y) => Math.floor(y / 10) * cols + Math.floor(x / 10);
    const seen = new Uint8Array(cols * rows), queue = [cell(...sim.order)];
    seen[queue[0]] = 1;
    while (queue.length) {
      const i = queue.pop(), cx = i % cols, cy = i / cols | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy, n = ny * cols + nx;
        if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && !seen[n] && !g[n]) { seen[n] = 1; queue.push(n); }
      }
    }
    for (const seat of sim.seats) {
      let near = false;
      for (let i = 0; i < seen.length && !near; i++) if (seen[i] && Math.hypot((i % cols) * 10 + 5 - seat.x, (i / cols | 0) * 10 + 5 - seat.y) <= (seat.kind === 'sofa' ? 52 : 34)) near = true;
      assert.ok(near, `${seat.label} is walled in`);
    }
    sim.destroy();
  });

  test(`layout "${id}": seats stay on the customer floor and do not overlap`, () => {
    const { sim } = build(id);
    for (const [i, a] of sim.seats.entries()) {
      assert.ok(a.x > 28 && a.x < 772 && a.y > 28 && a.y < 496, `${a.label} outside the walls`);
      assert.ok(!(a.x > 598 + sim.cdx && a.x < 776 + sim.cdx && a.y > 24 + sim.cdy && a.y < 256 + sim.cdy), `${a.label} inside the barista area`);
      for (const b of sim.seats.slice(i + 1)) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 30, `${a.label} overlaps ${b.label}`);
    }
    sim.destroy();
  });

  test(`layout "${id}": the kitchen, chef and stove steam are removed`, () => {
    const { sim, environment } = build(id);
    assert.equal(sim.L.kitchen, false);
    assert.equal(sim.staff.length, 1);
    assert.ok(sim.staff[0].barista);
    assert.ok(!sim.staff.some(person => person.chef));
    assert.doesNotMatch(environment.calls.map(call => call.join(' ')).join('\n'), /Гал тогоо/);
    sim.destroy();
  });
}

test('the legacy layout still has its kitchen for the original fixtures', () => {
  const { sim, environment } = build('legacy');
  assert.equal(sim.L.kitchen, true);
  assert.ok(sim.staff.some(person => person.chef));
  assert.match(environment.calls.map(call => call.join(' ')).join('\n'), /Гал тогоо/);
  sim.destroy();
});

test('the minimal template starts from the original interior without the kitchen', () => {
  const { sim } = build(undefined, getCafes()[0]);
  const legacy = build('legacy', getCafes()[0]).sim;
  assert.equal(sim.L.id, 'minimal');
  // Every original seat is kept in the same place.
  assert.deepEqual(sim.seats.map(({ x, y, label, state }) => [x, y, label, state]), legacy.seats.map(({ x, y, label, state }) => [x, y, label, state]));
  sim.destroy(); legacy.destroy();
});

test('demo cafés use both templates', () => {
  const used = new Set(getCafes().map(cafe => resolveLayout(undefined, cafe).id));
  assert.deepEqual([...used].sort(), [...LAYOUT_IDS].sort());
  for (const cafe of getCafes()) assert.ok(LAYOUTS[DEMO_LAYOUT[cafe.id]], `${cafe.id} has no layout`);
});

test('visualization configs: preset plus arrangement, old presets and unknown presets fall back safely', () => {
  const custom = resolveLayout({ preset: 'artistic', overrides: { plants: [[100, 100, 10]], chairs: [{ x: 300, y: 300, dir: 'E' }], counter: { x: 560, y: 60 } } });
  assert.equal(custom.id, 'artistic');
  assert.deepEqual(custom.plants, [[100, 100, 10]]);
  assert.deepEqual(custom.counter, { x: 560, y: 60 });
  assert.equal(resolveLayout({ preset: 'does-not-exist' }).id, 'minimal');
  assert.equal(resolveLayout(undefined, { id: 'zzz', visualization: { layout: { preset: 'social' } } }).id, 'artistic');
  assert.equal(resolveLayout({ preset: 'library' }).id, 'minimal');
});

test('an edited arrangement: moved counter and single chairs move the barista, the queue and the seats', () => {
  const layout = resolveLayout({ preset: 'minimal', overrides: { counter: { x: 560, y: 60 }, chairs: [{ x: 420, y: 300, dir: 'W' }] } });
  const { sim } = build(layout);
  assert.deepEqual(sim.order, [540, 148]);
  assert.equal(sim.staff[0].x, 650);
  const chair = sim.seats.find(seat => seat.zone === 'chair');
  assert.ok(chair && chair.x === 420 && chair.y === 300, 'single chair becomes a seat');
  assert.ok(sim.path(sim.door[0], sim.door[1] + 4, ...sim.order).length >= 2, 'door still reaches the moved counter');
  sim.destroy();
});

test('every layout runs the full seeded scenario and settles on a new occupancy target', () => {
  for (const id of LAYOUT_IDS) {
    const environment = simulationEnvironment();
    Object.assign(globalThis, environment.globals);
    const cafe = getCafes().find(c => c.id === 'I');
    runScenario(FloorPlan, cafe, environment, { layout: id });
    assert.equal(environment.frames.size, 0);

    const { sim } = build(id, cafe);
    sim.setTarget(80, true);
    let now = 0;
    for (let i = 0; i < 60 * 120; i++) { now += 1000 / 60; environment.setTime(now); sim.update(1 / 60, now); }
    const { free, total } = sim.stats();
    assert.ok(Math.abs(total - free - sim.target) <= 2, `${id}: ${total - free} seated, target ${sim.target}`);
    assert.ok(sim.people.every(p => ['seated', 'leaving', 'gone', 'toOrder', 'order', 'toSeat'].includes(p.state)));
    sim.destroy();
  }
});
