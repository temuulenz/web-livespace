// Local-only preparation/smoke/recovery. No URL, --remote, deployment or production mode.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {getPlatformProxy,unstable_dev,unstable_splitSqlQuery} from 'wrangler';
import {hashPassword} from '../cloudflare/core.mjs';
import {stagingConfig} from './lib/phase11-staging.mjs';
import {MARKER,requireSynthetic,snapshotDirectory,verifySnapshot,inventory} from './lib/phase11-backup.mjs';
const args=process.argv.slice(2),mode=args.shift()||'rehearse';
if(!['prepare','smoke','rehearse'].includes(mode)||args.length>1||args[0]?.startsWith('-'))throw Error('Usage: node scripts/phase11-staging.mjs prepare|smoke [new-local-directory] OR rehearse');
if(mode==='rehearse'&&args.length)throw Error('Rehearsal always creates disposable local state');
const temporary=mode==='rehearse',parent=temporary?await mkdtemp(join(tmpdir(),'ls-phase11-staging-')):null;
const root=temporary?join(parent,'source'):resolve(args[0]||'.artifacts/phase11-staging');
const cli=(directory,...a)=>execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...a,'--config',join(directory,'config.json'),...(a[1]==='export'?[]:['--persist-to',join(directory,'.wrangler','state')])],{stdio:'pipe',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
async function platform(directory){
 const cfg=await stagingConfig();delete cfg.durable_objects;delete cfg.migrations;delete cfg.assets;delete cfg.main;
 const file=join(directory,'bindings.json');await writeFile(file,JSON.stringify(cfg),{mode:0o600});
 return getPlatformProxy({configPath:file,persist:{path:join(directory,'.wrangler','state','v3')},remoteBindings:false,envFiles:[]});
}
async function prepare(directory){
 const cfg=await stagingConfig();await mkdir(dirname(directory),{recursive:true,mode:0o700});await mkdir(directory,{mode:0o700});
 await writeFile(join(directory,MARKER),JSON.stringify({kind:'livespace-phase11-synthetic',runtime:'cloudflare-local'}),{mode:0o600});
 await writeFile(join(directory,'config.json'),JSON.stringify(cfg),{mode:0o600});
 cli(directory,'d1','migrations','apply',cfg.name,'--local');
 const password=randomBytes(24).toString('base64url'),hash=await hashPassword(password);
 const proxy=await platform(directory);
 try{
  const db=proxy.env.DB;
  for(const [id,role] of [['owner-a','owner'],['owner-b','owner'],['customer','user'],['admin','admin']])await db.prepare('INSERT INTO users(id,email,password_hash,name,role,created_at) VALUES(?,?,?,?,?,?)').bind('staging-'+id,id+'@staging.invalid',hash,'SIMULATED '+id,role,new Date().toISOString()).run();
  for(const key of ['a','b'])await db.prepare("INSERT INTO cafes(id,name,owner_id,status,data_mode,description,created_at,updated_at) VALUES(?,?,?,'active','demo','SIMULATED staging fixture',?,?)").bind('staging-'+key,'SIMULATED '+key,'staging-owner-'+key,new Date().toISOString(),new Date().toISOString()).run();
 }finally{await proxy.dispose();}
 await writeFile(join(directory,'credentials.json'),JSON.stringify({password}),{mode:0o600});
 return {migrations:16,synthetic_users:4,synthetic_cafes:2};
}
async function smoke(directory,{analytics=false,verifyExisting=false}={}){
 await requireSynthetic(directory);const cfg=await stagingConfig();cfg.vars.LS_ANALYTICS_ENABLED=analytics?'1':'0';
 const config=join(directory,'runtime.json');await writeFile(config,JSON.stringify(cfg),{mode:0o600});
 const worker=await unstable_dev(cfg.main,{config,port:0,ip:'127.0.0.1',local:true,persistTo:join(directory,'.wrangler','state'),logLevel:'error',experimental:{watch:false,disableExperimentalWarning:true,showInteractiveDevSession:false}});
 let checks=0;const started=performance.now();
 try{
  const origin=`http://${worker.address}:${worker.port}`,credentials=JSON.parse(await readFile(join(directory,'credentials.json'),'utf8'));
  let cookie='';async function api(path,method='GET',body,auth=true){const response=await fetch(origin+'/api/v1'+path,{method,headers:{Origin:origin,...(auth&&cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {response,data:await response.json()};}
  async function login(email){const r=await api('/auth/login','POST',{email,password:credentials.password},false);assert.equal(r.response.status,200);cookie=r.response.headers.get('set-cookie').split(';')[0];checks++;}
  const page=await fetch(origin+'/');assert.match(page.headers.get('permissions-policy')||'',/geolocation=\(self\)/);
  const ready=await api('/ready');assert.equal(ready.response.status,200);assert.deepEqual(ready.data,{ready:true,api:'1'});assert.match(ready.response.headers.get('x-request-id'),/^[a-f0-9-]{36}$/);checks++;
  for(let i=0;i<29;i++)assert.equal((await api('/ready')).response.status,200);assert.equal((await api('/ready')).response.status,429);checks++;
  assert.equal((await api('/admin/resources/monitor','GET',undefined,false)).response.status,401);checks++;
  await login('owner-a@staging.invalid');assert.equal((await api('/owner/cafes/staging-b/menu/products')).response.status,404);checks++;
  let product;
  const found=await api('/owner/cafes/staging-a/menu/products');if(verifyExisting)assert.ok(found.data.items.length);
  if(found.data.items.length){product=found.data.items[0];assert.equal((await api('/cafes/staging-a/inventory')).data.items[0].status,'available');checks++;}
  else{
   const c=await api('/owner/cafes/staging-a/menu/categories','POST',{name:'SIMULATED coffee',published:true});assert.equal(c.response.status,201);
   const p=await api('/owner/cafes/staging-a/menu/products','POST',{name:'SIMULATED latte',category_id:c.data.item.id,base_price:5000,published:true});assert.equal(p.response.status,201);product=p.data.item;checks++;
   const body={idempotency_key:'staging-initial-stock',updates:[{product_id:product.id,version:0,mode:'quantity',quantity:5,reason:'restock'}]};const stock=await api('/owner/cafes/staging-a/inventory/mutations','POST',body);assert.equal(stock.response.status,200);assert.equal((await api('/owner/cafes/staging-a/inventory/mutations','POST',body)).data.duplicate,true);checks++;
   const image='data:image/jpeg;base64,'+(await readFile('tests/fixtures/upload-valid.jpg')).toString('base64');assert.equal((await api('/owner/cafes/staging-a/menu/products/'+product.id+'/image','PUT',{version:product.version,image})).response.status,200);checks++;
  }
  const imageResponse=await fetch(origin+'/api/v1/cafes/staging-a/menu/products/'+product.id+'/image');assert.equal(imageResponse.status,200);assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()),await readFile('tests/fixtures/upload-valid.jpg'));const imageEtag=imageResponse.headers.get('etag');assert.equal((await fetch(origin+'/api/v1/cafes/staging-a/menu/products/'+product.id+'/image',{headers:{'If-None-Match':imageEtag}})).status,304);checks++;
  const analyticsBody={schemaVersion:2,cafeId:'staging-a',events:[{id:'staging-event-0001',type:'product_view',productId:product.id}]};
  const initialized=await api('/analytics/session','POST',{});assert.equal(initialized.response.status,analytics?200:404);
  if(analytics){let analyticsCookie;try{analyticsCookie=await readFile(join(directory,'analytics-cookie.txt'),'utf8');}catch{analyticsCookie=initialized.response.headers.get('set-cookie').split(';')[0];await writeFile(join(directory,'analytics-cookie.txt'),analyticsCookie,{mode:0o600});}cookie+='; '+analyticsCookie;const accepted=await api('/analytics/events','POST',analyticsBody);assert.equal(accepted.response.status,202);assert.equal((await api('/analytics/events','POST',analyticsBody)).data.duplicates,1);}checks++;
  await login('admin@staging.invalid');const resource=await api('/admin/resources/monitor');assert.equal(resource.response.status,200);assert.equal(resource.data.provider_billing.status,'unavailable');assert.ok('notification_overdue_seconds' in resource.data.application_measured);checks++;
  assert.equal((await api('/admin/maintenance','POST',{})).response.status,200);assert.equal((await api('/admin/cafes/staging-a/analytics')).response.status,200);checks++;
  return {checks,analytics_enabled:analytics,restored_readback:verifyExisting,seconds:Math.round(performance.now()-started)/1000,origin_scope:'loopback-only'};
 }finally{await worker.stop();}
}
try{
 execFileSync(process.execPath,['scripts/cloudflare-assets.mjs'],{stdio:'pipe'});
 if(mode==='prepare'){const result=await prepare(root);console.log(JSON.stringify({prepared:root,...result,credentials:'private credentials.json; values never printed'}));}
 else if(mode==='smoke')console.log(JSON.stringify(await smoke(root)));
 else{
  const start=performance.now(),seed=await prepare(root),baseline=await smoke(root),enabled=await smoke(root,{analytics:true,verifyExisting:true});
  // A stopped local workerd is the consistency boundary; copy all local D1/DO/blob files.
  const backupStart=performance.now(),backup=join(parent,'backup');const before=await snapshotDirectory(root,backup,{offline:true});const backupMs=performance.now()-backupStart;
  const restoreStart=performance.now(),restored=join(parent,'restored');await verifySnapshot(backup);await snapshotDirectory(backup,restored,{offline:true});const restoreMs=performance.now()-restoreStart;
  const compare=await inventory(restored);assert.deepEqual(compare,before);
  const recovered=await smoke(restored,{analytics:true,verifyExisting:true});const restoreThroughRuntimeMs=performance.now()-restoreStart;
  // Test a real local D1 SQL export/import separately from the full-state copy.
  const d1RestoreStart=performance.now(),dump=join(parent,'d1.sql');cli(root,'d1','export',(await stagingConfig()).name,'--local','--output',dump);
  const imported=join(parent,'imported');await mkdir(imported,{mode:0o700});await writeFile(join(imported,'config.json'),JSON.stringify(await stagingConfig()),{mode:0o600});

  const originalProxy=await platform(root);
  const restoredProxy=await platform(imported);
  try{
   // D1's local dump can place composite parent indexes after child inserts.
   // Restore definitions/indexes before rows, and triggers after rows so quota,
   // aggregate and outbox triggers cannot duplicate imported materialized data.
   const statements=unstable_splitSqlQuery(await readFile(dump,'utf8')).map(q=>q.trim().replace(/^(?:--[^\n]*\n\s*)+/,''));
   const definitions=[],data=[],triggers=[];
   for(const q of statements){if(/^CREATE\s+(?:TABLE|(?:UNIQUE\s+)?INDEX|VIEW)\b/i.test(q))definitions.push(q);else if(/^CREATE\s+TRIGGER\b/i.test(q))triggers.push(q);else if(/^INSERT\s+INTO\b/i.test(q)||/^DELETE\s+FROM\s+["`]?sqlite_sequence["`]?;?$/i.test(q))data.push(q);else if(q&&!/^(?:PRAGMA|BEGIN|COMMIT)\b/i.test(q))throw Error('Unsupported local dump statement type: '+(q.match(/^[A-Za-z]+/)?.[0]||'comment'));}
   const target=restoredProxy.env.DB;
   await target.batch([...definitions,'PRAGMA defer_foreign_keys=ON',...data,...triggers].map(q=>target.prepare(q)));
   for(const table of ['users','cafes','menu_items','inventory','inventory_receipts','menu_images','notification_outbox','analytics_dimensions','d1_migrations']){
   const a=await originalProxy.env.DB.prepare('SELECT count(*) n FROM '+table).first(),b=await restoredProxy.env.DB.prepare('SELECT count(*) n FROM '+table).first();assert.equal(b.n,a.n);
  }
   for(const query of ['SELECT id,name,category_id,base_price,version FROM menu_items ORDER BY id','SELECT cafe_id,product_id,quantity,status,version FROM inventory ORDER BY id','SELECT cafe_id,request_id,response FROM inventory_receipts ORDER BY request_id','SELECT id,size,sha256,bytes FROM menu_images ORDER BY id'])assert.deepEqual((await restoredProxy.env.DB.prepare(query).all()).results,(await originalProxy.env.DB.prepare(query).all()).results);
   const schemaQuery="SELECT type,name FROM sqlite_master WHERE type IN('table','index','trigger','view') AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%' ORDER BY type,name";
   assert.deepEqual((await restoredProxy.env.DB.prepare(schemaQuery).all()).results,(await originalProxy.env.DB.prepare(schemaQuery).all()).results);
   assert.deepEqual((await restoredProxy.env.DB.prepare('PRAGMA foreign_key_check').all()).results,[]);
   await assert.rejects(restoredProxy.env.DB.prepare("INSERT INTO menu_items(id,cafe_id,category_id,name,base_price,created_at,updated_at) VALUES('bad-recovery','staging-a','missing','SIMULATED invalid',5000,'2026-01-01','2026-01-01')").run());
}finally{await originalProxy.dispose();await restoredProxy.dispose();}
  const report={scope:'disposable_local_workerd_not_hosted',seed,baseline,enabled,recovered,backup_ms:backupMs,restore_copy_verify_ms:restoreMs,restore_through_http_readback_ms:restoreThroughRuntimeMs,d1_export_import_verify_ms:performance.now()-d1RestoreStart,databases:Object.fromEntries(Object.entries(before.databases).map(([path,v])=>[path,{schema_objects:v.schema_objects,indexes:v.indexes,triggers:v.triggers,tables:Object.fromEntries(Object.entries(v.tables).map(([name,t])=>[name,t.rows])),integrity:v.integrity,foreign_key_violations:v.foreign_key_violations}])),all_file_checksums_and_record_digests_equal:true,d1_export_import_counts:true,d1_representative_records_equal:true,d1_schema_objects_equal:true,d1_foreign_constraint_rejected:true,total_seconds:(performance.now()-start)/1000,limitations:['offline synthetic state only','not production volume or provider backup','D1-only export excludes DO and media bytes','hosted namespace recovery not established']};
  await mkdir('.artifacts',{recursive:true});await writeFile('.artifacts/phase11-staging-rehearsal.json',JSON.stringify(report,null,2));console.log(JSON.stringify({scope:report.scope,backup_ms:backupMs,restore_copy_verify_ms:restoreMs,restore_through_http_readback_ms:restoreThroughRuntimeMs,checks:baseline.checks+enabled.checks+recovered.checks,d1_export_import:true}));
 }
}finally{if(temporary)await rm(parent,{recursive:true,force:true});}
