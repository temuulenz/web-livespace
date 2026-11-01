// A small observable store.
//
//   const store = createStore({ user: null, favorites: [] });
//   store.subscribe(s => s.user, user => …);  // runs only when the selected value changes
//   store.set({ user });                       // shallow merge
//   store.update(s => ({ favorites: [...s.favorites, id] }));
//
// Notifications are batched into one microtask, so several updates in a row cause
// one re-render. Selectors compare with Object.is: return stable references.

export function createStore(initial = {}) {
  let state = Object.freeze({ ...initial });
  const listeners = new Set();
  let queued = false, previous = state;

  function flush() {
    queued = false;
    const before = previous; previous = state;
    for (const listener of [...listeners]) {
      if (!listeners.has(listener)) continue;
      const next = listener.select(state), prev = listener.select(before);
      if (!Object.is(next, prev)) listener.callback(next, prev, state);
    }
  }

  function commit(patch) {
    if (!patch) return;
    const next = { ...state, ...patch };
    if (Object.keys(patch).every(key => Object.is(state[key], next[key]))) return;
    state = Object.freeze(next);
    if (!queued) { queued = true; queueMicrotask(flush); }
  }

  return {
    get: () => state,
    set: commit,
    update: fn => commit(fn(state)),
    subscribe(select, callback, { immediate = false } = {}) {
      if (typeof callback !== 'function') { callback = select; select = s => s; }
      const listener = { select, callback };
      listeners.add(listener);
      if (immediate) callback(select(state), undefined, state);
      return () => listeners.delete(listener);
    }
  };
}
