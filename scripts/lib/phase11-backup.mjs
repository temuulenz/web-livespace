// Offline synthetic/staging directory backups only. No production/remote mode.
import {readdir,readFile,writeFile,mkdir,copyFile,lstat,realpath,chmod} from 'node:fs/promises';
import {resolve,join,dirname,relative,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
export const MARKER='.phase11-synthetic.json';
const digest=b=>createHash('sha256').update(b).digest('hex');
async function files(root,prefix=''){
 const out=[];for(const entry of await readdir(join(root,prefix),{withFileTypes:true})){
  const path=join(prefix,entry.name),stat=await lstat(join(root,path));
  if(stat.isSymbolicLink())throw Error('Symlinks are forbidden in rehearsal snapshots');
  if(stat.isDirectory())out.push(...await files(root,path));else if(stat.isFile()&&path!=='backup-manifest.json')out.push(path);
 }return out.sort();
}
export async function requireSynthetic(root){
 const path=await realpath(root),stat=await lstat(join(path,MARKER));if(!stat.isFile()||stat.isSymbolicLink())throw Error('Synthetic marker required');
 const value=JSON.parse(await readFile(join(path,MARKER),'utf8'));if(value.kind!=='livespace-phase11-synthetic')throw Error('Synthetic marker required');return path;
}
export function inspectDatabase(file){
 const db=new DatabaseSync(file,{readOnly:true});try{
  const integrity=db.prepare('PRAGMA integrity_check').all(),foreignKeys=db.prepare('PRAGMA foreign_key_check').all();
  if(integrity.some(r=>r.integrity_check!=='ok')||foreignKeys.length)throw Error('Backup database integrity failed');
  const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
  const tables={};for(const {name} of schema.filter(r=>r.type==='table')){
   const quoted='"'+name.replaceAll('"','""')+'"';
   const statement=db.prepare('SELECT * FROM '+quoted);statement.setReadBigInts(true);
   const rows=statement.all().map(row=>JSON.stringify(row,(_,v)=>typeof v==='bigint'?String(v):ArrayBuffer.isView(v)?Buffer.from(v).toString('hex'):v)).sort();
   tables[name]={rows:rows.length,content_sha256:digest(rows.join('\n'))};
  }
  return {user_version:db.prepare('PRAGMA user_version').get().user_version,schema_sha256:digest(JSON.stringify(schema)),schema_objects:schema.length,indexes:schema.filter(r=>r.type==='index').length,triggers:schema.filter(r=>r.type==='trigger').length,tables,integrity:'ok',foreign_key_violations:0};
 }finally{db.close();}
}
export async function inventory(root){
 root=await requireSynthetic(root);const paths=await files(root),databases={};
 for(const path of paths.filter(p=>p.endsWith('.sqlite')||p.endsWith('.db')))databases[path]=inspectDatabase(join(root,path));
 // Offline WAL bytes are part of the backup. Read-only inspection can create
 // empty WAL/SHM files; SHM is rebuildable and empty WAL has no durable content.
 const checksums={};for(const path of paths){if(path.endsWith('-shm'))continue;const bytes=await readFile(join(root,path));if(path.endsWith('-wal')&&!bytes.length)continue;checksums[path]=digest(bytes);}
 return {files:checksums,databases};
}
export async function snapshotDirectory(source,destination,{offline=false}={}){
 if(!offline)throw Error('Explicit offline assertion required; stop all writers first');
 source=await requireSynthetic(source);destination=resolve(destination);
 if(destination===source||destination.startsWith(source+sep)||source.startsWith(destination+sep))throw Error('Backup must use a separate new directory');
 // Resolve parent to catch symlink-based overlap before creating destination.
 const parent=await realpath(dirname(destination));if(parent===source||parent.startsWith(source+sep))throw Error('Backup overlap');
 const before=await inventory(source);await mkdir(destination,{mode:0o700});
 for(const path of Object.keys(before.files)){const target=join(destination,path);await mkdir(dirname(target),{recursive:true,mode:0o700});await copyFile(join(source,path),target);await chmod(target,0o600);}
 const after=await inventory(destination);if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Restored inventory mismatch');
 await writeFile(join(destination,'backup-manifest.json'),JSON.stringify({created_at:new Date().toISOString(),scope:'offline_synthetic_local_not_production',...after},null,2),{mode:0o600});return after;
}
export async function verifySnapshot(root){
 const expected=JSON.parse(await readFile(join(root,'backup-manifest.json'),'utf8')),actual=await inventory(root);
 if(JSON.stringify(expected.files)!==JSON.stringify(actual.files)||JSON.stringify(expected.databases)!==JSON.stringify(actual.databases))throw Error('Backup verification failed');return actual;
}
