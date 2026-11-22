import assert from 'node:assert/strict';
import test from 'node:test';
import { simulationEnvironment } from './support/simulation.mjs';

Object.assign(globalThis, simulationEnvironment().globals);
globalThis.localStorage = { getItem() { return null; } };
const { FloorPlan } = await import('../js/simulation/floor-plan.js');
const { resolveLayout, arrangementOf, EDITABLE, DESIGNS, designFor } = await import('../js/simulation/layouts.js');
const C = await import('../js/simulation/catalog.js');
const { sanitizeLayout } = await import('../server/services/visualization.mjs');

const build = (layout, cafe = { id: 'test-cafe', name: 'Туршилт', occ: 0 }) => {
  const environment = simulationEnvironment();
  Object.assign(globalThis, environment.globals);
  return new FloorPlan(environment.wrap, cafe, { layout });
};
// Floor cells reachable from a point (4-neighbour flood fill over the walkway grid).
const reachable = (sim, from) => {
  const { g, cols, rows } = sim, cell = (x, y) => Math.floor(y / 10) * cols + Math.floor(x / 10);
  const seen = new Uint8Array(cols * rows), queue = [cell(...from)]; seen[queue[0]] = 1;
  while (queue.length) {
    const i = queue.pop(), cx = i % cols, cy = i / cols | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy, n = ny * cols + nx; if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && !seen[n] && !g[n]) { seen[n] = 1; queue.push(n); } }
  }
  return { seen, at: (x, y) => !!seen[cell(x, y)], near: (s, reach) => { for (let i = 0; i < seen.length; i++) if (seen[i] && Math.hypot((i % cols) * 10 + 5 - s.x, (i / cols | 0) * 10 + 5 - s.y) <= reach) return true; return false; } };
};
const withItems = items => ({ preset: 'minimal', overrides: {}, items });

test('every catalogue type is complete and its default size lies within its limits', () => {
  const layers = ['floor0', 'floor', 'wall', 'object', 'overhead'], groups = C.GROUPS.map(([g]) => g);
  for (const [type, spec] of Object.entries(C.CATALOG)) {
    assert.ok(spec.name && groups.includes(spec.group) && layers.includes(spec.layer), type);
    assert.ok(['rect', 'circle', 'wall', 'none'].includes(spec.solid), `${type} solid`);
    for (const k of [0, 1]) assert.ok(spec.min[k] <= spec.size[k] && spec.size[k] <= spec.max[k], `${type} size`);
    assert.equal(typeof spec.draw, 'function', `${type} draw`);
    const item = C.makeItem(type, 300, 200);
    assert.deepEqual(C.sanitizeItems([item]), [{ ...item, rot: 0 }].map(o => C.sanitizeItems([o])[0]), `${type} survives a round trip`);
  }
  for (const [g] of C.GROUPS) assert.ok(Object.values(C.CATALOG).some(s => s.group === g), `group ${g} has objects`);
});

test('item whitelist: unknown types, bad numbers and unknown properties are dropped or clamped', () => {
  const out = C.sanitizeItems([
    { type: 'rocket', x: 1, y: 1 },
    { type: 'table', x: 'a', y: 5000, w: 9999, h: 1, rot: 725, n: 99, shape: 'triangle', evil: '<script>', name: 'x'.repeat(80) },
    { type: 'label', x: 100, y: 100, rot: 45, text: 'Сайн уу' },
    null
  ]);
  assert.equal(out.length, 2);
  const [t, l] = out;
  assert.deepEqual([t.x, t.y, t.w, t.h, t.rot, t.n, t.shape, t.name.length], [400, 520, 320, 30, 5, 6, 'square', 30]);
  assert.ok(!('evil' in t));
  assert.equal(l.rot, 0, 'labels never turn');
  assert.equal(C.sanitizeItems('not a list').length, 0);
  assert.equal(C.sanitizeItems(Array.from({ length: 500 }, () => ({ type: 'chair', x: 100, y: 100 }))).length, 300);
});

test('geometry: turning is reversible and hit tests follow the turned shape', () => {
  const o = { x: 300, y: 200, w: 120, h: 20, rot: 30 };
  const [wx, wy] = C.toWorld(o, 50, -5), [lx, ly] = C.toLocal(o, wx, wy);
  assert.ok(Math.abs(lx - 50) < 1e-9 && Math.abs(ly + 5) < 1e-9);
  assert.ok(C.contains(o, ...C.toWorld(o, 55, 0)));
  assert.ok(!C.contains(o, 300 + 55, 200), 'a point along the unturned axis is outside the turned shape');
  const [x0, y0, x1, y1] = C.aabb({ ...o, rot: 90 });
  assert.deepEqual([x0, y0, x1, y1].map(Math.round), [290, 140, 310, 260]);
});

test('seats turn with their table and face it', () => {
  const sim = build(withItems([{ type: 'table', x: 300, y: 250, w: 60, h: 60, rot: 90, n: 1, s: 0, wl: 0, e: 0 }]));
  const seat = sim.seats.at(-1);
  // The "front" chair of a table turned 90° clockwise stands on its right (east) side.
  assert.ok(Math.abs(seat.x - (300 + 30 + 16)) < 1e-6 && Math.abs(seat.y - 250) < 1e-6, `${seat.x},${seat.y}`);
  assert.ok(Math.abs(Math.cos(seat.ang) + 1) < 1e-9, 'the chair faces west, towards the table');
  sim.destroy();
});

test('a glass partition blocks the walkway except at its opening', () => {
  const partition = gapw => [{ type: 'wall', x: 300, y: 262, w: 476, h: 8, rot: 90, material: 'glass', gap: 50, gapw }];
  const closed = build(withItems(partition(0))), open = build(withItems(partition(70)));
  assert.ok(!reachable(closed, [150, 262]).at(...closed.order), 'without an opening the left side cannot reach the counter');
  assert.ok(reachable(open, [150, 262]).at(...open.order), 'the opening lets guests through');
  assert.equal(open.g[Math.floor(100 / 10) * open.cols + 30], 1, 'the wall leaves no gap where there should be glass');
  closed.destroy(); open.destroy();
});

test('decoration does not block, furniture does', () => {
  const floor = build(withItems([{ type: 'mural', x: 300, y: 300, w: 200, h: 40 }, { type: 'kids-mat', x: 300, y: 300, w: 200, h: 100 }, { type: 'lamp', x: 300, y: 300, w: 120, h: 120 }]));
  const cell = (sim, x, y) => sim.g[Math.floor(y / 10) * sim.cols + Math.floor(x / 10)];
  assert.equal(cell(floor, 300, 300), 0);
  const solid = build(withItems([{ type: 'kids-table', x: 300, y: 300, w: 64, h: 44 }]));
  assert.equal(cell(solid, 300, 300), 1);
  floor.destroy(); solid.destroy();
});

test('a resized and turned order counter keeps the queue spot, barista and walkway together', () => {
  for (const counter of [{ x: 600, y: 24, w: 140, h: 120 }, { x: 300, y: 150, w: 176, h: 226, rot: 90 }, { x: 420, y: 40, w: 220, h: 180, rot: -30 }]) {
    const sim = build({ preset: 'minimal', overrides: { counter } });
    assert.ok(sim.cbox.custom);
    const [ox, oy] = sim.order;
    assert.ok(ox > 24 && ox < 776 && oy > 24 && oy < 500, `queue spot on the floor ${ox},${oy}`);
    assert.ok(reachable(sim, sim.order).at(...sim.doorIn), 'the entrance reaches the queue spot');
    const box = { ...C.counterFrame(counter), w: C.counterFrame(counter).w + 10, h: C.counterFrame(counter).h + 10 };
    for (const [x, y] of sim.staff[0].pts) assert.ok(C.contains(box, x, y), 'the barista walks behind the counter');
    const [cx, cy] = C.counterPoint(sim.cbox, 690, 150);
    assert.equal(sim.g[Math.floor(cy / 10) * sim.cols + Math.floor(cx / 10)], 1, 'guests do not walk through the barista area');
    sim.destroy();
  }
});

test('the default counter and layouts without items take the original code paths', () => {
  assert.equal(C.counterBox({ x: 600, y: 24 }).custom, false);
  assert.deepEqual(C.counterPoint(C.counterBox({ x: 560, y: 60 }), 580, 112), [540, 148]);
  assert.deepEqual(C.counterFromFrame(C.counterFrame({ x: 560, y: 60 })), { x: 560, y: 60 });
  for (const id of ['minimal', 'artistic', 'legacy']) assert.ok(!('items' in resolveLayout(id)) && !('design' in resolveLayout(id)), id);
  assert.deepEqual(Object.keys(arrangementOf(resolveLayout('minimal'))), EDITABLE, 'the saved shape is unchanged');
  const plain = build('minimal');
  assert.equal(plain.cbox.custom, false);
  assert.ok(plain.seats.every(s => !s.label.includes('·') || s.label.includes('р ширээ')), 'no catalogue seats appear');
  plain.destroy();
});

test('the server keeps only the classic part of an exported layout', () => {
  const exported = { preset: 'minimal', overrides: { counter: { x: 204, y: 24, w: 176, h: 190, rot: 15 }, plants: [[100, 100, 10]] }, items: [{ type: 'table', x: 1, y: 1 }], look: { name: 'x' } };
  assert.deepEqual(sanitizeLayout(exported), { preset: 'minimal', overrides: { plants: [[100, 100, 10]], counter: { x: 204, y: 24 } } });
});

test('design files: a café is matched by id or name, and a design survives an export round trip', () => {
  const design = DESIGNS['sunny-day'];
  assert.ok(design);
  assert.equal(designFor({ id: 'zz', name: '  sunny-day  coffee SHOP ' })?.id, 'sunny-day');
  assert.equal(designFor({ id: 'A', name: 'Номт кафе' }), null);
  assert.equal(resolveLayout('minimal', { name: 'Sunny Day' }).design, undefined, 'an explicit template wins');
  const L = resolveLayout(undefined, { id: 'zz', name: 'Sunny Day', visualization: { layout: { preset: 'artistic' } } });
  assert.equal(L.design, 'sunny-day', 'the design file wins over the server template');
  // What the editor exports is { preset, overrides, look, items }; reading it back gives the same interior.
  const exported = JSON.parse(JSON.stringify({ preset: 'minimal', overrides: arrangementOf(L), look: L.look, items: L.items }));
  const again = resolveLayout(exported);
  assert.deepEqual(again.items, L.items);
  assert.deepEqual(again.counter, L.counter);
  assert.deepEqual(again.door, L.door);
  assert.deepEqual(C.sanitizeItems(design.layout.items), L.items, 'the design file needs no cleaning');
});

test('Sunny Day: two rooms behind a glass partition, a children\'s corner, and every seat reachable', () => {
  const sim = build(undefined, { id: 'sunny', name: 'Sunny Day Coffee Shop', occ: 0 });
  const types = sim.L.items.map(o => o.type);
  for (const t of ['wall', 'kids-mat', 'kids-table', 'kids-books', 'toys', 'mural', 'panel', 'bar', 'bench', 'stairs', 'display']) assert.ok(types.includes(t), t);
  const glass = sim.L.items.find(o => o.type === 'wall');
  assert.equal(glass.material, 'glass'); assert.equal(glass.color, '#4E8B3A'); assert.ok(glass.gapw >= 60);
  assert.deepEqual(sim.L.items.filter(o => o.type === 'mural').map(o => o.style).sort(), ['books', 'drawings']);
  assert.ok(sim.seats.length >= 20, `${sim.seats.length} seats`);
  const flood = reachable(sim, sim.order);
  assert.ok(flood.at(...sim.doorIn), 'the entrance reaches the order counter');
  for (const seat of sim.seats) {
    assert.ok(seat.x > 28 && seat.x < 772 && seat.y > 28 && seat.y < 496, `${seat.label} outside the walls`);
    assert.ok(flood.near(seat, seat.kind === 'sofa' ? 52 : 34), `${seat.label} is walled in`);
  }
  for (const [i, a] of sim.seats.entries()) for (const b of sim.seats.slice(i + 1)) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 30, `${a.label} overlaps ${b.label}`);
  // Both rooms have seats; the partition stands between them.
  assert.ok(sim.seats.some(s => s.x < glass.x) && sim.seats.some(s => s.x > glass.x));
  sim.destroy();
});

test('Sunny Day simulation: guests arrive, sit and leave through the side entrance', () => {
  const environment = simulationEnvironment();
  Object.assign(globalThis, environment.globals);
  const sim = new FloorPlan(environment.wrap, { id: 'sunny', name: 'Sunny Day', occ: 0 }, {});
  sim.setTarget(60, true);
  for (let t = 0; t < 4000; t++) { environment.setTime(t * 50); sim.update(.05, t * 50); }
  const seated = sim.people.filter(p => p.state === 'seated');
  assert.ok(seated.length > 0, 'guests found seats');
  for (const p of seated) assert.ok(Math.hypot(p.x - p.seat.x, p.y - p.seat.y) < 1);
  sim.destroy();
});
