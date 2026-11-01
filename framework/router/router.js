// Hash router.
//
//   const router = createRouter({
//     routes: [
//       { path: '', name: 'home', enter: () => … },
//       { path: 'cafe-:id', name: 'cafe', enter: ({ params }) => … },
//       { path: 'admin', guard: to => isAdmin() || 'home', enter: … }
//     ],
//     fallback: 'home',                 // unknown hashes render this route
//     beforeEach: (to, from) => …,      // teardown of the previous page
//     afterEach: (to, from) => …
//   });
//   router.start();
//
// Paths are matched against the hash without '#' and without a '?query'. A segment
// written `:name` captures that part of the path; `:name` may also follow a literal
// prefix inside one segment (`cafe-:id`). Guards return true to continue, false to
// stop, or a path to redirect to.

function compile(path) {
  const names = [];
  const pattern = path.split('/').map(segment => segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:(\w+)/g, (_, name) => { names.push(name); return '([^/]+)'; })).join('/');
  return { regex: new RegExp(`^${pattern}$`), names };
}

export function parseHash(hash) {
  const value = decodeURIComponent((hash || '').replace(/^#/, ''));
  const q = value.indexOf('?');
  const path = q < 0 ? value : value.slice(0, q);
  const query = Object.fromEntries(new URLSearchParams(q < 0 ? '' : value.slice(q + 1)));
  return { path, query };
}

export function createRouter({ routes, fallback, beforeEach, afterEach, location: loc = globalThis.location, target = globalThis } = {}) {
  const table = routes.map(route => ({ ...route, ...compile(route.path) }));
  let current = null, started = false, resolving = 0;

  function match(path) {
    for (const route of table) {
      const found = route.regex.exec(path);
      if (found) return { route, params: Object.fromEntries(route.names.map((name, i) => [name, found[i + 1]])) };
    }
    const route = table.find(r => r.name === fallback || r.path === fallback);
    return route ? { route, params: {}, fallback: true } : null;
  }

  function resolve() {
    const depth = ++resolving;
    const { path, query } = parseHash(loc.hash);
    const found = match(path);
    if (!found) return null;
    const to = { name: found.route.name, path, params: found.params, query, fallback: !!found.fallback, route: found.route };
    if (found.route.guard) {
      const verdict = found.route.guard(to, current);
      if (verdict === false) return null;
      if (typeof verdict === 'string') { navigate(verdict, { replace: true }); return null; }
    }
    const from = current;
    beforeEach?.(to, from);
    if (depth !== resolving) return null; // a newer navigation started inside beforeEach
    current = to;
    found.route.enter?.(to, from);
    afterEach?.(to, from);
    return to;
  }

  function navigate(path, { replace = false } = {}) {
    const hash = '#' + String(path).replace(/^#/, '');
    if (replace) { target.history?.replaceState(null, '', hash); resolve(); }
    else if (loc.hash === hash) resolve();
    else loc.hash = hash; // hashchange → resolve
  }

  return {
    start() { if (!started) { started = true; target.addEventListener('hashchange', resolve); } return resolve(); },
    stop() { started = false; target.removeEventListener('hashchange', resolve); },
    resolve,
    navigate,
    current: () => current,
    href: (name, params = {}) => {
      const route = table.find(r => r.name === name);
      return '#' + route.path.replace(/:(\w+)/g, (_, key) => encodeURIComponent(params[key]));
    }
  };
}
