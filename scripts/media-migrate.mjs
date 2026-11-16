// Local-only, resumable copy/verify utility. Retains all D1 photo bytes.
// Never creates remote resources. --apply changes only the selected local state.
import {getPlatformProxy} from 'wrangler';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {createMediaStorage} from '../cloudflare/media.mjs';
import {inspectImage} from '../shared/image-validation.mjs';
import {sha} from '../cloudflare/core.mjs';
const args=process.argv.slice(2);if(args.some(a=>!['--local','--apply','--verify'].includes(a)))throw new Error('Use --local [--apply] [--verify]; remote migration is not implemented');
if(!args.includes('--local'))throw new Error('Explicit --local required');
const dir=await mkdtemp(join(tmpdir(),'ls-media-copy-')),config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
config.main=resolve(config.main);delete config.build;delete config.assets;delete config.durable_objects;delete config.migrations;
config.r2_buckets=[{binding:'MEDIA',bucket_name:'livespace-media-local'}];
await writeFile(join(dir,'wrangler.json'),JSON.stringify(config));
const proxy=await getPlatformProxy({configPath:join(dir,'wrangler.json'),persist:{path:resolve('.wrangler/state/v3')},remoteBindings:false});
try {
 const {DB,MEDIA}=proxy.env;
 const rows=(await DB.prepare(`SELECT p.id,p.mime,p.size,b.bytes,a.cafe_id,m.object_key FROM application_photos p JOIN applications a ON a.id=p.application_id JOIN photo_bytes b ON b.photo_id=p.id LEFT JOIN media_objects m ON m.photo_id=p.id ORDER BY p.id LIMIT 1000`).all()).results;
 const results=[];
 for(const row of rows) {
  const buffer=Buffer.from(row.bytes),hash=sha(buffer);
  if(row.object_key){const object=await MEDIA.get(row.object_key);results.push({id:row.id,status:object&&sha(new Uint8Array(await object.arrayBuffer()))===hash?'verified':'verification_failed'});continue;}
  let image;try{image=inspectImage(buffer);}catch{results.push({id:row.id,status:'invalid_legacy_image_preserved'});continue;}
  if(!args.includes('--apply')||args.includes('--verify')){results.push({id:row.id,status:'would_copy',bytes:buffer.length});continue;}
  const staged=await createMediaStorage({DB,MEDIA,LS_R2_MEDIA_ENABLED:'1'}).stage(row.cafe_id,row.id,{...image,buffer});
  const uploaded=await MEDIA.get(staged.key);if(!uploaded||sha(new Uint8Array(await uploaded.arrayBuffer()))!==hash)throw new Error('Copy verification failed; staged journal retained');
  await DB.batch([DB.prepare('INSERT INTO media_objects(photo_id,cafe_id,object_key,sha256,created_at) VALUES(?,?,?,?,?) ON CONFLICT(photo_id) DO NOTHING').bind(row.id,row.cafe_id,staged.key,hash,new Date().toISOString()),DB.prepare('DELETE FROM media_staging WHERE object_key=?').bind(staged.key)]);
  results.push({id:row.id,status:'copied_verified_legacy_retained'});
 }
 console.log(JSON.stringify({local:true,dryRun:!args.includes('--apply'),results},null,2));
}finally{await proxy.dispose();await rm(dir,{recursive:true,force:true});}
