# The LiveSpace framework

`framework/` is our own small front-end framework. It uses native browser APIs only: no React, Vue, Svelte or other framework, and no runtime dependencies or build step. It knows nothing about LiveSpace; everything café-specific lives in `js/`.

It deliberately does only what LiveSpace needs. The original pages (home, map, cafés, café page, about, partner, staff) still use their tuned render functions in `app.js`. New features (accounts, owner and admin dashboards, live data) are built on the framework, and the router drives every page.

```
framework/
  index.js            public entry: import { … } from '/framework/index.js'
  core/component.js   components + lifecycle + resource cleanup
  core/errors.js      error boundary and global error hook
  renderer/html.js    escaped HTML templates
  renderer/patch.js   DOM patching (update in place)
  state/store.js      observable store
  events/bus.js       app event bus + DOM event delegation
  router/router.js    hash router with params, guards, fallback
  api/client.js       JSON API client with typed errors, timeouts, retry
  api/realtime.js     SSE with polling fallback
  auth/session.js     session store, roles, "continue after login"
  utilities/          forms (read + validate), formatting
```

## Components

```js
import { Component, html, mount } from '../framework/index.js';

class SavedCount extends Component {
  initialState() { return { n: 0 }; }
  events() { return { 'click [data-add]': () => this.setState({ n: this.state.n + 1 }) }; }
  onMount() { this.watch(store, s => s.user, () => this.invalidate()); }
  render() { return html`<button data-add>${this.state.n}</button>`; }
}
const view = mount(SavedCount, element, { some: 'prop' });
view.destroy();
```

**Lifecycle:** `constructor → mount(el) → render → onMount → (setState → render → onUpdate)* → destroy → onDestroy`.

- **Batched rendering.** `setState` merges state and schedules one render per microtask, so several updates in a row cause one DOM update.
- **Events** are delegated to the component root: `'click [data-x]': handler` or the name of a method. Handlers receive `(event, matchedElement)`.
- **Automatic cleanup.** Anything started through `listen`, `timeout`, `interval`, `frame`, `watch`, `child` or `onCleanup` is released by `destroy()`. A page can't leak listeners, timers or animation frames when the router leaves it.
- **Errors.** A render or handler error is caught, reported through `core/errors.js`, and replaced by a small message. One broken widget doesn't break the page.

## Rendering

- `` html`…` `` escapes every interpolation. Nested `` html`` `` results and arrays of them are inserted as markup, and `raw(markup)` opts out for markup you produced yourself (for example the existing SVG icons). Inside a quoted attribute value, booleans become `"true"`/`"false"`. In content, `false`, `null` and `undefined` render nothing.
- `patch(container, markup)` updates the existing DOM instead of replacing it. Unchanged nodes stay, so focus, typed text, scroll positions and running CSS animations survive a re-render.
  - `data-key="…"` lets list items move without being recreated.
  - `data-preserve` marks a node the framework must never touch after creation. Use it for anything owned by other code, such as the canvas `FloorPlan` simulation.

## State, events, routing

- **Store.** `createStore(initial)` provides `get`, `set(patch)`, `update(fn)` and `subscribe(selector, callback)`. Subscribers run once per batch, and only when their selected value changed (compared with `Object.is`).
- **Event bus.** `createEventBus()` provides `on`, `once` and `emit`; a failing handler doesn't stop the others. `delegate(root, type, selector, handler, { signal })` is the delegation helper.
- **Router.** `createRouter({ routes, fallback, beforeEach, afterEach })`. Paths match the hash without `#` or `?query`, and `cafe-:id` captures `id`. A guard returns `true`, `false` or a redirect path. `app.js` uses `beforeEach` for the original teardown: page timers, simulation, map, audio, modal and the previous component.

## Data

- **API client.** `createApiClient({ baseUrl, timeout, onUnauthorized })` provides `get`, `post`, `put`, `patch` and `del`. Every failure is an `ApiError` with `status` (0 means network or timeout), `code`, `message` and `details` (per-field validation messages from the server). GET retries once on a network error. Cookies are same-origin only.
- **Live channel.** `createLiveChannel({ streamUrl, poll, interval, events, onMessage, onStatus })` uses SSE when possible and polling otherwise. It pauses polling in hidden tabs and reconnects with backoff.
- **Session.** `createSession({ api })` provides `load`, `login`, `register`, `logout`, `hasRole(...)` and `requireLogin(action, reason)`. `requireLogin` runs the action now, or after the next successful login. That is how "save this café" continues after the login window. The session token lives only in an HTTP-only cookie.
- **Forms.** `readForm(form)` and `validate(values, rules)`, with rules `required`, `email`, `minLength`, `count`, …

## Conventions

- Files are native ES modules. Import with relative paths only (`tests/static.test.mjs` checks this).
- Styling reuses the existing design tokens (`--brown`, `--cream`, `--line`, `.card`, `.btn`, `.chip`, `.badge`, `.fld`). New rules go in `styles/livespace.css`, which loads after the four original stylesheets. Those stay byte-identical, and a test checks it.
- User-facing text is Mongolian. Code, comments and docs are English.

## Tests

- `tests/framework.test.mjs` covers escaping, the store, the event bus, the router, the API client, the live channel, the session and form validation, in Node.
- `tests/e2e.mjs` covers DOM patching (focus, typed values, preserved and keyed nodes) and component cleanup in a real browser.
