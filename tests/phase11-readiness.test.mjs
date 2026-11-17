import {createMenuStorage,menuImageEtag} from '../cloudflare/menu-media-storage.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {operationalLog,readiness,routeGroup} from '../shared/operations.mjs';
import {startServer} from './support/server.mjs';
import {businessFixture,fail,id} from './support/business.mjs';
import {createResources,createRuntimeMetrics} from '../shared/business/resources.mjs';
import {phase11Config} from '../shared/business/phase11-config.mjs';

test('readiness checks required schema without leaking dependency details',async()=>{
 const f=businessFixture();try{assert.deepEqual(await readiness(f.sql),{ready:true,api:'1'});assert.equal((await readiness(f.sql,false)).ready,false);f.db.exec('DROP TRIGGER notify_review');assert.deepEqual(await readiness(f.sql),{ready:false,api:'1'});assert.deepEqual(await readiness({first(){throw Error('token-private-sql');}}),{ready:false,api:'1'});}finally{f.db.close();}
});
test('Node readiness fails closed, liveness stays compatible and request IDs cannot be injected',async()=>{
 const logs=[],s=await startServer({requestLogs:true,logSink:line=>logs.push(line)});try{
  const client=s.client();
  // Also exercise a syntactically valid hostile incoming header; it is ignored.
  const good=await client.get('/api/v1/ready',{'X-Request-ID':'private-token-cookie'});assert.equal(good.status,200);assert.match(good.headers.get('x-request-id'),/^[a-f0-9-]{36}$/);assert.equal(good.headers.get('cache-control'),'no-store');
  s.app.deps.db.exec('DROP TRIGGER notify_review');const bad=await client.get('/api/v1/ready');assert.equal(bad.status,503);assert.deepEqual(bad.data,{ready:false,api:'1'});assert.equal((await client.get('/api/v1/health')).status,200);
  await client.get('/api/v1/cafes/private-identifier?token=private-query');assert.ok(logs.length>=4);assert.ok(!logs.join('').includes('private-'));assert.ok(logs.some(line=>JSON.parse(line).request_id===bad.headers.get('x-request-id')));
  for(let i=0;i<28;i++)assert.equal((await client.get('/api/v1/ready')).status,503);assert.equal((await client.get('/api/v1/ready')).status,429);
 }finally{await s.stop();}
});
test('operational logs are fixed-schema and never serialize errors, tokens, paths or identities',()=>{
 const logs=[];const e=operationalLog('http_request',{request_id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',status:503,duration_ms:1.234,runtime:'node',route:'other',error:Error('password'),authorization:'token',cookie:'private',path:'/users/private'},l=>logs.push(l));assert.deepEqual(Object.keys(e).sort(),['timestamp','event','request_id','status','duration_ms','runtime','route'].sort());assert.ok(!logs[0].includes('password'));assert.ok(!logs[0].includes('private'));assert.equal(routeGroup('/api/v1/cafes/private-secret?token=secret'),'cafes');assert.equal(routeGroup('/unknown-private'),'other');assert.throws(()=>operationalLog('secret',{},()=>{}));
});
test('operational metrics expose job freshness, scoped queue age and local analytics day',async()=>{
 const f=businessFixture(),metrics=createRuntimeMetrics();try{
  metrics.record(null,500,1);metrics.record(null,400,1);assert.equal(metrics.snapshot().api.server_errors,1);assert.equal(metrics.snapshot().api.errors,2);
  metrics.job();metrics.job(true);assert.ok(metrics.snapshot().background.last_success_at);assert.ok(metrics.snapshot().background.last_failure_at);
  const clock=()=> '2026-11-17T18:00:00.000Z';
  f.db.prepare("INSERT INTO analytics_dimensions VALUES('a','2026-11-17T17:00:00.000Z','cafe_view','','',7,7,'2026-11-17T17:00:00.000Z')").run();
  f.db.prepare("INSERT INTO analytics_dimensions VALUES('a','2026-11-17T15:00:00.000Z','cafe_view','','',11,11,'2026-11-17T15:00:00.000Z')").run();
  f.db.prepare("INSERT INTO notification_outbox VALUES('age','a','inventory','stock',NULL,'2026-11-17T17:59:00.000Z','2026-11-17T17:59:00.000Z',NULL,0)").run();
  const resource=createResources({...f,fail,id,metrics,clock,options:phase11Config()});const own=await resource.read('a',f.owner);assert.equal(own.application_measured.analytics_flushed_events_today,7);assert.equal(own.application_measured.notification_overdue_seconds,60);assert.equal((await resource.read('b',f.other)).application_measured.notification_overdue_seconds,0);assert.equal(own.runtime.background.status,'unavailable_tenant_attribution');
 }finally{f.db.close();}
});

test('a failed optional Node collector cannot suppress inbox/resource maintenance or leak its error',async()=>{
 const logs=[],s=await startServer({logSink:line=>logs.push(line)});try{
  let core=0;s.app.deps.behavior.maintenance=async()=>{throw Error('private-sql-token-path');};s.app.deps.phase11.maintenance=async()=>{core++;};
  await s.app.deps.runMaintenance();assert.equal(core,1);assert.ok(logs.some(line=>JSON.parse(line).job==='analytics_flush'));assert.ok(!logs.join('').includes('private-sql-token-path'));
  const client=s.client();await client.post('/api/v1/auth/login',{email:'admin@livespace.test',password:'admin-password-123'});const monitor=await client.get('/api/v1/admin/resources/monitor');assert.equal(monitor.status,200);assert.equal(monitor.data.runtime.background.failures,1);assert.ok(monitor.data.runtime.background.last_failure_at);
 }finally{await s.stop();}
});

test('D1 menu media converts returned binary arrays to an exact HTTP binary body',async()=>{
 assert.notEqual(menuImageEtag({sha256:'hash'}),'"hash"');assert.equal(menuImageEtag({object_key:'r2',sha256:'hash'}),'"hash"');
 const storage=createMenuStorage({});const expected=Uint8Array.of(255,216,0,128,255,217);
 for(const data of [Array.from(expected),expected.buffer,expected]){
  const bytes=await storage.read({bytes:data,size:expected.length});assert.ok(bytes instanceof Uint8Array);assert.deepEqual(new Uint8Array(await new Response(bytes).arrayBuffer()),expected);
 }
});
test('D1 menu media fails unavailable rather than serving absent or truncated bytes',async()=>{
 const storage=createMenuStorage({});await assert.rejects(storage.read({bytes:null,size:4}),e=>e.status===503&&e.code==='media_unavailable');await assert.rejects(storage.read({bytes:[1],size:4}),e=>e.status===503&&e.code==='media_unavailable');
});

test('resource notification cooldown separates platform from a cafe literally named platform',async()=>{
 const f=businessFixture();let time=Date.now();try{
  f.db.prepare("INSERT INTO cafes(id,name,owner_id,status,data_mode,created_at,updated_at) VALUES('platform','SIMULATED platform cafe','owner','active','demo','2026-01-01','2026-01-01')").run();
  for(const [event,cafe] of [['resource:platform:media_bytes:1:1',null],['resource:cafe:platform:media_bytes:1:1','platform']])f.db.prepare("INSERT INTO notification_outbox VALUES(?,?,'resource','media_bytes',NULL,?,?,NULL,0)").run(event,cafe,new Date(time).toISOString(),new Date(time).toISOString());
  const {createNotifications}=await import('../shared/business/notifications.mjs');const notices=createNotifications({...f,fail,id,options:phase11Config(),clock:()=>new Date(time).toISOString()});
  for(let i=0;i<8;i++){time+=2000;await notices.maintenance();}
  const delivered=(await notices.list({},f.admin)).items;assert.equal(delivered.length,2);assert.deepEqual(new Set(delivered.map(row=>row.cafe_id)),new Set([null,'platform']));
 }finally{f.db.close();}
});

test('nested native transactions join the outer durable commit and roll back together on the minimum runtime',async()=>{
 const {openDatabase,transaction}=await import('../server/lib/db.mjs');const db=openDatabase(':memory:');try{
  db.exec('CREATE TABLE nested_probe(id INTEGER PRIMARY KEY)');
  assert.throws(()=>transaction(db,()=>{db.prepare('INSERT INTO nested_probe VALUES(1)').run();transaction(db,()=>db.prepare('INSERT INTO nested_probe VALUES(2)').run());throw Error('outer failure');}),/outer failure/);assert.equal(db.prepare('SELECT count(*) n FROM nested_probe').get().n,0);
  transaction(db,()=>{db.prepare('INSERT INTO nested_probe VALUES(1)').run();transaction(db,()=>db.prepare('INSERT INTO nested_probe VALUES(2)').run());});assert.equal(db.prepare('SELECT count(*) n FROM nested_probe').get().n,2);
 }finally{db.close();}
});
