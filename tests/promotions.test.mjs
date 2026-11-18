import {test} from 'node:test';
import assert from 'node:assert/strict';
import {businessFixture,fail,id} from './support/business.mjs';
import {createPromotionService,promotionState} from '../shared/business/promotions.mjs';
const window={starts_at:'2026-11-17T00:00:00Z',ends_at:'2026-11-21T00:00:00Z'};
const rule=(x={})=>({title:'Synthetic rule',type:'percentage',discount_value:10,...window,...x});
async function fixture(){const f=businessFixture(),category=await f.menu.create('a','categories',{name:'Cat',published:true},f.owner),product=await f.menu.create('a','products',{category_id:category.id,name:'Item',base_price:1001,published:true},f.owner);return {...f,category,product,promos:createPromotionService({sql:f.sql,fail,id,clock:()=> '2026-11-18T00:30:00.000Z'})};}
test('promotion CRUD, publish/pause/archive, tenant references and integer discount validation',async()=>{
 const f=await fixture();try{
 await assert.rejects(f.promos.save('a',rule(),f.other),{status:404});await assert.rejects(f.promos.save('a',rule(),null),{status:401});
 for(const discount_value of [-1,0,101,1.5,'10'])await assert.rejects(f.promos.save('a',rule({discount_value}),f.owner),{status:422});
 await assert.rejects(f.promos.save('a',rule({type:'product_discount',discount_kind:'fixed_amount',discount_value:1,product_ids:['foreign']}),f.owner),{status:422});
 let p=await f.promos.save('a',rule(),f.owner);assert.equal((await f.promos.list('a',{},null,true)).items.length,0);
 p=await f.promos.save('a',{version:p.version,published:true},f.owner,p.id);assert.equal((await f.promos.list('a',{},null,true)).items.length,1);
 await assert.rejects(f.promos.save('a',{version:1,title:'Stale'},f.owner,p.id),{status:409});
 p=await f.promos.save('a',{version:p.version,published:false},f.owner,p.id);assert.equal((await f.promos.list('a',{state:'draft'},f.owner)).items.length,1);
 await f.promos.remove('a',p.id,{version:p.version},f.owner);assert.equal((await f.promos.list('a',{},f.owner)).items.length,0);assert.equal(f.db.prepare('SELECT archived FROM promotions').get().archived,1);
 }finally{f.db.close();}
});
test('promotion overlap never stacks; fixed clamp and informational discounts never invent prices',async()=>{
 const f=await fixture();try{
 await f.promos.save('a',rule({published:true}),f.owner);
 const fixed=await f.promos.save('a',rule({type:'fixed_amount',discount_value:200,published:true}),f.owner);
 let price=await f.promos.preview('a',{product_id:f.product.id},f.owner);assert.equal(price.listed_price,1001);assert.equal(price.resulting_price,801);assert.equal(price.applied_promotion_id,fixed.id);assert.equal(price.stacking,false);
 const tied=await f.promos.save('a',rule({type:'fixed_amount',discount_value:200,published:true}),f.owner);price=await f.promos.preview('a',{product_id:f.product.id},f.owner);assert.equal(price.applied_promotion_id,[fixed.id,tied.id].sort()[0]);
 await assert.rejects(f.promos.preview('a',{product_id:null},f.owner),{status:422});await assert.rejects(f.promos.preview('a',{product_id:f.product.id,at:null},f.owner),{status:422});
 const info=await f.promos.save('a',rule({type:'student_discount',discount_kind:null,discount_value:null,published:true}),f.owner);
 price=await f.promos.preview('a',{product_id:f.product.id,promotion_id:info.id},f.owner);assert.equal(price.resulting_price,1001);assert.equal(price.applied_promotion_id,null);
 const zero=await f.promos.save('a',rule({type:'fixed_amount',discount_value:100000,published:true}),f.owner);price=await f.promos.preview('a',{product_id:f.product.id},f.owner);assert.equal(price.resulting_price,0);assert.equal(price.applied_promotion_id,zero.id);
 }finally{f.db.close();}
});
test('Ulaanbaatar recurring schedules handle start/end and overnight previous weekday',()=>{
 const p={...window,starts_at:new Date(window.starts_at).toISOString(),ends_at:new Date(window.ends_at).toISOString(),published:1,schedule:{days:[3],start:'08:00',end:'10:00'}};
 assert.equal(promotionState(p,'2026-11-18T00:00:00.000Z'),'active');assert.equal(promotionState(p,'2026-11-18T02:00:00.000Z'),'upcoming');
 p.schedule={days:[3],start:'22:00',end:'02:00'};
 assert.equal(promotionState(p,'2026-11-18T15:00:00.000Z'),'active');assert.equal(promotionState(p,'2026-11-18T17:30:00.000Z'),'active');assert.equal(promotionState(p,'2026-11-18T18:00:00.000Z'),'upcoming');
});
test('private associated products never leak as public/global promotions; current menu visibility is rechecked',async()=>{
 const f=await fixture();try{
 await f.promos.save('a',rule({type:'product_discount',discount_kind:'percentage',product_ids:[f.product.id],published:true}),f.owner);
 assert.equal((await f.promos.list('a',{},null,true)).items.length,1);
 await f.menu.update('a','products',f.product.id,{version:f.product.version,published:false},f.owner);
 assert.equal((await f.promos.list('a',{},null,true)).items.length,0);
 await assert.rejects(f.promos.save('a',rule({schedule:'{invalid'}),f.owner),{status:422});
 }finally{f.db.close();}
});
test('promotion mutation rejects ownership change at commit and rolls back associations/audit',async()=>{
 const f=await fixture();try{
 const before=f.db.prepare('SELECT count(*) n FROM business_audit').get().n;
 const sql={...f.sql,batch:async entries=>{f.db.exec("UPDATE cafes SET owner_id='other' WHERE id='a'");return f.sql.batch(entries);}};
 await assert.rejects(createPromotionService({sql,fail,id}).save('a',rule(),f.owner),{status:409,code:'access_changed'});
 assert.equal(f.db.prepare('SELECT count(*) n FROM promotions').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM business_audit').get().n,before);
 }finally{f.db.close();}
});
test('promotion HTTP contract denies guest and cross-origin writes; public draft stays hidden',async()=>{
 const {startServer}=await import('./support/server.mjs');const server=await startServer({seedDemo:false});try{
 const owner=server.client(),guest=server.client(),u=(await owner.post('/api/v1/auth/register',{email:'promotion-fixture@example.invalid',password:'synthetic-password-123'})).data.user,db=server.app.deps.db;
 db.prepare("UPDATE users SET role='owner' WHERE id=?").run(u.id);db.prepare("INSERT INTO cafes(id,name,owner_id,status,data_mode,created_at,updated_at) VALUES('promotion-http','Synthetic',?,'active','demo','2026-01-01','2026-01-01')").run(u.id);
 const path='/api/v1/owner/cafes/promotion-http/promotions';assert.equal((await guest.post(path,rule())).status,401);assert.equal((await owner.post(path,rule(),{Origin:'https://other.invalid'})).status,403);
 const created=await owner.post(path,rule());assert.equal(created.status,201);assert.equal((await guest.get('/api/v1/cafes/promotion-http/promotions')).data.items.length,0);
 assert.equal((await owner.get(path)).data.items.length,1);assert.equal((await owner.get('/api/v1/owner/cafes/foreign/promotions')).status,404);
 }finally{await server.stop();}
});
