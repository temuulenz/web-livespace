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
  await send('Page.navigate', { url: origin + '/?case=' + ++navigation + hash });
  await waitFor(`document.querySelector('#app')?.children.length > 0`);
  await evaluate(`document.fonts.ready`);
  if (hash === '#cafe-A' || hash === '#staff') await waitFor(`!!document.querySelector('canvas')`);
  await delay(100);
}
const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const input = (selector, value) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', {bubbles:true})); })()`);
try {
  // Keep captures reproducible offline; both revisions use the same fallback fonts.
  await send('Network.setBlockedURLs', { urls: ['https://fonts.googleapis.com/*', 'https://fonts.gstatic.com/*'] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: deterministicClock });
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
    assert.equal(await evaluate(`document.querySelectorAll('.mk.hit').length`), 1);
    await evaluate(`document.querySelector('#hs').requestSubmit()`);
    await waitFor(`location.hash === '#explore' && !!document.querySelector('.pv')`);
    assert.equal(await evaluate(`document.querySelector('.pv').dataset.id`), 'A');
    await evaluate(`document.querySelector('.pv').dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true}))`);
    await waitFor(`location.hash === '#cafe-A' && !!document.querySelector('canvas')`);
  });
  await check('map live search operation count and matching results', async () => {
    await navigate('#home');
    measurements.markerQueriesFor100Inputs = await evaluate(`(() => {
      const original = Element.prototype.querySelectorAll;
      let queries = 0;
      Element.prototype.querySelectorAll = function(selector) { if(selector === '.mk') queries++; return original.call(this, selector); };
      try { const input = document.querySelector('#hq'); for(let i=0;i<100;i++) { input.value='Кафе A'; input.dispatchEvent(new Event('input',{bubbles:true})); } return queries; }
      finally { Element.prototype.querySelectorAll = original; }
    })()`);
    assert.equal(await evaluate(`document.querySelectorAll('.mk.hit').length`), 1);
    console.log(`Marker queries for 100 inputs: ${measurements.markerQueriesFor100Inputs}`);
    await click('[data-go-purpose="Сурах"]');
    await waitFor(`location.hash === '#explore' && !!document.querySelector('#exMap')`);
    assert.equal(await evaluate(`document.querySelectorAll('.mk:not(.dim)').length`), 7);
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
    assert.equal(await evaluate(`document.querySelectorAll('.fld.err').length`), 4);
    for (const [selector, value] of [['#f1','Cafe'],['#f2','Test'],['#f3','88000000'],['#f4','test@example.com']]) await input(selector, value);
    await evaluate(`document.querySelector('#pf').requestSubmit()`);
    assert.equal(await evaluate(`!!document.querySelector('#pf .done')`), true);
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
    await waitFor(`!!document.querySelector('#exMap')`);
    assert.equal(await evaluate(`document.querySelectorAll('.mk').length`), 12);
  });
  const errors = events.filter(e => e.method === 'Runtime.exceptionThrown').map(e => e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text);
  const badResponses = events.filter(e => e.method === 'Network.responseReceived' && e.params.response.status >= 400).map(e => ({ url: e.params.response.url.replace(origin, ''), status: e.params.response.status }));
  const networkFailures = events.filter(e => e.method === 'Network.loadingFailed').map(e => ({ error: e.params.errorText, blockedReason: e.params.blockedReason, canceled: e.params.canceled }));
  await check('browser console has no uncaught errors', async () => assert.deepEqual(errors, []));
  await check('all local assets return successful HTTP responses', async () => assert.deepEqual(badResponses.filter(response => response.url.startsWith('/')), []));
  await writeFile(join(output, 'results.json'), JSON.stringify({ checks, failures, measurements, errors, badResponses, networkFailures }, null, 2));
  console.log(`${checks.length} checks passed; ${failures.length} failed. HTTP failures: ${JSON.stringify(badResponses)}`);
} finally { await browser.close(); }
if (failures.length) process.exitCode = 1;
