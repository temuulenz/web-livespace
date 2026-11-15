// Authorized production smoke test. Reads private admin.json, never logs credentials.
// Creates/reuses two explicitly named devices and sends only SIMULATED telemetry.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { startHeartbeat } from './lib/ws-heartbeat.mjs';
const origin='https://livespace.temuulenbayarjargal.workers.dev';
const folder=resolve(process.argv[2] || '.artifacts/production-secrets');
const credentials=JSON.parse(await readFile(join(folder,'admin.json'),'utf8'));
let cookie='',socket,stopHeartbeat;
const results=[];
const record=name=>{results.push(name);console.log('PASS '+name);};
async function api(path,method='GET',value,auth=true){const res=await fetch(origin+'/api/v1'+path,{method,headers:{Origin:origin,...(value?{'Content-Type':'application/json'}:{}),...(auth&&cookie?{cookie}:{})},...(value?{body:JSON.stringify(value)}:{})});const data=await res.json();if(!res.ok)throw new Error(`API verification failed: ${method} ${path} HTTP ${res.status}`);return {res,data};}
async function register(deviceId,kind){
 const devices=(await api('/admin/devices')).data.devices;const existing=devices.find(d=>d.id===deviceId);
 const file=join(folder,deviceId+'.token');
 if(existing){assert.equal(existing.cafe_id,'I');assert.equal(existing.kind,kind);assert.equal(existing.enabled,true);assert.equal(existing.is_test,kind==='simulator');if(kind==='sensor')return null;return (await readFile(file,'utf8')).trim();}
 const {data}=await api('/admin/devices','POST',{id:deviceId,cafe_id:'I',kind,is_test:kind==='simulator'});
 await writeFile(file,data.token+'\n',{mode:0o600,flag:'wx'});return data.token;
}
async function connect(token){const ws=new WebSocket(origin.replace('https:','wss:')+'/ws/sensors',{headers:{Authorization:'Bearer '+token},perMessageDeflate:false});const queue=[],waiting=[];ws.on('error',()=>{});ws.on('message',x=>{const data=JSON.parse(x);waiting.length?waiting.shift()(data):queue.push(data);});const next=()=>queue.length?Promise.resolve(queue.shift()):new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Sensor response timeout')),10000);waiting.push(x=>{clearTimeout(timer);resolve(x);});});assert.equal((await next()).type,'sensor.ready');return {ws,next};}
try {
 assert.equal((await api('/health','GET',undefined,false)).data.ok,true);assert.equal((await fetch(origin+'/')).status,200);record('public HTTPS and health');
 const login=await api('/auth/login','POST',credentials,false);cookie=login.res.headers.get('set-cookie').split(';')[0];assert.equal(login.data.user.role,'admin');await api('/admin/overview');record('production authentication and admin authorization');
 assert.equal((await fetch(origin+'/api/v1/admin/devices')).status,401);
 assert.equal((await fetch(origin+'/api/v1/auth/login',{method:'POST',headers:{Origin:'https://invalid.example','Content-Type':'application/json'},body:'{}'})).status,403);
 await new Promise((resolve,reject)=>{const ws=new WebSocket(origin.replace('https:','wss:')+'/ws/sensors',{headers:{Authorization:'Bearer lsd_invalid_production_probe'}});const timer=setTimeout(()=>{ws.terminate();reject(Error('Unauthorized upgrade timeout'));},10000);ws.on('error',()=>{});ws.on('unexpected-response',(_,res)=>{clearTimeout(timer);res.resume();ws.terminate();if(res.statusCode===401)resolve();else reject(Error('Unauthorized sensor upgrade was not rejected'));});ws.on('open',()=>{clearTimeout(timer);ws.terminate();reject(Error('Unauthorized sensor connected'));});});record('anonymous admin, cross-origin write and invalid WSS token rejected');
 const cafe=(await api('/admin/cafes/I')).data.cafe;if(cafe.data_mode!=='live')await api('/admin/cafes/I','PATCH',{data_mode:'live'});
 await register('LS-NOTE4-001','sensor');record('physical registration LS-NOTE4-001 / I (token kept private if newly issued)');
 const token=await register('LS-SIM-DEMO-001','simulator');let connection=await connect(token);socket=connection.ws;record('authenticated WSS');
 const frame={schemaVersion:1,type:'sensor.telemetry',messageId:randomUUID(),deviceId:'LS-SIM-DEMO-001',locationId:'I',timestamp:new Date().toISOString(),dataSource:'simulated',occupancy:{observedPeople:8,confidence:0.87},noise:{rms:0.014,dbfs:-37.1,estimatedDbSpl:null,calibrated:false},device:{batteryPercent:85,batteryTemperatureC:36.5,charging:true,inferenceMs:1200,uptimeSeconds:10}};
 socket.send(JSON.stringify(frame));const ack=await connection.next();assert.equal(ack.status,'accepted');
 const persisted=(await api('/admin/measurements?device_id=LS-SIM-DEMO-001')).data.measurements;assert.ok(persisted.some(x=>x.message_id===frame.messageId));record('ACK followed by verified D1 persistence');
 socket.send(JSON.stringify(frame));const duplicate=await connection.next();assert.equal(duplicate.status,'duplicate');assert.equal(duplicate.serverTimestamp,ack.serverTimestamp);record('idempotent duplicate ACK');
 const seen=(await api('/admin/devices')).data.devices.find(d=>d.id==='LS-SIM-DEMO-001').last_seen_at;
 console.log('Checking the recommended 30-second control heartbeat…');const pong=once(socket,'pong');stopHeartbeat=startHeartbeat(socket);await Promise.race([pong,new Promise((_,r)=>setTimeout(()=>r(Error('Production pong timeout')),40000))]);stopHeartbeat();
 assert.equal((await api('/admin/devices')).data.devices.find(d=>d.id==='LS-SIM-DEMO-001').last_seen_at,seen);record('30-second protocol pong without telemetry refresh');
 const closed=once(socket,'close');socket.close();await closed;await new Promise(r=>setTimeout(r,500));connection=await connect(token);socket=connection.ws;socket.send(JSON.stringify(frame));assert.equal((await connection.next()).status,'duplicate');record('reconnect/replay');
 const history=(await api('/cafes/I/sensor-history?source=simulated')).data;assert.ok(history.readings.some(r=>r.timestamp===frame.timestamp && r.observedPeople===8));record('source-separated public history');
 const publicCafe=(await api('/cafes/I')).data.cafe;assert.ok(publicCafe.live.sensor);if(publicCafe.live.sensor.dataSource==='simulated')assert.equal(publicCafe.live.sensor.noise.estimatedDbSpl,null);assert.ok(!JSON.stringify(publicCafe).includes('batteryPercent'));record('sanitized public sensor summary');
 if(process.env.BROWSER_PATH && publicCafe.live.sensor.dataSource==='simulated'){
  const {startBrowser,delay}=await import('../tests/support/browser.mjs');const browser=await startBrowser();
  try{
   await browser.send('Network.setBlockedURLs',{urls:['https://fonts.googleapis.com/*','https://fonts.gstatic.com/*']});
   const navigationStart=browser.events.length;await browser.send('Page.navigate',{url:origin+'/#cafe-I'});
   for(let i=0;i<300 && !browser.events.slice(navigationStart).some(e=>e.method==='Page.loadEventFired');i++)await delay(50);
   let ready=false;for(let i=0;i<200;i++){await delay(50);ready=await browser.evaluate(`!!document.querySelector('#publicSensor [data-observed-people]')`);if(ready)break;}assert.ok(ready);
   const next={...frame,messageId:randomUUID(),timestamp:new Date().toISOString(),occupancy:{observedPeople:11,confidence:0.87}};socket.send(JSON.stringify(next));assert.equal((await connection.next()).status,'accepted');let updated=false;for(let i=0;i<300;i++){await delay(50);updated=await browser.evaluate(`document.querySelector('#publicSensor [data-observed-people]')?.textContent==='11'`);if(updated)break;}assert.ok(updated);record('automatic native browser polling update');
  }finally{await browser.close();}
 }
 await writeFile('.artifacts/production-verification.json',JSON.stringify({origin,verifiedAt:new Date().toISOString(),results},null,2));
 console.log('Production checks complete. Credentials and one-time tokens remain in the private bootstrap directory.');
}finally{stopHeartbeat?.();if(socket && socket.readyState!==WebSocket.CLOSED)socket.terminate();}
