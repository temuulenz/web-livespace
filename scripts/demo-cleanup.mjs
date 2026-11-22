// Local SQLite cleanup only. Never run from application startup or a migration.
import { DatabaseSync, backup } from 'node:sqlite';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const PROTECTED = new Set(['I', 'cafe_9f81309be58b4d48']);
const args = process.argv.slice(2);
const value = flag => { const i = args.indexOf(flag); return i < 0 ? null : args[i + 1]; };
const database = resolve(value('--db') || 'data/livespace.db');
const execute = args.includes('--execute');
const ids = (value('--ids') || '').split(',').filter(Boolean);
const quote = name => `"${name.replaceAll('"', '""')}"`;
if (!existsSync(database)) throw new Error(`Database does not exist: ${database}`);
if (execute && (!ids.length || value('--confirm') !== ids.join(',') || !value('--backup'))) {
  throw new Error('Execution requires --ids ID,ID --confirm ID,ID --backup /separate/path.db');
}
if (ids.some(id => PROTECTED.has(id))) throw new Error('Protected cafe ID cannot be removed');
const db = new DatabaseSync(database, { readOnly: !execute });
try {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name);
  const dependencies = tables.flatMap(table => db.prepare(`PRAGMA foreign_key_list(${quote(table)})`).all()
    .filter(fk => fk.table === 'cafes' && fk.to === 'id').map(fk => ({ table, column: fk.from })));
  const cafes = db.prepare("SELECT id,name,status,data_mode,owner_id,created_at FROM cafes ORDER BY id").all();
  const inventory = cafes.map(cafe => {
    const related = Object.fromEntries(dependencies.map(({ table, column }) => [table,
      db.prepare(`SELECT count(*) AS n FROM ${quote(table)} WHERE ${quote(column)}=?`).get(cafe.id).n]));
    return { ...cafe, protected: PROTECTED.has(cafe.id), demo_only: cafe.data_mode === 'demo',
      candidate: cafe.data_mode === 'demo' && !PROTECTED.has(cafe.id) && !cafe.owner_id && !Object.values(related).some(Boolean), dependencies: related };
  });
  const sunny = inventory.filter(c => c.name === 'Sunny Day coffee shop');
  console.log(JSON.stringify({ database, mode: execute ? 'execute' : 'dry-run', protected_ids: [...PROTECTED], sunny_day_records: sunny, inventory }, null, 2));
  if (execute) {
    const selected = ids.map(id => inventory.find(c => c.id === id));
    if (selected.some(c => !c || !c.candidate || c.owner_id || Object.values(c.dependencies).some(Boolean))) {
      throw new Error('Selection includes a missing, protected, owned, non-demo, or related cafe; no rows deleted');
    }
    const backupPath = resolve(value('--backup'));
    if (existsSync(backupPath) || backupPath === database) throw new Error('Backup path must be new and separate');
    await backup(db, backupPath);
    db.exec('BEGIN IMMEDIATE');
    try {
      const del = db.prepare('DELETE FROM cafes WHERE id=? AND data_mode=? AND owner_id IS NULL');
      for (const id of ids) if (del.run(id, 'demo').changes !== 1) throw new Error(`Cafe changed during cleanup: ${id}`);
      if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Foreign key check failed');
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    console.log(JSON.stringify({ deleted_ids: ids, backup: backupPath,
      remaining: ids.map(id => ({ id, count: db.prepare('SELECT count(*) AS n FROM cafes WHERE id=?').get(id).n })) }, null, 2));
  }
} finally { db.close(); }
