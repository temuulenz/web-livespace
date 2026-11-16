// Local workerd + D1 + SQLite Durable Objects. No remote resources or credentials.
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { unstable_dev } from 'wrangler';
import WebSocket from 'ws';
import { runSimulator, simulatorOptions } from '../scripts/sensor-simulator.mjs';
import { startBrowser, delay } from './support/browser.mjs';
import { hashPassword } from '../cloudflare/core.mjs';
const dir=await mkdtemp(join(tmpdir(),'livespace-cf-'));
const cli=(...args)=>execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args,'--persist-to',dir],{stdio:'pipe',env:{...process.env,WRANGLER_SEND_METRICS:'false'}}).toString();
let worker,checks=0;
const check=(name,fn)=>Promise.resolve().then(fn).then(()=>{checks++;console.log('PASS',name);});
let cookie='';
let origin;
async function api(path,method='GET',value,authenticated=true) {
 const res=await fetch(origin+'/api/v1'+path,{method,headers:{...(value?{'Content-Type':'application/json'}:{}),...(authenticated&&cookie?{cookie}:{}),Origin:origin},...(value?{body:JSON.stringify(value)}:{})});
 const data=await res.json();return {res,data};
}
function socket(t){const ws=new WebSocket(origin.replace('http:','ws:')+'/ws/sensors',{headers:{Authorization:'Bearer '+t}});const queue=[],waiters=[];ws.on('message',x=>{const value=JSON.parse(x);if(waiters.length)waiters.shift()(value);else queue.push(value);});ws.on('unexpected-response',(_,res)=>console.error('WebSocket upgrade failed',res.statusCode));ws.on('error',e=>console.error('WebSocket error',e.message));return {ws,next:()=>queue.length?Promise.resolve(queue.shift()):Promise.race([new Promise(r=>waiters.push(r)),new Promise((_,r)=>setTimeout(()=>r(Error('WS timeout')),5000))])};}
try {
 cli('d1','migrations','apply','livespace','--local');console.log('PASS five local D1 migrations');
 cli('d1','execute','livespace','--local','--file','cloudflare/seed.sql');
 const adminSql=join(dir,'admin.sql'),h=await hashPassword('test-password-123');
 await writeFile(adminSql,`INSERT INTO users(id,email,password_hash,name,role,created_at) VALUES('admin','admin@test.mn','${h}','Admin','admin','${new Date().toISOString()}');`,{mode:0o600});
 cli('d1','execute','livespace','--local','--file',adminSql);
 worker=await unstable_dev('cloudflare/worker.mjs',{config:'wrangler.jsonc',port:0,local:true,persistTo:dir,logLevel:'error',experimental:{disableExperimentalWarning:true,watch:false,showInteractiveDevSession:false}});
 origin=`http://${worker.address}:${worker.port}`;
 await check('health, static allow-list and seeded catalog',async()=>{assert.equal((await api('/health')).data.ok,true);assert.equal((await api('/cafes')).data.cafes.length,12);assert.equal((await fetch(origin+'/server/lib/auth.mjs')).status,404);const page=await fetch(origin+'/');assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy') || '',/default-src 'self'/);});
 await check('auth rejects anonymous admin and cross-origin writes',async()=>{assert.equal((await api('/admin/devices')).res.status,401);assert.equal((await fetch(origin+'/api/v1/auth/login',{method:'POST',headers:{Origin:'https://evil.invalid','Content-Type':'application/json'},body:'{}'})).status,403);});
 await check('unchanged scrypt password login and session',async()=>{const {res,data}=await api('/auth/login','POST',{email:'admin@test.mn',password:'test-password-123'});assert.equal(res.status,200,JSON.stringify(data));cookie=res.headers.get('set-cookie').split(';')[0];assert.equal((await api('/auth/me')).data.user.role,'admin');});
 await check('Super Admin ID binding, administrator restrictions, recent auth and session revocation',async()=>{
  const regularCookie=cookie;
  const rootSql=join(dir,'root.sql');
  await writeFile(rootSql,`INSERT INTO users(id,email,password_hash,name,role,created_at) VALUES('root-id','temuulenbayarjargal@icloud.com','${h}','Root','admin','${new Date().toISOString()}'); INSERT INTO super_admin_identity(singleton,user_id,bound_at) VALUES(1,'root-id','${new Date().toISOString()}');`,{mode:0o600});
  cli('d1','execute','livespace','--local','--file',rootSql);
  const account={email:'managed-admin@test.mn',password:'managed-test-password-123',role:'admin'};
  assert.equal((await api('/admin/users','POST',account)).res.status,403);
  assert.equal((await api('/auth/register','POST',{email:'forge@test.mn',password:'test-password-123',is_super_admin:true},false)).res.status,422);
  assert.equal((await api('/auth/register','POST',{email:'TEMUULENBAYARJARGAL@ICLOUD.COM',password:'test-password-123'},false)).res.status,403);
  const login=await api('/auth/login','POST',{email:'temuulenbayarjargal@icloud.com',password:'test-password-123'});
  assert.equal(login.data.user.is_super_admin,true);cookie=login.res.headers.get('set-cookie').split(';')[0];const rootCookie=cookie;
  const created=await api('/admin/users','POST',account);assert.equal(created.res.status,201,JSON.stringify(created.data));const target=created.data.user.id;
  const targetLogin=await api('/auth/login','POST',{email:account.email,password:account.password});const targetCookie=targetLogin.res.headers.get('set-cookie').split(';')[0];
  cookie=regularCookie;
  for(const value of [{role:'user'},{disabled:true},{name:'Changed'}])assert.equal((await api('/admin/users/'+target,'PATCH',value)).res.status,403);
  assert.equal((await api('/admin/users/'+target+'/password','POST',{password:'changed-password-123'})).res.status,403);
  cookie=rootCookie;
  for(const value of [{role:'user'},{disabled:true}])assert.equal((await api('/admin/users/root-id','PATCH',value)).res.status,403);
  assert.equal((await api('/admin/users/root-id/password','POST',{password:'changed-password-123'})).res.status,403);
  cli('d1','execute','livespace','--local','--command',"UPDATE sessions SET authenticated_at='2000-01-01T00:00:00Z' WHERE user_id='root-id'");
  assert.equal((await api('/admin/users/'+target,'PATCH',{role:'owner'})).data.error.code,'recent_auth_required');
  assert.equal((await api('/auth/reauthenticate','POST',{password:'test-password-123'})).res.status,200);
  assert.equal((await api('/admin/users/'+target+'/password','POST',{password:'changed-password-123'})).res.status,200);
  cookie=targetCookie;assert.equal((await api('/auth/me')).res.status,401);
  cookie=rootCookie;
  assert.equal((await api('/admin/users/'+target,'PATCH',{role:'owner'})).res.status,200);
  assert.equal((await api('/admin/users/'+target,'PATCH',{disabled:true})).res.status,200);
  const events=(await api('/admin/audit')).data.events;
  assert.ok(events.some(e=>e.action==='super_admin.bind'));assert.ok(events.some(e=>e.action==='user.password_reset'));assert.ok(!JSON.stringify(events).includes('scrypt$'));
  cookie=regularCookie;
 });
 await check('registration, RBAC and favorites',async()=>{const x=await api('/auth/register','POST',{email:'user@test.mn',password:'test-password-123'});assert.equal(x.res.status,201);const adminCookie=cookie;cookie=x.res.headers.get('set-cookie').split(';')[0];assert.equal((await api('/admin/devices')).res.status,403);assert.deepEqual((await api('/me/favorites/A','PUT')).data.favorites,['A']);cookie=adminCookie;});
 await check('configure cafe and register simulated device',async()=>{assert.equal((await api('/admin/cafes/A','PATCH',{data_mode:'live',hours:'00:00–23:59'})).res.status,200);});
 const registered=await api('/admin/devices','POST',{id:'CF-SIM',cafe_id:'A',kind:'simulator',is_test:false});assert.equal(registered.res.status,201,JSON.stringify(registered.data));const t=registered.data.token;
 let s=socket(t);assert.equal((await s.next()).dataSource,'simulated');
 const frame={schemaVersion:1,type:'sensor.telemetry',messageId:'cf-message-1',deviceId:'CF-SIM',locationId:'A',timestamp:new Date().toISOString(),occupancy:{observedPeople:8,confidence:0.9},noise:{rms:0.01,dbfs:-40,estimatedDbSpl:null,calibrated:false},device:{batteryPercent:82,batteryTemperatureC:36.5,charging:true,inferenceMs:100,uptimeSeconds:10}};
 let ack;
 await check('durable ACK, private persistence and sanitized public projection',async()=>{s.ws.send(JSON.stringify(frame));ack=await s.next();assert.equal(ack.status,'accepted',JSON.stringify(ack));const records=(await api('/admin/measurements?device_id=CF-SIM')).data.measurements;assert.equal(records.length,1);assert.equal(records[0].observed_people,8);const c=(await api('/cafes/A')).data.cafe;assert.equal(c.live.sensor.observedPeople,8);assert.equal(c.live.sensor.dataSource,'simulated');assert.equal(c.occ,null);assert.equal(c.live.sensor.noise.estimatedDbSpl,null);assert.ok(!JSON.stringify(c).includes('batteryPercent'));});
 await check('duplicate is idempotent and altered replay rejected',async()=>{s.ws.send(JSON.stringify(frame));const x=await s.next();assert.equal(x.status,'duplicate');assert.equal(x.serverTimestamp,ack.serverTimestamp);s.ws.send(JSON.stringify({...frame,occupancy:{observedPeople:9}}));assert.equal((await s.next()).error.code,'message_id_conflict');assert.equal((await api('/admin/measurements?device_id=CF-SIM')).data.measurements.length,1);});
 await check('history aggregation and private diagnostics',async()=>{const pub=await api('/cafes/A/sensor-history?source=simulated');assert.equal(pub.res.status,200,JSON.stringify(pub.data));assert.equal(pub.data.readings[0].observedPeople,8);assert.equal(pub.data.aggregates[0].eligibleForForecast,false);const priv=await api('/admin/cafes/A/sensor-history?source=simulated');assert.equal(priv.data.readings[0].batteryPercent,82);});
 await check('reconnect replay survives connection replacement',async()=>{s.ws.close();await new Promise(r=>s.ws.once('close',r));await new Promise(r=>setTimeout(r,100));s=socket(t);await s.next();s.ws.send(JSON.stringify(frame));assert.equal((await s.next()).status,'duplicate');});
 await check('Cloudflare control ping/pong preserves telemetry timestamp and does not create readings',async()=>{
  const before=await api('/admin/devices');const lastSeen=before.data.devices.find(d=>d.id==='CF-SIM').last_seen_at;
  const count=(await api('/admin/measurements?device_id=CF-SIM')).data.measurements.length;
  const received=once(s.ws,'pong');s.ws.ping('android-30-second-heartbeat');assert.equal((await received)[0].toString(),'android-30-second-heartbeat');
  const after=await api('/admin/devices');assert.equal(after.data.devices.find(d=>d.id==='CF-SIM').last_seen_at,lastSeen);assert.equal((await api('/admin/measurements?device_id=CF-SIM')).data.measurements.length,count);
 });
 await check('strict validation and stale observation status',async()=>{
  s.ws.send(JSON.stringify({...frame,messageId:'invalid',extra:'not allowed'}));assert.equal((await s.next()).error.code,'validation_failed');
  s.ws.send(JSON.stringify({...frame,messageId:'stale',timestamp:new Date(Date.now()-45000).toISOString()}));assert.equal((await s.next()).status,'accepted');
  assert.equal((await api('/cafes/A')).data.cafe.live.sensor.status,'online'); // newest observation still wins
 });
 await check('worker restart retains replay receipts',async()=>{
  s.ws.close();await new Promise(r=>s.ws.once('close',r));await worker.stop();
  worker=await unstable_dev('cloudflare/worker.mjs',{config:'wrangler.jsonc',port:0,local:true,persistTo:dir,logLevel:'error',experimental:{disableExperimentalWarning:true,watch:false,showInteractiveDevSession:false}});
  origin=`http://${worker.address}:${worker.port}`;s=socket(t);await s.next();s.ws.send(JSON.stringify(frame));assert.equal((await s.next()).status,'duplicate');
 });
 await check('disable invalidates an established connection',async()=>{await api('/admin/devices/CF-SIM','PATCH',{enabled:false});s.ws.send(JSON.stringify({...frame,messageId:'disabled'}));assert.equal((await s.next()).error.code,'device_assignment_changed');});
 await check('stale and disconnected statuses use observation/connection state',async()=>{
  const d=await api('/admin/devices','POST',{id:'CF-STALE',cafe_id:'A',kind:'simulator'});const stale=socket(d.data.token);await stale.next();stale.ws.send(JSON.stringify({...frame,deviceId:'CF-STALE',messageId:'old-observation',timestamp:new Date(Date.now()-45000).toISOString()}));assert.equal((await stale.next()).status,'accepted');assert.equal((await api('/admin/devices')).data.devices.find(x=>x.id==='CF-STALE').status,'stale');stale.ws.close();await new Promise(r=>stale.ws.once('close',r));let offline=false;for(let i=0;i<20;i++){offline=(await api('/admin/devices')).data.devices.find(x=>x.id==='CF-STALE').status==='offline';if(offline)break;await delay(50);}assert.ok(offline);
 });
 await check('real registration rejects simulated source, rotation and revocation',async()=>{
  const d=await api('/admin/devices','POST',{id:'CF-REAL',cafe_id:'A',kind:'sensor'});assert.equal(d.res.status,201);
  let real=socket(d.data.token);assert.equal((await real.next()).dataSource,'real');
  real.ws.send(JSON.stringify({...frame,deviceId:'CF-REAL',messageId:'not-real',dataSource:'simulated'}));assert.equal((await real.next()).error.code,'simulation_not_allowed');
  await new Promise(r=>real.ws.once('close',r));await api('/admin/devices/CF-REAL/token','POST');
  assert.equal((await fetch(origin+'/ws/sensors',{headers:{Authorization:'Bearer '+d.data.token}})).status,401);
  await api('/admin/devices/CF-REAL','DELETE');assert.equal((await api('/admin/devices')).data.devices.find(x=>x.id==='CF-REAL').status,'disabled');
 });
 await check('legacy HTTP ingestion preserves source separation',async()=>{
  const d=await api('/admin/devices','POST',{id:'CF-HTTP',cafe_id:'A',kind:'simulator'});
  const r=await fetch(origin+'/api/v1/ingest/measurements',{method:'POST',headers:{Authorization:'Bearer '+d.data.token,'Content-Type':'application/json'},body:JSON.stringify({schema_version:'1.0',cafe_id:'A',device_id:'CF-HTTP',timestamp:new Date().toISOString(),measurements:{noise_level_db:45}})});
  assert.equal(r.status,202,await r.text());assert.equal((await api('/admin/measurements?device_id=CF-HTTP')).data.measurements[0].data_source,'simulated');
 });
 await check('D1 failure never ACKs or partially stores a reading',async()=>{
  const d=await api('/admin/devices','POST',{id:'CF-FAIL',cafe_id:'A',kind:'simulator'});const failSocket=socket(d.data.token);await failSocket.next();
  cli('d1','execute','livespace','--local','--command',"CREATE TRIGGER reject_test_frame BEFORE INSERT ON measurements WHEN NEW.message_id='storage-fail' BEGIN SELECT RAISE(ABORT,'test failure'); END;");
  failSocket.ws.send(JSON.stringify({...frame,deviceId:'CF-FAIL',messageId:'storage-fail',timestamp:new Date().toISOString()}));assert.equal((await failSocket.next()).error.code,'storage_failed');assert.equal((await api('/admin/measurements?device_id=CF-FAIL')).data.measurements.length,0);
  cli('d1','execute','livespace','--local','--command','DROP TRIGGER reject_test_frame');
  failSocket.ws.send(JSON.stringify({...frame,deviceId:'CF-FAIL',messageId:'storage-fail',timestamp:new Date().toISOString()}));assert.equal((await failSocket.next()).status,'accepted');failSocket.ws.close();
 });
 await check('partner photos, owner claim and scoped private photo access',async()=>{
  const pic='data:image/png;base64,iVBORw0KGgo=';
  const response=await api('/applications','POST',{cafe_name:'CF Cafe',contact_name:'Owner',phone:'88000000',email:'owner@test.mn',district:'Сүхбаатар',category:'Кафе',address:'Test address',hours:'00:00–23:59',description:'Test cafe',photos:[pic,pic,pic]},false);
  assert.equal(response.res.status,201,JSON.stringify(response.data));
  const owner=await api('/auth/register-owner','POST',{claim_token:response.data.claim_token,email:'owner@test.mn',password:'owner-password-123'},false);assert.equal(owner.res.status,201,JSON.stringify(owner.data));
  const savedCookie=cookie;cookie=owner.res.headers.get('set-cookie').split(';')[0];
  const owned=await api('/owner/cafes');assert.equal(owned.data.cafes.length,1);assert.equal((await api('/owner/cafes/A/sensor-history')).res.status,404);
  const url=owned.data.cafes[0].application.photos[0].url;assert.equal((await fetch(origin+url,{headers:{cookie}})).status,200);assert.equal((await fetch(origin+url)).status,401);cookie=savedCookie;
 });
 await check('CLI simulator with replay and production-mode browser polling',async()=>{
  const device=await api('/admin/devices','POST',{id:'CF-CLI',cafe_id:'A',kind:'simulator'});assert.equal(device.res.status,201);
  await runSimulator(simulatorOptions(['--url',origin.replace('http:','ws:')+'/ws/sensors','--device','CF-CLI','--location','A','--count','2','--interval','30','--people','12','--duplicate-every','1'],{LS_SENSOR_TOKEN:device.data.token}),{log:()=>{}});
  assert.equal((await api('/cafes/A')).data.cafe.live.sensor.observedPeople,12);
  if(process.env.BROWSER_PATH) {
   const browser=await startBrowser();
   try {
    await browser.send('Page.navigate',{url:origin+'/#cafe-A'});
    let ready=false;for(let i=0;i<200;i++){await delay(50);ready=await browser.evaluate(`document.documentElement?.classList.contains('ls-online') && document.querySelector('#publicSensor [data-observed-people]')?.textContent === '—' && !!document.querySelector('canvas')`);if(ready)break;}assert.ok(ready,'Cloudflare frontend did not show unknown offline occupancy');
    await browser.evaluate(`window.__cloudflareCanvas = document.querySelector('canvas'); true`);
    const config=await browser.evaluate(`import('/js/services/platform.js').then(m=>({status:m.platform.liveStatus,stream:m.platform.config.stream_enabled}))`);assert.deepEqual(config,{status:'polling',stream:false});
    const frame2={...frame,deviceId:'CF-CLI',messageId:'poll-update',timestamp:new Date().toISOString(),occupancy:{observedPeople:17}};
    const live=socket(device.data.token);await live.next();live.ws.send(JSON.stringify(frame2));assert.equal((await live.next()).status,'accepted');
    let updated=false;for(let i=0;i<260;i++){await delay(50);updated=await browser.evaluate(`document.querySelector('#publicSensor [data-observed-people]')?.textContent === '17'`);if(updated)break;}assert.ok(updated,'Polling failed to update browser');assert.equal(await browser.evaluate(`window.__cloudflareCanvas === document.querySelector('canvas')`),true);
    assert.equal(await browser.evaluate(`document.querySelector('[data-live-dbfs]').textContent`),'-40.0');live.ws.close();
    const realDevice=await api('/admin/devices','POST',{id:'CF-PUBLIC-REAL',cafe_id:'A',kind:'sensor'});
    const real=socket(realDevice.data.token);await real.next();
    try {
     for(const count of [0,5,2,0]) {
      real.ws.send(JSON.stringify({...frame,deviceId:'CF-PUBLIC-REAL',messageId:'real-poll-'+count+'-'+Date.now(),timestamp:new Date().toISOString(),occupancy:{observedPeople:count},noise:{dbfs:count===5?-25:-48,calibrated:false}}));
      assert.equal((await real.next()).status,'accepted');
      let synced=false;for(let i=0;i<260;i++){await delay(50);synced=await browser.evaluate(`document.querySelector('[data-plan-reliability]')?.textContent.includes('Ажиглагдсан хүмүүс: ${count}.') && document.querySelector('#publicSensor [data-observed-people]')?.textContent === '${count}'`);if(synced)break;}
      assert.ok(synced,'Real count did not reach Cloudflare polling visualization');
      assert.equal(await browser.evaluate(`document.querySelector('#addG').disabled && window.__cloudflareCanvas === document.querySelector('canvas')`),true);
      assert.equal(await browser.evaluate(`document.querySelector('[data-live-dbfs]').textContent`),count===5?'-25.0':'-48.0');
     }
    } finally {real.ws.close();}
   } finally {await browser.close();}
  }
 });
 console.log(`${checks} Cloudflare checks passed`);
} finally {if(worker)await worker.stop();await rm(dir,{recursive:true,force:true});}
