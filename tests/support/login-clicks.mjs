import assert from 'node:assert/strict';
import { delay } from './browser.mjs';
export async function pointerClick(browser,selector) {
 let p,previous;
 for(let attempt=0;attempt<70;attempt++) {
  const current=await browser.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing click target');el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);return{x,y,reachable:!!hit&&el.contains(hit),blockedBy:hit?.tagName+'.'+hit?.getAttribute('class')};})()`);
  p=current;
  if(p.reachable && previous && Math.abs(previous.x-p.x)<.5 && Math.abs(previous.y-p.y)<.5)break;
  previous=p;await delay(30);
 }
 assert.ok(p.reachable,`${selector} blocked by ${p.blockedBy}`);
 await browser.send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});
 await browser.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1});
}
export async function verifyLoginClicks(browser,{origin,credentials,tour=true}) {
 const {evaluate,send}=browser;
 const wait=async expression=>{for(let i=0;i<180;i++){if(await evaluate(expression))return;await delay(50);}throw Error('Login check timed out: '+expression);};
 const home=async(mobile,reset=false)=>{
  await send('Emulation.setDeviceMetricsOverride',{width:mobile?390:1440,height:mobile?844:900,deviceScaleFactor:1,mobile});
  if(reset)await evaluate(`localStorage.removeItem('ls_mhTour')`);
  await send('Page.navigate',{url:origin+'/#home'});
  await wait(`document.documentElement?.classList.contains('ls-online') && typeof document.querySelector('#accBtn')?.onclick === 'function'`);
 };
 const open=async()=>{await pointerClick(browser,'#accBtn');await wait(`!document.querySelector('#accPop').hidden`);await pointerClick(browser,'#accPop [data-auth="login"]');await wait(`!!document.querySelector('#modal .auth-form')`);};
 const login=async()=>{
  await evaluate(`document.querySelector('#au-email').value=${JSON.stringify(credentials.email)};document.querySelector('#au-password').value=${JSON.stringify(credentials.password)};`);
  await pointerClick(browser,'#modal .auth-form button');await wait(`!!document.querySelector('#accBtn .acc-dot') && !document.querySelector('#modal .auth-form')`);
  await pointerClick(browser,'#accBtn');await pointerClick(browser,'#accPop [href="#account"]');await wait(`location.hash === '#account' && !!document.querySelector('.acc-page')`);
  await pointerClick(browser,'#accBtn');await pointerClick(browser,'#accPop [data-logout]');await wait(`!document.querySelector('#accBtn .acc-dot')`);
 };
 await home(false);
 assert.match((await fetch(origin+'/')).headers.get('content-security-policy')||'',/script-src 'self'/);
 await evaluate(`window.__analyticsBlocked=false;document.addEventListener('securitypolicyviolation',e=>{if(e.blockedURI.includes('static.cloudflareinsights.com'))window.__analyticsBlocked=true;});const script=document.createElement('script');script.src='https://static.cloudflareinsights.com/beacon.min.js';document.head.appendChild(script);`);
 await wait('window.__analyticsBlocked === true');await open();await login();
 console.log('PASS physical desktop login/logout/account navigation despite blocked analytics');
 await pointerClick(browser,'[data-gate-login="account"]');await wait(`!!document.querySelector('#modal .auth-form')`);await pointerClick(browser,'#modal [data-close]');
 await home(true,true);if(tour)await wait(`!!document.querySelector('.tour.in')`);else await delay(1300);
 await open();await login();console.log('PASS physical mobile login/logout during first-visit onboarding');
 await home(true,true);await open();await delay(1600);
 assert.equal(await evaluate(`!!document.querySelector('.tour:not(.out)')`),false,'pending tour must not cover login');await login();
 console.log('PASS pending onboarding cannot steal an open auth modal');
 // Registration is also exercised by real pointer events, using a fresh test account.
 await home(false);await open();await pointerClick(browser,'[data-auth-mode="register"]');await wait(`!!document.querySelector('#au-name')`);
 await evaluate(`document.querySelector('#au-name').value='Browser test';document.querySelector('#au-email').value='pointer-'+Date.now()+'@test.mn';document.querySelector('#au-password').value='pointer-test-password-123';`);
 await pointerClick(browser,'#modal .auth-form button');await wait(`!!document.querySelector('#accBtn .acc-dot') && !document.querySelector('#modal .auth-form')`);
 await pointerClick(browser,'#accBtn');await pointerClick(browser,'#accPop [data-logout]');await wait(`!document.querySelector('#accBtn .acc-dot')`);
 console.log('PASS physical registration and logout');
}

export async function verifyOutageRecovery(browser,{origin,credentials}) {
 const {send,evaluate,events}=browser;let unavailable=true,running=true,cursor=events.length;
 await send('Fetch.enable',{patterns:[{urlPattern:'*/api/v1/health',requestStage:'Request'},{urlPattern:'*/api/v1/auth/login',requestStage:'Request'}]});
 const pump=(async()=>{while(running){const batch=events.slice(cursor);cursor=events.length;for(const item of batch.filter(e=>e.method==='Fetch.requestPaused')){
  if(unavailable)await send('Fetch.fulfillRequest',{requestId:item.params.requestId,responseCode:503,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Retry-After',value:'3600'}],body:Buffer.from(JSON.stringify({error:{code:'database_limit_reached',message:'Live services are temporarily unavailable. Please retry later.'}})).toString('base64')});
  else await send('Fetch.continueRequest',{requestId:item.params.requestId});
 }await delay(5);}})();
 const wait=async expression=>{for(let i=0;i<180;i++){if(await evaluate(expression))return;await delay(50);}throw Error('Outage check timed out: '+expression);};
 try {
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  const start=events.length;await send('Page.navigate',{url:origin+'/#home'});
  await wait(`!!document.querySelector('#platformStatus') && !document.querySelector('#platformStatus').hidden && typeof document.querySelector('#accBtn')?.onclick === 'function'`);
  await pointerClick(browser,'#accBtn');await pointerClick(browser,'#accPop [data-auth="login"]');
  await wait(`!!document.querySelector('#modal .auth-form')`);
  await evaluate(`document.querySelector('#au-email').value=${JSON.stringify(credentials.email)};document.querySelector('#au-password').value=${JSON.stringify(credentials.password)};`);
  await pointerClick(browser,'#modal .auth-form button');await wait(`!!document.querySelector('.auth-form [role="alert"]') && !document.querySelector('.auth-form button').disabled`);
  assert.match(await evaluate(`document.querySelector('.auth-form [role="alert"]').textContent`),/temporarily unavailable/);
  assert.equal(events.slice(start).filter(e=>e.method==='Network.requestWillBeSent'&&new URL(e.params.request.url).pathname==='/api/v1/live').length,0,'quota outage must not start background database polling');
  await pointerClick(browser,'#modal [data-close]');unavailable=false;await pointerClick(browser,'[data-retry-platform]');
  await wait(`document.querySelector('#platformStatus').hidden && typeof document.querySelector('#accBtn')?.onclick === 'function'`);
  console.log('PASS backend outage keeps authentication reachable and recovers without reload or credential changes');
 } finally {await send('Fetch.disable');running=false;await pump;}
}
