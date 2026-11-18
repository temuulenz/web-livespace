import {test} from 'node:test';
import assert from 'node:assert/strict';
import {businessFixture,fail,id} from './support/business.mjs';
import {createMenuService} from '../shared/business/menu.mjs';
import {createInventoryService} from '../shared/business/inventory.mjs';
import {createReviewService} from '../shared/business/reviews.mjs';
import {createMenuMedia} from '../shared/business/menu-media.mjs';
import {tinyJpeg} from './support/server.mjs';
function delayed(f,change){let armed=true;return {...f.sql,batch:async entries=>{if(armed){armed=false;change();}return f.sql.batch(entries);}};}
for(const [name,statement] of [
 ['ownership transfer',"UPDATE cafes SET owner_id='other' WHERE id='a'"],
 ['account suspension',"UPDATE users SET disabled_at='2026-01-01' WHERE id='owner'"],
 ['role demotion',"UPDATE users SET role='user' WHERE id='owner'"],
 ['credential version revocation',"UPDATE users SET auth_version=auth_version+1 WHERE id='owner'"]
])test('menu commit rejects '+name+' after validation',async()=>{
 const f=businessFixture();try{const sql=delayed(f,()=>f.db.exec(statement));const menu=createMenuService({sql,fail,id});
 await assert.rejects(menu.create('a','categories',{name:'Forbidden'},f.owner),{status:409,code:'access_changed'});
 assert.equal(f.db.prepare('SELECT count(*) n FROM menu_categories').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM business_audit').get().n,0);
 }finally{f.db.close();}
});
test('session logout and expiry are checked inside business commits',async()=>{
 for(const change of ["DELETE FROM sessions", "UPDATE sessions SET expires_at='2000-01-01'"]){const f=businessFixture();try{
 f.db.prepare("INSERT INTO sessions(token_hash,user_id,created_at,expires_at,user_auth_version) VALUES('synthetic-session','owner','2026-01-01','2999-01-01',0)").run();
 const actor={...f.owner,auth_version:0,session_token_hash:'synthetic-session'};
 const menu=createMenuService({sql:delayed(f,()=>f.db.exec(change)),fail,id});
 await assert.rejects(menu.create('a','categories',{name:'Forbidden'},actor),{status:409,code:'access_changed'});assert.equal(f.db.prepare('SELECT count(*) n FROM menu_categories').get().n,0);
 }finally{f.db.close();}}
});
test('inventory ownership race leaves no stock, movement, receipt or event',async()=>{
 const f=businessFixture();try{
 const c=await f.menu.create('a','categories',{name:'Cat'},f.owner),p=await f.menu.create('a','products',{category_id:c.id,name:'Item',base_price:1},f.owner);let events=0;
 const stock=createInventoryService({sql:delayed(f,()=>f.db.exec("UPDATE cafes SET owner_id='other' WHERE id='a'")),fail,id,afterCommit:()=>events++});
 await assert.rejects(stock.mutate('a',{idempotency_key:'race',updates:[{product_id:p.id,version:0,quantity:1,mode:'quantity',reason:'restock'}]},f.owner),{status:409,code:'access_changed'});
 for(const table of ['inventory','inventory_movements','inventory_receipts'])assert.equal(f.db.prepare('SELECT count(*) n FROM '+table).get().n,0);assert.equal(events,0);
 }finally{f.db.close();}
});
test('review publication and moderator role are rechecked; aggregate state rolls back',async()=>{
 const f=businessFixture();try{
 const create=createReviewService({sql:delayed(f,()=>f.db.exec("UPDATE cafes SET status='submitted' WHERE id='a'")),fail,id});
 const values={taste:1,service:1,comfort:1,value:1,study:1};
 await assert.rejects(create.create('a',values,f.customer),{status:409,code:'access_changed'});assert.equal(f.db.prepare('SELECT count(*) n FROM reviews').get().n,0);
 f.db.exec("UPDATE cafes SET status='active' WHERE id='a'");const reviews=createReviewService({sql:f.sql,fail,id}),r=await reviews.create('a',values,f.customer);
 const moderator=createReviewService({sql:delayed(f,()=>f.db.exec("UPDATE users SET role='user' WHERE id='admin'")),fail,id});
 await assert.rejects(moderator.moderate('a',r.id,{version:1,action:'hide',reason:'Race'},f.admin),{status:409,code:'access_changed'});
 assert.equal((await reviews.summary('a')).review_count,1);assert.equal(f.db.prepare('SELECT count(*) n FROM review_moderation_audit').get().n,0);
 }finally{f.db.close();}
});
test('ownership revoked during image upload cannot attach bytes; staged intent retained',async()=>{
 const f=businessFixture();try{const c=await f.menu.create('a','categories',{name:'Cat'},f.owner),p=await f.menu.create('a','products',{category_id:c.id,name:'Item',base_price:1},f.owner);
 const media=createMenuMedia({sql:f.sql,menu:f.menu,fail,id,storage:{plan:()=>({file:'synthetic/path.jpg'}),async save(){f.db.exec("UPDATE cafes SET owner_id='other' WHERE id='a'");return {file:'synthetic/path.jpg'};}}});
 await assert.rejects(media.replace('a',p.id,{version:1,image:tinyJpeg()},f.owner),{status:409,code:'access_changed'});
 assert.equal(f.db.prepare('SELECT image_ref FROM menu_items WHERE id=?').get(p.id).image_ref,null);assert.equal(f.db.prepare('SELECT ready FROM menu_images').get().ready,0);
 }finally{f.db.close();}
});
test('reauthentication cannot report success after logout during password verification',async()=>{
 const {createUserAccess}=await import('../server/services/user-access.mjs');const f=businessFixture();try{
 f.db.prepare("INSERT INTO sessions(token_hash,user_id,created_at,expires_at,user_auth_version) VALUES('synthetic-admin','admin','2026-01-01','2999-01-01',0)").run();
 const actor={...f.db.prepare("SELECT * FROM users WHERE id='admin'").get(),session_token_hash:'synthetic-admin'};
 const access=createUserAccess({sql:f.sql,fail,id,hashPassword:async()=>'',verifyPassword:async()=>{f.db.prepare("DELETE FROM sessions WHERE token_hash='synthetic-admin'").run();return true;}});
 await assert.rejects(access.reauthenticate(actor,'synthetic-input'),{status:409,code:'access_changed'});
 }finally{f.db.close();}
});
test('two owner registrations cannot steal the same one-time application claim',async()=>{
 const {startServer,tinyJpeg}=await import('./support/server.mjs');const server=await startServer({seedDemo:false});try{
 const app=await server.client().post('/api/v1/applications',{cafe_name:'Synthetic claim race',contact_name:'Fixture',phone:'88001234',email:'application@example.invalid',district:'Сүхбаатар',category:'Кафе',address:'Synthetic only',hours:'08:00–22:00',description:'Synthetic fixture',purposes:['Сурах'],seats:24,lat:47.918,lng:106.92,photos:[tinyJpeg(),tinyJpeg(),tinyJpeg()]});assert.equal(app.status,201);
 const results=await Promise.all(['one','two'].map(name=>server.client().post('/api/v1/auth/register-owner',{email:name+'@claim.example.invalid',password:'synthetic-password-123',name,claim_token:app.data.claim_token})));
 assert.equal(results.filter(r=>r.status===201).length,1);assert.ok(results.some(r=>[400,409].includes(r.status)));
 const winner=results.find(r=>r.status===201).data.user.id;const row=server.app.deps.db.prepare('SELECT owner_id,claim_token_hash FROM applications WHERE id=?').get(app.data.application_id);assert.equal(row.owner_id,winner);assert.equal(row.claim_token_hash,null);assert.equal(server.app.deps.db.prepare('SELECT owner_id FROM cafes WHERE id=?').get(app.data.cafe_id).owner_id,winner);
 }finally{await server.stop();}
});
test('new main-branch cafe-owner reassignment rejects logout between validation and commit',async()=>{
 const {createCafeOwnership}=await import('../server/services/cafe-ownership.mjs');const f=businessFixture();try{
 f.db.prepare("INSERT INTO sessions(token_hash,user_id,created_at,expires_at,user_auth_version) VALUES('owner-assignment-session','admin','2026-01-01','2999-01-01',0)").run();
 const actor={...f.admin,auth_version:0,session_token_hash:'owner-assignment-session'};
 const service=createCafeOwnership({sql:delayed(f,()=>f.db.exec("DELETE FROM sessions WHERE token_hash='owner-assignment-session'")),fail,id});
 await assert.rejects(service.setOwner(actor,'a',{email:'other@example.invalid'}),{status:409,code:'owner_changed'});
 assert.equal(f.db.prepare("SELECT owner_id FROM cafes WHERE id='a'").get().owner_id,'owner');assert.equal(f.db.prepare('SELECT count(*) n FROM user_audit_log').get().n,0);
 }finally{f.db.close();}
});
