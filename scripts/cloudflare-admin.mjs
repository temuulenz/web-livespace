// Write a private SQL file; never print a password/hash or commit this output.
import { hashPassword, credentials, id, now } from '../cloudflare/core.mjs';
import { writeFileSync } from 'node:fs';
const [email,path]=process.argv.slice(2),password=process.env.LS_ADMIN_PASSWORD;
const input=credentials({email,password,name:'Admin'});
if(!path)throw new Error('Usage: LS_ADMIN_PASSWORD=... node scripts/cloudflare-admin.mjs EMAIL /private/path/admin.sql');
const q=x=>`'${x.replaceAll("'","''")}'`;
writeFileSync(path,`INSERT INTO users(id,email,password_hash,name,role,created_at) VALUES(${[id('usr'),input.email,await hashPassword(password),'Admin','admin',now()].map(q).join(',')}) ON CONFLICT(email) DO UPDATE SET role='admin',password_hash=excluded.password_hash;\n`,{mode:0o600});
console.log('Private admin SQL written. Apply with Wrangler, then delete the file.');
