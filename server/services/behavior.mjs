import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {initializeAnalytics,acceptAnalytics,flushAnalytics} from '../../cloudflare/analytics-store.mjs';
import {transaction} from '../lib/db.mjs';
export function createBehaviorBackend(db,config){
 const directory=join(config.dataDir,'analytics'),stores=new Map(),options=config.phase11;
 const sink={prepare:q=>({bind:(...args)=>({q,args})}),batch:async entries=>transaction(db,()=>entries.map(({q,args})=>{db.prepare(q).run(...args);return {meta:{}};}))};
 function store(cafe,create=true){
  if(stores.has(cafe))return stores.get(cafe);
  const file=join(directory,createHash('sha256').update(cafe).digest('hex')+'.sqlite');if(!create&&!existsSync(file))return null;
  mkdirSync(directory,{recursive:true});const local=new DatabaseSync(file);local.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=3000');
  const sql={exec(q,...a){const stmt=local.prepare(q);return stmt.all(...a);}},ctx={storage:{sql,transactionSync:fn=>transaction(local,fn)}};initializeAnalytics(sql);
  // Eviction closes only durable stores; no uncommitted counters are lost.
  if(stores.size>=16){const key=stores.keys().next().value;stores.get(key).local.close();stores.delete(key);}
  const value={ctx,local,tail:Promise.resolve()};stores.set(cafe,value);return value;
 }
 return {
  collect(batch){return acceptAnalytics(store(batch.cafeId).ctx,batch,Date.now(),options);},
  async flush(cafe){if(!options.analyticsEnabled)return;const s=store(cafe,false);if(!s)return;const task=s.tail.then(()=>flushAnalytics(s.ctx,sink,Date.now(),options));s.tail=task.catch(()=>{});return task;},
  async maintenance(){if(!options.analyticsEnabled)return;const rows=db.prepare('SELECT id FROM cafes WHERE id>? ORDER BY id LIMIT ?').all(this.cursor||'',options.batch);for(const cafe of rows)await this.flush(cafe.id);this.cursor=rows.length===options.batch?rows.at(-1).id:'';},
  close(){for(const s of stores.values())s.local.close();stores.clear();}
 };
}
