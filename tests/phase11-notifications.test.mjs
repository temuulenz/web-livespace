import {test} from 'node:test';
import assert from 'node:assert/strict';
import {businessFixture,fail,id} from './support/business.mjs';
import {createNotifications} from '../shared/business/notifications.mjs';
import {createReviewService} from '../shared/business/reviews.mjs';
import {createInventoryService} from '../shared/business/inventory.mjs';
import {createPromotionService} from '../shared/business/promotions-service.mjs';
import {phase11Config} from '../shared/business/phase11-config.mjs';
const options={...phase11Config(),cooldownSec:0};
async function drain(n,advance){for(let i=0;i<25;i++){advance();await n.maintenance();}}
function fixture(){const f=businessFixture();let time=Date.now();const clock=()=>new Date(time).toISOString(),advance=()=>{time+=2000;};return {...f,clock,advance,n:createNotifications({sql:f.sql,fail,id,options,clock})};}
test('review, reply and moderation notifications persist and enforce recipient-only read state',async()=>{
 const f=fixture();try{
  const reviews=createReviewService({...f,fail,id,clock:f.clock});const review=await reviews.create('a',{taste:5,service:4,comfort:3,value:2,study:1},f.customer);
  await drain(f.n,f.advance);let messages=await f.n.list({},f.owner);assert.equal(messages.items.filter(x=>x.category==='review_submitted').length,1);
  await reviews.reply('a',review.id,{version:0,text:'Thank you'},f.owner);await drain(f.n,f.advance);const authorMessages=(await f.n.list({},f.customer)).items;assert.equal(authorMessages[0].category,'review_reply');
  await assert.rejects(f.n.read(authorMessages[0].id,f.owner),e=>e.status===404);
  await f.n.read(authorMessages[0].id,f.customer);assert.equal((await f.n.list({},f.customer)).unread,0);
  await reviews.moderate('a',review.id,{version:1,action:'hide',reason:'Policy'},f.admin);await drain(f.n,f.advance);
  assert.ok((await f.n.list({},f.owner)).items.some(x=>x.category==='moderation'));assert.ok((await f.n.list({},f.customer)).items.some(x=>x.category==='moderation'));
  const reconstructed=createNotifications({...f,fail,id,options,clock:f.clock});assert.equal((await reconstructed.list({},f.owner)).items.length,(await f.n.list({},f.owner)).items.length);
  await f.n.read(null,f.owner);assert.equal((await f.n.list({},f.owner)).unread,0);
 }finally{f.db.close();}
});
test('inventory only emits on threshold/state crossing and marketing requires opt-in plus relevance',async()=>{
 const f=fixture();try{
  const c=await f.menu.create('a','categories',{name:'Coffee',published:true},f.owner),p=await f.menu.create('a','products',{name:'Latte',category_id:c.id,base_price:5000,published:true},f.owner),stock=createInventoryService({...f,fail,id,clock:f.clock});
  const update=(key,version,quantity)=>stock.mutate('a',{idempotency_key:key,updates:[{product_id:p.id,version,mode:'quantity',quantity,low_stock_threshold:3,reason:'restock'}]},f.owner);
  await update('initial',0,10);await update('low',1,3);await update('still-low',2,2);await drain(f.n,f.advance);
  assert.equal((await f.n.list({},f.owner)).items.filter(x=>x.category==='inventory').length,1);
  await update('empty',3,0);await drain(f.n,f.advance);assert.equal((await f.n.list({},f.owner)).items.filter(x=>x.category==='inventory').length,2);
  await f.n.preferences(f.customer,{promotion:true});f.db.prepare("INSERT INTO favorites VALUES('customer','a',?)").run(f.clock());
  const promotions=createPromotionService({...f,fail,id,clock:f.clock});await promotions.create('a',{name:'Sale',kind:'fixed',value:100,starts_at:new Date(Date.now()-1000).toISOString(),ends_at:new Date(Date.now()+3600000).toISOString(),published:true},f.owner);
  await drain(f.n,f.advance);assert.equal((await f.n.list({},f.customer)).items.filter(x=>x.category==='promotion').length,1);assert.equal((await f.n.list({},f.other)).items.length,0);
  assert.ok((await f.n.list({},f.owner)).items.some(x=>x.category==='promotion_expiry'));
 }finally{f.db.close();}
});
test('sensor incidents are deduplicated and notify owners/admins without recording credentials',async()=>{
 const f=fixture();try{
  f.db.prepare("INSERT INTO devices(id,cafe_id,token_hash,kind,is_test,created_at,last_seen_at,connection_status) VALUES('sensor','a','private-hash','sensor',0,?,?,'online')").run(f.clock(),f.clock());
  f.db.prepare("UPDATE devices SET connection_status='offline' WHERE id='sensor'").run();f.db.prepare("UPDATE devices SET connection_status='offline' WHERE id='sensor'").run();await drain(f.n,f.advance);
  for(const user of [f.owner,f.admin])assert.equal((await f.n.list({},user)).items.filter(x=>x.category==='sensor_offline').length,1);
  f.db.prepare("UPDATE devices SET connection_status='online',last_seen_at=? WHERE id='sensor'").run(f.clock());await drain(f.n,f.advance);
  assert.equal((await f.n.list({},f.owner)).items.filter(x=>x.category==='sensor_recovered').length,1);
  assert.ok(!JSON.stringify(await f.n.list({},f.owner)).includes('private-hash'));
 }finally{f.db.close();}
});

test('concurrent workers cannot double-deliver or exceed notification budgets; consent is checked during insertion',async()=>{
 const f=fixture();try{
  const reviews=createReviewService({...f,fail,id,clock:f.clock});await reviews.create('a',{taste:5,service:4,comfort:3,value:2,study:1},f.customer);
  const bounded=createNotifications({sql:f.sql,fail,id,options:{...options,notificationDaily:1},clock:f.clock});await Promise.all([bounded.maintenance(),bounded.maintenance()]);
  assert.equal((await bounded.list({},f.owner)).items.length,1);assert.equal(f.db.prepare("SELECT n FROM notification_budgets WHERE recipient_id='owner'").get().n,1);
  await reviews.create('c',{taste:5,service:4,comfort:3,value:2,study:1},f.customer);await drain(bounded,f.advance);assert.equal((await bounded.list({},f.owner)).items.length,1);assert.ok(f.db.prepare('SELECT count(*) n FROM notification_outbox WHERE processed_at IS NULL').get().n>0);
 }finally{f.db.close();}
});
test('a cafe ownership change during delivery fences the former owner',async()=>{
 const f=fixture();try{
  await createReviewService({...f,fail,id,clock:f.clock}).create('a',{taste:5,service:4,comfort:3,value:2,study:1},f.customer);
  let changed=false;const sql={...f.sql,batch:async entries=>{if(!changed&&entries.some(([q])=>q.includes('INSERT OR IGNORE INTO notifications('))){changed=true;f.db.prepare("UPDATE cafes SET owner_id='other' WHERE id='a'").run();}return f.sql.batch(entries);}};
  const service=createNotifications({sql,fail,id,options,clock:f.clock});await drain(service,f.advance);assert.equal((await service.list({},f.owner)).items.length,0);assert.equal((await service.list({},f.other)).items.length,1);
 }finally{f.db.close();}
});
