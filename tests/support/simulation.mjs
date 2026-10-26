// A canvas recorder keeps simulation tests independent of a browser or graphics driver.
export function simulationEnvironment() {
  let now = 0, nextFrame = 0;
  const frames = new Map(), calls = [];
  const context = new Proxy({}, {
    set(target, key, value) { calls.push([key, value]); target[key] = value; return true; },
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return (...args) => {
        calls.push([key, ...args]);
        return { addColorStop(...args) { calls.push(['addColorStop', ...args]); } };
      };
      return (...args) => calls.push([key, ...args.map(value => value?.canvasMarker ? 'canvas' : value)]);
    }
  });
  const canvases = [];
  const document = { hidden: false, createElement() {
    const canvas = { canvasMarker: true, style: {}, setAttribute() {}, getContext() { return context; }, addEventListener() {}, getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 520 }; } };
    canvases.push(canvas); return canvas;
  } };
  const observers = [];
  class ResizeObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {} disconnect() { this.disconnected = true; }
  }
  const wrap = { style: {}, appendChild() {}, getBoundingClientRect() { return { width: 800 }; } };
  return {
    calls, frames, observers, wrap, canvases,
    globals: { document, ResizeObserver, window: { devicePixelRatio: 1, matchMedia: () => ({ matches: false }) }, performance: { now: () => now }, requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; }, cancelAnimationFrame(id) { frames.delete(id); } },
    setTime(value) { now = value; }
  };
}

export function runScenario(FloorPlan, cafe, environment) {
  const stats = [], events = [];
  const sim = new FloorPlan(environment.wrap, cafe, { sound: cafe.sound, onStats: value => stats.push(value), onEvent: (...event) => events.push(event) });
  environment.calls.length = 0;
  sim.draw();
  const initialDraw = JSON.stringify(environment.calls);
  const states = [];
  const snapshot = label => states.push({ label, stats: sim.stats(), people: sim.people.map(p => ({ state: p.state, seat: p.seat?.id ?? null, x: p.x, y: p.y, ang: p.ang, item: p.item, shirt: p.shirt, path: p.path })), staff: sim.staff, target: sim.target, nextEv: sim.nextEv });
  // Freeze snapshots rather than retaining mutable staff/path arrays.
  const capture = label => { snapshot(label); states[states.length - 1] = JSON.parse(JSON.stringify(states.at(-1))); };
  capture('initial');
  sim.arrive(true); sim.depart(true);
  let now = 0;
  const advance = count => { for (let i = 0; i < count; i++) { now += 1000 / 60; environment.setTime(now); sim.update(1 / 60, now); } };
  advance(1800); capture('arrival, order, seating and departure');
  sim.setTarget(80, true); advance(1200); capture('forecast occupancy');
  sim.sound = 5; advance(600); capture('busy cafe');
  sim.reduced = true; sim.arrive(true); sim.depart(true); advance(300); capture('reduced motion');
  const paths = [[90, 518, 580, 112], [580, 112, 200, 312], [370, 167, 90, 518]].map(args => sim.path(...args));
  sim.destroy();
  return { initialDraw, states, stats, events, paths };
}
