import {test} from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {initializeAnalytics,acceptAnalytics,flushAnalytics} from '../cloudflare/analytics-store.mjs';import {validateAnalyticsBatch} from '../js/services/analytics-schema.js';import {createAnalyticsCollector} from '../js/services/analytics.js';
function fixture(){const db=new DatabaseSync(':memory:');const sql={exec(query,...args){const stmt=db.prepare(query);return stmt.all(...args);}};const ctx={storage:{sql,transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}}};initializeAnalytics(sql);return {db,ctx};}
const batch=(type='cafe_view',id='event-0001')=>validateAnalyticsBatch({schemaVersion:1,cafeId:'a',events:[{id,type,timestamp:new Date().toISOString()}]});
test('analytics accepts only whitelisted minimal events and no visitor identities',()=>{assert.equal(batch().events[0].type,'cafe_view');const b=batch();b.events[0].visitorId='identity';assert.throws(()=>validateAnalyticsBatch(b));assert.throws(()=>batch('purchase'));});
test('analytics receipts and counters survive service recreation, deduplicate and isolate cafes',()=>{const {db,ctx}=fixture();assert.equal(acceptAnalytics(ctx,batch()).accepted,1);initializeAnalytics(ctx.storage.sql);assert.equal(acceptAnalytics(ctx,batch()).duplicates,1);const other=batch();other.cafeId='b';assert.throws(()=>acceptAnalytics(ctx,other));assert.equal(db.prepare('SELECT n FROM counters').get().n,1);db.close();});
test('flush retry uses absolute revisions and preserves concurrent dirty increments',async()=>{const {db,ctx}=fixture();acceptAnalytics(ctx,batch());let calls=0;const stored=new Map();const d1={prepare(sql){return {bind(...args){return {sql,args};}};},async batch(rows){calls++;for(const row of rows){const a=row.args;if(!stored.has(a[0])||stored.get(a[0])<a[3])stored.set(a[0],a[3]);}if(calls===1)throw Error('Ambiguous D1 response after commit');return rows.map(()=>({meta:{rows_written:2,rows_read:1}}));}};
 await assert.rejects(flushAnalytics(ctx,d1));assert.equal(db.prepare('SELECT dirty FROM counters').get().dirty,1);await flushAnalytics(ctx,d1);assert.equal(stored.get('a'),1);assert.equal(db.prepare('SELECT dirty FROM counters').get().dirty,0);db.close();});
test('browser analytics is disabled by default and batches explicitly enabled events',async()=>{let sent=0;const off=createAnalyticsCollector({send:async()=>sent++});assert.equal(off.track('a','cafe_view'),false);await off.flush();assert.equal(sent,0);
 const on=createAnalyticsCollector({enabled:true,schedule:()=>1,cancel(){},send:async b=>{sent++;assert.equal(b.events.length,2);}});on.track('a','cafe_view');on.track('a','menu_view');await on.flush();assert.equal(sent,1);assert.equal(on.pending,0);on.stop();});

test('intake during an outstanding flush remains dirty until the next flush',async()=>{
 const {db,ctx}=fixture();acceptAnalytics(ctx,batch());let release;const revisions=[];
 const d1={prepare(){return {bind(...args){return args;}};},async batch(rows){revisions.push(rows[0][3]);if(revisions.length===1)await new Promise(resolve=>{release=resolve;});return [{meta:{rows_written:1,rows_read:0}}];}};
 const pending=flushAnalytics(ctx,d1);acceptAnalytics(ctx,batch('cafe_view','event-0002'));release();await pending;
 assert.equal(db.prepare('SELECT n FROM counters').get().n,2);assert.equal(db.prepare('SELECT dirty FROM counters').get().dirty,1);
 await flushAnalytics(ctx,d1);assert.deepEqual(revisions,[1,2]);assert.equal(db.prepare('SELECT dirty FROM counters').get().dirty,0);db.close();
});
test('conflicting analytics IDs roll back the entire batch',()=>{
 const {db,ctx}=fixture();acceptAnalytics(ctx,batch());const mixed=batch('menu_view','event-0002');mixed.events.push(batch('product_view').events[0]);
 assert.throws(()=>acceptAnalytics(ctx,mixed),/conflict/);assert.equal(db.prepare('SELECT COUNT(*) n FROM event_receipts').get().n,1);assert.equal(db.prepare('SELECT SUM(n) n FROM counters').get().n,1);db.close();
});

test('legacy intake honors configured daily budgets without changing default receipts',()=>{
 const {db,ctx}=fixture();try{acceptAnalytics(ctx,batch(),Date.now(),{analyticsDaily:1});assert.throws(()=>acceptAnalytics(ctx,batch('menu_view','event-config-2'),Date.now(),{analyticsDaily:1}),/budget/);assert.equal(db.prepare('SELECT SUM(n) n FROM counters').get().n,1);}finally{db.close();}
});
