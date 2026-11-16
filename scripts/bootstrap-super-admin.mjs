// Operator bootstrap. Passwords are read only from a hidden terminal prompt.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, transaction } from '../server/lib/db.mjs';
import { loadConfig } from '../server/config.mjs';
import { superAdminBootstrap } from '../server/lib/super-admin-bootstrap.mjs';
import { SUPER_ADMIN_EMAIL } from '../server/services/user-access.mjs';
const args=process.argv.slice(2),remote=args.includes('--remote');
if(args.some((a,i)=>!['--remote','--local','--expected-id'].includes(a) && args[i-1]!=='--expected-id')) throw new Error('Usage: node scripts/bootstrap-super-admin.mjs --local|--remote [--expected-id USER_ID]');
const expectedId=args.includes('--expected-id')?args[args.indexOf('--expected-id')+1]:undefined;
const literal=value=>value==null?'NULL':typeof value==='number'?String(value):"'"+String(value).replaceAll("'","''")+"'";
let db;
function remoteQuery(statement,parameters=[],returnRows=true) {
  const directory=mkdtempSync(join(tmpdir(),'livespace-super-admin-'));
  try {
    const file=join(directory,'operation.sql');let index=0;
    const query=parameters.length?statement.replaceAll('?',()=>literal(parameters[index++])):statement;
    if(!returnRows)writeFileSync(file,query,{mode:0o600});
    const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','livespace','--remote',...(returnRows?['--command',query]:['--file',file]),'--json'],{encoding:'utf8',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
    if(result.status!==0) throw new Error('D1 operation failed; sensitive SQL/output was suppressed');
    // File imports emit progress even with --json and do not return SELECT rows.
    return returnRows?JSON.parse(result.stdout).flatMap(r=>r.results || []):[];
  } finally {rmSync(directory,{recursive:true,force:true});}
}
const sql=remote?{
  first:async(query,...params)=>remoteQuery(query,params)[0],
  batch:async entries=>{
    // The production existing-admin path is one INSERT; a database trigger
    // atomically binds, revokes sessions and audits it. Other paths use D1 import.
    const query=entries.map(([query,...params])=>{let i=0;return query.replaceAll('?',()=>literal(params[i++]))+';';}).join('\n');
    remoteQuery(query,[],false);
  }
}:{
  first:async(query,...params)=>db.prepare(query).get(...params),
  batch:async entries=>transaction(db,()=>entries.forEach(([query,...params])=>db.prepare(query).run(...params)))
};
async function hiddenPassword(prompt) {
  if(!process.stdin.isTTY) throw new Error('A terminal is required to enter a new password securely');
  process.stdout.write(prompt);process.stdin.setRawMode(true);process.stdin.resume();
  return new Promise((resolve,reject)=>{let value='';const done=()=>{process.stdin.setRawMode(false);process.stdin.pause();process.stdin.off('data',read);process.stdout.write('\n');};const read=chunk=>{
    for(const c of chunk.toString()) {if(c==='\u0003'){done();reject(new Error('Cancelled'));return;}if(c==='\r'||c==='\n'){done();resolve(value);return;}if(c==='\u007f'||c==='\b')value=value.slice(0,-1);else if(c>=' ')value+=c;}
  };process.stdin.on('data',read);});
}
try {
  if(!remote)db=openDatabase(loadConfig().dbFile);
  const existing=await sql.first('SELECT id FROM users WHERE email=? COLLATE NOCASE',SUPER_ADMIN_EMAIL);
  let password;
  if(!existing) {
    password=await hiddenPassword('New Super Admin password (hidden): ');
    if(password!==await hiddenPassword('Confirm password (hidden): '))throw new Error('Passwords do not match');
  }
  const result=await superAdminBootstrap({sql,password,expectedId});
  console.log(JSON.stringify(result));
} finally {db?.close();}
