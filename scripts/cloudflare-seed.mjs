// Generate deterministic, credential-free D1 seed SQL from the existing Node seed.
import { openDatabase } from '../server/lib/db.mjs';
import { seedDemoCafes } from '../server/seed.mjs';
import { writeFileSync } from 'node:fs';
const db=openDatabase(':memory:');seedDemoCafes(db);
const quote=x=>x==null?'NULL':typeof x==='number'?String(x):`'${String(x).replaceAll("'","''")}'`;
const rows=db.prepare('SELECT * FROM cafes').all();
writeFileSync('cloudflare/seed.sql',rows.map(r=>`INSERT OR IGNORE INTO cafes (${Object.keys(r).join(',')}) VALUES (${Object.values(r).map(quote).join(',')});`).join('\n')+'\n');db.close();
