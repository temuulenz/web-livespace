import { test } from 'node:test';
import assert from 'node:assert/strict';
import { error, isQuotaError } from '../cloudflare/core.mjs';
import { createLiveChannel } from '../framework/api/realtime.js';
test('D1 quota errors return explicit retryable 503 without private diagnostics',async()=>{
 const e=new Error('D1_ERROR: daily row read limit exceeded (7500): secret diagnostic');
 assert.equal(isQuotaError(e),true);
 const response=error(e);assert.equal(response.status,503);assert.equal(response.headers.get('Retry-After'),'900');
 const data=await response.json();assert.equal(data.error.code,'d1_quota_exhausted');assert.ok(!JSON.stringify(data).includes('secret'));
 assert.equal(error(new Error('other')).status,500);
});
test('live polling coalesces in-flight refresh, pauses hidden tabs and backs off quota failures',async()=>{
 let calls=0,finish;
 const doc={hidden:true,addEventListener(){},removeEventListener(){}};
 const channel=createLiveChannel({doc,streamUrl:null,poll:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});
 channel.start();assert.equal(calls,0);doc.hidden=false;
 const first=channel.refresh();await channel.refresh();assert.equal(calls,1);finish([]);await first;channel.stop();
 let failures=0;
 const quota=createLiveChannel({doc,streamUrl:null,poll:async()=>{failures++;throw Object.assign(new Error('quota'),{status:503});}});
 quota.start();await new Promise(resolve=>setImmediate(resolve));assert.equal(quota.status,'unavailable');await quota.refresh();assert.equal(failures,1);quota.stop();
});
test('a completed fallback request cannot overwrite realtime status after polling stops',async()=>{
 let resolve;const states=[],doc={hidden:false,addEventListener(){},removeEventListener(){}};
 const channel=createLiveChannel({doc,streamUrl:null,onStatus:s=>states.push(s),poll:()=>new Promise(r=>resolve=r)});
 channel.start();channel.stop();resolve([]);await new Promise(r=>setImmediate(r));assert.equal(states.at(-1),'stopped');
});
