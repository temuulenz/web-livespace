import {test} from 'node:test';
import assert from 'node:assert/strict';
import {businessFixture,fail,id} from './support/business.mjs';
import {createInventoryService} from '../shared/business/inventory.mjs';
import {INVENTORY_SCHEMA} from '../shared/business/inventory-schema.mjs';
import {readFileSync} from 'node:fs';
async function fixture(){const f=businessFixture();const c=await f.menu.create('a','categories',{name:'Cat',published:true},f.owner);const product=await f.menu.create('a','products',{category_id:c.id,name:'Coffee',base_price:5000,published:true},f.owner);const events=[];const stock=createInventoryService({sql:f.sql,fail,id,afterCommit:async event=>{assert.ok(f.db.prepare('SELECT request_id FROM inventory_receipts LIMIT 1').get());events.push(event);}});return {...f,product,stock,events};}
const mutation=(product_id,version,fields={})=>({product_id,version,reason:'manual_adjustment',...fields});
test('inventory quantities, public visibility, zero/sold-out and durable retry receipts',async()=>{
 assert.equal(readFileSync(new URL('../cloudflare/migrations/0011_inventory.sql',import.meta.url),'utf8'),INVENTORY_SCHEMA);
 const f=await fixture();try{const {stock,product,owner,db,events}=f;
 const request={idempotency_key:'initial',updates:[mutation(product.id,0,{mode:'quantity',quantity:3,low_stock_threshold:2})]};
 let result=await stock.mutate('a',request,owner);assert.equal(result.items[0].quantity,3);
 assert.equal((await stock.mutate('a',request,owner)).duplicate,true);assert.equal(events.length,1);
 assert.equal(db.prepare('SELECT count(*) n FROM inventory_movements').get().n,1);
 for(const [field,value] of [['variant_id',''],['quantity',null],['mode',null],['status',null],['low_stock_threshold',null]])await assert.rejects(stock.mutate('a',{idempotency_key:'invalid-'+field,updates:[mutation(product.id,1,{[field]:value})]},owner),{status:422});
 await assert.rejects(stock.mutate('a',{...request,updates:[mutation(product.id,0,{quantity:5})]},owner),{status:409,code:'idempotency_conflict'});
 assert.equal('quantity' in (await stock.snapshot('a')).items[0],false);
 result=await stock.mutate('a',{idempotency_key:'decrement',updates:[mutation(product.id,1,{delta:-1,show_quantity:true})]},owner);
 let publicItem=(await stock.snapshot('a')).items[0];assert.equal(publicItem.quantity,2);assert.equal(publicItem.low_stock,true);
 await stock.mutate('a',{idempotency_key:'empty',updates:[mutation(product.id,2,{quantity:0})]},owner);publicItem=(await stock.snapshot('a')).items[0];assert.equal(publicItem.status,'sold_out');assert.equal(publicItem.quantity,0);
 await assert.rejects(stock.mutate('a',{idempotency_key:'negative',updates:[mutation(product.id,3,{delta:-1})]},owner),{status:422});
 assert.equal((await stock.movements('a',{},owner)).items.length,3);
 assert.equal((await stock.list('a',{sold_out:'true'},owner)).items.length,1);
 }finally{f.db.close();}
});
test('inventory source conflicts, ordered source switch and cross-tenant/role denial',async()=>{
 const f=await fixture();try{const {stock,product,owner,other,customer,menu}=f;
 await assert.rejects(stock.list('a',{},other),{status:404});await assert.rejects(stock.movements('a',{},customer),{status:403});await assert.rejects(stock.list('a',{},null),{status:401});
 const variant=await menu.create('a','variants',{product_id:product.id,name:'Large',price:6000},owner);
 await stock.mutate('a',{idempotency_key:'product',updates:[mutation(product.id,0,{status:'temporarily_unavailable'})]},owner);
 await assert.rejects(stock.mutate('a',{idempotency_key:'conflict',updates:[mutation(product.id,0,{variant_id:variant.id})]},owner),{status:409,code:'inventory_source_conflict'});
 await stock.mutate('a',{idempotency_key:'switch',updates:[mutation(product.id,1,{enabled:false}),mutation(product.id,0,{variant_id:variant.id,mode:'quantity',quantity:10})]},owner);
 assert.equal((await stock.snapshot('a')).items[0].variant_id,variant.id);
 await assert.rejects(stock.mutate('a',{idempotency_key:'foreign',updates:[mutation(product.id,0,{variant_id:'foreign'})]},owner),{status:422});
 }finally{f.db.close();}
});
test('concurrent decrements have one winner and movement/audit failure rolls back whole mutation',async()=>{
 const f=await fixture();try{const {stock,product,owner,db}=f;
 await stock.mutate('a',{idempotency_key:'initial',updates:[mutation(product.id,0,{mode:'quantity',quantity:1})]},owner);
 const results=await Promise.allSettled(['one','two'].map(key=>stock.mutate('a',{idempotency_key:key,updates:[mutation(product.id,1,{delta:-1})]},owner)));
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.code,'version_conflict');
 assert.equal(db.prepare('SELECT count(*) n FROM inventory_movements').get().n,2);
 db.exec("CREATE TRIGGER fail_movement BEFORE INSERT ON inventory_movements BEGIN SELECT RAISE(ABORT,'injected_movement_failure'); END");
 await assert.rejects(stock.mutate('a',{idempotency_key:'failure',updates:[mutation(product.id,2,{quantity:10})]},owner));
 assert.equal((await stock.list('a',{},owner)).items[0].quantity,0);assert.equal(db.prepare("SELECT count(*) n FROM inventory_receipts WHERE request_id='failure'").get().n,0);
 }finally{f.db.close();}
});
test('bulk inventory updates rollback on later conflict and emit only public post-commit deltas',async()=>{
 const f=await fixture();try{const {stock,product,owner,db,menu,events}=f;
 await stock.mutate('a',{idempotency_key:'initial',updates:[mutation(product.id,0,{mode:'quantity',quantity:10})]},owner);
 const p2=await menu.create('a','products',{category_id:product.category_id,name:'Draft',base_price:1},owner);
 await stock.mutate('a',{idempotency_key:'draft',updates:[mutation(p2.id,0,{mode:'quantity',quantity:999,show_quantity:true})]},owner);
 assert.equal(events.at(-1).items.length,0);assert.ok(!JSON.stringify(events).includes('999'));
 db.exec("CREATE TRIGGER fail_second BEFORE UPDATE ON inventory WHEN OLD.product_id='"+p2.id+"' BEGIN SELECT RAISE(ABORT,'injected_second_failure'); END");
 await assert.rejects(stock.mutate('a',{idempotency_key:'bulk',updates:[mutation(product.id,1,{quantity:2}),mutation(p2.id,1,{quantity:3})]},owner));
 assert.equal((await stock.list('a',{product_id:product.id},owner)).items[0].quantity,10);
 assert.equal(db.prepare('SELECT count(*) n FROM inventory_movements').get().n,2);
 }finally{f.db.close();}
});
test('Node inventory HTTP and SSE deliver a persisted cafe-scoped public delta',async()=>{
 const {startServer}=await import('./support/server.mjs');
 const server=await startServer({seedDemo:false});let abort;
 try{
 const client=server.client(),guest=server.client();const registered=await client.post('/api/v1/auth/register',{email:'stock-owner@example.invalid',password:'local-password-123'});const user=registered.data.user,db=server.app.deps.db;
 db.prepare("UPDATE users SET role='owner' WHERE id=?").run(user.id);db.prepare("INSERT INTO cafes(id,name,owner_id,status,data_mode,created_at,updated_at) VALUES('stock-http','Stock',?,'active','demo','2026-01-01','2026-01-01')").run(user.id);
 const base='/api/v1/owner/cafes/stock-http';const category=(await client.post(base+'/menu/categories',{name:'Cat',published:true})).data.item;
 const product=(await client.post(base+'/menu/products',{category_id:category.id,name:'Item',base_price:1,published:true})).data.item;
 assert.equal((await guest.post(base+'/inventory/mutations',{})).status,401);
 assert.equal((await client.post(base+'/inventory/mutations',{}, {Origin:'https://evil.invalid'})).status,403);
 abort=new AbortController();const stream=await fetch(server.origin+'/api/v1/cafes/stock-http/inventory/stream',{signal:abort.signal});assert.equal(stream.status,200);const reader=stream.body.getReader();await reader.read();
 const result=await client.post(base+'/inventory/mutations',{idempotency_key:'http-initial',updates:[mutation(product.id,0,{mode:'quantity',quantity:1})]});assert.equal(result.status,200);
 const message=new TextDecoder().decode((await reader.read()).value);assert.match(message,/inventory.changed/);assert.match(message,/stock-http/);assert.ok(!message.includes('movement'));
 assert.equal((await guest.get('/api/v1/cafes/stock-http/inventory')).data.items[0].status,'available');
 assert.equal((await client.get(base+'/inventory/movements')).data.items.length,1);
 }finally{abort?.abort();await server.stop();}
});
