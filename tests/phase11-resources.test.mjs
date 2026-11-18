import {test} from 'node:test';
import assert from 'node:assert/strict';
import {businessFixture,fail,id} from './support/business.mjs';
import {createResources,createRuntimeMetrics,protectRequest} from '../shared/business/resources.mjs';
import {phase11Config} from '../shared/business/phase11-config.mjs';
import {createNotifications} from '../shared/business/notifications.mjs';
const options=phase11Config();
test('resource measurements are scoped, distinguish billing and deduplicate threshold incidents',async()=>{
 const f=businessFixture(),metrics=createRuntimeMetrics();let time=Date.now();const clock=()=>new Date(time).toISOString();
 const resource=createResources({sql:f.sql,fail,id,options,metrics,clock}),n=createNotifications({sql:f.sql,fail,id,options,clock});
 try{
  metrics.record('a',200,10);metrics.record('b',429,20);metrics.db(2);metrics.job(true);
  const a=await resource.read('a',f.owner);assert.equal(a.runtime.api.requests,1);assert.equal(a.runtime.api.errors,0);assert.equal(a.provider_billing.status,'unavailable');assert.equal(a.runtime.database.status,'unavailable_tenant_attribution');
  assert.equal((await resource.read(null,f.admin)).runtime.api.requests,2);await assert.rejects(resource.read('a',f.other),e=>e.status===404);await assert.rejects(resource.read(null,f.owner),e=>e.status===403);
  f.db.prepare('INSERT INTO menu_tenant_usage(cafe_id,image_bytes) VALUES(?,?)').run('a',Math.ceil(options.tenantMediaBytes*.75));
  await resource.evaluate('a');await resource.evaluate('a');assert.equal(f.db.prepare("SELECT count(*) n FROM notification_outbox WHERE category='resource'").get().n,1);
  f.db.prepare("UPDATE menu_tenant_usage SET image_bytes=? WHERE cafe_id='a'").run(Math.ceil(options.tenantMediaBytes*.95));await resource.evaluate('a');assert.equal(f.db.prepare("SELECT count(*) n FROM notification_outbox WHERE category='resource'").get().n,2);
  for(let i=0;i<8;i++){time+=2000;await n.maintenance();}assert.ok((await n.list({},f.admin)).items.some(x=>x.category==='resource'));
  await assert.rejects(resource.controls('a',{analytics_paused:true},f.owner),e=>e.status===403);await resource.controls('a',{analytics_paused:true},f.admin);assert.equal((await resource.read('a',f.owner)).controls.analytics_paused,1);
 }finally{f.db.close();}
});
test('configurable API admission preserves sensor and security endpoints',()=>{
 const calls=[],limit=(...a)=>calls.push(a);protectRequest('/api/v1/cafes/a/menu',null,'anonymous',limit,options);assert.equal(calls.length,2);assert.equal(calls[0][1],options.apiAnonymous);
 protectRequest('/api/v1/ingest/measurements',null,'anonymous',limit,options);protectRequest('/api/v1/auth/logout',{id:'u'},'client',limit,options);assert.equal(calls.length,2);
 assert.throws(()=>phase11Config({LS_RESOURCE_WARNING_PERCENT:'95',LS_RESOURCE_CRITICAL_PERCENT:'90'}));
});
test('Node analytics HTTP uses anonymous session cookies, rejects metadata and protects reports/inboxes',async()=>{
 const {startServer}=await import('./support/server.mjs');const server=await startServer({seedDemo:false,phase11:{...options,analyticsEnabled:true,cohort:3}});
 try{
  const owner=server.client(),other=server.client();const user=(await owner.post('/api/v1/auth/register',{email:'insight-owner@example.invalid',password:'local-password-123'})).data.user;
  server.app.deps.db.prepare("UPDATE users SET role='owner' WHERE id=?").run(user.id);
  server.app.deps.db.prepare("INSERT INTO cafes(id,name,owner_id,status,data_mode,created_at,updated_at) VALUES('http-insight','Cafe',?,'active','demo','2026-01-01','2026-01-01')").run(user.id);
  for(let i=0;i<3;i++){
   const anon=server.client();const session=await anon.post('/api/v1/analytics/session',{});assert.equal(session.status,200);assert.match(session.headers.get('set-cookie'),/HttpOnly/);
   const value={schemaVersion:2,cafeId:'http-insight',events:[{id:'http-event-'+i,type:'cafe_view'}]};assert.equal((await anon.post('/api/v1/analytics/events',value)).status,202);assert.equal((await anon.post('/api/v1/analytics/events',value)).data.duplicates,1);
   assert.equal((await anon.post('/api/v1/analytics/events',{...value,events:[{id:'bad-event-id',type:'cafe_view',ip:'private'}]})).status,422);
  }
  assert.equal((await other.get('/api/v1/owner/cafes/http-insight/analytics')).status,401);
  const report=await owner.get('/api/v1/owner/cafes/http-insight/analytics');assert.equal(report.status,200,JSON.stringify(report.data));assert.equal(report.data.current.unique_sessions,3);assert.equal(report.data.current.behavior[0].count,3);
  assert.equal((await owner.get('/api/v1/admin/resources/monitor')).status,403);assert.equal((await other.get('/api/v1/me/notifications')).status,401);
  assert.equal((await owner.get('/api/v1/owner/cafes/http-insight/resources')).status,200);
 }finally{await server.stop();}
});

test('configured media fences account for the current insert and preserve existing content',()=>{
 const f=businessFixture();try{
  f.db.prepare("UPDATE application_limits SET value=1024 WHERE key='tenant_media_bytes'").run();
  const insert=f.db.prepare("INSERT INTO menu_images(id,cafe_id,mime,size,sha256,created_at) VALUES(?,'a','image/jpeg',800,?,'2026-11-17')");
  insert.run('first','hash1');assert.throws(()=>insert.run('second','hash2'),/media_configured_limit/);assert.equal(f.db.prepare("SELECT image_bytes FROM menu_tenant_usage WHERE cafe_id='a'").get().image_bytes,800);assert.equal(f.db.prepare('SELECT count(*) n FROM menu_images').get().n,1);
 }finally{f.db.close();}
});

test('E-H shared additive schemas match all D1 migrations',async()=>{
 const {readFileSync}=await import('node:fs');for(const [file,name,migration] of [['behavior-schema.mjs','BEHAVIOR_SCHEMA','0014_behavior.sql'],['notifications-schema.mjs','NOTIFICATIONS_SCHEMA','0015_notifications.sql'],['resources-schema.mjs','RESOURCES_SCHEMA','0016_resources.sql']]){const module=await import('../shared/business/'+file);assert.equal(readFileSync(new URL('../cloudflare/migrations/'+migration,import.meta.url),'utf8'),module[name]);}
});

test('reserved platform scope cannot collide with a cafe and warnings never coalesce across tenants',async()=>{
 const f=businessFixture();let time=Date.now();const clock=()=>new Date(time).toISOString(),resource=createResources({sql:f.sql,fail,id,options,clock}),n=createNotifications({sql:f.sql,fail,id,options,clock});
 try{
  f.db.prepare("INSERT INTO cafes(id,name,owner_id,status,data_mode,created_at,updated_at) VALUES('platform','Reserved-name fixture','owner','active','demo','2026-01-01','2026-01-01')").run();
  await resource.controls('platform',{analytics_paused:true},f.admin);assert.equal((await resource.read(null,f.admin)).controls.analytics_paused,0);assert.equal((await resource.read('platform',f.owner)).controls.analytics_paused,1);
  for(const cafe of ['a','b']){f.db.prepare('INSERT INTO menu_tenant_usage(cafe_id,image_bytes) VALUES(?,?)').run(cafe,Math.ceil(options.tenantMediaBytes*.75));await resource.evaluate(cafe);}
  for(let i=0;i<12;i++){time+=2000;await n.maintenance();}
  const alerts=(await n.list({},f.admin)).items.filter(x=>x.category==='resource');assert.equal(alerts.length,2);assert.deepEqual(new Set(alerts.map(x=>x.cafe_id)),new Set(['a','b']));assert.equal((await n.list({},f.owner)).items.length,0);
 }finally{f.db.close();}
});
