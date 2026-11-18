import {test} from 'node:test';import assert from 'node:assert/strict';
import {startServer} from './support/server.mjs';import {createUploads} from '../server/services/uploads.mjs';
test('Node JSON roots reject null/arrays/scalars and reject scheme-mismatched cookie origins',async()=>{
 const server=await startServer();try{const c=server.client();for(const input of [null,[],42,'text'])assert.equal((await c.post('/api/v1/auth/login',input)).status,400);
 const origin=new URL(server.origin);assert.equal((await c.post('/api/v1/auth/login',{}, {Origin:'https://'+origin.host})).status,403);
 assert.equal((await c.post('/api/v1/auth/login',{}, {Origin:server.origin})).status,401);
 const health=await c.get('/api/v1/health');assert.match(health.headers.get('x-request-id'),/^[a-f0-9-]{36}$/);
 }finally{await server.stop();}
});
test('filesystem media adapter refuses traversal before any filesystem operation',async()=>{
 const storage=createUploads('/tmp/isolated-path-validation-only');
 assert.throws(()=>storage.read('../../etc/passwd'),/Invalid storage path/);assert.throws(()=>storage.remove('/etc/passwd'),/Invalid storage path/);assert.throws(()=>storage.removeFolder('../outside'),/Invalid storage path/);
 await assert.rejects(storage.save('../outside','file',{ext:'jpg',buffer:Buffer.from('x')}),/Invalid storage path/);
});
test('readiness probes required schema, reports dependency failure without diagnostic leakage',async()=>{
 const {databaseReady,readinessPayload}=await import('../shared/readiness.mjs');const {openDatabase}=await import('../server/lib/db.mjs');const db=openDatabase(':memory:');
 try{assert.equal(await databaseReady({first:q=>db.prepare(q).get()}),true);assert.equal(await databaseReady({first:()=>{throw Error('synthetic secret internal detail');}}),false);assert.ok(!JSON.stringify(readinessPayload(false)).includes('secret'));}finally{db.close();}
 const {startServer}=await import('./support/server.mjs');const server=await startServer();try{const response=await server.client().get('/api/v1/ready');assert.equal(response.status,200);assert.deepEqual(response.data,{ok:true});}finally{await server.stop();}
});
test('malformed or unbounded stored scrypt parameters reject without throwing or costly derivation',async()=>{
 const {verifyPassword}=await import('../server/lib/auth.mjs');
 for(const stored of ['scrypt','scrypt$999999999$8$1$bad$bad','scrypt$16384$8$1$$','other$16384$8$1$bad$bad'])assert.equal(await verifyPassword('synthetic-password',stored),false);
});
