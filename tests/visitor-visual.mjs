// Compare the REAL visitor lifecycle against an unmodified engine from Git.
// Chair status overlays/staff intentionally differ; visitor pixels must be identical.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root, startBrowser, deterministicClock } from './support/browser.mjs';

const revision = 'fd3c12b'; // Last pre-integration engine; original lifecycle from f7f64a7.
const output = join(root, '.artifacts', 'visitor-restoration');
await mkdir(output, { recursive: true });
const original = execFileSync('git', ['show', `${revision}:js/simulation/floor-plan.js`], { cwd: root, encoding: 'utf8' });
// Only import locations change for this generated, ignored browser test artifact.
await writeFile(join(output, 'original-floor-plan.js'), original.replaceAll("from '../", "from '/js/").replaceAll("from './layouts.js'", "from '/js/simulation/layouts.js'"));
await writeFile(join(output, 'index.html'), '<!doctype html><meta charset="utf-8"><title>Original visitor comparison</title><body></body>');
const browser = await startBrowser();
const { send, evaluate, origin } = browser;
try {
  await send('Page.addScriptToEvaluateOnNewDocument', { source: deterministicClock });
  await send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 680, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: origin + '/.artifacts/visitor-restoration/index.html' });
  await evaluate(`(async () => {
    document.body.innerHTML = '<h1>Visitor restoration · original Git engine comparison</h1><div style="display:flex;gap:24px"><section><h2>REAL · illustrative seats remain unknown</h2><div id="real" style="width:800px"></div></section><section><h2>Git ${revision} · original simulation</h2><div id="original" style="width:800px"></div></section></div>';
    document.body.style.cssText = 'font:14px sans-serif;margin:16px;background:#fff;color:#3E2A17';
    const { FloorPlan } = await import('/js/simulation/floor-plan.js');
    const { FloorPlan: Original } = await import('/.artifacts/visitor-restoration/original-floor-plan.js');
    const cafe = { id:'A', name:'Original animation', occ:0 };
    window.makeCafe = count => ({ ...cafe, live: { mode:'live', sensor: { dataSource:'real', status:'online', observedPeople:count, peopleTimestamp:new Date().toISOString() } } });
    window.real = new FloorPlan(document.querySelector('#real'), makeCafe(0), { layout:'minimal', sound:2 });
    window.original = new Original(document.querySelector('#original'), cafe, { layout:'minimal', sound:2 });
    original.nextEv = Infinity;
    window.advance = frames => { for(let i=0;i<frames;i++) { real.update(1/60,i*1000/60); original.update(1/60,i*1000/60); } };
    window.capture = () => {
      // Capture visitor commands from the real draw loop, excluding staff and
      // measured/unknown chair overlays, onto identical transparent canvases.
      const layer = sim => {
        const canvas = document.createElement('canvas'); canvas.width=800; canvas.height=520;
        const ctx = canvas.getContext('2d'), person=sim.person, item=sim.item, bub=sim.bub;
        sim.person = (x,p,...args) => { if(!p.barista && !p.chef) person.call(sim,ctx,p,...args); };
        sim.item = (x,...args) => item.call(sim,ctx,...args);
        sim.bub = (x,...args) => bub.call(sim,ctx,...args);
        sim.draw(); sim.person=person; sim.item=item; sim.bub=bub;
        const pixels = canvas.toDataURL(); sim.draw(); return pixels;
      };
      const snapshot = sim => sim.people.map(p => ({ state:p.state, x:p.x,y:p.y,ang:p.ang,path:p.path,seat:p.seat?.id,shirt:p.shirt,item:p.item,alpha:p.alpha }));
      return { real:layer(real), original:layer(original), states:JSON.stringify(snapshot(real)), referenceStates:JSON.stringify(snapshot(original)), population:real.population() };
    };
  })()`);
  const compare = async (phase, expected) => {
    const capture = await evaluate('capture()');
    assert.equal(capture.states, capture.referenceStates, `${phase}: original visitor lifecycle changed`);
    assert.equal(capture.real, capture.original, `${phase}: original visitor pixels changed`);
    assert.equal(capture.population.active, expected);
    await writeFile(join(output, phase + '-visitors.png'), Buffer.from(capture.real.split(',')[1], 'base64'));
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(join(output, phase + '.png'), Buffer.from(screenshot.data, 'base64'));
    console.log('PASS original visitor pixels and lifecycle:', phase);
  };
  await evaluate('real.syncTelemetry(makeCafe(1)); original.arrive(false)');
  await compare('entrance', 1);
  await evaluate('advance(180)'); await compare('walking-to-order', 1);
  await evaluate('advance(900)'); await compare('ordering-or-seating', 1);
  await evaluate('advance(1800)'); await compare('seated-one', 1);
  await evaluate('real.syncTelemetry(makeCafe(5)); for(let i=0;i<4;i++) original.arrive(false); advance(180)');
  await compare('four-more-enter', 5);
  await evaluate('advance(3600)'); await compare('seated-five', 5);
  await evaluate('real.syncTelemetry(makeCafe(5)); advance(300)'); await compare('unchanged-five-idle', 5);
  await evaluate('real.syncTelemetry(makeCafe(2)); for(let i=0;i<3;i++) original.depart(false); advance(180)');
  await compare('three-walk-to-exit', 2);
  await evaluate('advance(3600)'); await compare('seated-two', 2);
  await evaluate('real.syncTelemetry(makeCafe(0)); for(let i=0;i<2;i++) original.depart(false); advance(180)');
  await compare('remaining-two-leave', 0);
  await evaluate('advance(3600)'); await compare('empty', 0);
  await evaluate('real.destroy(); original.destroy()');
} finally { await browser.close(); }
