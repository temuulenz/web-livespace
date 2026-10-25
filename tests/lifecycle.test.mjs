import assert from 'node:assert/strict';
import test from 'node:test';
import { createScope } from '../js/lifecycle.js';

test('route cleanup cancels stale timers and frames, and the scope can be reused', () => {
  const originals = { setTimeout, clearTimeout, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame };
  const timers = new Map(), frames = new Map();
  let id = 0, ran = 0;
  globalThis.setTimeout = callback => { timers.set(++id, callback); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  globalThis.requestAnimationFrame = callback => { frames.set(++id, callback); return id; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  try {
    const scope = createScope();
    scope.timeout(() => ran++, 380); scope.frame(() => ran++);
    scope.clear();
    assert.equal(timers.size, 0); assert.equal(frames.size, 0); assert.equal(ran, 0);
    const timer = scope.timeout(() => ran++, 60);
    timers.get(timer)(); timers.delete(timer);
    const frame = scope.frame(() => ran++);
    frames.get(frame)(100); frames.delete(frame);
    scope.clear();
    assert.equal(ran, 2);
  } finally { Object.assign(globalThis, originals); }
});
