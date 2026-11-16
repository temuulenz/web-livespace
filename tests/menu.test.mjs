import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase,transaction} from '../server/lib/db.mjs';
import {createMenuService} from '../shared/business/menu.mjs';
import {MENU_SCHEMA} from '../shared/business/menu-schema.mjs';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
function fixture(){
 const db=openDatabase(':memory:');
 for(const id of ['owner','other'])db.prepare("INSERT INTO users(id,email,password_hash,name,role,created_at) VALUES(?,?,?,'','owner','2026-01-01')").run(id,id+'@test.invalid','unused');
 for(const [id,owner] of [['a','owner'],['b','other']])db.prepare("INSERT INTO cafes(id,name,owner_id,status,created_at,updated_at) VALUES(?,?,?,'active','2026-01-01','2026-01-01')").run(id,id,owner);
 const sql={first:(q,...a)=>db.prepare(q).get(...a),all:(q,...a)=>db.prepare(q).all(...a),batch:entries=>transaction(db,()=>entries.map(([q,...a])=>db.prepare(q).run(...a)))};
 const menu=createMenuService({sql,id:p=>p+randomUUID(),fail:(status,code,message)=>{throw Object.assign(new Error(message),{status,code});}});
 return {db,menu,sql,user:{id:'owner',role:'owner'},other:{id:'other',role:'owner'}};
}
test('menu CRUD, publication, discounts, variants, tenant denial and safe archiving',async()=>{
 const {db,menu,user,other}=fixture();try{
 await assert.rejects(menu.list('a','categories',{},null),{status:401});
 await assert.rejects(menu.list('a','categories',{},other),{status:404});
 const c=await menu.create('a','categories',{name:'Coffee',published:true},user);
 const foreign=await menu.create('b','categories',{name:'Other'},other);
 await assert.rejects(menu.create('a','products',{category_id:foreign.id,name:'Bad',base_price:1},user),{status:422});
 for(const base_price of [-1,1.5,'100'])await assert.rejects(menu.create('a','products',{category_id:c.id,name:'Bad',base_price},user),{status:422});
 await assert.rejects(menu.create('a','products',{category_id:c.id,name:'Bad',base_price:100,discounted_price:101},user),{status:422});
 let p=await menu.create('a','products',{category_id:c.id,name:'Latte',base_price:1000},user);
 assert.equal((await menu.publicMenu('a')).products.length,0);
 p=await menu.update('a','products',p.id,{version:p.version,published:true},user);
 await assert.rejects(menu.update('a','products',p.id,{version:1,name:'stale'},user),{status:409});
 const v=await menu.create('a','variants',{product_id:p.id,name:'Large',price:2000,discounted_price:1800},user);
 assert.equal((await menu.publicMenu('a')).products[0].variants[0].id,v.id);
 await assert.rejects(menu.remove('a','categories',c.id,user),{status:409});
 await menu.remove('a','variants',v.id,user);
 assert.equal((await menu.publicMenu('a')).products[0].variants.length,0);
 await menu.remove('a','products',p.id,user);
 assert.equal((await menu.publicMenu('a')).products.length,0);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM menu_items').get().n,1);
 assert.equal((await menu.list('a','products',{archived:'true'},user)).items.length,1);
 await assert.rejects(menu.list('a','products',{limit:'101'},user),{status:422});
 assert.ok(db.prepare('SELECT count(*) n FROM business_audit').get().n>=6);
 }finally{db.close();}
});
test('D1 and Node menu schemas stay identical; database rejects cross-tenant foreign keys',()=>{
 assert.equal(readFileSync(new URL('../cloudflare/migrations/0009_menu.sql',import.meta.url),'utf8'),'-- Phase 11A: additive menu schema.\n'+MENU_SCHEMA);
 const {db}=fixture();try{assert.throws(()=>db.prepare("INSERT INTO menu_items(id,cafe_id,category_id,name,base_price,created_at,updated_at) VALUES('bad','a','missing','x',0,'x','x')").run(),/FOREIGN KEY/);}finally{db.close();}
});
test('bulk mutations roll back and CSV confirmation is explicit and idempotent',async()=>{
 const {db,menu,user}=fixture();try{
 const c=await menu.create('a','categories',{name:'Coffee',published:true},user);
 const p=await menu.create('a','products',{category_id:c.id,name:'A, "coffee"',base_price:2000,published:true},user);
 const before=await menu.publicMenu('a');assert.equal(before.products.length,1);
 await assert.rejects(menu.bulk('a','products',{items:[{id:p.id,version:1,published:false},{id:'missing',version:1,published:false}]},user),{status:404});
 assert.equal((await menu.get('a','products',p.id,user)).published,1);
 await menu.bulk('a','products',{items:[{id:p.id,version:1,published:false,display_order:2}]},user);
 assert.equal((await menu.publicMenu('a')).products.length,0);
 const csv='category_id,name,description,base_price,discounted_price\r\n'+c.id+',"Tea, large","Quoted ""tea""",3000,2500';
 const preview=await menu.importCsv('a',{csv},user);
 assert.equal(preview.products[0].name,'Tea, large');
 await assert.rejects(menu.importCsv('a',{csv,preview_id:preview.preview_id},user,true),{status:409});
 assert.equal((await menu.importCsv('a',{csv,preview_id:preview.preview_id,confirm:true},user,true)).imported,1);
 assert.equal((await menu.importCsv('a',{csv,preview_id:preview.preview_id,confirm:true},user,true)).duplicate,true);
 assert.equal((await menu.publicMenu('a')).products.length,0);
 assert.equal(db.prepare('SELECT count(*) n FROM menu_items').get().n,2);
 await assert.rejects(menu.importCsv('a',{csv:'invalid'},user),{status:422});
 }finally{db.close();}
});
test('HTTP menu ownership, CSRF, media signature validation and replacement',async()=>{
 const {startServer,tinyJpeg}=await import('./support/server.mjs');
 const server=await startServer({seedDemo:false});
 try{
 const owner=server.client(),guest=server.client(),other=server.client();
 const registered=await owner.post('/api/v1/auth/register',{email:'menu-owner@test.invalid',password:'menu-password'});
 const user=registered.data.user;
 server.app.deps.db.prepare("UPDATE users SET role='owner' WHERE id=?").run(user.id);
 server.app.deps.db.prepare("INSERT INTO cafes(id,name,owner_id,status,created_at,updated_at) VALUES('menu-cafe','Menu cafe',?,'active',?,?)").run(user.id,new Date().toISOString(),new Date().toISOString());
 const base='/api/v1/owner/cafes/menu-cafe/menu';
 assert.equal((await guest.post(base+'/categories',{name:'No'})).status,401);
 await other.post('/api/v1/auth/register',{email:'other-menu@test.invalid',password:'menu-password'});
 assert.equal((await other.get(base+'/categories')).status,403);
 assert.equal((await owner.post(base+'/categories',{name:'No'},{Origin:'https://other.invalid'})).status,403);
 const c=(await owner.post(base+'/categories',{name:'Coffee',published:true})).data.item;
 let p=(await owner.post(base+'/products',{category_id:c.id,name:'Coffee',base_price:4000,published:true})).data.item;
 assert.equal((await owner.put(base+'/products/'+p.id+'/image',{version:p.version,image:'data:image/jpeg;base64,bm90YW5pbWFnZQ=='})).status,422);
 const uploaded=await owner.put(base+'/products/'+p.id+'/image',{version:p.version,image:tinyJpeg()});
 assert.equal(uploaded.status,200);p=uploaded.data.item;assert.ok(p.image_ref);
 const imageUrl='/api/v1/cafes/menu-cafe/menu/products/'+p.id+'/image';
 const image=await guest.get(imageUrl);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/jpeg');
 assert.equal((await guest.get(imageUrl,{'If-None-Match':image.headers.get('etag')})).status,304);
 await owner.patch(base+'/products/'+p.id,{version:p.version,published:false});
 assert.equal((await guest.get(imageUrl)).status,404);
 assert.equal((await owner.get(base+'/products/'+p.id+'/image')).status,200);
 }finally{await server.stop();}
});
test('concurrent versioned edits produce one winner and one conflict',async()=>{
 const {db,menu,user}=fixture();try{
 const c=await menu.create('a','categories',{name:'Coffee'},user);
 const results=await Promise.allSettled(['A','B'].map(name=>menu.update('a','categories',c.id,{name,version:c.version},user)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
 assert.equal((await menu.get('a','categories',c.id,user)).version,2);
 assert.equal(db.prepare("SELECT count(*) n FROM business_audit WHERE action='categories.update'").get().n,1);
 }finally{db.close();}
});
test('a storage failure after the product write rolls back both state and audit',async()=>{
 const {db,menu,user}=fixture();try{
 const c=await menu.create('a','categories',{name:'Coffee'},user);
 const p=await menu.create('a','products',{category_id:c.id,name:'Original',base_price:4000},user);
 const count=db.prepare('SELECT count(*) n FROM business_audit').get().n;
 db.exec("CREATE TRIGGER injected_audit_failure BEFORE INSERT ON business_audit WHEN NEW.action='products.update' BEGIN SELECT RAISE(ABORT,'injected_storage_failure'); END");
 await assert.rejects(menu.update('a','products',p.id,{version:p.version,name:'Must roll back'},user),/injected_storage_failure/);
 const after=await menu.get('a','products',p.id,user);assert.equal(after.name,'Original');assert.equal(after.version,p.version);
 assert.equal(db.prepare('SELECT count(*) n FROM business_audit').get().n,count);
 }finally{db.close();}
});
test('variant reassignment cap and audit immutability are database enforced',async()=>{
 const {db,menu,user}=fixture();try{
 const c=await menu.create('a','categories',{name:'Coffee'},user);
 const p=await menu.create('a','products',{category_id:c.id,name:'One',base_price:1},user);
 const q=await menu.create('a','products',{category_id:c.id,name:'Two',base_price:1},user);
 for(let i=0;i<20;i++)await menu.create('a','variants',{product_id:p.id,name:'Size '+i,price:1},user);
 const v=await menu.create('a','variants',{product_id:q.id,name:'Other',price:1},user);
 await assert.rejects(menu.update('a','variants',v.id,{version:v.version,product_id:p.id},user),{status:409,code:'menu_limit'});
 assert.equal((await menu.get('a','variants',v.id,user)).product_id,q.id);
 assert.throws(()=>db.prepare('DELETE FROM business_audit').run(),/business_audit_immutable/);
 }finally{db.close();}
});
test('image reference failure retains prior reference; retries deduplicate stored content',async()=>{
 const {createMenuMedia}=await import('../shared/business/menu-media.mjs');
 const {tinyJpeg}=await import('./support/server.mjs');
 const {db,menu,sql,user}=fixture();try{
 const c=await menu.create('a','categories',{name:'Coffee',published:true},user);
 let p=await menu.create('a','products',{category_id:c.id,name:'Coffee',base_price:1,published:true},user);
 let saves=0;const storage={save:async()=>{saves++;return {file:'isolated-fixture'};},read:async()=>Buffer.from('fixture')};
 const fail=(status,code,message)=>{throw Object.assign(new Error(message),{status,code});};
 const media=createMenuMedia({sql,menu,storage,fail,id:prefix=>prefix+randomUUID()});
 p=await media.replace('a',p.id,{version:p.version,image:tinyJpeg()},user);const reference=p.image_ref;
 p=await media.replace('a',p.id,{version:p.version,image:tinyJpeg()},user);
 assert.equal(saves,1);assert.equal(p.image_ref,reference);
 db.exec("CREATE TRIGGER injected_image_failure BEFORE UPDATE OF image_ref ON menu_items BEGIN SELECT RAISE(ABORT,'injected_image_failure'); END");
 await assert.rejects(media.remove('a',p.id,{version:p.version},user),/injected_image_failure/);
 assert.equal((await menu.get('a','products',p.id,user)).image_ref,reference);
 db.exec('DROP TRIGGER injected_image_failure');
 p=await media.remove('a',p.id,{version:p.version},user);assert.equal(p.image_ref,null);
 await assert.rejects(media.read('a',p.id,null,true),{status:404});
 }finally{db.close();}
});
