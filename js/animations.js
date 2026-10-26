import { $$ } from './dom.js';
import { Prefs } from './state.js';
import { pageTasks } from './lifecycle.js';

const numberFrames = new WeakMap();

export function countUp() {
  if (Prefs.reduced) return;
  $$('[data-count]').forEach(el => {
    const n = +el.dataset.count, suffix = el.dataset.suf || '';
    let start = null;
    const step = time => {
      start = start || time;
      const progress = Math.min(1, (time - start) / 900);
      el.textContent = Math.round(n * (1 - Math.pow(1 - progress, 3))) + suffix;
      if (progress < 1) pageTasks.frame(step);
    };
    pageTasks.frame(step);
  });
}

export function animNum(el, to, suffix) {
  pageTasks.cancelFrame(numberFrames.get(el));
  numberFrames.delete(el);
  const from = parseInt(el.textContent) || 0;
  if (from === to || Prefs.reduced) { el.textContent = to + suffix; return; }
  let start = null;
  const step = time => {
    start = start || time;
    const progress = Math.min(1, (time - start) / 600);
    el.textContent = Math.round(from + (to - from) * progress) + suffix;
    if (progress < 1) numberFrames.set(el, pageTasks.frame(step));
    else numberFrames.delete(el);
  };
  numberFrames.set(el, pageTasks.frame(step));
}
