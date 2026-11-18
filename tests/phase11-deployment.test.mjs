import {test} from 'node:test';
import assert from 'node:assert/strict';
import {businessFixture,fail,id} from './support/business.mjs';
import {createMenuService} from '../shared/business/menu.mjs';
import {createMenuMedia} from '../shared/business/menu-media.mjs';
import {createInventoryService} from '../shared/business/inventory.mjs';
import {createReviewService} from '../shared/business/reviews.mjs';
import {readFileSync} from 'node:fs';

for(const operation of ['menu-create','menu-update','menu-bulk','csv','inventory','reply','moderation','review-disabled','media'])test(`deployment authority fence rolls back ${operation} after authority changes`,async()=>{
 const f=businessFixture();
 try{
  const category=await f.menu.create('a','categories',{name:'Coffee'},f.owner);
  const product=await f.menu.create('a','products',{name:'Latte',category_id:category.id,base_price:100},f.owner);
  const review=await createReviewService({...f,fail,id}).create('a',{taste:5,service:5,comfort:5,value:5,study:5},f.customer);
  const beforeAudit=f.db.prepare('SELECT count(*) n FROM business_audit').get().n;
  const beforeOutbox=f.db.prepare('SELECT count(*) n FROM notification_outbox').get().n;
  let armed=true,saved=false;
  const sql={...f.sql,batch:async entries=>{
   if(armed){armed=false;
    if(operation==='moderation')f.db.prepare("UPDATE users SET role='user' WHERE id='admin'").run();
    else if(operation==='review-disabled')f.db.prepare("UPDATE users SET disabled_at='2026-11-17' WHERE id='customer'").run();
    else f.db.prepare("UPDATE cafes SET owner_id='other' WHERE id='a'").run();
   }return f.sql.batch(entries);
  }};
  const menu=createMenuService({sql,fail,id}),reviews=createReviewService({sql,fail,id});
  const actions={
   'menu-create':()=>menu.create('a','categories',{name:'Unauthorized'},f.owner),
   'menu-update':()=>menu.update('a','products',product.id,{version:1,name:'Unauthorized'},f.owner),
   'menu-bulk':()=>menu.bulk('a','products',{items:[{id:product.id,version:1,name:'Unauthorized'}]},f.owner),
   csv:()=>{const csv=`category_id,name,description,base_price,discounted_price\n${category.id},Unauthorized,,100,`;return menu.importCsv('a',{csv},f.owner).then(p=>menu.importCsv('a',{csv,preview_id:p.preview_id,confirm:true},f.owner,true));},
   inventory:()=>createInventoryService({sql,fail,id}).mutate('a',{idempotency_key:'race',updates:[{product_id:product.id,version:0,mode:'quantity',quantity:4,reason:'restock'}]},f.owner),
   reply:()=>reviews.reply('a',review.id,{version:0,text:'Unauthorized'},f.owner),
   moderation:()=>reviews.moderate('a',review.id,{version:1,action:'hide',reason:'Unauthorized'},f.admin),
   'review-disabled':()=>reviews.edit('a',review.id,{version:1,comment:'Unauthorized'},f.customer),
   media:()=>createMenuMedia({sql,menu,fail,id,storage:{save:async()=>{saved=true;return {};}}}).replace('a',product.id,{version:1,image:'data:image/jpeg;base64,'+readFileSync(new URL('./fixtures/upload-valid.jpg',import.meta.url)).toString('base64')},f.owner)
  };
  await assert.rejects(actions[operation](),e=>e.status===409&&e.code==='version_conflict');
  assert.equal(f.db.prepare('SELECT name FROM menu_items WHERE id=?').get(product.id).name,'Latte');
  for(const table of ['inventory','inventory_movements','inventory_receipts','review_replies','menu_images'])assert.equal(f.db.prepare(`SELECT count(*) n FROM ${table}`).get().n,0);
  assert.equal(f.db.prepare('SELECT status FROM reviews WHERE id=?').get(review.id).status,'visible');
  assert.equal(f.db.prepare('SELECT count(*) n FROM business_audit').get().n,beforeAudit);
  assert.equal(f.db.prepare('SELECT count(*) n FROM notification_outbox').get().n,beforeOutbox);
  assert.equal(saved,false);
 }finally{f.db.close();}
});
