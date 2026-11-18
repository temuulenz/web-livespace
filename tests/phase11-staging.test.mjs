import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {openDatabase} from '../server/lib/db.mjs';
import {MARKER,snapshotDirectory,verifySnapshot} from '../scripts/lib/phase11-backup.mjs';
import {stagingConfig} from '../scripts/lib/phase11-staging.mjs';
test('staging configuration has only local resources and no production account or routes',async()=>{
 const cfg=await stagingConfig(),production=JSON.parse(await readFile('wrangler.jsonc','utf8'));
 assert.notEqual(cfg.name,production.name);assert.equal(cfg.account_id,undefined);assert.equal(cfg.workers_dev,false);assert.deepEqual(cfg.routes,[]);assert.equal(cfg.d1_databases[0].remote,false);assert.notEqual(cfg.d1_databases[0].database_id,production.d1_databases[0].database_id);assert.deepEqual(cfg.migrations,production.migrations);assert.equal(cfg.vars.LS_ANALYTICS_ENABLED,'0');
});
test('offline backup verifies records and refuses unmarked, active, overlapping and modified snapshots',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ls-backup-test-'));try{
  const source=join(dir,'source'),backup=join(dir,'backup');await mkdir(source);
  await assert.rejects(snapshotDirectory(source,backup,{offline:true}));
  await writeFile(join(source,MARKER),JSON.stringify({kind:'livespace-phase11-synthetic'}));const db=openDatabase(join(source,'livespace.db'));db.close();
  await assert.rejects(snapshotDirectory(source,backup),/offline/);await assert.rejects(snapshotDirectory(source,join(source,'backup'),{offline:true}),/separate/);
  const a=await snapshotDirectory(source,backup,{offline:true});const b=await verifySnapshot(backup);assert.deepEqual(a,b);assert.equal(b.databases['livespace.db'].user_version,12);assert.ok(b.databases['livespace.db'].indexes>0);assert.ok(b.databases['livespace.db'].triggers>0);
  await writeFile(join(backup,MARKER),JSON.stringify({kind:'livespace-phase11-synthetic',tampered:true}));await assert.rejects(verifySnapshot(backup),/verification failed/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('backup refuses symlinks rather than following files outside synthetic state',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ls-backup-link-'));try{const source=join(dir,'source');await mkdir(source);await writeFile(join(source,MARKER),JSON.stringify({kind:'livespace-phase11-synthetic'}));await symlink('/etc/hosts',join(source,'outside'));await assert.rejects(snapshotDirectory(source,join(dir,'copy'),{offline:true}),/Symlinks/);}finally{await rm(dir,{recursive:true,force:true});}
});
