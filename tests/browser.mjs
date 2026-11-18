import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { delay, deterministicClock, root, startBrowser } from './support/browser.mjs';

const visual = process.argv.includes('--visual');
const label = process.env.CAPTURE_LABEL || 'after';
const source = process.env.SITE_ROOT ? resolve(process.env.SITE_ROOT) : root;
const output = join(root, '.artifacts', label);
await mkdir(output, { recursive: true });
const browser = await startBrowser(source);
const { origin, send, evaluate, events } = browser;
const failures = [], checks = [], measurements = {};
const check = async (name, callback) => {
  try { await callback(); checks.push(name); console.log(`PASS ${name}`); }
  catch (error) { failures.push({ name, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); }
};
async function waitFor(expression) {
  for (let n = 0; n < 100; n++) { if (await evaluate(expression)) return; await delay(50); }
  console.error(await evaluate(`({url:location.href,ready:document.readyState,body:document.body?.innerText.slice(0,200)})`));
  console.error(events.filter(e => ['Runtime.exceptionThrown','Network.loadingFailed'].includes(e.method)));
  throw new Error(`Not ready: ${expression}`);
}
let navigation = 0;
async function navigate(hash) {
  const start = events.length;
  await send('Page.navigate', { url: origin + '/?case=' + ++navigation + hash });
  for (let n = 0; n < 200 && !events.slice(start).some(e => e.method === 'Page.loadEventFired'); n++) await delay(50);
  await waitFor(`document.querySelector('#app')?.children.length > 0`);
  await evaluate(`document.fonts.ready`);
  if (hash === '#cafe-A' || hash === '#staff') await waitFor(`!!document.querySelector('canvas')`);
  await delay(100);
}
const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const input = (selector, value) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', {bubbles:true})); })()`);
try {
  // Keep captures reproducible offline; both revisions use the same fallback fonts.
  // The real map (MapLibre CDN + OpenFreeMap tiles) is blocked here, so every original check runs
  // offline against the automatic SVG fallback. The real map has its own checks further below.
  const FONTS = ['https://fonts.googleapis.com/*', 'https://fonts.gstatic.com/*'], MAP_NET = ['https://unpkg.com/*', 'https://tiles.openfreemap.org/*'];
  await send('Network.setBlockedURLs', { urls: [...FONTS, ...MAP_NET] });
  const clockScript = await send('Page.addScriptToEvaluateOnNewDocument', { source: deterministicClock });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  if (visual) {
    for (const [viewport, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: viewport === 'mobile' });
      for (const route of ['home', 'explore', 'cafes', 'cafe-A', 'cafe-O', 'about', 'partner', 'staff']) {
        await navigate('#' + route);
        await evaluate(`__advance(); document.getAnimations().forEach(a => { a.pause(); a.currentTime = 1000; });`);
        const snapshot = await evaluate(`({ text: document.body.innerText, overflow: document.documentElement.scrollWidth > innerWidth, elements: [...document.querySelectorAll('body *')].filter(el => !el.closest('svg')).map(el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return { tag: el.tagName, id: el.id, cls: typeof el.className === 'string' ? el.className : '', rect: [r.x,r.y,r.width,r.height].map(n => Math.round(n*100)/100), style: [s.display,s.color,s.backgroundColor,s.fontFamily,s.fontSize,s.padding,s.margin,s.gridTemplateColumns,s.transform] }; }) })`);
        await writeFile(join(output, `${viewport}-${route}.json`), JSON.stringify(snapshot, null, 2));
        const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile(join(output, `${viewport}-${route}.png`), Buffer.from(data, 'base64'));
        console.log(`Captured ${viewport} ${route}${snapshot.overflow ? ' (existing overflow)' : ''}`);
      }
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  }
  await check('home search, map results and cafe navigation', async () => {
    await navigate('#home');
    await input('#hq', 'Кафе A');
    await evaluate(`document.querySelector('#hs').requestSubmit()`);
    await waitFor(`location.hash === '#explore' && !!document.querySelector('.pv')`);
    assert.equal(await evaluate(`document.querySelector('.pv').dataset.id`), 'A');
    await evaluate(`document.querySelector('.pv').dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true}))`);
    await waitFor(`location.hash === '#cafe-A' && !!document.querySelector('canvas')`);
  });
  await check('home map is a still preview; home has no goal buttons, recommendations sort by seats/noise/Wi-Fi', async () => {
    await navigate('#home');
    // No pins, live pills or pulses on the home preview: the real map lives on #explore.
    assert.equal(await evaluate(`document.querySelectorAll('#miniMap .mk').length`), 0);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('#miniMap .you')).animationName`), 'none');
    assert.equal(await evaluate(`document.body.innerText.includes('Кафе хайх эсвэл зорилгоо сонгоход')`), false);
    // The four goals (Сурах, Ажиллах, Найзуудтай, Тухтай) were removed from the home page on request.
    assert.equal(await evaluate(`document.querySelectorAll('.hero-purp, [data-go-purpose], [data-drec-goal]').length`), 0);
    assert.equal(await evaluate(`document.querySelectorAll('.drec [data-drec-sort]').length`), 5);
    assert.ok(await evaluate(`document.querySelectorAll('.drec .rc').length > 0`));
    // The lamps keep their sway and glow.
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.hero .lamp')).animationName`), 'sway');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.hero .lamp .cone')).animationName`), 'glow');
    // Goal filtering itself still exists on the map page.
    await navigate('#explore');
    await click('[data-f="purpose"][data-v="Сурах"]');
    assert.equal(await evaluate(`document.querySelectorAll('.mk:not(.dim)').length`), 7);
    // The real map shows every café with its animated pin, on green land.
    assert.equal(await evaluate(`document.querySelectorAll('#exMap .mk').length`), 12);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('#exMap .map-land')).fill`), 'rgb(220, 230, 196)');
  });
  await check('map zoom, wheel, panning, marker selection and Escape', async () => {
    await navigate('#explore');
    const initial = await evaluate(`document.querySelector('.map-inner').style.transform`);
    await click('[data-z="in"]');
    const zoomed = await evaluate(`document.querySelector('.map-inner').style.transform`);
    assert.notEqual(zoomed, initial);
    await evaluate(`(() => { const map=document.querySelector('#exMap'), r=map.getBoundingClientRect(); map.dispatchEvent(new PointerEvent('pointerdown',{clientX:r.left+300,clientY:r.top+300,pointerId:1,bubbles:true})); map.dispatchEvent(new PointerEvent('pointermove',{clientX:r.left+340,clientY:r.top+320,pointerId:1,bubbles:true})); map.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,bubbles:true})); })()`);
    assert.notEqual(await evaluate(`document.querySelector('.map-inner').style.transform`), zoomed);
    const panned = await evaluate(`document.querySelector('.map-inner').style.transform`);
    await evaluate(`document.querySelector('#exMap').dispatchEvent(new WheelEvent('wheel',{deltaY:-100,clientX:800,clientY:400,bubbles:true,cancelable:true}))`);
    assert.notEqual(await evaluate(`document.querySelector('.map-inner').style.transform`), panned);
    await click('[data-z="out"]'); await click('[data-z="me"]');
    await evaluate(`document.querySelector('[data-mk="A"]').dispatchEvent(new PointerEvent('pointerdown',{pointerId:2,bubbles:true}))`);
    await click('[data-mk="A"]');
    assert.equal(await evaluate(`document.querySelector('.pv').dataset.id`), 'A');
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
    assert.equal(await evaluate(`!!document.querySelector('.pv')`), false);
  });
  await check('hash navigation and browser back/forward retain existing routes', async () => {
    await navigate('#home'); await click('.nav [data-nav="cafes"]');
    await waitFor(`location.hash === '#cafes' && !!document.querySelector('#cgrid')`);
    await click('.nav [data-nav="explore"]');
    await waitFor(`location.hash === '#explore' && !!document.querySelector('#exMap')`);
    await evaluate(`history.back()`);
    await waitFor(`location.hash === '#cafes' && !!document.querySelector('#cgrid')`);
    await evaluate(`history.forward()`);
    await waitFor(`location.hash === '#explore' && !!document.querySelector('#exMap')`);
  });
  await check('favorites persist across reloads', async () => {
    await navigate('#cafes');
    await evaluate(`localStorage.removeItem('ls_favs')`);
    await navigate('#cafes');
    await click('[data-fav="A"]');
    assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem('ls_favs'))`), ['A']);
    await navigate('#cafes');
    assert.equal(await evaluate(`document.querySelector('[data-fav="A"]').getAttribute('aria-pressed')`), 'true');
    await click('#favBtn');
    assert.equal(await evaluate(`document.querySelector('#favPop a').getAttribute('href')`), '#cafe-A');
    await click('[data-fav="A"]');
    assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem('ls_favs'))`), []);
  });
  await check('filters, reset, closed cafes and comparison', async () => {
    await navigate('#cafes');
    assert.equal(await evaluate(`document.querySelectorAll('.ccard').length`), 12);
    await input('[data-sound-range]', '1');
    assert.equal(await evaluate(`document.querySelectorAll('.ccard').length`), 2);
    await click('[data-reset]');
    await click('[data-f="purpose"][data-v="Сурах"]');
    assert.equal(await evaluate(`document.querySelectorAll('.ccard').length`), 7);
    await click('[data-f="purpose"][data-v="Ажиллах"]');
    assert.equal(await evaluate(`document.querySelectorAll('.ccard').length`), 4);
    await click('[data-f="wifi"][data-v="great"]');
    assert.equal(await evaluate(`document.querySelectorAll('.ccard').length`), 2);
    await click('[data-f="seats"][data-v="50"]');
    assert.equal(await evaluate(`document.querySelectorAll('.ccard').length`), 2);
    await input('[data-sound-range]', '1');
    assert.equal(await evaluate(`document.querySelectorAll('.ccard').length`), 1);
    await click('[data-reset]');
    await click('[data-f="wifi"][data-v="good"]');
    assert.equal(await evaluate(`document.querySelectorAll('.ccard').length`), 6);
    await click('[data-f="seats"][data-v="50"]');
    assert.equal(await evaluate(`document.querySelectorAll('.ccard').length`), 5);
    await click('[data-reset]');
    await click('[data-f="openOnly"]');
    assert.equal(await evaluate(`document.querySelectorAll('.ccard').length`), 10);
    await click('[data-reset]');
    await input('#q', 'Кафе O');
    assert.equal(await evaluate(`document.querySelector('.ccard').classList.contains('is-closed')`), true);
    await click('[data-reset]');
    await click('[data-cmp="A"]'); await click('[data-cmp="K"]'); await click('#cmpGo');
    assert.equal(await evaluate(`!!document.querySelector('[role="dialog"] .cmp-t')`), true);
    await click('[data-close]');
  });
  await check('simulation controls, forecast, table and seat selection', async () => {
    await navigate('#cafe-A');
    await evaluate(`__advance()`);
    const before = await evaluate(`document.querySelector('#freeSub').textContent`);
    await click('#remG'); await evaluate(`__advance(40)`);
    assert.notEqual(await evaluate(`document.querySelector('#freeSub').textContent`), before);
    await click('#addG');
    await evaluate(`__advance(2400)`);
    await click('[data-pz="in"]'); await click('[data-pz="out"]');
    await input('#teSl', '18'); await evaluate(`__advance(300)`);
    assert.equal(await evaluate(`document.querySelector('.pb.sel').dataset.h`), '18');
    await click('[data-view="table"]');
    assert.equal(await evaluate(`document.querySelector('#viewPlan').hidden`), true);
    assert.equal(await evaluate(`!!document.querySelector('#viewTable table')`), true);
    await click('[data-view="plan"]');
    await evaluate(`(() => { const cv=document.querySelector('canvas'), r=cv.getBoundingClientRect(); cv.dispatchEvent(new MouseEvent('click',{clientX:r.left+r.width*205/800,clientY:r.top+r.height*78/520,bubbles:true})); })()`);
    assert.equal(await evaluate(`!!document.querySelector('.seatinfo')`), true);
  });
  await check('sound previews and persisted sound/motion preferences', async () => {
    await navigate('#cafe-A');
    await click('[data-play]');
    assert.equal(await evaluate(`document.querySelector('[data-play]').classList.contains('on')`), true);
    await click('[data-play]');
    assert.equal(await evaluate(`document.querySelector('[data-play]').classList.contains('on')`), false);
    for (let level = 1; level <= 5; level++) {
      await click(`[data-ssl="${level}"]`); await click('[data-play]');
      assert.equal(await evaluate(`document.querySelector('[data-play].on').dataset.play`), String(level));
      await click('[data-play]');
    }
    await click('#sndBtn'); await click('#swSnd'); await click('#swRm');
    assert.equal(await evaluate(`localStorage.getItem('ls_sound')`), 'false');
    assert.equal(await evaluate(`document.documentElement.classList.contains('rm')`), true);
    await navigate('#home');
    assert.equal(await evaluate(`document.querySelector('#sndBtn').getAttribute('aria-pressed')`), 'false');
    assert.equal(await evaluate(`document.documentElement.classList.contains('rm')`), true);
    await evaluate(`localStorage.clear()`);
  });
  await check('partner form validation and demo submission', async () => {
    await navigate('#partner');
    await evaluate(`document.querySelector('#pf').requestSubmit()`);
    // The merged three-step form validates the visible contact step first.
    assert.equal(await evaluate(`document.querySelectorAll('.fld.err').length`), 3);
    for (const [selector, value] of [['#f1','Cafe'],['#f2','Test'],['#f3','88000000'],['#f4','test@example.com'],['#f8','Seoul street 1'],['#f12','Quiet cafe']]) await input(selector, value);
    await evaluate(`(() => { const input = document.querySelector('#fPhotos'), dt = new DataTransfer(); for (let i = 0; i < 3; i++) dt.items.add(new File([new Uint8Array([137,80,78,71,13,10,26,10])], 'p' + i + '.png', { type: 'image/png' })); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    assert.equal(await evaluate(`document.querySelectorAll('#phGrid .ph').length`), 3);
    await click('#pf [data-next]');
    await click('#pf [data-next]');
    await evaluate(`document.querySelector('#pf').requestSubmit()`);
    assert.equal(await evaluate(`!!document.querySelector('#pf .done')`), true);
  });
  await check('sockets are not shown anywhere; open/closed is a lit or grey lamp', async () => {
    for (const hash of ['#cafes', '#cafe-A', '#about', '#home']) {
      await navigate(hash);
      if (hash === '#cafe-A') await waitFor(`!!document.querySelector('.cd-pills')`);
      assert.doesNotMatch(await evaluate(`document.body.innerText`), /алгуур/, `${hash} mentions sockets`);
    }
    await navigate('#cafes');
    assert.equal(await evaluate(`Math.max(...[...document.querySelectorAll('.ccard .tiles')].map(t => t.children.length))`), 3);
    assert.equal(await evaluate(`document.querySelectorAll('.ccard .olamp.on').length`), 10);
    assert.equal(await evaluate(`document.querySelectorAll('.ccard.is-closed .olamp.off').length`), 2);
    assert.equal(await evaluate(`document.querySelector('.ccard .olamp').getAttribute('aria-label')`), 'Нээлттэй');
  });

  await check('staff page: advice, plan and current state fit the first screen; temporary status below', async () => {
    await navigate('#staff');
    const r = await evaluate(`(() => { const box = s => document.querySelector(s).getBoundingClientRect(); return { h: innerHeight, plan: box('#planWrap').bottom, advice: box('.st-advice').top, adviceBottom: box('.st-advice').bottom, now: box('.st-now').bottom, temp: box('#tsList').top, plan_top: box('#planWrap').top }; })()`);
    assert.ok(r.plan <= r.h && r.now <= r.h && r.adviceBottom <= r.h, JSON.stringify(r));
    assert.ok(r.advice < r.plan_top + 10, 'advice starts at the top');
    assert.ok(r.temp > r.plan, 'temporary status follows below');
  });

  await check('staff controls, FAQ and unknown route fallback', async () => {
    await navigate('#staff'); await click('[data-ts]');
    assert.equal(await evaluate(`document.querySelectorAll('.tstat').length`), 2);
    await click('[data-tsx]'); await click('[data-mus="up"]');
    assert.equal(await evaluate(`document.querySelector('#musV').textContent`), 'Хөгжмийн дуу 60%');
    await navigate('#about'); await click('summary');
    assert.equal(await evaluate(`document.querySelector('details').open`), true);
    await navigate('#missing');
    assert.equal(await evaluate(`!!document.querySelector('.hero')`), true);
    await navigate('#cafe-missing');
    assert.equal(await evaluate(`!!document.querySelector('.empty')`), true);
  });
  await check('rapid cafe revisits and navigation leave no simulation or UI frames running', async () => {
    await navigate('#about');
    await evaluate(`location.hash = '#cafe-A'`); await delay(30);
    await evaluate(`location.hash = '#cafe-I'`); await delay(30);
    await evaluate(`location.hash = '#cafe-A'`); await delay(500);
    await evaluate(`__advance(60)`);
    assert.equal(await evaluate(`document.querySelectorAll('canvas').length`), 1);
    await evaluate(`location.hash = '#about'`); await delay(80);
    assert.equal(await evaluate(`__pendingFrames()`), 0);
  });
  await check('mobile sheet, filter modal and responsive navigation', async () => {
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await navigate('#explore');
    assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('#tabbar')).display`), 'none');
    await click('#shHandle');
    assert.equal(await evaluate(`document.querySelector('#exSide').classList.contains('full')`), true);
    await click('#mFilter');
    assert.equal(await evaluate(`!!document.querySelector('[role="dialog"]')`), true);
    await input('#modal [data-sound-range]', '2');
    assert.equal(await evaluate(`document.querySelectorAll('[data-card]').length`), 2);
    await click('#mfApply');
    assert.equal(await evaluate(`!!document.querySelector('[role="dialog"]')`), false);
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    // Resizing can rebuild the asynchronous map after its container is mounted.
    await waitFor(`document.querySelectorAll('#exMap .mk').length === 12`);
    assert.equal(await evaluate(`document.querySelectorAll('.mk').length`), 12);
  });

  /* ---------- real map (MapLibre + OpenStreetMap tiles) ---------- */
  await check('blocked map library falls back to the drawn SVG map automatically', async () => {
    await navigate('#explore');
    await waitFor(`document.querySelector('#exMap').dataset.map === 'svg'`);
    assert.equal(await evaluate(`!!document.querySelector('#exMap .map-inner svg.base') && !document.querySelector('#exMap .map-gl')`), true);
    assert.equal(await evaluate(`document.querySelectorAll('#exMap .mk').length`), 12);
  });
  // Network is needed from here on; without it these checks are reported as skipped, not passed.
  // MapLibre needs a real clock and animation frames, so the deterministic clock is removed.
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: clockScript.identifier });
  await send('Network.setBlockedURLs', { urls: FONTS });
  const glReady = async () => {
    for (let n = 0; n < 120; n++) { const m = await evaluate(`document.querySelector('#exMap')?.dataset.map`); if (m === 'gl' || m === 'svg') return m === 'gl'; await delay(125); }
    return false;
  };
  await navigate('#explore');
  if (!await glReady()) console.log('SKIP real map checks: MapLibre or OpenFreeMap tiles were not reachable (the SVG fallback was used)');
  else {
    const M = `document.querySelector('#exMap .map-gl')._lsMap`;
    await check('real map loads with OSM attribution and every café marker at its coordinates', async () => {
      await waitFor(`!!document.querySelector('#exMap canvas.maplibregl-canvas')`);
      assert.match(await evaluate(`document.querySelector('.maplibregl-ctrl-attrib').textContent`), /OpenStreetMap contributors/);
      assert.equal(await evaluate(`document.querySelectorAll('#exMap .ml-mk .mk').length`), 12);
      // Each marker's tip (bottom centre) sits within 2 px of the projected café coordinate.
      const off = await evaluate(`(async () => { const { cafeLngLat } = await import('/js/map-gl.js'); const { getCafes } = await import('/js/cafes.js'); const m = ${M}, box = m.getContainer().getBoundingClientRect(); return Math.max(...getCafes().map(c => { const p = m.project(cafeLngLat(c)), r = document.querySelector('.ml-mk [data-mk="' + c.id + '"]').closest('.ml-mk').getBoundingClientRect(); return Math.hypot(r.left + r.width / 2 - box.left - p.x, r.bottom - box.top - p.y); })); })()`);
      assert.ok(off < 2, `marker offset ${off}px`);
      assert.equal(await evaluate(`${M}.getStyle().layers.find(l => l.id === 'land').paint['background-color']`), '#DCE6C4');
    });
    await check('real map: marker click opens the preview, Escape closes it, demo cafés have no real directions', async () => {
      await click('.ml-mk [data-mk="A"]');
      await waitFor(`document.querySelector('.pv')?.dataset.id === 'A'`);
      assert.equal(await evaluate(`document.querySelector('.ml-mk [data-mk="A"]').classList.contains('sel')`), true);
      assert.equal(await evaluate(`document.querySelector('.pv .pv-dir').disabled`), true);
      assert.match(await evaluate(`document.querySelector('.pv .pv-dir').textContent`), /Чиглэл авах · ДЕМО/);
      await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
      assert.equal(await evaluate(`!!document.querySelector('.pv')`), false);
      assert.equal(await evaluate(`document.querySelectorAll('.ml-mk .mk.sel').length`), 0);
    });
    await check('real map: filters dim markers; zoom buttons, wheel and drag move the camera', async () => {
      await click('[data-f="purpose"][data-v="Сурах"]');
      assert.equal(await evaluate(`document.querySelectorAll('.ml-mk .mk:not(.dim)').length`), 7);
      await click('[data-f="purpose"][data-v="Сурах"]');
      assert.equal(await evaluate(`document.querySelectorAll('.ml-mk .mk.dim').length`), 0);
      const z0 = await evaluate(`${M}.getZoom()`);
      await click('.map-ctrl-gl [data-z="in"]'); await delay(450);
      const z1 = await evaluate(`${M}.getZoom()`); assert.ok(z1 > z0 + .5, `zoom in ${z0} → ${z1}`);
      await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 900, y: 500, deltaX: 0, deltaY: 300 }); await delay(700);
      const z2 = await evaluate(`${M}.getZoom()`); assert.ok(z2 < z1, `wheel ${z1} → ${z2}`);
      const c0 = await evaluate(`JSON.stringify(${M}.getCenter())`);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 900, y: 450, button: 'left', clickCount: 1 });
      for (let i = 1; i <= 6; i++) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 900 - i * 25, y: 450 + i * 10, button: 'left', buttons: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 750, y: 510, button: 'left', clickCount: 1 }); await delay(400);
      assert.notEqual(await evaluate(`JSON.stringify(${M}.getCenter())`), c0);
      assert.equal(await evaluate(`Math.abs(${M}.getBearing())`), 0, 'rotation stays off so north stays up');
    });
    await check('real map: «Миний байршил» shows «Та энд» only after a tap; a refusal shows a Mongolian message', async () => {
      assert.equal(await evaluate(`!!document.querySelector('.ml-you')`), false, 'no location before the tap');
      await send('Browser.grantPermissions', { origin, permissions: ['geolocation'] });
      await send('Emulation.setGeolocationOverride', { latitude: 47.9188, longitude: 106.9176, accuracy: 20 });
      await click('.map-ctrl-gl [data-z="me"]');
      await waitFor(`!!document.querySelector('.ml-you') && document.querySelector('.ml-you').textContent.includes('Та энд')`);
      await delay(800);
      const c = await evaluate(`${M}.getCenter()`);
      assert.ok(Math.abs(c.lat - 47.9188) < .001 && Math.abs(c.lng - 106.9176) < .001, JSON.stringify(c));
      await send('Browser.resetPermissions');
      await send('Emulation.clearGeolocationOverride');
      await send('Emulation.setGeolocationOverride', {});      // position unavailable
      await click('.map-ctrl-gl [data-z="me"]');
      await waitFor(`[...document.querySelectorAll('.toast')].some(t => /Байршил|байршил/.test(t.textContent))`);
      await send('Emulation.clearGeolocationOverride');
    });
    await check('real map: selecting from the list centres the café; mobile preview and sheet still work', async () => {
      await click('[data-card="K"]'); await delay(700);
      assert.equal(await evaluate(`document.querySelector('.pv')?.dataset.id`), 'K');
      await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await navigate('#explore'); assert.equal(await glReady(), true);
      await click('.ml-mk [data-mk="I"]');
      await waitFor(`document.querySelector('body > .pv')?.dataset.id === 'I'`);
      await click('#shHandle');
      assert.equal(await evaluate(`document.querySelector('#exSide').classList.contains('full')`), true);
      assert.equal(await evaluate(`document.documentElement.scrollWidth > innerWidth`), false);
      await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    });
    await check('real map: blocked tiles fall back to SVG; navigating away removes the map', async () => {
      await navigate('#about');
      assert.equal(await evaluate(`document.querySelectorAll('.maplibregl-map, .maplibregl-marker, .map-ctrl-gl').length`), 0);
      await send('Network.setBlockedURLs', { urls: [...FONTS, 'https://tiles.openfreemap.org/*'] });
      await navigate('#explore');
      await waitFor(`document.querySelector('#exMap').dataset.map === 'svg'`);
      assert.equal(await evaluate(`document.querySelectorAll('.maplibregl-map').length`), 0);
      assert.equal(await evaluate(`document.querySelectorAll('#exMap .mk').length`), 12);
      await send('Network.setBlockedURLs', { urls: FONTS });
    });
  }
  const errors = events.filter(e => e.method === 'Runtime.exceptionThrown').map(e => e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text);
  // A static host answers the backend probe with 404: that is how the site detects the offline demo mode.
  const badResponses = events.filter(e => e.method === 'Network.responseReceived' && e.params.response.status >= 400 && !new URL(e.params.response.url).pathname.startsWith('/api/')).map(e => ({ url: e.params.response.url.replace(origin, ''), status: e.params.response.status }));
  const networkFailures = events.filter(e => e.method === 'Network.loadingFailed').map(e => ({ error: e.params.errorText, blockedReason: e.params.blockedReason, canceled: e.params.canceled }));
  await check('browser console has no uncaught errors', async () => assert.deepEqual(errors, []));
  await check('all local assets return successful HTTP responses', async () => assert.deepEqual(badResponses.filter(response => response.url.startsWith('/')), []));
  await writeFile(join(output, 'results.json'), JSON.stringify({ checks, failures, measurements, errors, badResponses, networkFailures }, null, 2));
  console.log(`${checks.length} checks passed; ${failures.length} failed. HTTP failures: ${JSON.stringify(badResponses)}`);
} finally { await browser.close(); }
if (failures.length) process.exitCode = 1;
