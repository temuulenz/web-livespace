import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validatePromotion,promotionActive,promotionPrice} from '../shared/business/promotions.mjs';
const fail=(status,code,message)=>{throw Object.assign(new Error(message),{status,code});};
const promotion=(extra={})=>({...validatePromotion({name:'Morning',kind:'percentage',value:15,starts_at:'2026-11-01T00:00:00Z',ends_at:'2026-12-01T00:00:00Z',published:true,...extra},fail),id:'promo-a'});
test('promotions reject mass assignment, malformed dates, targets, prices and schedules',()=>{
 for(const patch of [{cafe_id:'foreign'},{published:1},{value:1.5},{value:101},{kind:'unknown'},{starts_at:'2026-11-31T00:00:00Z'},{ends_at:'2026-10-01T00:00:00Z'},{product_id:'p',category_id:'c'},{recurrence:{days:[1,1],start_minute:1,end_minute:2}},{recurrence:{days:[1],start_minute:1,end_minute:1}},{starts_at:'2026-11-01T08:00:00+08:00'}])assert.throws(()=>promotion(patch),e=>e.status===422);
});
test('promotions use half-open UTC schedules and explicit publication',()=>{
 const p=promotion();assert.equal(promotionActive(p,p.starts_at),true);assert.equal(promotionActive(p,p.ends_at),false);assert.equal(promotionActive({...p,published:false},p.starts_at),false);assert.equal(promotionActive(p,'invalid'),false);
});
test('Ulaanbaatar recurrence handles weekdays and overnight rollover',()=>{
 const p=promotion({recurrence:{days:[1],start_minute:22*60,end_minute:2*60}});
 assert.equal(promotionActive(p,'2026-11-16T14:00:00Z'),true); // Monday 22:00
 assert.equal(promotionActive(p,'2026-11-16T17:59:00Z'),true); // Tuesday 01:59
 assert.equal(promotionActive(p,'2026-11-16T18:00:00Z'),false);
 assert.equal(promotionActive(p,'2026-11-17T14:00:00Z'),false);
 const daytime=promotion({recurrence:{days:[1],start_minute:9*60,end_minute:10*60}});
 assert.equal(promotionActive(daytime,'2026-11-16T01:00:00Z'),true);
 assert.equal(promotionActive(daytime,'2026-11-16T02:00:00Z'),false);
});
test('discounts use integer MNT, clamp at zero, never stack and preserve better manual prices',()=>{
 const product={id:'p',category_id:'c',base_price:101};
 const percent=promotion(),fixed={...promotion({kind:'fixed',value:16}),id:'promo-b'};
 assert.deepEqual(promotionPrice(product,[fixed,percent],'2026-11-17T00:00:00Z'),{base_price:101,effective_price:85,promotion_id:'promo-a'});
 assert.equal(promotionPrice(product,[promotion({kind:'fixed',value:1000})],'2026-11-17T00:00:00Z').effective_price,0);
 assert.equal(promotionPrice({...product,discounted_price:70},[percent],'2026-11-17T00:00:00Z').promotion_id,null);
 assert.equal(promotionPrice(product,[promotion({product_id:'foreign'})],'2026-11-17T00:00:00Z').effective_price,101);
 assert.equal(promotionPrice(product,[promotion({category_id:'foreign'})],'2026-11-17T00:00:00Z').effective_price,101);
 assert.throws(()=>promotionPrice({...product,base_price:NaN},[]));
});

import {businessFixture,id} from './support/business.mjs';
import {createPromotionService} from '../shared/business/promotions-service.mjs';
const input={name:'Morning',kind:'percentage',value:15,starts_at:'2026-11-01T00:00:00Z',ends_at:'2026-12-01T00:00:00Z',published:true};
test('promotion persistence enforces tenant scope, version races, publication and audit rollback',async()=>{
 const f=businessFixture(),service=createPromotionService({...f,fail,id,clock:()=> '2026-11-17T00:00:00.000Z'});
 try {
  const category=await f.menu.create('a','categories',{name:'Coffee',published:true},f.owner);
  const product=await f.menu.create('a','products',{name:'Latte',category_id:category.id,base_price:101,published:true},f.owner);
  const {promotion:p}=await service.create('a',{...input,product_id:product.id},f.owner);
  assert.equal((await service.publicList('a')).promotions.length,1);
  await assert.rejects(service.create('b',input,f.owner),e=>e.status===404);
  await assert.rejects(service.create('b',{...input,product_id:product.id},f.other),e=>e.status===422);
  await assert.rejects(service.list('a',{},f.customer),e=>e.status===403);
  assert.equal((await service.preview('a',{promotion:{...input,published:false},product_id:product.id},f.owner)).price.effective_price,85);
  const races=await Promise.allSettled([service.update('a',p.id,{version:1,name:'First'},f.owner),service.update('a',p.id,{version:1,name:'Second'},f.owner)]);
  assert.equal(races.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(races.find(r=>r.status==='rejected').reason.status,409);
  const current=(await service.list('a',{},f.owner)).items[0];
  f.db.exec("CREATE TRIGGER promotion_audit_failure BEFORE INSERT ON business_audit WHEN NEW.action='promotions.update' BEGIN SELECT RAISE(ABORT,'injected_failure'); END");
  await assert.rejects(service.update('a',p.id,{version:current.version,published:false},f.owner));
  assert.equal((await service.publicList('a')).promotions.length,1);
  f.db.exec('DROP TRIGGER promotion_audit_failure');
  await service.update('a',p.id,{version:current.version,published:false},f.owner);
  assert.equal((await service.publicList('a')).promotions.length,0);
 } finally {f.db.close();}
});
test('promotion quota is transactionally enforced and ownership is checked inside the write',async()=>{
 const f=businessFixture(),service=createPromotionService({...f,fail,id});
 try {
  for(let i=0;i<100;i++)await service.create('a',input,f.owner);
  await assert.rejects(service.create('a',input,f.owner),e=>e.code==='promotion_limit');
  assert.equal(f.db.prepare('SELECT count(*) n FROM promotions').get().n,100);
  const racedSql={...f.sql,batch:async entries=>{f.db.prepare("UPDATE cafes SET owner_id='other' WHERE id='c'").run();return f.sql.batch(entries);}};
  const raced=createPromotionService({sql:racedSql,fail,id});
  await assert.rejects(raced.create('c',input,f.owner));
  assert.equal(f.db.prepare("SELECT count(*) n FROM promotions WHERE cafe_id='c'").get().n,0);
 } finally {f.db.close();}
});

test('menu cache reflects promotion edits and expiration without changing stored prices',async()=>{
 const f=businessFixture();let now='2026-11-17T00:00:00.000Z';
 const {createMenuService}=await import('../shared/business/menu.mjs');
 const menu=createMenuService({sql:f.sql,fail,id,clock:()=>now}),service=createPromotionService({sql:f.sql,fail,id,clock:()=>now});
 try{
  const c=await menu.create('a','categories',{name:'Coffee',published:true},f.owner);
  const p=await menu.create('a','products',{name:'Latte',category_id:c.id,base_price:101,published:true},f.owner);
  assert.equal((await menu.publicMenu('a')).products[0].effective_price,101);
  const {promotion}=await service.create('a',input,f.owner);
  assert.equal((await menu.publicMenu('a')).products[0].effective_price,85);
  await service.update('a',promotion.id,{version:1,value:50},f.owner);
  assert.equal((await menu.publicMenu('a')).products[0].effective_price,50);
  now='2026-12-01T00:00:00.000Z';
  assert.equal((await menu.publicMenu('a')).products[0].effective_price,101);
  assert.equal(f.db.prepare('SELECT base_price FROM menu_items WHERE id=?').get(p.id).base_price,101);
 }finally{f.db.close();}
});
test('Node promotion HTTP enforces sessions, origin, publication and bounded bodies',async()=>{
 const {startServer}=await import('./support/server.mjs');const server=await startServer({seedDemo:false});
 try{
  const owner=server.client(),guest=server.client();const registered=await owner.post('/api/v1/auth/register',{email:'promotion-owner@example.invalid',password:'local-password-123'});
  const user=registered.data.user,db=server.app.deps.db;
  db.prepare("UPDATE users SET role='owner' WHERE id=?").run(user.id);
  db.prepare("INSERT INTO cafes(id,name,owner_id,status,data_mode,created_at,updated_at) VALUES('promo-http','Cafe',?,'active','demo','2026-01-01','2026-01-01')").run(user.id);
  const path='/api/v1/owner/cafes/promo-http/promotions';
  assert.equal((await guest.post(path,input)).status,401);
  assert.equal((await owner.post(path,input,{Origin:'https://foreign.invalid'})).status,403);
  assert.equal((await owner.post(path,{...input,name:'x'.repeat(20000)})).status,413);
  const created=await owner.post(path,input);assert.equal(created.status,201);
  assert.equal((await guest.get('/api/v1/cafes/promo-http/promotions')).status,200);
  assert.equal((await owner.patch(path+'/'+created.data.promotion.id,{version:1,published:false})).status,200);
  assert.equal((await owner.get(path)).data.items[0].published,false);
 }finally{await server.stop();}
});

test('promotion schema matches D1 migration and referenced categories return a contract conflict',async()=>{
 const {PROMOTIONS_SCHEMA}=await import('../shared/business/promotions-schema.mjs');const {readFileSync}=await import('node:fs');
 assert.equal(readFileSync(new URL('../cloudflare/migrations/0013_promotions.sql',import.meta.url),'utf8'),PROMOTIONS_SCHEMA);
 const f=businessFixture(),service=createPromotionService({...f,fail,id});
 try{
  const c=await f.menu.create('a','categories',{name:'Empty'},f.owner);
  await service.create('a',{...input,category_id:c.id},f.owner);
  await assert.rejects(f.menu.remove('a','categories',c.id,f.owner),e=>e.code==='category_in_use');
 }finally{f.db.close();}
});
