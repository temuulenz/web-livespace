import assert from 'node:assert/strict';
import test from 'node:test';
import { simulationEnvironment } from './support/simulation.mjs';

test('a newer seat count cannot be overwritten by an older number animation', async () => {
  const environment = simulationEnvironment();
  Object.assign(globalThis, environment.globals);
  globalThis.localStorage = { getItem: () => null };
  const { animNum } = await import('../js/animations.js');
  const { pageTasks } = await import('../js/lifecycle.js');
  const element = { textContent: '0%' };
  animNum(element, 80, '%');
  animNum(element, 0, '%');
  for (let frame = 0; frame < 60; frame++) {
    const batch = [...environment.frames.values()];
    environment.frames.clear();
    batch.forEach(callback => callback(frame * 1000 / 60));
  }
  assert.equal(element.textContent, '0%');
  assert.equal(environment.frames.size, 0);
  pageTasks.clear();
});
