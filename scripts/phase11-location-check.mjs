// Browser policy validation with injected synthetic coordinates only; no real GPS.
import assert from 'node:assert/strict';import {createServer} from 'node:http';import {mkdir,writeFile} from 'node:fs/promises';
import {startBrowser,delay} from '../tests/support/browser.mjs';import {startServer} from '../tests/support/server.mjs';
const app=await startServer({seedDemo:false}),browser=await startBrowser(),control=createServer((_,res)=>{res.writeHead(200,{'Content-Type':'text/html','Permissions-Policy':'geolocation=()'});res.end('<!doctype html><title>Synthetic policy control</title>');});
try{
 await new Promise(resolve=>control.listen(0,'127.0.0.1',resolve));const denyOrigin='http://127.0.0.1:'+control.address().port;
 await browser.send('Network.setBlockedURLs',{urls:['https://fonts.googleapis.com/*','https://fonts.gstatic.com/*']});
 await browser.send('Emulation.setGeolocationOverride',{latitude:47.918,longitude:106.917,accuracy:1});
 async function position(origin){
  await browser.send('Browser.grantPermissions',{origin,permissions:['geolocation']});await browser.send('Page.navigate',{url:origin+'/'});
  let ready=false;for(let i=0;i<100;i++){if(await browser.evaluate(`location.origin===${JSON.stringify(origin)}&&document.readyState==='complete'`)){ready=true;break;}await delay(50);}assert.ok(ready);
  return browser.evaluate(`new Promise(resolve=>navigator.geolocation.getCurrentPosition(p=>resolve({ok:true,synthetic:p.coords.latitude===47.918&&p.coords.longitude===106.917}),e=>resolve({ok:false,code:e.code}),{timeout:3000,maximumAge:0}))`);
 }
 const allowed=await position(app.origin);assert.deepEqual(allowed,{ok:true,synthetic:true});const denied=await position(denyOrigin);assert.equal(denied.ok,false);assert.equal(denied.code,1);
 const requests=browser.events.filter(e=>e.method==='Network.requestWillBeSent').map(e=>e.params.request);assert.ok(requests.every(r=>![r.url,r.postData||''].some(text=>text.includes('47.918')||text.includes('106.917'))));
 const report={scope:'local_headless_browser_synthetic_position_not_hardware_or_map_GL',same_origin_policy_allows_consented_synthetic_location:true,denied_policy_control_rejects:true,synthetic_coordinates_not_sent_in_observed_requests:true,hardware_GL_and_real_GPS:'unverified'};
 await mkdir('.artifacts',{recursive:true});await writeFile('.artifacts/phase11-location-policy.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await app.stop();await new Promise(resolve=>control.close(resolve));}
