import assert from 'node:assert/strict';
import test from 'node:test';
import { simulationEnvironment } from './support/simulation.mjs';

Object.assign(globalThis, simulationEnvironment().globals);
globalThis.localStorage = { getItem() { return null; } };
const { FloorPlan, lookTheme, THEMES } = await import('../js/simulation/floor-plan.js');
const { resolveLayout, arrangementOf } = await import('../js/simulation/layouts.js');
const { getCafes } = await import('../js/cafes.js');
const { Snd } = await import('../js/audio.js');
Snd.ui = () => {};

const build = layout => {
  const environment = simulationEnvironment();
  Object.assign(globalThis, environment.globals);
  return new FloorPlan(environment.wrap, getCafes()[0], { layout });
};
const reaches = (sim, [x, y]) => sim.path(...sim.entry, x, y).length >= 2;

test('without room options the entrance is the original bottom-left door', () => {
  const sim = build('minimal');
  assert.deepEqual(sim.door, [90, 514]);
  assert.deepEqual(sim.entry, [90, 518]);
  assert.equal(sim.custom, false);
  sim.destroy();
});

test('the entrance can be on another wall and guests still reach the counter', () => {
  for (const door of [{ side: 'right', at: 380 }, { side: 'left', at: 180 }, { side: 'bottom', at: 400 }]) {
    // (The minimal template's shelf stands against the right wall; the editor warns when a door is blocked.)
    const sim = build({ preset: 'minimal', overrides: { door, shelves: [] } });
    assert.equal(sim.custom, true);
    assert.ok(reaches(sim, sim.order), `${door.side} door reaches the counter`);
    sim.destroy();
  }
});

test('a moved order counter and a cut-away corner keep the café walkable', () => {
  const sim = build({ preset: 'artistic', overrides: { counter: { x: 80, y: 240 }, cuts: [[616, 24, 160, 120]] } });
  assert.ok(reaches(sim, sim.order));
  const cell = (x, y) => Math.floor(y / 10) * sim.cols + Math.floor(x / 10);
  assert.equal(sim.g[cell(700, 80)], 1, 'the cut corner is not floor');
  sim.destroy();
});

test('VIP room seats are booked separately: never filled by walk-ins, not counted as free', () => {
  const layout = { preset: 'minimal', overrides: { vip: { x: 300, y: 290, w: 230, h: 200, name: 'VIP' }, long: [{ x: 335, y: 370, w: 160, seats: [365, 415, 465], zone: 'long', name: 'VIP ширээ' }], sofas: [] } };
  const sim = build(layout);
  const vip = sim.seats.filter(s => s.zone === 'vip');
  assert.equal(vip.length, 6);
  assert.ok(vip.every(s => s.state === 'vip'));
  const stats = sim.stats();
  assert.equal(stats.total + stats.unknown, sim.seats.length - vip.length);
  for (let i = 0; i < 40; i++) sim.arrive(false);
  assert.ok(vip.every(s => !s.res && !s.person));
  sim.destroy();
});

test('a new look recolours a template and travels with the layout', () => {
  const look = { name: 'Цэнхэр', base: 'artistic', floorStyle: 'wood', floor: '#EEF2F5', wall: '#1D3557', wood: '#A8DADC', sofa: '#457B9D', plant: '#2A9D8F', accent: '#E63946' };
  const T = lookTheme(look);
  assert.equal(T.wall, '#1D3557');
  assert.equal(T.floorStyle, 'wood');
  assert.equal(T.pendants, THEMES.artistic.pendants);
  assert.equal(resolveLayout({ preset: 'artistic', look }).look.name, 'Цэнхэр');
});

test('the editable arrangement includes the room', () => {
  const keys = Object.keys(arrangementOf(resolveLayout('minimal')));
  for (const key of ['door', 'windows', 'cuts', 'vip', 'counter']) assert.ok(keys.includes(key), key);
});
