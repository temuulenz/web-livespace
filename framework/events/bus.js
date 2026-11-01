// Application-wide events and DOM event delegation.

export function createEventBus() {
  const handlers = new Map();
  return {
    on(type, handler) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(handler);
      return () => handlers.get(type)?.delete(handler);
    },
    once(type, handler) {
      const off = this.on(type, payload => { off(); handler(payload); });
      return off;
    },
    emit(type, payload) {
      for (const handler of [...(handlers.get(type) || [])]) {
        try { handler(payload); } catch (error) { reportError(error); }
      }
    },
    clear() { handlers.clear(); }
  };
}

// One listener on `root` handles every matching descendant, including elements
// rendered later. Pass an AbortSignal to remove it together with its owner.
export function delegate(root, type, selector, handler, { signal, capture = false } = {}) {
  const listener = event => {
    const target = event.target instanceof Element ? event.target.closest(selector) : null;
    if (target && root.contains(target)) handler(event, target);
  };
  root.addEventListener(type, listener, { signal, capture });
  return () => root.removeEventListener(type, listener, { capture });
}

function reportError(error) {
  // Keep one failing handler from breaking the others.
  if (typeof console !== 'undefined') console.error(error);
}
