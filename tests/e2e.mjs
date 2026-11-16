import { hashPassword } from '../server/lib/auth.mjs';
// End-to-end: the real LiveSpace server + a real (headless) browser.
// Guest → favourite → login window → saved; partner application → owner account →
// owner dashboard; admin workflow → device → live JSON measurement → café page updates.
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { delay, root, startBrowser } from './support/browser.mjs';
import { ADMIN, startServer } from './support/server.mjs';
import { runSimulator, simulatorOptions } from '../scripts/sensor-simulator.mjs';

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
async function navigateDocument(method, params = {}) {
  const start = events.length;
  await send(method, params);
  for (let i = 0; i < 200; i++) {
    if (events.slice(start).some(event => event.method === 'Page.loadEventFired')) return;
    await delay(50);
  }
  throw new Error('Document navigation did not finish');
}

try {
  await send('Network.setBlockedURLs', { urls: ['https://fonts.googleapis.com/*', 'https://fonts.gstatic.com/*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigateDocument('Page.navigate', { url: origin + '/#home' });
  await waitFor(`document.documentElement?.classList.contains('ls-online') && document.querySelector('#app')?.children.length > 0`);

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
    await navigateDocument('Page.reload');
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
    await click('#pf [data-next]');
    await click('#pf [data-next]');
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
    await waitFor(`!!document.querySelector('.adm-suggest') && !!document.querySelector('[data-adm-editor] canvas')`);
    assert.equal(await evaluate(`document.querySelector('[data-le-template].on').dataset.leTemplate`), 'minimal', 'books and quiet → minimal');
    // Layout editor: switch the look, add a single chair and move it with the keyboard.
    await click('[data-le-template="artistic"]');
    await click('[data-le-add="chair"]');
    await evaluate(`document.querySelector('.le-plan').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`);
    assert.match(await evaluate(`document.querySelector('[data-le-name]').innerText`), /Сандал/);
    await evaluate(`(() => { const f = document.querySelector('[data-form="saveVisualization"]'); f.vstatus.value = 'ready'; f.requestSubmit(); })()`);
    await waitFor(`!document.querySelector('.adm-suggest')`);
    const saved = await evaluate(`fetch('/api/v1/admin/cafes/${cafeId}').then(r => r.json()).then(d => d.cafe.visualization.layout)`);
    assert.equal(saved.preset, 'artistic');
    assert.deepEqual(saved.overrides.chairs, [{ x: 335, y: 290, dir: 'N' }]);
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
    assert.match(await evaluate(`document.querySelector('#ssBox').innerText`), /71.0 dB SPL/);
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

  await check('real camera counts drive the existing canvas through 0 → 5 → 2 → 0 and offline', async () => {
    const admin = server.client(); await admin.post('/api/v1/auth/login', ADMIN);
    await admin.patch('/api/v1/admin/cafes/B', { data_mode: 'live', hours: '00:00–23:59' });
    const registered = await admin.post('/api/v1/admin/devices', { id: 'real_canvas', cafe_id: 'B', kind: 'sensor' });
    // Observe the existing instance without adding a production debugging global.
    await evaluate(`(async () => {
      const { FloorPlan } = await import('/js/simulation/floor-plan.js');
      const original = FloorPlan.prototype.syncTelemetry;
      FloorPlan.prototype.syncTelemetry = function(...args) { window.__realPlan = this; return original.apply(this, args); };
    })()`);
    await go('#cafe-B');
    await evaluate(`window.__realCanvas = null`);
    const ws = new WebSocket(origin.replace('http', 'ws') + '/ws/sensors', { headers: { Authorization: 'Bearer ' + registered.data.token } });
    try {
      await new Promise((resolve, reject) => { ws.on('error', reject); ws.on('message', raw => { if (JSON.parse(raw).type === 'sensor.ready') resolve(); }); });
      for (const count of [0, 5, 2, 0]) {
        ws.send(JSON.stringify({ schemaVersion: 1, type: 'sensor.telemetry', messageId: `canvas_${count}_${Date.now()}`, deviceId: 'real_canvas', locationId: 'B', timestamp: new Date().toISOString(), occupancy: { observedPeople: count }, noise: { calibrated: false }, device: {} }));
        await waitFor(`window.__realPlan?.telemetryControlled && window.__realPlan.observedPeople === ${count} && window.__realPlan.population().active === ${count}`);
        await evaluate(`window.__realCanvas ||= document.querySelector('#planWrap canvas')`);
        assert.equal(await evaluate(`window.__realCanvas === document.querySelector('#planWrap canvas') && window.__realPlan.seats.every(s => window.__realPlan.seatView(s).state === 'unknown') && document.querySelector('#addG').disabled`), true);
        assert.match(await evaluate(`document.querySelector('[data-plan-reliability]').textContent`), /illustrative/);
      }
      const sendNoise = (dbfs, calibrated = false) => {
        const frame = { schemaVersion: 1, type: 'sensor.telemetry', messageId: `noise_${Date.now()}`, deviceId: 'real_canvas', locationId: 'B', timestamp: new Date().toISOString(), occupancy: { observedPeople: 2 }, noise: { dbfs, calibrated, estimatedDbSpl: calibrated ? 55 : null }, device: {} };
        ws.send(JSON.stringify(frame)); return frame;
      };
      sendNoise(-62);
      await waitFor(`document.querySelector('[data-live-dbfs]')?.textContent === '-62.0' && window.__realPlan.population().active === 2`);
      const originalFrame = sendNoise(-24, true);
      await waitFor(`document.querySelector('[data-live-dbfs]')?.textContent === '-24.0' && !!document.querySelector('[data-live-spl]')`);
      assert.match(await evaluate(`document.querySelector('[data-live-spl]').textContent`), /55.0 dB SPL/);
      assert.equal(await evaluate(`document.querySelector('[data-noise-chart]').dataset.samples`), '2');
      await shot('cafe-real-noise');
      // Valid old outbox upload must remain historical; its receipt time is newer.
      ws.send(JSON.stringify({ ...originalFrame, messageId: `old_${Date.now()}`, timestamp: new Date(Date.now() - 60000).toISOString(), occupancy: { observedPeople: 99 }, noise: { dbfs: -95, calibrated: false } }));
      await delay(300);
      assert.equal(await evaluate(`document.querySelector('[data-live-dbfs]').textContent`), '-24.0');
      assert.equal(await evaluate(`window.__realPlan.population().active`), 2);
      sendNoise(null);
      await waitFor(`document.querySelector('[data-live-dbfs]')?.textContent === '—' && window.__realPlan.population().active === 2`);
      assert.match(await evaluate(`document.querySelector('[data-noise-category]').textContent`), /unknown/);
      assert.equal(await evaluate(`document.querySelector('[data-noise-time]').textContent`), '—');
      await evaluate(`import('/js/services/platform.js').then(({ platform }) => { platform.config.sensor_stale_after_sec = .01; })`);
      await waitFor(`window.__realPlan.observedPeople === null && document.querySelector('#publicSensor [data-sensor-status]')?.dataset.sensorStatus === 'stale'`);
      await evaluate(`import('/js/services/platform.js').then(({ platform }) => { platform.config.sensor_stale_after_sec = 30; })`);
      sendNoise(-33);
      await waitFor(`document.querySelector('[data-live-dbfs]')?.textContent === '-33.0' && window.__realPlan.population().active === 2`);
      assert.equal(await evaluate(`window.__realCanvas === document.querySelector('#planWrap canvas')`), true);
      await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true);
      await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    } finally { ws.close(); }
    await waitFor(`window.__realPlan?.observedPeople === null && document.querySelector('[data-plan-reliability]').textContent.includes('unknown occupancy')`);
  });

  await check('virtual sensor → WebSocket → SQLite → existing SSE framework → browser', async () => {
    const admin = server.client(); await admin.post('/api/v1/auth/login', ADMIN);
    const registered = await admin.post('/api/v1/admin/devices', { id: 'virtual_browser', cafe_id: cafeId, kind: 'simulator' });
    assert.equal(registered.status, 201);
    await evaluate(`(async () => {
      const { createLiveChannel } = await import('/framework/index.js');
      window.__sensorEvents = [];
      window.__sensorChannel = createLiveChannel({ streamUrl: '/api/v1/stream', events: ['sensor.telemetry'], onMessage: (type, data) => window.__sensorEvents.push(data) });
      window.__sensorChannel.start();
    })()`);
    try {
      await waitFor(`window.__sensorChannel.status === 'live'`);
      const options = simulatorOptions(['--url', origin.replace('http', 'ws') + '/ws/sensors', '--device', 'virtual_browser', '--location', cafeId, '--count', '1', '--people', '11'], { LS_SENSOR_TOKEN: registered.data.token });
      assert.equal((await runSimulator(options, { log: () => {} })).sent, 1);
      await waitFor(`window.__sensorEvents.some(e => e.locationId === ${JSON.stringify(cafeId)})`);
      const event = await evaluate(`window.__sensorEvents[0]`);
      assert.equal(event.occupancy.observedPeople, 11); assert.equal(event.dataSource, 'simulated'); assert.equal(event.device, undefined);
      const row = server.app.deps.db.prepare('SELECT observed_people, data_source FROM measurements WHERE device_id = ?').get('virtual_browser');
      assert.equal(row.observed_people, 11); assert.equal(row.data_source, 'simulated');
    } finally { await evaluate(`window.__sensorChannel.stop()`); }
  });

  await check('public sensor UI updates counts/noise/status without inventing seats or rebuilding canvas', async () => {
    const admin = server.client(); await admin.post('/api/v1/auth/login', ADMIN);
    await admin.patch('/api/v1/admin/cafes/A', { data_mode: 'live', hours: '00:00–23:59' });
    const registered = await admin.post('/api/v1/admin/devices', { id: 'public_demo', cafe_id: 'A', kind: 'simulator' });
    await go('#cafe-A'); await waitFor(`!!document.querySelector('#publicSensor')`);
    const options = simulatorOptions(['--url', origin.replace('http', 'ws') + '/ws/sensors', '--device', 'public_demo', '--location', 'A', '--interval', '1000', '--people', '7'], { LS_SENSOR_TOKEN: registered.data.token });
    const controller = new AbortController();
    const running = runSimulator(options, { signal: controller.signal, log: () => {} }).catch(error => { if (!controller.signal.aborted) throw error; });
    try {
      await waitFor(`document.querySelector('#publicSensor [data-observed-people]')?.textContent === '7' && !!document.querySelector('#planWrap canvas')`);
      assert.match(await evaluate(`document.querySelector('#publicSensor').textContent`), /dBFS/);
      assert.match(await evaluate(`document.querySelector('#publicSensor').textContent`), /SIMULATED/);
      assert.equal(await evaluate(`document.querySelector('#freePct').textContent`), '—');
      assert.match(await evaluate(`document.querySelector('[data-plan-reliability]').textContent`), /simulation/);
      await evaluate(`window.__sensorCanvas = document.querySelector('#planWrap canvas')`);
      options.people = 12;
      await waitFor(`document.querySelector('#publicSensor [data-observed-people]')?.textContent === '12'`);
      assert.equal(await evaluate(`window.__sensorCanvas === document.querySelector('#planWrap canvas')`), true);
      assert.equal(await evaluate(`document.querySelector('#publicSensor [data-sensor-status]').dataset.sensorStatus`), 'online');
      assert.equal(await evaluate(`document.querySelector('#publicSensor [data-device-diagnostics]')`), null);
      await waitFor(`document.querySelector('#publicSensorHistory [data-history-reading]')?.textContent.includes('12')`);
      assert.equal(await evaluate(`document.querySelector('#publicSensorHistory [data-history-source]').value`), 'simulated');
      await evaluate(`(() => { const input = document.querySelector('#publicSensorHistory [data-history-interval]'); input.value = '15'; input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      await waitFor(`!!document.querySelector('#publicSensorHistory [data-history-bucket]')`);
    } finally { controller.abort(); await running; }
    await waitFor(`document.querySelector('#publicSensor [data-sensor-status]')?.dataset.sensorStatus === 'offline'`);
    await go('#admin?tab=devices');
    await logout(); await click('#accBtn'); await click('[data-auth="login"]');
    await waitFor(`!!document.querySelector('#modal .auth-form')`);
    await fill('#au-email', ADMIN.email); await fill('#au-password', ADMIN.password);
    await evaluate(`document.querySelector('#modal form').requestSubmit()`);
    await waitFor(`!!document.querySelector('[data-device-diagnostics="public_demo"]')`);
    assert.match(await evaluate(`document.querySelector('[data-device-diagnostics="public_demo"]').textContent`), /36.5/);
  });

  await check('user management hides administrator controls from regular admins and permits the bound Super Admin', async () => {
    const db=server.app.deps.db, rootPassword='browser-root-test-password';
    db.prepare("INSERT INTO users(id,email,password_hash,name,role,created_at) VALUES('browser-root','temuulenbayarjargal@icloud.com',?,'Root','admin',?)").run(await hashPassword(rootPassword),new Date().toISOString());
    db.prepare('INSERT INTO super_admin_identity(singleton,user_id,bound_at) VALUES(1,?,?)').run('browser-root',new Date().toISOString());
    await go('#admin?tab=users');
    await waitFor(`!!document.querySelector('[data-form="createManagedUser"]') && document.querySelector('.adm-t')?.textContent.includes('Super Admin')`);
    assert.equal(await evaluate(`!!document.querySelector('[data-form="createManagedUser"] option[value="admin"]')`),false);
    assert.equal(await evaluate(`!![...document.querySelectorAll('.adm-t tr')].find(row=>row.textContent.includes('temuulenbayarjargal@icloud.com'))?.querySelector('form')`),false);
    const regularId=db.prepare('SELECT id FROM users WHERE email=?').get(ADMIN.email).id;
    assert.equal(await evaluate(`!!document.querySelector('[data-user-id="${regularId}"]')`),false);
    await evaluate(`import('/js/services/platform.js').then(({ platform })=>platform.session.login({email:'temuulenbayarjargal@icloud.com',password:${JSON.stringify(rootPassword)}}))`);
    await waitFor(`!!document.querySelector('[data-form="createManagedUser"] option[value="admin"]') && !!document.querySelector('[data-user-id="${regularId}"]')`);
    assert.equal(await evaluate(`!!document.querySelector('[data-user-id="browser-root"]')`),false);
    await evaluate(`(() => { const form=document.querySelector('[data-form="createManagedUser"]');form.email.value='browser-created-admin@test.mn';form.name.value='Managed';form.account_role.value='admin';form.password.value='browser-managed-test-password';form.requestSubmit(); })()`);
    await waitFor(`document.querySelector('.adm-t')?.textContent.includes('browser-created-admin@test.mn')`);
    assert.equal(db.prepare('SELECT role FROM users WHERE email=?').get('browser-created-admin@test.mn').role,'admin');
    assert.equal(await evaluate(`document.querySelector('[data-form="createManagedUser"] [name="password"]').value`),'');
  });

  await check('merged mobile floor plan and recommendation widgets retain live telemetry and admin back navigation', async () => {
    const admin=server.client();await admin.post('/api/v1/auth/login',ADMIN);
    const registered=await admin.post('/api/v1/admin/devices',{id:'merge_mobile_phone',cafe_id:'A',kind:'sensor'});
    const ws=new WebSocket(origin.replace('http','ws')+'/ws/sensors',{headers:{Authorization:'Bearer '+registered.data.token}});
    try {
      await new Promise((resolve,reject)=>{ws.on('error',reject);ws.on('message',raw=>{if(JSON.parse(raw).type==='sensor.ready')resolve();});});
      const reading=(count,dbfs)=>ws.send(JSON.stringify({schemaVersion:1,type:'sensor.telemetry',messageId:'merge-mobile-'+Date.now(),deviceId:'merge_mobile_phone',locationId:'A',timestamp:new Date().toISOString(),occupancy:{observedPeople:count},noise:{dbfs,calibrated:false},device:{}}));
      reading(5,-42);
      await evaluate(`localStorage.setItem('ls_mhTour','true')`);
      await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
      await go('#cafe-A');
      await waitFor(`window.__realPlan?.cafe.id === 'A' && window.__realPlan.portrait && window.__realPlan.population().active === 5 && document.querySelector('[data-live-dbfs]')?.textContent === '-42.0'`);
      assert.equal(await evaluate(`document.querySelector('#addG').disabled && document.querySelector('#freePct').textContent === '—'`),true);
      await evaluate(`(() => { const sim=window.__realPlan, seat=sim.seats[0], rect=sim.cv.getBoundingClientRect();sim.click({clientX:rect.right-seat.y/sim.H*rect.width,clientY:rect.top+seat.x/sim.W*rect.height}); })()`);
      assert.match(await evaluate(`document.querySelector('#seatInfo').textContent`),/Мэдээлэлгүй/);
      await go('#home');await waitFor(`!!document.querySelector('.mh-track .rc')`);
      await click('[data-rec-sort="near"]');
      reading(7,-28);
      await waitFor(`document.querySelector('.mh-track [data-href="#cafe-A"]')?.textContent.includes('-28.0 dBFS') && document.querySelector('.mh-track [data-href="#cafe-A"] .rc-free b')?.textContent === '7'`);
      assert.match(await evaluate(`document.querySelector('.mh-track [data-href="#cafe-A"]').textContent`),/REAL/);
      assert.match(await evaluate(`document.querySelector('.drec-track [data-href="#cafe-A"]').textContent`),/-28.0 dBFS/);
      assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`),true);
    } finally {ws.close();await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});}
    await go('#admin?tab=cafes');await waitFor(`!!document.querySelector('[data-open-cafe="A"]')`);
    await click('[data-open-cafe="A"]');await waitFor(`!!document.querySelector('[data-back]')`);
    const hash=await evaluate('location.hash');await click('[data-back]');
    await waitFor(`!!document.querySelector('[data-open-cafe="A"]')`);assert.equal(await evaluate('location.hash'),hash);
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
