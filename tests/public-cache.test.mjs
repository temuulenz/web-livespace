import {test} from 'node:test';import assert from 'node:assert/strict';
import {PublicProfileCache} from '../cloudflare/public-cache.mjs';
const fixture=()=>{const values=new Map(),data=new Map();return {storage:{get:async k=>values.get(k),put:async(k,v)=>values.set(k,structuredClone(v))},kv:{get:async k=>data.get(k)?JSON.parse(data.get(k)):null,put:async(k,v)=>data.set(k,v)},data};};
test('public profiles strip private fields and coalesce concurrent loads',async()=>{
 const f=fixture(),cache=new PublicProfileCache({...f,enabled:true});let reads=0;
 const load=async()=>{reads++;return {id:'a',name:'Cafe',token_hash:'secret',owner_id:'private',live:{sensor:{}}};};
 const result=await Promise.all(Array.from({length:10},()=>cache.get('a',load)));assert.equal(reads,1);assert.ok(result.every(r=>!('owner_id'in r)&&!('live'in r)));assert.equal(f.data.size,1);
 await cache.get('a',load);assert.equal(reads,1);
});
test('durable version invalidation excludes eventually consistent old KV values after restart',async()=>{
 const f=fixture();let name='Old';const load=async()=>({id:'a',name});
 const first=new PublicProfileCache({...f,enabled:true});await first.get('a',load);await first.invalidate('a');name='New';
 const next=new PublicProfileCache({...f,enabled:true});assert.equal((await next.get('a',load)).name,'New');assert.equal(f.data.size,2);
});
test('KV outages fall back to authoritative loads and tenant keys remain distinct',async()=>{
 const f=fixture();f.kv.get=async()=>{throw Error('unavailable');};const cache=new PublicProfileCache({...f,enabled:true});
 assert.equal((await cache.get('a',async()=>({id:'a',name:'A'}))).name,'A');assert.equal((await cache.get('b',async()=>({id:'b',name:'B'}))).name,'B');assert.equal(cache.metrics.failures,2);
});
test('invalidating an in-flight profile prevents it from repopulating current cache',async()=>{
 const f=fixture(),cache=new PublicProfileCache({...f});let finish;
 const pending=cache.get('a',()=>new Promise(resolve=>{finish=resolve;}));await new Promise(resolve=>setImmediate(resolve));await cache.invalidate('a');finish({id:'a',name:'Old'});await pending;
 assert.equal((await cache.get('a',async()=>({id:'a',name:'New'}))).name,'New');
});
test('concurrent invalidations advance distinct durable epochs and KV writes respect the shared budget',async()=>{
 const f=fixture(),cache=new PublicProfileCache({...f,enabled:true});
 await Promise.all([cache.invalidate('a'),cache.invalidate('a')]);assert.equal(await cache.epoch('a'),2);
 await Promise.all(Array.from({length:405},(_,i)=>cache.get('c'+i,async()=>({id:'c'+i,name:'Cafe'}))));assert.equal(cache.metrics.kvWrites,400);assert.equal(f.data.size,400);
});
