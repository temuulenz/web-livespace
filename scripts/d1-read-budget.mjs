// Disposable local D1 measurements; no remote bindings or production data.
import assert from 'node:assert/strict';
import { getPlatformProxy, unstable_splitSqlQuery } from 'wrangler';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { liveSummary } from '../cloudflare/views.mjs';
import { createSensorHistory } from '../cloudflare/history.mjs';
import { commitTelemetry } from '../cloudflare/telemetry-storage.mjs';
const dir=await mkdtemp(join(tmpdir(),'ls-d1-reads-'));
const cfg=JSON.parse(await readFile('wrangler.jsonc','utf8'));
await writeFile(join(dir,'wrangler.json'),JSON.stringify({name:'local-read-budget',compatibility_date:cfg.compatibility_date,d1_databases:cfg.d1_databases}));
const proxy=await getPlatformProxy({configPath:join(dir,'wrangler.json'),persist:false,remoteBindings:false});
try {
 const db=proxy.env.DB, output={};
 const files=(await readdir('cloudflare/migrations')).filter(n=>n.endsWith('.sql')).sort();
 for(const file of files.filter(n=>n<'0006'))await db.batch(unstable_splitSqlQuery(await readFile('cloudflare/migrations/'+file,'utf8')).map(s=>db.prepare(s)));
 await db.prepare("INSERT INTO cafes(id,name,data_mode,created_at,updated_at) VALUES('c','Cost fixture','live',datetime('now'),datetime('now'))").run();
 await db.prepare("INSERT INTO devices(id,cafe_id,token_hash,created_at) VALUES('d','c','h',datetime('now'))").run();
 await db.prepare(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<10000) INSERT INTO measurements(cafe_id,device_id,ts,received_at,message_id,data_source,is_test,observed_people,noise_dbfs,raw) SELECT 'c','d',strftime('%Y-%m-%dT%H:%M:%fZ','now','-'||((10000-x)*15)||' seconds'),strftime('%Y-%m-%dT%H:%M:%fZ','now','-'||((10000-x)*15)||' seconds'),'m'||x,'real',0,8,-40,'{}' FROM n`).run();
 const queries={selector:"SELECT device_id FROM measurements WHERE cafe_id='c' AND data_source='real' AND message_id IS NOT NULL AND ts>='2020' AND ts<'2030' ORDER BY observed_people IS NOT NULL DESC,ts DESC,id DESC LIMIT 1",view:"SELECT * FROM sensor_latest_readings WHERE cafe_id='c' AND data_source='real'",legacy:"SELECT * FROM measurements WHERE cafe_id='c' AND is_test=0 AND (available_seats IS NOT NULL OR occupied_seats IS NOT NULL OR noise_db IS NOT NULL OR wifi_quality IS NOT NULL OR wifi_down_mbps IS NOT NULL) ORDER BY ts DESC,id DESC LIMIT 30",latest:"SELECT * FROM measurements WHERE device_id='d' AND cafe_id='c' AND data_source='real' AND message_id IS NOT NULL ORDER BY ts DESC,id DESC LIMIT 1",count:"SELECT COUNT(*) FROM measurements WHERE received_at>'2020'"};
 for(const phase of ['before','after']) {
  if(phase==='after')for(const file of files.filter(n=>n>='0006'))await db.batch(unstable_splitSqlQuery(await readFile('cloudflare/migrations/'+file,'utf8')).map(s=>db.prepare(s)));
  const result=output[phase]={};
  for(const [name,sql] of Object.entries(queries))result[name]={meta:(await db.prepare(sql).all()).meta,plan:(await db.prepare('EXPLAIN QUERY PLAN '+sql).all()).results};
  const costs=[];
  const measured={prepare(sql){return {bind(...args){const stmt=db.prepare(sql).bind(...args);return {async first(){const r=await stmt.all();costs.push({sql,read:r.meta.rows_read});return r.results[0] || null;},async all(){const r=await stmt.all();costs.push({sql,read:r.meta.rows_read});return r;}};}};}};
  await liveSummary(measured,{id:'c',data_mode:'live'});result.liveSummary={rowsRead:costs.reduce((a,b)=>a+b.read,0),queries:costs.splice(0)};
  await createSensorHistory(measured,{sensorExpectedIntervalSec:15,sensorStaleAfterSec:30}).read('c');result.history={rowsRead:costs.reduce((a,b)=>a+b.read,0),queries:costs.splice(0)};
  if(phase==='after')assert.ok(result.liveSummary.rowsRead<20,'Live reads must remain bounded');
  const v={messageId:phase,timestamp:new Date().toISOString(),occupancy:{observedPeople:8,confidence:0.9},noise:{dbfs:-40,rms:0.01,calibrated:false},device:{batteryPercent:80,batteryTemperatureC:30,charging:true,inferenceMs:100,uptimeSeconds:1}};
  result.commit=(await commitTelemetry(db,{id:'d',cafe_id:'c'},{hash:'h',cafe:'c',source:'real'},v,v.timestamp,'payload')).map(r=>r.meta);
 }
 console.log(JSON.stringify(output,null,2));
}finally{await proxy.dispose();await rm(dir,{recursive:true,force:true});}
