// End-to-end: the real LiveSpace server + a real (headless) browser.
// Guest → favourite → login window → saved; partner application → owner account →
// owner dashboard; admin workflow → device → live JSON measurement → café page updates.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { delay, root, startBrowser } from './support/browser.mjs';
import { ADMIN, startServer } from './support/server.mjs';

const output = join(root, '.artifacts', 'e2e');
await mkdir(output, { recursive: true });
const server = await startServer();
const browser = await startBrowser();
const { send, evaluate, events } = browser;
const origin = server.origin;
const failures = [], passed = [];
const check = async (name, fn) => {
  try { await fn(); passed.push(name); console.log(`PASS ${name}`); }
  catch (error) { failures.push(name); console.error(`FAIL ${name}: ${error.stack}`); }
};
async function waitFor(expression, tries = 120) {
  for (let i = 0; i < tries; i++) { if (await evaluate(expression)) return; await delay(50); }
  throw new Error(`Timed out: ${expression}\n${await evaluate('document.body.innerText.slice(0, 400)')}`);
}
const go = async hash => { await evaluate(`location.hash = ${JSON.stringify(hash)}`); await delay(150); };
const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const fill = (selector, value) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
// Sign out and wait until the header reflects it.
const logout = async () => { await click('#accBtn'); await click('[data-logout]'); await waitFor(`!document.querySelector('#accBtn .acc-dot')`); };
const shot = async name => { await delay(500); const { data } = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(join(output, `${name}.png`), Buffer.from(data, 'base64')); };
const pageFetch = (path, method = 'GET', body) => evaluate(`fetch(${JSON.stringify(path)}, { method: ${JSON.stringify(method)}, headers: { 'Content-Type': 'application/json' }, ${body ? `body: JSON.stringify(${JSON.stringify(body)})` : ''} }).then(r => r.json())`);

try {
  await send('Network.setBlockedURLs', { urls: ['https://fonts.googleapis.com/*', 'https://fonts.gstatic.com/*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: origin + '/#home' });
  await waitFor(`document.documentElement.classList.contains('ls-online') && document.querySelector('#app').children.length > 0`);

  await check('guest explores without an account; real map shows every café', async () => {
    assert.equal(await evaluate(`document.querySelector('#accBtn').hidden`), false);
    await go('#explore');
    await waitFor(`document.querySelectorAll('#exMap .mk').length === 12`);
    await go('#cafe-A');
    await waitFor(`!!document.querySelector('canvas') && !!document.querySelector('#cdFresh')`);
    assert.match(await evaluate(`document.querySelector('#cdFresh').innerText`), /ДЕМО/);
  });

  await check('saving a favourite asks to log in, then saves on the same page', async () => {
    await click('.cd-act [data-fav="A"]');
    await waitFor(`!!document.querySelector('#modal .auth-form')`);
    assert.match(await evaluate(`document.querySelector('#modal').innerText`), /Дуртай кафегаа хадгалахын тулд/);
    await shot('auth-modal');
    await click('[data-auth-mode="register"]');
    await waitFor(`!!document.querySelector('#au-name')`);
    await fill('#au-email', 'saraa@example.mn'); await fill('#au-password', 'correct horse'); await fill('#au-name', 'Сараа');
    await evaluate(`document.querySelector('#modal form').requestSubmit()`);
    await waitFor(`!document.querySelector('#modal .auth-form') && document.querySelector('.cd-act [data-fav="A"]').getAttribute('aria-pressed') === 'true'`);
    assert.equal(await evaluate(`location.hash`), '#cafe-A', 'stays on the same page');
    assert.deepEqual((await pageFetch('/api/v1/me/favorites')).favorites, ['A']);
    assert.equal(await evaluate(`document.querySelector('#favBtn .cnt')?.textContent`), '1');
  });

  await check('favourites survive a reload and a new login', async () => {
    await send('Page.reload');
    await waitFor(`document.documentElement.classList.contains('ls-online') && !!document.querySelector('.cd-act [data-fav="A"]')`);
    await waitFor(`document.querySelector('.cd-act [data-fav="A"]').getAttribute('aria-pressed') === 'true'`);
    await logout();
    await waitFor(`document.querySelector('.cd-act [data-fav="A"]').getAttribute('aria-pressed') === 'false'`);
    await click('#accBtn'); await click('[data-auth="login"]');
    await waitFor(`!!document.querySelector('#modal .auth-form')`);
    await fill('#au-email', 'saraa@example.mn'); await fill('#au-password', 'correct horse');
    await evaluate(`document.querySelector('#modal form').requestSubmit()`);
    await waitFor(`document.querySelector('.cd-act [data-fav="A"]').getAttribute('aria-pressed') === 'true'`);
    await go('#account');
    await waitFor(`document.querySelectorAll('#app .ccard').length === 1`);
    await logout();
  });

  let cafeId;
  await check('partner application with photos → owner account → owner dashboard', async () => {
    await go('#partner');
    await waitFor(`!!document.querySelector('#pf')`);
    for (const [selector, value] of [['#f1', 'Номт кафе'], ['#f2', 'Бат'], ['#f3', '88001234'], ['#f4', 'owner@nomt.mn'], ['#f8', 'Сөүлийн гудамж 5'], ['#f12', 'Номын тавиуртай, чимээгүй кафе'], ['#f11', '28'], ['#f9', '00:00'], ['#f10', '23:59']]) await fill(selector, value); // open all day: the test must not depend on the clock
    await evaluate(`document.querySelector('.pf-purp input[value="Сурах"]').click()`);
    // Real images, decoded and resized by the browser before upload.
    await evaluate(`(async () => { const input = document.querySelector('#fPhotos'), dt = new DataTransfer();
      for (let i = 0; i < 3; i++) { const c = document.createElement('canvas'); c.width = 900; c.height = 600; const x = c.getContext('2d'); x.fillStyle = ['#7B542F', '#FFCF71', '#B6771D'][i]; x.fillRect(0, 0, 900, 600);
        const blob = await new Promise(r => c.toBlob(r, 'image/png')); dt.items.add(new File([blob], 'cafe' + i + '.png', { type: 'image/png' })); }
      input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await waitFor(`document.querySelectorAll('#phGrid .ph').length === 3`);
    await shot('partner-form');
    await evaluate(`document.querySelector('#pf').requestSubmit()`);
    await waitFor(`!!document.querySelector('#modal .auth-form') && !!document.querySelector('#pf .done')`, 200);
    assert.equal(await evaluate(`document.querySelector('#au-email').value`), 'owner@nomt.mn');
    await shot('owner-signup');
    await fill('#au-name', 'Бат'); await fill('#au-password', 'owner password');
    await evaluate(`document.querySelector('#modal form').requestSubmit()`);
    await waitFor(`location.hash === '#owner' && !!document.querySelector('.own-steps')`, 200);
    const text = await evaluate(`document.querySelector('#app').innerText`);
    assert.match(text, /Таны хүсэлтийг хүлээн авлаа/);
    assert.match(text, /тоо зохиож харуулахгүй/);
    assert.equal(await evaluate(`document.querySelectorAll('.own-photos img').length`), 3);
    await waitFor(`[...document.querySelectorAll('.own-photos img')].every(img => img.complete && img.naturalWidth > 0)`);
    await shot('owner-dashboard-submitted');
    cafeId = (await pageFetch('/api/v1/owner/cafes')).cafes[0].id;
  });

  let token;
  await check('admin dashboard: application, workflow, visualization, device', async () => {
    await logout();
    await go('#admin');
    await waitFor(`!!document.querySelector('[data-gate-login]')`);
    await click('[data-gate-login]');
    await waitFor(`!!document.querySelector('#modal .auth-form')`);
    await fill('#au-email', ADMIN.email); await fill('#au-password', ADMIN.password);
    await evaluate(`document.querySelector('#modal form').requestSubmit()`);
    await waitFor(`!!document.querySelector('.adm-tabs')`);
    await click('[data-tab="applications"]');
    await waitFor(`!!document.querySelector('[data-open-cafe="${cafeId}"]')`);
    await click(`[data-open-cafe="${cafeId}"]`);
    await waitFor(`!!document.querySelector('[data-form="saveStatus"]')`);
    // Status workflow through the form.
    for (const status of ['under_review', 'contacting', 'visualization']) {
      await evaluate(`(() => { const f = document.querySelector('[data-form="saveStatus"]'); f.status.value = '${status}'; f.requestSubmit(); })()`);
      await waitFor(`document.querySelector('.adm-cafe .own-steps .st-on')?.innerText.includes(${JSON.stringify({ under_review: 'Хянаж', contacting: 'холбогдож', visualization: 'Зураглал' }[status])})`);
    }
    await click('[data-suggest]');
    await waitFor(`!!document.querySelector('.adm-suggest') && !!document.querySelector('[data-adm-plan] canvas')`);
    assert.equal(await evaluate(`document.querySelector('[name="preset"]').value`), 'library');
    await evaluate(`(() => { const f = document.querySelector('[data-form="saveVisualization"]'); f.vstatus.value = 'ready'; f.requestSubmit(); })()`);
    await waitFor(`!document.querySelector('.adm-suggest')`);
    await evaluate(`(() => { const f = document.querySelector('[data-form="saveInfo"]'); f.map_x.value = 690; f.map_y.value = 360; f.requestSubmit(); })()`);
    await delay(300);
    await evaluate(`(() => { const f = document.querySelector('.adm-wide [data-form="saveDevice"]'); f.id.value = 'sensor_001'; f.label.value = 'Танхимын камер'; f.requestSubmit(); })()`);
    await waitFor(`!!document.querySelector('.adm-token pre')`);
    token = await evaluate(`document.querySelector('.adm-token pre').innerText.trim()`);
    assert.match(token, /^lsd_/);
    await shot('admin-cafe');
    for (const status of ['sensors', 'testing', 'active']) {
      await evaluate(`(() => { const f = document.querySelector('[data-form="saveStatus"]'); f.status.value = '${status}'; f.requestSubmit(); })()`);
      await delay(250);
    }
    await waitFor(`document.querySelector('.adm-cafe .adm-head .badge')?.innerText.includes('Идэвхтэй')`);
  });

  await check('sensor JSON → server → open café page updates live (no reload)', async () => {
    await logout();
    // The public catalogue reloads after the activation event.
    await go('#explore');
    await waitFor(`document.querySelectorAll('#exMap .mk').length === 13`, 200);
    await go(`#cafe-${cafeId}`);
    await waitFor(`!!document.querySelector('#app .card') && document.querySelector('#app').innerText.includes('Мэдээлэл хүлээгдэж байна')`);
    // First measurement: the café opens with real values. The page shows the
    // waiting state, so reload into the live layout once data exists.
    const post = body => fetch(origin + '/api/v1/ingest/measurements', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const reading = (available, occupied, noise, wifi) => ({ schema_version: '1.0', cafe_id: cafeId, device_id: 'sensor_001', timestamp: new Date().toISOString(), measurements: { available_seats: available, occupied_seats: occupied, total_seats: available + occupied, noise_level_db: noise, wifi_quality: wifi, wifi_download_mbps: 72 } });
    assert.equal((await post(reading(20, 8, 42, 88))).status, 202);
    await delay(400);
    await go('#explore'); await go(`#cafe-${cafeId}`);
    await waitFor(`!!document.querySelector('#cdFresh') && document.querySelector('#cdFresh').innerText.includes('ШУУД') && !!document.querySelector('canvas')`, 200);
    await waitFor(`document.querySelector('#freePct').textContent === '71%'`);
    assert.match(await evaluate(`document.querySelector('#freeSub').textContent`), /28-оос 20 сул · мэдрэгч/);
    await shot('cafe-live-before');
    // Second measurement arrives while the page is open: updated in place via SSE.
    const canvas = await evaluate(`(() => { window.__cv = document.querySelector('canvas'); return true })()`);
    assert.ok(canvas);
    assert.equal((await post(reading(4, 24, 71, 30))).status, 202);
    await waitFor(`document.querySelector('#freePct').textContent === '14%'`, 200);
    assert.equal(await evaluate(`window.__cv === document.querySelector('canvas')`), true, 'the visualization was not rebuilt');
    assert.match(await evaluate(`document.querySelector('#ssBox').innerText`), /шуугиантай/);
    await shot('cafe-live-after');
  });

  await check('the owner sees live measurements and the café visualization', async () => {
    await click('#accBtn'); await click('[data-auth="login"]');
    await waitFor(`!!document.querySelector('#modal .auth-form')`);
    await fill('#au-email', 'owner@nomt.mn'); await fill('#au-password', 'owner password');
    await evaluate(`document.querySelector('#modal form').requestSubmit()`);
    await delay(300);
    await go('#owner');
    await waitFor(`!!document.querySelector('.own-tiles') && !!document.querySelector('.own-plan canvas')`, 200);
    assert.match(await evaluate(`document.querySelector('.own-live').innerText`), /ШУУД/);
    await shot('owner-dashboard-active');
  });

  await check('framework DOM layer: patch keeps input, focus, preserved and keyed nodes; components clean up', async () => {
    const result = await evaluate(`(async () => {
      const { patch, Component, mount, html } = await import('/framework/index.js');
      const root = document.createElement('div'); document.body.appendChild(root);
      patch(root, '<input id="t" value="a"><div data-preserve id="p"></div><ul><li data-key="1">1</li><li data-key="2">2</li></ul>');
      const input = root.querySelector('#t'), preserved = root.querySelector('#p'), second = root.querySelector('[data-key="2"]');
      input.focus(); input.value = 'typed'; preserved.appendChild(document.createElement('canvas'));
      patch(root, '<input id="t" value="a" class="x"><div data-preserve id="p" class="changed"></div><ul><li data-key="2">2</li><li data-key="1">1</li><li data-key="3">3</li></ul>');
      const out = { sameInput: root.querySelector('#t') === input, typed: input.value, focus: document.activeElement === input, cls: input.className,
        preservedKept: root.querySelector('#p canvas') !== null && !root.querySelector('#p').classList.contains('changed'), keyedMoved: root.querySelector('ul').firstElementChild === second, count: root.querySelectorAll('li').length };
      let ticks = 0, destroyed = false;
      class Counter extends Component { initialState() { return { n: 0 }; } events() { return { 'click button': () => this.setState({ n: this.state.n + 1 }) }; }
        onMount() { this.interval(() => ticks++, 5); } onDestroy() { destroyed = true; } render() { return html\`<button>\${this.state.n}</button>\`; } }
      const c = mount(Counter, root);
      root.querySelector('button').click(); root.querySelector('button').click(); await Promise.resolve();
      out.clicks = root.querySelector('button').textContent;
      await new Promise(r => setTimeout(r, 30)); c.destroy(); const after = ticks; await new Promise(r => setTimeout(r, 30));
      out.intervalStopped = ticks === after; out.destroyed = destroyed;
      root.querySelector('button').click(); await Promise.resolve(); out.noEventsAfterDestroy = root.querySelector('button').textContent === '2';
      root.remove(); return out; })()`);
    assert.deepEqual(result, { sameInput: true, typed: 'typed', focus: true, cls: 'x', preservedKept: true, keyedMoved: true, count: 3, clicks: '2', intervalStopped: true, destroyed: true, noEventsAfterDestroy: true });
  });

  await check('browser console has no uncaught errors', async () => {
    const errors = events.filter(e => e.method === 'Runtime.exceptionThrown').map(e => e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text);
    assert.deepEqual(errors, []);
  });
} finally {
  await browser.close();
  await server.stop();
}
console.log(`${passed.length} passed; ${failures.length} failed. Screenshots: ${output}`);
process.exitCode = failures.length ? 1 : 0;
