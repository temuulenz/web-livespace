import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decodeImage,inspectImage } from '../shared/image-validation.mjs';
import { createMediaStorage,mediaKey,mediaResponse,reconcileMedia } from '../cloudflare/media.mjs';
const jpeg=await readFile(new URL('fixtures/upload-valid.jpg',import.meta.url));
test('raster validation rejects signatures alone, MIME spoofing, oversized and executable uploads',()=>{
 assert.equal(inspectImage(jpeg).mime,'image/jpeg');
 for(const input of [Buffer.from([255,216,255,224]),Buffer.from('<svg onload="alert(1)"/>'),Buffer.from('MZ executable')])assert.throws(()=>inspectImage(input));
 assert.throws(()=>decodeImage('data:image/png;base64,'+jpeg.toString('base64'),1048576));
 assert.throws(()=>inspectImage(jpeg,10));assert.throws(()=>decodeImage('data:image/jpeg;base64,AAAA===',100));
});
test('optional media storage is fail-closed when enabled without a binding and keys are tenant scoped',()=>{
 assert.equal(createMediaStorage({}).enabled,false);assert.throws(()=>createMediaStorage({LS_R2_MEDIA_ENABLED:'1'}));
 assert.notEqual(mediaKey('a','p','jpg'),mediaKey('b','p','jpg'));assert.throws(()=>mediaKey('../a','p','jpg'));
});
test('private conditional media responses never enter a shared public cache',async()=>{
 const response=mediaResponse(new Request('https://local/photo',{headers:{'if-none-match':'"abc"'}}),{mime:'image/jpeg',visibility:'private'},{body:jpeg,etag:'"abc"'});
 assert.equal(response.status,304);assert.equal(response.headers.get('cache-control'),'private, no-cache');assert.equal(response.headers.get('vary'),'Cookie');
 const pub=mediaResponse(new Request('https://local/photo'),{mime:'image/jpeg',visibility:'public'},{body:jpeg,etag:'"abc"'});assert.match(pub.headers.get('cache-control'),/^public/);
});
test('R2 staging writes a journal before put and does not mutate authoritative photo records',async()=>{
 const calls=[],DB={prepare(sql){return {bind(...args){return {all:async()=>({results:[{n:0,bytes:0}]}),run:async()=>{calls.push({sql,args});}};}};}};
 const storage=createMediaStorage({DB,LS_R2_MEDIA_ENABLED:'1',MEDIA:{put:async(key)=>calls.push({key})}});
 const staged=await storage.stage('a','photo', {...inspectImage(jpeg),buffer:jpeg});assert.match(staged.key,/^media\/v1\/cafes\/a\//);assert.match(calls[0].sql,/INSERT INTO media_staging/);assert.equal(calls.length,2);
});
test('orphan reconciliation refuses to remove referenced objects and scopes candidates by cafe',async()=>{
 const calls=[],DB={prepare(sql){return {bind(...args){calls.push({sql,args});return {all:async()=>({results:sql.startsWith('SELECT * FROM media_staging')?[{object_key:'kept'},{object_key:'orphan'}]:args[0]==='kept'?[{photo_id:'p'}]:[]}),run:async()=>{}};}};}};
 const removed=[];const env={DB,MEDIA:{delete:async key=>removed.push(key)}};
 await reconcileMedia(env,{cafeId:'a'});assert.equal(removed.length,0);
 await reconcileMedia(env,{cafeId:'a',dryRun:false});assert.deepEqual(removed,['orphan']);assert.equal(calls[0].args[0],'a');
});
