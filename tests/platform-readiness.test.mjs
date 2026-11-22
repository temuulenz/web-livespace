import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { openDatabase } from '../server/lib/db.mjs';
import { createCafeService } from '../server/services/cafes.mjs';
import { loadConfig } from '../server/config.mjs';

test('protected IDs survive demo cleanup and duplicate Sunny Day is hidden by ID', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ls-cleanup-')), file = join(dir, 'test.db');
  const db = openDatabase(file);
  try {
    const add = db.prepare("INSERT INTO cafes(id,name,status,data_mode,created_at,updated_at) VALUES(?,?,'active',?, '2026-01-01','2026-01-01')");
    add.run('I', 'Cafe I', 'demo');
    add.run('cafe_9f81309be58b4d48', 'Sunny Day coffee shop', 'live');
    add.run('duplicate', 'Sunny Day coffee shop', 'demo');
    add.run('sample', 'Demo Cafe', 'demo');
    const config = loadConfig({ NODE_ENV: 'production' });
    assert.equal(config.seedDemo, false);
    assert.equal(loadConfig({ NODE_ENV: 'production', LS_SEED_DEMO: '1' }).seedDemo, false);
    const service = createCafeService(db, config);
    assert.deepEqual(service.listPublic().map(c => c.id), ['I', 'cafe_9f81309be58b4d48', 'sample']);
    assert.equal(service.getPublic('duplicate'), null);
    const script = new URL('../scripts/demo-cleanup.mjs', import.meta.url).pathname;
    const dry = JSON.parse(execFileSync(process.execPath, [script, '--db', file], { encoding: 'utf8' }));
    assert.deepEqual(dry.sunny_day_records.map(c => [c.id, c.protected]), [['cafe_9f81309be58b4d48', true], ['duplicate', false]]);
    assert.ok(dry.inventory.find(c => c.id === 'I').protected);
    const protectedRun = spawnSync(process.execPath, [script, '--db', file, '--execute', '--ids', 'I', '--confirm', 'I', '--backup', join(dir, 'backup.db')]);
    assert.notEqual(protectedRun.status, 0);
    assert.equal(db.prepare("SELECT count(*) n FROM cafes WHERE id='I'").get().n, 1);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('demo cleanup backs up, deletes only the confirmed ID and preserves dependent cafes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ls-cleanup-execute-')), file = join(dir, 'test.db'), backup = join(dir, 'backup.db');
  const script = new URL('../scripts/demo-cleanup.mjs', import.meta.url).pathname;
  const db = openDatabase(file);
  try {
    const add = db.prepare("INSERT INTO cafes(id,name,status,data_mode,created_at,updated_at) VALUES(?,'Fixture','active','demo','2026-01-01','2026-01-01')");
    add.run('I'); add.run('safe'); add.run('related');
    db.prepare("INSERT INTO users(id,email,password_hash,name,role,created_at) VALUES('test-user','test@example.invalid','unused','','user','2026-01-01')").run();
    db.prepare("INSERT INTO favorites(user_id,cafe_id,created_at) VALUES('test-user','related','2026-01-01')").run();
    const denied = spawnSync(process.execPath, [script, '--db', file, '--execute', '--ids', 'related', '--confirm', 'related', '--backup', backup]);
    assert.notEqual(denied.status, 0);
    const result = execFileSync(process.execPath, [script, '--db', file, '--execute', '--ids', 'safe', '--confirm', 'safe', '--backup', backup], { encoding: 'utf8' });
    assert.match(result, /"deleted_ids": \[/);
    assert.equal(db.prepare("SELECT count(*) n FROM cafes WHERE id='safe'").get().n, 0);
    assert.equal(db.prepare("SELECT count(*) n FROM cafes WHERE id IN ('I','related')").get().n, 2);
    const snapshot = openDatabase(backup);
    try { assert.equal(snapshot.prepare("SELECT count(*) n FROM cafes WHERE id='safe'").get().n, 1); }
    finally { snapshot.close(); }
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});
