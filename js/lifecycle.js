// A route owns its delayed work. Clearing it prevents an old page from updating
// a new one, including when the same cafe URL is revisited before loading ends.
export function createScope() {
  const timers = new Set();
  const frames = new Set();
  return {
    timeout(callback, delay) {
      const id = setTimeout(() => { timers.delete(id); callback(); }, delay);
      timers.add(id);
      return id;
    },
    frame(callback) {
      const id = requestAnimationFrame(time => { frames.delete(id); callback(time); });
      frames.add(id);
      return id;
    },
    cancelFrame(id) {
      if (id === undefined) return;
      cancelAnimationFrame(id);
      frames.delete(id);
    },
    clear() {
      timers.forEach(clearTimeout);
      frames.forEach(cancelAnimationFrame);
      timers.clear();
      frames.clear();
    }
  };
}

export const pageTasks = createScope();
