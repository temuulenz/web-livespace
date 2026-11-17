import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {initializeAnalytics,acceptAnalytics,flushAnalytics} from '../cloudflare/analytics-store.mjs';
import {validateBehavior,authorizeBehaviorTargets} from '../shared/business/behavior.mjs';
import {phase11Config} from '../shared/business/phase11-config.mjs';
import {createInsights,safeCsv} from '../shared/business/insights.mjs';
import {businessFixture,fail,id} from './support/business.mjs';
const options=phase11Config({LS_ANALYTICS_MIN_COHORT:'3'}),now=Date.parse('2026-11-17T03:00:00Z');
function store(){const db=new DatabaseSync(':memory:');const sql={exec(q,...a){const s=db.prepare(q);return s.all(...a);}},ctx={storage:{sql,transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}}};initializeAnalytics(sql);return {db,ctx};}
function sink(f){return {prepare:q=>({bind:(...args)=>({q,args})}),batch:async entries=>{f.db.exec('BEGIN');try{const rows=entries.map(e=>{f.db.prepare(e.q).run(...e.args);return {meta:{}};});f.db.exec('COMMIT');return rows;}catch(e){f.db.exec('ROLLBACK');throw e;}}};}
const input=(id='event-v20001',type='cafe_view')=>({schemaVersion:2,cafeId:'a',events:[{id,type}]});
test('v2 analytics validates minimal payloads, uses server time and cafe-scoped pseudonyms',()=>{
 const a=validateBehavior(input(),'session',now),b=validateBehavior({...input(),cafeId:'b'},'session',now);assert.notEqual(a.sessionHash,b.sessionHash);assert.equal(a.events[0].timestamp,'2026-11-17T03:00:00.000Z');
 for(const e of [{...input().events[0],metadata:{ip:'bad'}},{id:'event-v20001',type:'purchase'},{id:'event-v20001',type:'product_view'},{id:'event-v20001',type:'cafe_view',timestamp:'2020-01-01'}])assert.throws(()=>validateBehavior({...input(),events:[e]},'session',now));
});
test('v2 durable intake is idempotent, atomic, bounded per session and survives restart',async()=>{
 const s=store(),f=businessFixture();try{
  const batch=validateBehavior(input(),'session',now);assert.equal(acceptAnalytics(s.ctx,batch,now,options).accepted,1);initializeAnalytics(s.ctx.storage.sql);assert.equal(acceptAnalytics(s.ctx,validateBehavior(input(),'session',now+86400000),now+86400000,options).duplicates,1);
  assert.throws(()=>acceptAnalytics(s.ctx,validateBehavior(input('event-v20001','menu_view'),'session',now),now,options),/conflict/);
  assert.throws(()=>acceptAnalytics(s.ctx,validateBehavior(input('event-v20002'),'session',now),now,{...options,sessionDaily:1}),/budget/);
  assert.equal(s.db.prepare('SELECT count(*) n FROM behavior_receipts').get().n,1);
  const target=sink(f);let calls=0;const ambiguous={...target,batch:async x=>{const r=await target.batch(x);if(calls++===0)throw Error('ambiguous');return r;}};
  await assert.rejects(flushAnalytics(s.ctx,ambiguous,now,options));await flushAnalytics(s.ctx,target,now,options);
  assert.equal(f.db.prepare('SELECT event_count FROM analytics_dimensions').get().event_count,1);assert.equal(f.db.prepare('SELECT count(*) n FROM analytics_session_days').get().n,1);
 }finally{s.db.close();f.db.close();}
});
test('aggregate reports suppress cohorts, isolate owners, compare local periods and export safe CSV',async()=>{
 const f=businessFixture(),s=store(),insights=createInsights({sql:f.sql,fail,options,clock:()=>now});try{
  for(let n=0;n<3;n++)acceptAnalytics(s.ctx,validateBehavior(input('event-session'+n),'session'+n,now),now,options);
  await flushAnalytics(s.ctx,sink(f),now,options);
  const q={since:'2026-11-17',until:'2026-11-18',compare:'true'};
  const report=await insights.read('a',q,f.owner);assert.equal(report.current.behavior[0].count,3);assert.equal(report.current.unique_sessions,3);assert.equal(report.previous.behavior.length,0);assert.equal(report.current.sensors.status,'unavailable');assert.equal(report.current.average_rating,null);
  await assert.rejects(insights.read('a',q,f.other),e=>e.status===404);await assert.rejects(insights.read(null,q,f.owner),e=>e.status===403);await assert.rejects(insights.read('a',q,null),e=>e.status===401);
  assert.ok(!(await insights.read(null,q,f.admin)).current.unique_sessions);
  assert.throws(()=>safeCsv(null));assert.match(safeCsv([['=formula','+1','safe']]),/"'=formula"/);
  assert.ok(!insights.csv(report).includes('session0'));
  await assert.rejects(insights.read('a',{since:'2020-01-01',until:'2026-11-18'},f.owner),e=>e.status===422);
  const hidden=await insights.read('a',{since:'2026-11-17',until:'2026-11-18'},f.owner);assert.equal(hidden.current.behavior[0].status,'available');
 }finally{s.db.close();f.db.close();}
});
test('behavior references cannot name foreign or unpublished menu entities',async()=>{
 const f=businessFixture();try{const c=await f.menu.create('b','categories',{name:'Other',published:true},f.other),p=await f.menu.create('b','products',{name:'Foreign',category_id:c.id,base_price:1,published:true},f.other);
 await assert.rejects(authorizeBehaviorTargets(f.sql,validateBehavior({schemaVersion:2,cafeId:'a',events:[{id:'event-ref0001',type:'product_view',productId:p.id}]},'session',now),fail),e=>e.status===422);
 }finally{f.db.close();}
});

test('small cohorts remain suppressed; local weeks/months and real sensor exclusions are accurate',async()=>{
 const f=businessFixture(),s=store();try{
  acceptAnalytics(s.ctx,validateBehavior(input(),'single',now),now,options);await flushAnalytics(s.ctx,sink(f),now,options);
  const report=createInsights({sql:f.sql,fail,options,clock:()=>now});let value=await report.read('a',{since:'2026-11-01',until:'2026-11-18',granularity:'month'},f.owner);assert.equal(value.current.behavior.length,0);assert.equal(value.current.behavior_status,'suppressed');assert.equal(value.current.suppressed_cohorts,true);assert.equal(value.current.unique_sessions,null);
  value=await report.read('a',{since:'2026-11-01',until:'2026-11-18',granularity:'week'},f.owner);assert.equal(value.current.behavior.length,0);
  const insert=f.db.prepare('INSERT INTO measurements(cafe_id,device_id,ts,received_at,is_test,raw,data_source,message_id,observed_people,noise_dbfs,noise_db,noise_calibrated,wifi_quality) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
  insert.run('a','real','2026-11-17T03:00:00Z','2026-11-17T03:00:01Z',0,'{}','real','real1',8,-40,60,1,80);
  insert.run('a','real','2026-11-17T04:00:00Z','2026-11-17T05:00:00Z',0,'{}','real','stale',100,-20,90,1,100);
  insert.run('a','real','2026-11-17T06:00:00Z','2026-11-17T06:00:01Z',0,'{}','real','invalid',-1,-999,999,0,999);
  insert.run('a','sim','2026-11-17T03:00:00Z','2026-11-17T03:00:01Z',1,'{}','simulated','simulated',90,-20,90,1,100);
  const fresh=createInsights({sql:f.sql,fail,options,clock:()=>now});value=await fresh.read('a',{since:'2026-11-17',until:'2026-11-18'},f.owner);
  assert.equal(value.current.sensors.rows[0].occupancy,8);assert.equal(value.current.sensors.rows[0].noise_spl,60);assert.equal(value.current.sensors.rows[0].wifi_quality,80);
  value=await fresh.read('a',{since:'2026-11-17',until:'2026-11-18',source:'simulated'},f.owner);assert.equal(value.source,'simulated');assert.equal(value.current.sensors.rows[0].occupancy,90);
 }finally{s.db.close();f.db.close();}
});

test('all approved behavior types validate while malformed calendar ranges fail with 422',async()=>{
 const {BEHAVIOR_EVENTS}=await import('../shared/business/behavior.mjs');for(const type of BEHAVIOR_EVENTS){const e={id:'approved-event-id',type};if(type==='product_view')e.productId='product';if(type.startsWith('promotion_'))e.promotionId='promotion';assert.equal(validateBehavior({...input(),events:[e]},'session',now).events[0].type,type);}
 const f=businessFixture();try{const insights=createInsights({sql:f.sql,fail,options,clock:()=>now});for(const since of ['2026-99-99','2026-02-30','not-date'])await assert.rejects(insights.read('a',{since},f.owner),e=>e.status===422);}finally{f.db.close();}
});

test('retention is bounded and never drops unflushed durable counters',async()=>{
 const s=store(),f=businessFixture();try{
  acceptAnalytics(s.ctx,validateBehavior(input(),'session',now),now,options);
  const later=now+100*86400000;const blocked={prepare:()=>({bind:()=>({})}),batch:async()=>{throw Error('storage unavailable');}};
  await assert.rejects(flushAnalytics(s.ctx,blocked,later,options));assert.equal(s.db.prepare('SELECT dirty FROM behavior_counters').get().dirty,1);
  await flushAnalytics(s.ctx,sink(f),later,options);assert.equal(f.db.prepare('SELECT event_count FROM analytics_dimensions').get().event_count,1);
  assert.equal(s.db.prepare('SELECT count(*) n FROM behavior_receipts').get().n,0);assert.equal(s.db.prepare('SELECT count(*) n FROM behavior_counters').get().n,0);
 }finally{s.db.close();f.db.close();}
});

test('Node durable collector reopens unflushed data and round-robin recovery preserves deduplication',async()=>{
 const {createBehaviorBackend}=await import('../server/services/behavior.mjs'),{mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const dir=await mkdtemp(join(tmpdir(),'ls-analytics-restart-')),f=businessFixture(),config={dataDir:dir,phase11:{...options,analyticsEnabled:true}};let collector;
 try{
  const batch=validateBehavior(input(),'session',now);collector=createBehaviorBackend(f.db,config);assert.equal(collector.collect(batch).accepted,1);collector.close();
  collector=createBehaviorBackend(f.db,config);assert.equal(collector.collect(batch).duplicates,1);await collector.maintenance();assert.equal(f.db.prepare('SELECT event_count FROM analytics_dimensions').get().event_count,1);
 }finally{collector?.close();f.db.close();await rm(dir,{recursive:true,force:true});}
});

test('legacy and v2 share one tenant quota at the Ulaanbaatar day boundary',()=>{
 const s=store(),at=Date.parse('2026-11-16T17:00:00Z');try{
  const bounds={...options,analyticsDaily:1};acceptAnalytics(s.ctx,validateBehavior(input(),'session',at),at,bounds);
  const legacy={schemaVersion:1,cafeId:'a',events:[{id:'legacy-day-boundary',type:'cafe_view',timestamp:new Date(at).toISOString(),hour:'2026-11-16T17:00:00.000Z'}]};
  assert.throws(()=>acceptAnalytics(s.ctx,legacy,at,bounds),/budget/);assert.equal(s.db.prepare('SELECT n FROM intake').get().n,1);
 }finally{s.db.close();}
});
