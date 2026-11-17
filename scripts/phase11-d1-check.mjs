import {createNotifications} from '../shared/business/notifications.mjs';
import {DatabaseSync} from 'node:sqlite';
import {initializeAnalytics,acceptAnalytics,flushAnalytics} from '../cloudflare/analytics-store.mjs';
import {validateBehavior} from '../shared/business/behavior.mjs';
import {phase11Config} from '../shared/business/phase11-config.mjs';
import {createPhase11} from '../shared/business/phase11.mjs';
import {createPromotionService} from '../shared/business/promotions-service.mjs';
import {createReviewService} from '../shared/business/reviews.mjs';
import {reconcileCafeRatings} from '../shared/business/reviews-reconcile.mjs';
import {createInventoryService} from '../shared/business/inventory.mjs';
// Real local workerd D1 metadata + optional local R2. No remote bindings.
import {mkdtemp,readFile,readdir,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {getPlatformProxy,unstable_splitSqlQuery} from 'wrangler';
import assert from 'node:assert/strict';
import {createMenuService} from '../shared/business/menu.mjs';
import {createMenuMedia} from '../shared/business/menu-media.mjs';
import {reconcileMenuMedia} from '../shared/business/menu-media-reconcile.mjs';
import {createMenuStorage} from '../cloudflare/menu-media-storage.mjs';
import {businessSqlError} from '../shared/business/sql-errors.mjs';
const dir=await mkdtemp(join(tmpdir(),'livespace-business-d1-'));
const original=JSON.parse(await readFile('wrangler.jsonc','utf8'));
const config=join(dir,'wrangler.json');
await writeFile(config,JSON.stringify({name:'livespace-business-local',compatibility_date:original.compatibility_date,compatibility_flags:['nodejs_compat'],d1_databases:[{binding:'DB',database_name:'isolated',database_id:'local-only'}],r2_buckets:[{binding:'MEDIA',bucket_name:'isolated-menu-images'}]}));
const proxy=await getPlatformProxy({configPath:config,persist:false,remoteBindings:false});
try{
 const db=proxy.env.DB;for(const name of (await readdir('cloudflare/migrations')).sort())for(const query of unstable_splitSqlQuery(await readFile('cloudflare/migrations/'+name,'utf8')))await db.prepare(query).run();
 const fail=(status,code,message)=>{throw Object.assign(new Error(message),{status,code});},id=p=>p+'_'+crypto.randomUUID();let observed=[];
 const record=r=>{observed.push({rows_read:r.meta.rows_read,rows_written:r.meta.rows_written});return r;};
 const sql={first:async(q,...a)=>record(await db.prepare(q).bind(...a).all()).results[0]||null,all:async(q,...a)=>record(await db.prepare(q).bind(...a).all()).results,batch:async entries=>{try{const results=await db.batch(entries.map(([q,...a])=>db.prepare(q).bind(...a)));results.forEach(record);return results;}catch(e){businessSqlError(e,fail);}}};
 await sql.batch([["INSERT INTO users(id,email,password_hash,name,role,created_at) VALUES('owner','local@example.invalid','unused','','owner','2026-01-01')"],["INSERT INTO cafes(id,name,owner_id,status,data_mode,created_at,updated_at) VALUES('fixture','Isolated','owner','active','demo','2026-01-01','2026-01-01')"]]);
 const user={id:'owner',role:'owner'},menu=createMenuService({sql,fail,id});
 const category=await menu.create('fixture','categories',{name:'Cat',published:true},user);
 const measurements={};
 async function measure(name,fn){observed=[];const value=await fn();measurements[name]={statements:observed.length,rows_read:observed.reduce((n,x)=>n+x.rows_read,0),rows_written:observed.reduce((n,x)=>n+x.rows_written,0)};return value;}
 let p=await measure('product_create',()=>menu.create('fixture','products',{category_id:category.id,name:'Item',base_price:5000,published:true},user));
 for(let i=0;i<29;i++)await menu.create('fixture','products',{category_id:category.id,name:'Fixture '+i,base_price:5000,published:true},user);
 await measure('cold_menu_30_products',()=>menu.publicMenu('fixture'));
 await measure('warm_menu_30_products',()=>menu.publicMenu('fixture'));
 p=await measure('product_update',()=>menu.update('fixture','products',p.id,{version:p.version,name:'Changed'},user));
 const updates=await Promise.allSettled(['A','B'].map(name=>menu.update('fixture','products',p.id,{version:p.version,name},user)));assert.equal(updates.filter(x=>x.status==='fulfilled').length,1);assert.equal(updates.find(x=>x.status==='rejected').reason.code,'version_conflict');
 // Inject failure after the entity write. D1 batch must roll back entity+audit.
 await db.prepare("CREATE TRIGGER injected_failure BEFORE INSERT ON business_audit WHEN NEW.action='products.update' BEGIN SELECT RAISE(ABORT,'injected_failure'); END").run();
 p=await menu.get('fixture','products',p.id,user);await assert.rejects(menu.update('fixture','products',p.id,{version:p.version,name:'must rollback'},user));assert.equal((await menu.get('fixture','products',p.id,user)).name,p.name);await db.prepare('DROP TRIGGER injected_failure').run();
 const photo='data:image/jpeg;base64,'+(await readFile('tests/fixtures/upload-valid.jpg')).toString('base64');
 const env={...proxy.env,LS_R2_MEDIA_ENABLED:'1'},storage=createMenuStorage(env);
 let broken=true;
 const faulty={...storage,async save(...args){const value=await storage.save(...args);if(broken)throw Error('ambiguous local R2 put');return value;}};
 let media=createMenuMedia({sql,menu,fail,id,storage:faulty});await assert.rejects(media.replace('fixture',p.id,{version:p.version,image:photo},user),/ambiguous/);
 let staged=await sql.first('SELECT * FROM menu_images LIMIT 1');assert.ok(staged.object_key);assert.ok(await env.MEDIA.head(staged.object_key));
 await sql.batch([["UPDATE menu_images SET created_at='2020-01-01' WHERE id=?",staged.id]]);
 await reconcileMenuMedia({sql,storage,fail},{cafe_id:'fixture',older_than:'2021-01-01',dry_run:false});assert.equal(await env.MEDIA.head(staged.object_key),null);
 // New service instance recovers durable state, not memory.
 broken=false;media=createMenuMedia({sql,menu,fail,id,storage:createMenuStorage(env)});
 p=await measure('r2_image_upload_and_attach',()=>media.replace('fixture',p.id,{version:p.version,image:photo},user));
 staged=await sql.first('SELECT * FROM menu_images WHERE id=?',p.image_ref);assert.equal(staged.bytes,null);assert.ok(await env.MEDIA.head(staged.object_key));
 await assert.rejects(media.read('other',p.id,user,false),{status:404});
 const inventory=createInventoryService({sql,fail,id});
 const request={idempotency_key:'initial-stock',updates:[{product_id:p.id,version:0,reason:'restock',mode:'quantity',quantity:10,low_stock_threshold:2}]};
 await measure('inventory_create',()=>inventory.mutate('fixture',request,user));
 await measure('inventory_duplicate',()=>inventory.mutate('fixture',request,user));
 await measure('inventory_decrement',()=>inventory.mutate('fixture',{idempotency_key:'decrement',updates:[{product_id:p.id,version:1,delta:-1,reason:'manual_adjustment'}]},user));
 await measure('inventory_public_snapshot',()=>inventory.snapshot('fixture'));
 const stockRace=await Promise.allSettled(['stock-race-a','stock-race-b'].map(key=>inventory.mutate('fixture',{idempotency_key:key,updates:[{product_id:p.id,version:2,delta:-1,reason:'waste'}]},user)));
 assert.equal(stockRace.filter(x=>x.status==='fulfilled').length,1);assert.equal(stockRace.find(x=>x.status==='rejected').reason.code,'version_conflict');
 const stockBefore=(await inventory.list('fixture',{},user)).items[0];
 await db.prepare("CREATE TRIGGER injected_stock_failure BEFORE INSERT ON inventory_movements BEGIN SELECT RAISE(ABORT,'injected_stock_failure'); END").run();
 await assert.rejects(inventory.mutate('fixture',{idempotency_key:'stock-rollback',updates:[{product_id:p.id,version:stockBefore.version,quantity:999,reason:'correction'}]},user));
 assert.equal((await inventory.list('fixture',{},user)).items[0].quantity,stockBefore.quantity);assert.equal(await sql.first("SELECT request_id FROM inventory_receipts WHERE request_id='stock-rollback'"),null);await db.prepare('DROP TRIGGER injected_stock_failure').run();
 const reviews=createReviewService({sql,fail,id});
 let review=await measure('review_create',()=>reviews.create('fixture',{taste:5,service:4,comfort:3,value:2,study:1,comment:'Local only'},user));
 review=await measure('review_edit',()=>reviews.edit('fixture',review.id,{version:review.version,taste:3},user));
 await measure('rating_summary_cold',()=>reviews.summary('fixture'));
 await measure('rating_summary_warm',()=>reviews.summary('fixture'));
 const administrator={id:'local-admin',role:'admin'};
 await sql.batch([["INSERT INTO users(id,email,password_hash,name,role,created_at) VALUES('local-admin','local-admin@example.invalid','unused','','admin','2026-01-01')"]]);
 review=await measure('review_hide',()=>reviews.moderate('fixture',review.id,{version:review.version,action:'hide',reason:'Local moderation fixture'},administrator));
 assert.equal((await reviews.summary('fixture')).review_count,0);
 await measure('rating_reconciliation',()=>reconcileCafeRatings({sql,fail,id},'fixture',administrator));
 review=await reviews.moderate('fixture',review.id,{version:review.version,action:'restore',reason:'Local restoration fixture'},administrator);assert.equal((await reviews.summary('fixture')).review_count,1);
 const reviewRace=await Promise.allSettled([reviews.edit('fixture',review.id,{version:review.version,study:5},user),reviews.moderate('fixture',review.id,{version:review.version,action:'hide',reason:'Local race fixture'},administrator)]);
 assert.equal(reviewRace.filter(x=>x.status==='fulfilled').length,1);assert.equal(reviewRace.find(x=>x.status==='rejected').reason.code,'version_conflict');
 const persistedReview=await reviews.mine('fixture',user),persistedRating=await reviews.summary('fixture');assert.equal(persistedRating.review_count,persistedReview.status==='visible'?1:0);if(persistedReview.status==='visible')assert.equal(persistedRating.overall_average,persistedReview.overall_rating);
 const promotions=createPromotionService({sql,fail,id});
 const promoInput={name:'Simulated probe promotion',kind:'percentage',value:25,product_id:p.id,published:true,starts_at:new Date(Date.now()-60000).toISOString(),ends_at:new Date(Date.now()+3600000).toISOString()};
 let promo=(await measure('promotion_create',()=>promotions.create('fixture',promoInput,user))).promotion;
 await measure('promotion_public_list',()=>promotions.publicList('fixture'));
 const price=await measure('menu_with_promotion',()=>menu.publicMenu('fixture',{product_id:p.id}));assert.equal(price.products[0].effective_price,3750);
 const promotionRace=await Promise.allSettled(['A','B'].map(name=>promotions.update('fixture',promo.id,{version:promo.version,name},user)));
 assert.equal(promotionRace.filter(x=>x.status==='fulfilled').length,1);assert.equal(promotionRace.find(x=>x.status==='rejected').reason.code,'version_conflict');
 promo=(await promotions.list('fixture',{},user)).items[0];
 await db.prepare("CREATE TRIGGER injected_promotion_failure BEFORE INSERT ON business_audit WHEN NEW.action='promotions.update' BEGIN SELECT RAISE(ABORT,'injected_promotion_failure'); END").run();
 await assert.rejects(promotions.update('fixture',promo.id,{version:promo.version,published:false},user));
 assert.equal((await promotions.publicList('fixture')).promotions.length,1);await db.prepare('DROP TRIGGER injected_promotion_failure').run();
 await measure('promotion_unpublish',()=>promotions.update('fixture',promo.id,{version:promo.version,published:false},user));
 assert.equal((await menu.publicMenu('fixture',{product_id:p.id})).products[0].effective_price,5000);
 const options=phase11Config({LS_ANALYTICS_MIN_COHORT:'3'}),phase11=createPhase11({sql,fail,id,options});
 const local=new DatabaseSync(':memory:');const localSql={exec(q,...args){const stmt=local.prepare(q);return stmt.all(...args);}},collector={storage:{sql:localSql,transactionSync(fn){local.exec('BEGIN');try{const result=fn();local.exec('COMMIT');return result;}catch(e){local.exec('ROLLBACK');throw e;}}}};initializeAnalytics(localSql);
 for(let i=0;i<3;i++)acceptAnalytics(collector,validateBehavior({schemaVersion:2,cafeId:'fixture',events:[{id:'d1-behavior-'+i,type:'product_view',productId:p.id}]},'session-'+i),Date.now(),options);
 const measuredSink={prepare:q=>db.prepare(q),batch:async statements=>{const result=await db.batch(statements);result.forEach(record);return result;}};
 await measure('behavior_dimension_flush',()=>flushAnalytics(collector,measuredSink,Date.now(),options));
 const insight=await measure('owner_analytics_cold',()=>phase11.insights.read('fixture',{},user));assert.equal(insight.current.unique_sessions,3);
 await measure('owner_analytics_cached',()=>phase11.insights.read('fixture',{},user));
 await assert.rejects(phase11.insights.read('fixture',{}, {id:'local-admin',role:'owner'}),{status:404});
 await measure('notification_maintenance',()=>phase11.notifications.maintenance());
 await measure('resource_monitor',()=>phase11.resources.read('fixture',user));
 await measure('resource_threshold_evaluation',()=>phase11.resources.evaluate('fixture'));
 // Reproduce authority changes after validation but before the actual D1 batch.
 // Each guarded write must roll back its domain row, triggers and audit together.
 for(const operation of ['menu','inventory','reply','moderation']){
  const product=await menu.get('fixture','products',p.id,user),stock=(await inventory.list('fixture',{},user)).items[0],currentReview=await reviews.mine('fixture',user);
  const beforeAudit=(await sql.first('SELECT count(*) n FROM business_audit')).n;
  const reply=await sql.first('SELECT version FROM review_replies WHERE review_id=?',currentReview.id);
  let armed=true;
  const racingSql={...sql,batch:async entries=>{
   if(armed){armed=false;await db.prepare(operation==='moderation'?"UPDATE users SET role='user' WHERE id='local-admin'":"UPDATE cafes SET owner_id='local-admin' WHERE id='fixture'").run();}
   return sql.batch(entries);
  }};
  try{
   const action=operation==='menu'?()=>createMenuService({sql:racingSql,fail,id}).update('fixture','products',p.id,{version:product.version,name:'unauthorized'},user)
    :operation==='inventory'?()=>createInventoryService({sql:racingSql,fail,id}).mutate('fixture',{idempotency_key:'authority-race',updates:[{product_id:p.id,version:stock.version,quantity:777,reason:'correction'}]},user)
    :operation==='reply'?()=>createReviewService({sql:racingSql,fail,id}).reply('fixture',currentReview.id,{version:reply?.version||0,text:'unauthorized'},user)
    :()=>createReviewService({sql:racingSql,fail,id}).moderate('fixture',currentReview.id,{version:currentReview.version,action:'hide',reason:'unauthorized'},administrator);
   await assert.rejects(action(),{code:'version_conflict'});
   assert.equal((await sql.first('SELECT count(*) n FROM business_audit')).n,beforeAudit);
   assert.equal((await sql.first('SELECT name FROM menu_items WHERE id=?',p.id)).name,product.name);
   assert.equal((await sql.first('SELECT quantity FROM inventory WHERE id=?',stock.id)).quantity,stock.quantity);
   assert.equal((await sql.first('SELECT status FROM reviews WHERE id=?',currentReview.id)).status,currentReview.status);
   assert.equal(await sql.first("SELECT request_id FROM inventory_receipts WHERE request_id='authority-race'"),null);
  }finally{await db.prepare("UPDATE cafes SET owner_id='owner' WHERE id='fixture'").run();await db.prepare("UPDATE users SET role='admin' WHERE id='local-admin'").run();}
 }
 // Platform and a literal "platform" cafe must not share resource cooldowns.
 await sql.batch([["INSERT INTO cafes(id,name,owner_id,status,data_mode,created_at,updated_at) VALUES('platform','SIMULATED scope probe','owner','active','demo','2026-01-01','2026-01-01')"]]);
 let scopeClock=Date.now();
 for(const [event,cafe] of [['resource:platform:media_bytes:1:1',null],['resource:cafe:platform:media_bytes:1:1','platform']])await sql.batch([["INSERT INTO notification_outbox VALUES(?,?,'resource','media_bytes',NULL,?,?,NULL,0)",event,cafe,new Date(scopeClock).toISOString(),new Date(scopeClock).toISOString()]]);
 const scopedNotifications=createNotifications({sql,fail,id,options,clock:()=>new Date(scopeClock).toISOString()});
 for(let i=0;i<30;i++){scopeClock+=2000;await scopedNotifications.maintenance();}
 const scopeNotices=await sql.all("SELECT cafe_id FROM notifications WHERE recipient_id='local-admin' AND category='resource' AND entity_id='media_bytes'");
 assert.deepEqual(new Set(scopeNotices.map(row=>row.cafe_id)),new Set([null,'platform']));
 local.close();
 const plans={};for(const [name,query,args] of [['public_join','SELECT p.* FROM menu_items p JOIN menu_categories c ON c.id=p.category_id AND c.cafe_id=p.cafe_id WHERE p.cafe_id=? AND p.published=1 AND p.archived=0 AND c.published=1 ORDER BY p.display_order,p.id LIMIT 101',['fixture']],['image_lookup','SELECT * FROM menu_images WHERE cafe_id=? AND sha256=?',['fixture','hash']]])plans[name]=(await db.prepare('EXPLAIN QUERY PLAN '+query).bind(...args).all()).results;
 const report={source:'disposable local workerd D1 meta (includes index and trigger work); local R2',measurements,plans,checks:{resource_cooldown_scope_isolation:true,authority_fences:true,behavior_flush:true,insight_cohort:true,notification_outbox:true,resource_monitoring:true,promotion_version_race:true,promotion_audit_rollback:true,promotion_cache_transition:true,version_race:true,inventory_version_race:true,inventory_movement_rollback:true,review_moderation_race:true,batch_rollback:true,r2_ambiguous_put_recovery:true,r2_no_blob:true,tenant_isolation:true},provider_billing:false};
 await mkdir('.artifacts',{recursive:true});await writeFile('.artifacts/phase11-menu-d1.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await proxy.dispose();await rm(dir,{recursive:true,force:true});}
