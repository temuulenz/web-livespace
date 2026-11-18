// Retained-history query costs on synthetic simulated observations, local D1 only.
import assert from 'node:assert/strict';import {mkdtemp,writeFile,readFile,readdir,rm,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {getPlatformProxy,unstable_splitSqlQuery} from 'wrangler';
import {createInsights} from '../shared/business/insights.mjs';import {phase11Config} from '../shared/business/phase11-config.mjs';
const dir=await mkdtemp(join(tmpdir(),'ls-phase11-history-'));let proxy;
try{
 const config=join(dir,'config.json');await writeFile(config,JSON.stringify({name:'phase11-local-history-cost',compatibility_date:'2026-11-01',d1_databases:[{binding:'DB',database_name:'synthetic',database_id:'local-only-history',remote:false}]}));
 proxy=await getPlatformProxy({configPath:config,persist:false,remoteBindings:false,envFiles:[]});const db=proxy.env.DB;
 for(const file of (await readdir('cloudflare/migrations')).sort())for(const q of unstable_splitSqlQuery(await readFile('cloudflare/migrations/'+file,'utf8')))await db.prepare(q).run();
 await db.batch([db.prepare("INSERT INTO users(id,email,password_hash,name,role,created_at) VALUES('owner','owner@staging.invalid','unused','SIMULATED owner','owner','2026-01-01')"),db.prepare("INSERT INTO cafes(id,name,owner_id,status,data_mode,created_at,updated_at) VALUES('synthetic','SIMULATED history','owner','active','demo','2026-01-01','2026-01-01')"),db.prepare("INSERT INTO devices(id,cafe_id,token_hash,kind,is_test,created_at) VALUES('SIM-HISTORY','synthetic','unused','simulator',1,'2026-01-01')")]);
 const output=[];let inserted=0;
 for(const size of [10000,50000]){
  while(inserted<size){const count=Math.min(5000,size-inserted);await db.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<?) INSERT INTO measurements(cafe_id,device_id,ts,received_at,message_id,data_source,is_test,observed_people,noise_dbfs,raw) SELECT 'synthetic','SIM-HISTORY',strftime('%Y-%m-%dT%H:%M:%fZ','now','-'||((x+?)*15)||' seconds'),strftime('%Y-%m-%dT%H:%M:%fZ','now','-'||((x+?)*15)||' seconds'),'synthetic-'||(x+?),'simulated',1,4,-40,'{}' FROM n").bind(count,inserted,inserted,inserted).run();inserted+=count;}
  let rowsRead=0,statements=0;const sql={first:async(q,...args)=>{const r=await db.prepare(q).bind(...args).all();rowsRead+=r.meta.rows_read;statements++;return r.results[0]||null;},all:async(q,...args)=>{const r=await db.prepare(q).bind(...args).all();rowsRead+=r.meta.rows_read;statements++;return r.results;}};
  const fail=(status,code,message)=>{throw Object.assign(Error(message),{status,code});},service=createInsights({sql,fail,options:phase11Config()}),start=performance.now();const result=await service.read('synthetic',{source:'simulated',compare:'true'}, {id:'owner',role:'owner'});
  assert.ok(result.current.sensors.rows.length);assert.equal(result.current.sensors.rows[0].occupancy,4);output.push({retained_simulated_rows:size,report:'default_seven_local_days_plus_previous_equal_period',statements,rows_read:rowsRead,elapsed_ms:performance.now()-start});
  const real=await service.read('synthetic',{source:'real'}, {id:'owner',role:'owner'});assert.equal(real.current.sensors.rows.length,0);
 }
 const result={scope:'local_workerd_synthetic_retained_history_not_hosted_capacity',measurements:output,real_reports_exclude_simulated:true,limitations:['single tenant/device','not full retention cardinality','not account/provider CPU','no latency SLA asserted']};await mkdir('.artifacts',{recursive:true});await writeFile('.artifacts/phase11-history-budget.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await proxy?.dispose();await rm(dir,{recursive:true,force:true});}
