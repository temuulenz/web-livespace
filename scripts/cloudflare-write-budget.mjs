// Measure the actual ingestion batch, including SQLite index/sequence writes.
// Always local and disposable; never touches a configured remote D1 database.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readdir, readFile } from 'node:fs/promises';
import { getPlatformProxy, unstable_splitSqlQuery } from 'wrangler';
import { commitTelemetry } from '../cloudflare/telemetry-storage.mjs';
import { sha, now } from '../cloudflare/core.mjs';
const temporary=await mkdtemp(join(tmpdir(),'livespace-budget-'));
const original=JSON.parse(await readFile('wrangler.jsonc','utf8'));
const configPath=join(temporary,'wrangler.json');
await writeFile(configPath,JSON.stringify({name:'livespace-budget-local',compatibility_date:original.compatibility_date,d1_databases:original.d1_databases}));
const proxy=await getPlatformProxy({configPath,persist:false,remoteBindings:false});
try {
 const db=proxy.env.DB;
 for(const name of (await readdir('cloudflare/migrations')).filter(n=>n.endsWith('.sql')).sort())await db.batch(unstable_splitSqlQuery(await readFile('cloudflare/migrations/'+name,'utf8')).map(sql=>db.prepare(sql)));
 await db.prepare("INSERT INTO cafes(id,name,created_at,updated_at) VALUES('budget-cafe','Budget test',?,?)").bind(now(),now()).run();
 const d={id:'budget-device',cafe_id:'budget-cafe',token_hash:'not-a-production-credential'};
 await db.prepare("INSERT INTO devices(id,cafe_id,token_hash,created_at) VALUES(?,?,?,?)").bind(d.id,d.cafe_id,d.token_hash,now()).run();
 const a={hash:d.token_hash,cafe:d.cafe_id,source:'real'};
 const observations=[];
 for(let i=0;i<3;i++) {
  const t=now(),v={timestamp:t,messageId:'budget-'+i,occupancy:{observedPeople:8,confidence:0.9},noise:{rms:0.01,dbfs:-40,estimatedDbSpl:null,calibrated:false},device:{batteryPercent:82,batteryTemperatureC:36.5,charging:true,inferenceMs:100,uptimeSeconds:i}};
  const results=await commitTelemetry(db,d,a,v,t,sha(JSON.stringify(v)));
  const writes=results.map(x=>x.meta.rows_written);assert.ok(writes.every(Number.isInteger));observations.push(writes);
 }
 const perMessage=observations.at(-1).reduce((a,b)=>a+b,0);
 console.log(JSON.stringify({measurement:'local workerd D1 meta.rows_written (includes indexes)',statements:['measurement insert','device diagnostics update','durable receipt insert'],observations,perMessage,estimates:[5,15,30,45,60].map(intervalSeconds=>({intervalSeconds,devices:[1,3,5].map(devices=>({devices,messagesPerDay:devices*86400/intervalSeconds,d1RowsWrittenPerDay:devices*86400/intervalSeconds*perMessage}))}))},null,2));
}finally{await proxy.dispose();await rm(temporary,{recursive:true,force:true});}
