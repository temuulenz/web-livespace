import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,copyFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {businessFixture,fail,id} from './support/business.mjs';
import {openDatabase,transaction} from '../server/lib/db.mjs';
import {createUploads} from '../server/services/uploads.mjs';
import {createMenuService} from '../shared/business/menu.mjs';
import {createMenuMedia} from '../shared/business/menu-media.mjs';
import {createInventoryService} from '../shared/business/inventory.mjs';
import {createReviewService} from '../shared/business/reviews.mjs';
import {tinyJpeg} from './support/server.mjs';
test('disposable SQLite and upload snapshot restores integrity and business-service compatibility',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'livespace-restore-test-')),f=businessFixture();let sourceOpen=true,restored;
 try{
 const source=join(directory,'source'),target=join(directory,'restored'),uploads=createUploads(source);
 const category=await f.menu.create('a','categories',{name:'Synthetic category',published:true},f.owner);
 let product=await f.menu.create('a','products',{category_id:category.id,name:'Synthetic product',base_price:1234,published:true},f.owner);
 const media=createMenuMedia({sql:f.sql,menu:f.menu,fail,id,storage:{plan:(_,key,p)=>({file:`fixture/${key}.${p.ext}`}),save:async(_,key,p)=>({file:await uploads.save('fixture',key,p)})}});
 product=await media.replace('a',product.id,{version:product.version,image:tinyJpeg()},f.owner);
 const stock=createInventoryService({sql:f.sql,fail,id});await stock.mutate('a',{idempotency_key:'restore-fixture',updates:[{product_id:product.id,version:0,mode:'quantity',quantity:7,reason:'restock'}]},f.owner);
 await createReviewService({sql:f.sql,fail,id}).create('a',{taste:3,service:4,comfort:5,value:2,study:1,comment:'Synthetic restore fixture'},f.customer);
 // Consistent SQLite snapshot; plain copying a live WAL database is unsafe.
 const snapshot=join(directory,'snapshot.sqlite');f.db.prepare('VACUUM INTO ?').run(snapshot);
 await mkdir(target);await copyFile(snapshot,join(target,'livespace.db'));await cp(join(source,'uploads'),join(target,'uploads'),{recursive:true});
 f.db.close();sourceOpen=false;
 restored=openDatabase(join(target,'livespace.db'));
 assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(restored.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(restored.prepare('PRAGMA user_version').get().user_version,11);
 const sql={first:(q,...a)=>restored.prepare(q).get(...a),all:(q,...a)=>restored.prepare(q).all(...a),batch:entries=>transaction(restored,()=>entries.map(([q,...a])=>restored.prepare(q).run(...a)))};
 assert.equal((await createMenuService({sql,fail,id}).publicMenu('a')).products[0].id,product.id);
 assert.equal((await createInventoryService({sql,fail,id}).list('a',{},f.owner)).items[0].quantity,7);
 assert.equal((await createReviewService({sql,fail,id}).summary('a')).overall_average,3);
 const metadata=restored.prepare('SELECT file,sha256 FROM menu_images WHERE id=?').get(product.image_ref),bytes=await createUploads(target).read(metadata.file);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),metadata.sha256);
 assert.equal((await createInventoryService({sql,fail,id}).mutate('a',{idempotency_key:'restore-fixture',updates:[{product_id:product.id,version:0,mode:'quantity',quantity:7,reason:'restock'}]},f.owner)).duplicate,true);
 }finally{if(sourceOpen)f.db.close();restored?.close();await rm(directory,{recursive:true,force:true});}
});
