// Browser check for the admin layout editor (no server or login needed): the editor is mounted
// on the real page with the real stylesheets and driven with pointer events, keys and the panel.
// Screenshots (desktop, phone, Sunny Day public view) go to .artifacts/floor-editor/.
// Run: node tests/floor-editor.mjs   (BROWSER_PATH = a Chromium browser if Edge is not installed)
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { delay, root, startBrowser } from './support/browser.mjs';

const output = join(root, '.artifacts', 'floor-editor');
await mkdir(output, { recursive: true });
const browser = await startBrowser();
const { send, evaluate, origin } = browser;
const failures = [], passed = [];
const check = async (name, fn) => { try { await fn(); passed.push(name); console.log(`PASS ${name}`); } catch (error) { failures.push(name); console.error(`FAIL ${name}: ${error.stack}`); } };
const shot = async name => { await delay(300); const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); await writeFile(join(output, `${name}.png`), Buffer.from(data, 'base64')); };
const viewport = (width, height, mobile = false) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
const frame = () => evaluate(`(() => { const [k, i] = ed.sel; const o = k === 'item' ? ed.L.items[i] : null; return o ? { x: o.x, y: o.y, w: o.w, h: o.h, rot: o.rot, type: o.type } : null; })()`);
// Pointer helpers work in plan (world) coordinates.
const drag = (from, to, shift = false) => evaluate(`(() => {
  const cv = ed.fp.cv, r = cv.getBoundingClientRect(), at = ([x, y]) => ({ clientX: r.left + x / 800 * r.width, clientY: r.top + y / 520 * r.height });
  const ev = (type, p) => cv.dispatchEvent(new PointerEvent(type, { ...at(p), pointerId: 7, bubbles: true, shiftKey: ${shift} }));
  ev('pointerdown', ${JSON.stringify(from)}); ev('pointermove', [${from[0]} + 1, ${from[1]} + 1]); ev('pointermove', ${JSON.stringify(to)}); ev('pointerup', ${JSON.stringify(to)}); return true;
})()`);
const mount = (cafe, layout = { preset: 'minimal' }) => evaluate(`(async () => {
  const { LayoutEditor } = await import('/js/features/admin-dashboard/layout-editor.js');
  window.ed?.destroy();
  document.body.innerHTML = '<main class="wrap page" style="padding:16px"><div class="card" id="ed"></div></main>';
  window.ed = new LayoutEditor(document.querySelector('#ed'), { layout: ${JSON.stringify(layout)}, cafe: ${JSON.stringify(cafe)} });
  await new Promise(r => setTimeout(r, 50)); return true;
})()`);

await viewport(1280, 1100);
await send('Page.navigate', { url: `${origin}/index.html` });
for (let i = 0; i < 100 && await evaluate('document.readyState') !== 'complete'; i++) await delay(50);
await evaluate('localStorage.clear()');
await mount({ id: 'T', name: 'Туршилтын кафе' });

await check('editor stylesheet loads and the plan has a side panel', async () => {
  for (let i = 0; i < 40 && await evaluate(`getComputedStyle(document.querySelector('.le-body')).display`) !== 'grid'; i++) await delay(50);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.le-body')).display`), 'grid');
  assert.match(await evaluate(`document.querySelector('[data-le-props]').innerText`), /Объект сонгоход/);
});

await check('a new table is added, selected and its settings appear in the panel', async () => {
  await evaluate(`document.querySelector('[data-le-item="table"]').click()`);
  const f = await frame(); assert.equal(f.type, 'table');
  const panel = await evaluate(`document.querySelector('[data-le-props]').innerText`);
  for (const word of ['Өргөн', 'Урт', 'Эргэлт', 'Хэлбэр', 'Сандал']) assert.ok(panel.includes(word), word);
});

await check('edge handles change width and length separately, keeping the opposite edge', async () => {
  const f0 = await frame();
  await drag([f0.x + f0.w / 2, f0.y], [f0.x + f0.w / 2 + 40, f0.y]);
  // Sizes snap to 5 units while «Сүлжээнд наалдах» is on.
  const f1 = await frame();
  assert.ok(Math.abs(f1.w - (f0.w + 40)) <= 5 && f1.w % 5 === 0, `width ${f1.w}`); assert.equal(f1.h, f0.h);
  assert.ok(Math.abs((f1.x - f1.w / 2) - (f0.x - f0.w / 2)) <= 1, 'left edge stays');
  await drag([f1.x, f1.y + f1.h / 2], [f1.x, f1.y + f1.h / 2 + 30]);
  const f2 = await frame();
  assert.ok(Math.abs(f2.h - (f1.h + 30)) <= 5, `length ${f2.h}`); assert.equal(f2.w, f1.w);
  assert.ok(Math.abs((f2.y - f2.h / 2) - (f1.y - f1.h / 2)) <= 1, 'top edge stays');
});

await check('the round knob turns to any angle; Shift snaps to 15°', async () => {
  const f = await frame();
  await drag([f.x, f.y - f.h / 2 - 24], [f.x + 100, f.y + 40]);
  const free = (await frame()).rot; assert.ok(free > 105 && free < 120 && free % 15 !== 0, `free angle ${free}`);
  await drag([f.x + Math.sin(free * Math.PI / 180) * (f.h / 2 + 24), f.y - Math.cos(free * Math.PI / 180) * (f.h / 2 + 24)], [f.x + 100, f.y + 27], true);
  assert.equal((await frame()).rot, 105);
});

await check('undo and redo step through the changes', async () => {
  const before = (await frame()).rot;
  await evaluate(`document.querySelector('.le-plan').dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))`);
  assert.notEqual(await evaluate('JSON.stringify(ed.L.items[0]?.rot)'), String(before));
  await evaluate(`document.querySelector('[data-le-act="redo"]').click()`);
  assert.equal(await evaluate('ed.L.items[0].rot'), before);
});

await check('exact numbers from the panel: width, angle and chairs per side', async () => {
  await evaluate(`ed.sel = ['item', 0]; ed.sync()`);
  const set = (key, value) => evaluate(`(() => { const el = document.querySelector('[data-le-prop="${key}"]'); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await set('w', '150'); await set('rot', '-30'); await set('n', '3'); await set('shape', 'round');
  const o = await evaluate('ed.L.items[0]');
  assert.deepEqual([o.w, o.rot, o.n, o.shape], [150, -30, 3, 'round']);
  assert.equal(await evaluate(`ed.fp.seats.filter(s => s.label.startsWith('Ширээ')).length`), 3 + o.s + o.wl + o.e);
});

await check('the order counter can be resized and turned, and keeps its queue spot on the floor', async () => {
  await evaluate(`ed.sel = ['counter', 0]; ed.sync()`);
  const set = (key, value) => evaluate(`(() => { const el = document.querySelector('[data-le-prop="${key}"]'); el.value = '${value}'; el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await set('w', '120'); await set('rot', '90');
  const c = await evaluate('ed.L.counter'); assert.equal(c.w, 120); assert.equal(c.rot, 90);
  const [ox, oy] = await evaluate('ed.fp.order'); assert.ok(ox > 24 && ox < 776 && oy > 24 && oy < 500, `${ox},${oy}`);
  assert.equal(await evaluate('ed.fp.cbox.custom'), true);
});

await check('a classic table turns into a free-form one when turned, keeping its seats', async () => {
  await evaluate(`document.querySelector('[data-le-add="long"]').click()`);
  const seats = await evaluate('ed.fp.seats.length');
  await evaluate(`document.querySelector('[data-le-act="rotate"]').click()`);
  const f = await frame(); assert.equal(f.type, 'table'); assert.equal(f.rot, 15);
  assert.equal(await evaluate('ed.fp.seats.length'), seats);
  assert.match(await evaluate(`document.querySelector('[data-le-hint]').innerText`), /чөлөөт объект/);
});

await check('duplicate, delete, grow and shrink', async () => {
  const n = await evaluate('ed.L.items.length');
  await evaluate(`document.querySelector('.le-plan').dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true }))`);
  assert.equal(await evaluate('ed.L.items.length'), n + 1);
  const w = (await frame()).w; await evaluate(`document.querySelector('[data-le-act="grow"]').click()`); assert.ok((await frame()).w > w);
  await evaluate(`document.querySelector('[data-le-act="delete"]').click()`); assert.equal(await evaluate('ed.L.items.length'), n);
});

await check('zoom in and back, and pull everything together', async () => {
  const w0 = await evaluate('ed.fp.cv.getBoundingClientRect().width');
  await evaluate(`document.querySelector('[data-le-act="zoomin"]').click()`);
  assert.ok(await evaluate('ed.fp.cv.getBoundingClientRect().width') > w0 * 1.2);
  await evaluate(`document.querySelector('[data-le-act="zoomfit"]').click()`);
  assert.equal(await evaluate('ed.fp.cv.getBoundingClientRect().width'), w0);
  const far = await evaluate('Math.hypot(ed.L.round[0].x - 400, ed.L.round[0].y - 262)');
  await evaluate(`document.querySelector('[data-le-act="scaledown"]').click()`);
  assert.ok(await evaluate('Math.hypot(ed.L.round[0].x - 400, ed.L.round[0].y - 262)') < far);
});

await check('JSON export and import round trip; broken JSON is refused', async () => {
  await evaluate(`document.querySelector('.le-json').open = true; document.querySelector('[data-le-act="export"]').click()`);
  const json = JSON.parse(await evaluate(`document.querySelector('[data-le-json]').value`));
  assert.ok(json.items.length >= 2 && json.overrides.counter.rot === 90);
  json.items[0].x = 222;
  await evaluate(`document.querySelector('[data-le-json]').value = ${JSON.stringify(JSON.stringify(json))}; document.querySelector('[data-le-act="import"]').click()`);
  assert.equal(await evaluate('ed.L.items[0].x'), 222);
  await evaluate(`document.querySelector('[data-le-json]').value = '{oops'; document.querySelector('[data-le-act="import"]').click()`);
  assert.match(await evaluate(`document.querySelector('[data-le-hint]').innerText`), /JSON уншиж чадсангүй/);
  assert.equal(await evaluate('ed.L.items[0].x'), 222, 'a failed import changes nothing');
});

await check('an unsaved draft can be restored in a new session', async () => {
  await mount({ id: 'T', name: 'Туршилтын кафе' });
  assert.equal(await evaluate(`document.querySelector('[data-le-act="draft"]').hidden`), false);
  await evaluate(`document.querySelector('[data-le-act="draft"]').click()`);
  assert.equal(await evaluate('ed.L.items[0].x'), 222);
});

await check('Sunny Day design: chosen from the list, every seat reachable, screenshot', async () => {
  await evaluate('localStorage.clear()'); await mount({ id: 'T2', name: 'Шинэ кафе' });
  await evaluate(`document.querySelector('[data-le-design="sunny-day"]').click()`);
  assert.equal(await evaluate('ed.L.items.length'), 32);
  assert.equal(await evaluate('ed.blockedSeats()'), 0);
  assert.doesNotMatch(await evaluate(`document.querySelector('[data-le-hint]').innerText`), /зам алга/);
  await shot('editor-sunny-day-desktop');
});

await check('a café with its own design file opens on it and says so', async () => {
  await mount({ id: 'S', name: 'Sunny Day Coffee Shop' }, { preset: 'artistic' });
  assert.equal(await evaluate('ed.L.design'), 'sunny-day');
  assert.match(await evaluate(`document.querySelector('[data-le-designnote]').innerText`), /Sunny Day Coffee Shop/);
  assert.equal(await evaluate(`document.querySelector('[data-le-design="sunny-day"]').getAttribute('aria-pressed')`), 'true');
});

await check('phone width: no sideways scrolling, panel below the plan', async () => {
  await viewport(390, 844, true); await delay(300);
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'page scrolls sideways');
  const [plan, panel] = await evaluate(`[document.querySelector('.le-plan').getBoundingClientRect().bottom, document.querySelector('.le-props').getBoundingClientRect().top]`);
  assert.ok(panel >= plan - 1);
  await shot('editor-sunny-day-phone');
  await viewport(1280, 1100);
});

await check('Sunny Day public view (as guests see it)', async () => {
  await evaluate(`(async () => {
    const { FloorPlan } = await import('/js/simulation/floor-plan.js');
    window.ed?.destroy(); window.ed = null;
    document.body.innerHTML = '<main class="wrap page" style="padding:16px"><div class="plan-wrap" id="pub" style="width:1100px"></div></main>';
    window.pub = new FloorPlan(document.querySelector('#pub'), { id: 'S', name: 'Sunny Day Coffee Shop', occ: 55 }, { fit: true, sound: 2 });
    return true;
  })()`);
  await delay(2500);
  assert.equal(await evaluate('pub.L.design'), 'sunny-day');
  assert.ok(await evaluate(`pub.people.length`) > 0, 'guests are shown');
  await shot('public-sunny-day');
});

await browser.close();
console.log(`\n${passed.length} passed, ${failures.length} failed${failures.length ? ': ' + failures.join('; ') : ''}`);
console.log(`Screenshots: ${output}`);
process.exitCode = failures.length ? 1 : 0;
