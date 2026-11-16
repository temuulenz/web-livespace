import {test} from 'node:test';
import assert from 'node:assert/strict';
import {businessFixture,fail,id} from './support/business.mjs';
import {createMenuMedia} from '../shared/business/menu-media.mjs';
import {reconcileMenuMedia} from '../shared/business/menu-media-reconcile.mjs';
import {tinyJpeg} from './support/server.mjs';
import {MENU_HARDENING_SCHEMA} from '../shared/business/menu-hardening-schema.mjs';
import {readFileSync} from 'node:fs';
test('hardening migration parity and atomic tenant quotas across concurrent writers',async()=>{
 assert.equal(readFileSync(new URL('../cloudflare/migrations/0010_menu_hardening.sql',import.meta.url),'utf8'),MENU_HARDENING_SCHEMA);
 const {db,menu,owner}=businessFixture();try{
 const insert=db.prepare("INSERT INTO menu_categories(id,cafe_id,name,created_at,updated_at) VALUES(?,'a','Category','x','x')");
 for(let i=0;i<99;i++)insert.run('cat'+i);
 const results=await Promise.allSettled([menu.create('a','categories',{name:'One'},owner),menu.create('a','categories',{name:'Two'},owner)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.code,'menu_limit');
 assert.equal(db.prepare("SELECT categories FROM menu_tenant_usage WHERE cafe_id='a'").get().categories,100);
 assert.equal(db.prepare('SELECT count(*) n FROM business_audit').get().n,1);
 }finally{db.close();}
});
test('media tenant and global byte budgets reserve atomically and rollback counters',()=>{
 const {db}=businessFixture();try{
 const insert=db.prepare("INSERT INTO menu_images(id,cafe_id,mime,size,sha256,created_at) VALUES(?,?,'image/jpeg',1048576,?,'x')");
 for(let i=0;i<50;i++)insert.run('im'+i,i<20?'a':i<40?'b':'c','hash'+i);
 assert.throws(()=>insert.run('overflow','c','overflow'),/CHECK/);
 assert.equal(db.prepare('SELECT bytes FROM menu_media_usage').get().bytes,50*1048576);
 assert.equal(db.prepare("SELECT images FROM menu_tenant_usage WHERE cafe_id='c'").get().images,10);
 assert.throws(()=>insert.run('tenant-overflow','a','tenant-overflow'),/CHECK/);
 db.prepare("DELETE FROM menu_images WHERE id='im0'").run();
 insert.run('after-delete','a','after-delete');
 assert.equal(db.prepare('SELECT count(*) n FROM menu_images').get().n,50);
 }finally{db.close();}
});
test('planned upload journal survives storage failure/restart and GC protects references',async()=>{
 const {db,sql,menu,owner}=businessFixture();try{
 const cat=await menu.create('a','categories',{name:'Cat',published:true},owner);
 let p=await menu.create('a','products',{category_id:cat.id,name:'Coffee',base_price:1,published:true},owner);
 const objects=new Map();let broken=true;
 const storage={plan:(cafe,key,photo)=>({object_key:`media/v1/cafes/${cafe}/${key}.${photo.ext}`}),async save(cafe,key,photo){const plan=this.plan(cafe,key,photo);objects.set(plan.object_key,photo.buffer);if(broken)throw Error('R2 ambiguous put');return plan;},async remove(image){objects.delete(image.object_key);},async read(image){return objects.get(image.object_key);}};
 let media=createMenuMedia({sql,menu,storage,fail,id});
 await assert.rejects(media.replace('a',p.id,{image:tinyJpeg(),version:p.version},owner),/ambiguous/);
 assert.equal((await menu.get('a','products',p.id,owner)).image_ref,null);
 const pending=db.prepare('SELECT * FROM menu_images').get();assert.ok(pending.object_key);assert.equal(pending.ready,0);assert.equal(objects.size,1);
 db.prepare("UPDATE menu_images SET created_at='2020-01-01'").run();
 const gc={sql,storage,fail};const opts={cafe_id:'a',older_than:'2021-01-01'};
 assert.equal((await reconcileMenuMedia(gc,opts)).candidates.length,1);assert.equal(objects.size,1);
 await reconcileMenuMedia(gc,{...opts,dry_run:false});assert.equal(objects.size,0);assert.equal(db.prepare('SELECT images FROM menu_media_usage').get().images,0);
 // Reconstruct service after simulated crash; identical content can upload again.
 broken=false;media=createMenuMedia({sql,menu,storage,fail,id});p=await media.replace('a',p.id,{image:tinyJpeg(),version:p.version},owner);
 db.prepare("UPDATE menu_images SET created_at='2020-01-01'").run();
 assert.equal((await reconcileMenuMedia(gc,opts)).candidates.length,0);
 assert.throws(()=>db.prepare('DELETE FROM menu_images WHERE id=?').run(p.image_ref),/menu_image_in_use/);
 assert.equal((await media.read('a',p.id,null,true)).image.id,p.image_ref);
 await assert.rejects(media.read('b',p.id,owner,false),{status:404});
 }finally{db.close();}
});
test('maximum tenant snapshot stays bounded with 100 categories, 1000 products, 2000 variants',async()=>{
 const {db,menu}=businessFixture();try{
 db.exec('BEGIN');
 for(let i=0;i<100;i++)db.prepare("INSERT INTO menu_categories(id,cafe_id,name,published,created_at,updated_at) VALUES(?,'a','Category',1,'x','x')").run('cat'+i);
 for(let i=0;i<1000;i++)db.prepare("INSERT INTO menu_items(id,cafe_id,category_id,name,base_price,published,created_at,updated_at) VALUES(?,'a','cat0','Item',1,1,'x','x')").run('p'+String(i).padStart(4,'0'));
 for(let i=0;i<2000;i++)db.prepare("INSERT INTO menu_item_variants(id,cafe_id,product_id,name,price,created_at,updated_at) VALUES(?,'a',?,'Variant',1,'x','x')").run('v'+i,'p'+String(Math.floor(i/20)).padStart(4,'0'));
 db.exec('COMMIT');
 const value=await menu.publicMenu('a',{limit:'100'});
 assert.equal(value.categories.length,100);assert.equal(value.products.length,100);assert.equal(value.products.reduce((n,p)=>n+p.variants.length,0),2000);assert.equal(value.pagination.has_more,true);
 assert.ok(Buffer.byteLength(JSON.stringify(value))<1024*1024);
 db.prepare("UPDATE cafes SET status='submitted' WHERE id='a'").run();await assert.rejects(menu.publicMenu('a',{limit:'100'}),{status:404});
 }finally{db.close();}
});
