import assert from 'node:assert/strict';
import test from 'node:test';
import { html, raw, attrs } from '../framework/renderer/html.js';
import { createStore } from '../framework/state/store.js';
import { createEventBus } from '../framework/events/bus.js';
import { createRouter, parseHash } from '../framework/router/router.js';
import { createApiClient, ApiError } from '../framework/api/client.js';
import { createLiveChannel } from '../framework/api/realtime.js';
import { createSession } from '../framework/auth/session.js';
import { validate, required, email, minLength, count } from '../framework/utilities/forms.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('html escapes interpolations, keeps nested templates and raw markup', () => {
  const name = '<img src=x onerror=alert(1)>';
  assert.equal(String(html`<b>${name}</b>`), '<b>&lt;img src=x onerror=alert(1)&gt;</b>');
  assert.equal(String(html`<ul>${['a', '<b>'].map(x => html`<li>${x}</li>`)}</ul>`), '<ul><li>a</li><li>&lt;b&gt;</li></ul>');
  assert.equal(String(html`${raw('<i>ok</i>')}${null}${false}${0}`), '<i>ok</i>0');
  assert.equal(String(html`<input${attrs({ disabled: true, value: '"x"', hidden: false })}>`), '<input disabled value="&quot;x&quot;">');
  assert.equal(String(html`<b aria-pressed="${true}" data-x='${false}'>${true}${false && 'no'}</b>`), `<b aria-pressed="true" data-x='false'></b>`);
});

test('store batches updates and notifies only changed selections', async () => {
  const store = createStore({ a: 1, b: 1 });
  const seenA = [], seenB = [];
  store.subscribe(s => s.a, v => seenA.push(v));
  store.subscribe(s => s.b, v => seenB.push(v));
  store.set({ a: 2 }); store.set({ a: 3 }); store.update(s => ({ a: s.a + 1 }));
  await tick();
  assert.deepEqual(seenA, [4]);
  assert.deepEqual(seenB, []);
  store.set({ a: 4 }); await tick();
  assert.deepEqual(seenA, [4], 'no notification without a change');
  assert.throws(() => { store.get().a = 9; }, 'state is frozen');
});

test('event bus isolates failing handlers and supports once', () => {
  const bus = createEventBus(), got = [];
  const original = console.error; console.error = () => {};
  bus.on('x', () => { throw new Error('boom'); });
  bus.on('x', v => got.push(v));
  bus.once('x', v => got.push('once:' + v));
  bus.emit('x', 1); bus.emit('x', 2);
  console.error = original;
  assert.deepEqual(got, [1, 'once:1', 2]);
});

test('router matches params, query strings, guards, redirects and fallback', () => {
  const loc = { hash: '' }, entered = [];
  const target = { addEventListener() {}, removeEventListener() {}, history: { replaceState: (_, __, h) => { loc.hash = h; } } };
  const router = createRouter({
    location: loc, target, fallback: 'home',
    routes: [
      { path: '', name: 'home', enter: to => entered.push(['home', to.fallback]) },
      { path: 'cafe-:id', name: 'cafe', enter: to => entered.push(['cafe', to.params.id, to.query.tab]) },
      { path: 'admin', name: 'admin', guard: () => '', enter: () => entered.push(['admin']) },
      { path: 'owner', name: 'owner', guard: () => false, enter: () => entered.push(['owner']) }
    ]
  });
  loc.hash = '#cafe-A?tab=plan'; router.start();
  loc.hash = '#nowhere'; router.resolve();
  loc.hash = '#admin'; router.resolve();
  loc.hash = '#owner'; router.resolve();
  assert.deepEqual(entered, [['cafe', 'A', 'plan'], ['home', true], ['home', false]]);
  assert.equal(router.href('cafe', { id: 'B' }), '#cafe-B');
  assert.deepEqual(parseHash('#x?y=1'), { path: 'x', query: { y: '1' } });
});

test('api client returns JSON, maps errors and retries GET once on network failure', async () => {
  let calls = 0;
  const responses = [
    () => { throw new TypeError('offline'); },
    () => new Response(JSON.stringify({ ok: 1 }), { status: 200 }),
    () => new Response(JSON.stringify({ error: { code: 'bad', message: 'Nope', details: { f: 1 } } }), { status: 422 }),
    () => new Response('', { status: 401 })
  ];
  let unauthorized = 0;
  const api = createApiClient({ baseUrl: '/api', fetchImpl: async () => responses[calls++](), onUnauthorized: () => unauthorized++ });
  assert.deepEqual(await api.get('/x'), { ok: 1 });
  await assert.rejects(api.post('/y', {}), error => error instanceof ApiError && error.status === 422 && error.code === 'bad' && error.details.f === 1);
  await assert.rejects(api.get('/me'), error => error.isUnauthorized);
  assert.equal(unauthorized, 1);
  const failing = createApiClient({ fetchImpl: async () => { throw new TypeError('down'); } });
  await assert.rejects(failing.post('/z', {}), error => error.isNetwork);
});

test('live channel uses SSE when available and falls back to polling', async () => {
  const statuses = [], messages = [];
  class FakeSource {
    static last; listeners = {};
    constructor(url) { this.url = url; FakeSource.last = this; }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    close() { this.closed = true; }
  }
  const doc = { hidden: false, addEventListener() {}, removeEventListener() {} };
  let polls = 0;
  const channel = createLiveChannel({ streamUrl: '/s', events: ['measurement'], poll: async () => { polls++; return [['measurement', { p: polls }]]; }, interval: 10, EventSourceImpl: FakeSource, doc, onStatus: s => statuses.push(s), onMessage: (t, d) => messages.push(d) });
  channel.start();
  FakeSource.last.onopen();
  FakeSource.last.listeners.measurement({ data: '{"cafe":"A"}' });
  assert.deepEqual(messages, [{ cafe: 'A' }]);
  FakeSource.last.onerror();
  await new Promise(resolve => setTimeout(resolve, 35));
  channel.stop();
  assert.ok(polls >= 2, 'polls while the stream is down');
  assert.deepEqual(statuses.slice(0, 3), ['connecting', 'live', 'polling']);
  assert.equal(statuses.at(-1), 'stopped');
});

test('session runs a pending action after login', async () => {
  const api = { post: async (url, body) => ({ user: { id: 1, email: body.email, role: 'user' } }), get: async () => { throw Object.assign(new Error(), { isUnauthorized: true }); } };
  let asked = 0;
  const session = createSession({ api, onLoginRequired: () => asked++ });
  await session.load();
  let saved = null;
  assert.equal(session.requireLogin(user => { saved = user.email; }), null);
  assert.equal(asked, 1);
  await session.login({ email: 'a@b.mn', password: 'x' });
  assert.equal(saved, 'a@b.mn');
  assert.ok(session.hasRole('user'));
  assert.ok(!session.hasRole('admin'));
});

test('form validation reports the first failing rule per field', () => {
  const rules = { email: [required('need'), email('bad')], password: [required('need'), minLength(8, 'short')], photos: [count(3, 4, 'three or four')] };
  assert.deepEqual(validate({ email: 'x', password: '', photos: [1, 2] }, rules), { email: 'bad', password: 'need', photos: 'three or four' });
  assert.deepEqual(validate({ email: 'a@b.mn', password: '12345678', photos: [1, 2, 3] }, rules), {});
});
