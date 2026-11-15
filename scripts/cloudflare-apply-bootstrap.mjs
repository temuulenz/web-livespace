// Apply private bootstrap without allowing Wrangler output to expose SQL/hash data.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const folder=resolve(process.argv[2] || '.artifacts/production-secrets');
const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
if(config.account_id!=='9e5256db4932b2064ca5982039f4e121' || config.d1_databases[0].database_id!=='40e181a5-4058-4f82-bdf2-e26c79392056')throw new Error('Unexpected bootstrap target');
const sql=join(folder,'admin.sql');
try {
 await promisify(execFile)(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','livespace','--remote','--file',sql],{env:{...process.env,WRANGLER_SEND_METRICS:'false'},maxBuffer:1024*1024});
 await unlink(sql);console.log('Admin bootstrap applied to verified D1; private SQL removed. No credentials printed.');
} catch(e) {
 await writeFile(join(folder,'bootstrap-error.log'),String(e.stdout || '')+String(e.stderr || ''),{mode:0o600});
 throw new Error('Bootstrap failed; details retained privately, not printed.');
}
