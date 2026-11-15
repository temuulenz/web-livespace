// Preserve publicly served assets for a frontend-only recovery; no remote writes.
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
const origin='https://livespace.temuulenbayarjargal.workers.dev';
const folder=join('.artifacts','production-before',new Date().toISOString().replaceAll(':','-'));
async function files(root){const out=[];for(const item of await readdir(root,{withFileTypes:true})){const p=join(root,item.name);out.push(...(item.isDirectory()?await files(p):[p]));}return out;}
const paths=['index.html','app.js','styles.css','logo.webp',...await files('js'),...await files('styles'),...await files('framework')];
const results=[];
for(const path of paths){const r=await fetch(origin+'/'+(path==='index.html'?'':path));results.push({path,status:r.status});if(r.ok){const file=join(folder,'assets',path);await mkdir(dirname(file),{recursive:true});await writeFile(file,Buffer.from(await r.arrayBuffer()));}}
await writeFile(join(folder,'manifest.json'),JSON.stringify({origin,recordedVersion:'7f8beb8f-ecc3-4288-980a-ad4e0cc09fba',results},null,2));
console.log(JSON.stringify({backup:folder,saved:results.filter(x=>x.status===200).length,missing:results.filter(x=>x.status!==200).map(x=>x.path)}));
