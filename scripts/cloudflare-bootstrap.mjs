// Prepare credentials locally. This command neither connects nor deploys.
// The SQL is INSERT-only: it never resets or promotes an existing account.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { hashPassword, credentials, token, id, now } from '../cloudflare/core.mjs';
const [email,destination]=process.argv.slice(2);
if(!destination)throw new Error('Usage: node scripts/cloudflare-bootstrap.mjs EMAIL PRIVATE_DIRECTORY');
const password=token(),input=credentials({email,password,name:'Admin'}),folder=resolve(destination);
await mkdir(folder,{recursive:true,mode:0o700});
const q=x=>`'${x.replaceAll("'","''")}'`;
const sql=`INSERT INTO users(id,email,password_hash,name,role,created_at) VALUES(${[id('usr'),input.email,await hashPassword(password),'Admin','admin',now()].map(q).join(',')});\n`;
await writeFile(join(folder,'admin.json'),JSON.stringify({email:input.email,password}),{mode:0o600,flag:'wx'});
await writeFile(join(folder,'admin.sql'),sql,{mode:0o600,flag:'wx'});
console.log('Private bootstrap prepared; no credentials printed. Apply admin.sql only to the verified database, then delete that SQL file.');
