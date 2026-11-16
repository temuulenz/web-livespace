import { first,run,sha,now,fail } from './core.mjs';
export const MEDIA_MAX_BYTES=1048576;
const part=x=>{if(!/^[A-Za-z0-9_.:-]{1,80}$/.test(x))throw new Error('Invalid media key component');return encodeURIComponent(x);};
export const mediaKey=(cafe,id,ext)=>`media/v1/cafes/${part(cafe)}/${part(id)}.${ext}`;
export function createMediaStorage(env) {
 const enabled=env.LS_R2_MEDIA_ENABLED==='1';
 if(enabled && !env.MEDIA)fail(503,'media_unavailable','Media storage is not configured');
 return {
  enabled,
  async stage(cafe,id,photo) {
   if(!enabled){const old=await first(env.DB,'SELECT COUNT(*) n,COALESCE(SUM(p.size),0) bytes FROM application_photos p LEFT JOIN media_objects m ON m.photo_id=p.id WHERE m.photo_id IS NULL');if(old.n>=1000||old.bytes+photo.buffer.length>50*1024*1024)fail(503,'media_budget_exceeded','Legacy image storage budget reached');return null;}
   const pending=await first(env.DB,'SELECT COUNT(*) n,COALESCE(SUM(size),0) bytes FROM media_staging');
   // Hard application budget for new/journaled uploads. Referenced object bytes
   // are counted through metadata, not bucket listing on every request.
   const stored=await first(env.DB,'SELECT COUNT(*) n,COALESCE(SUM(p.size),0) bytes FROM media_objects m JOIN application_photos p ON p.id=m.photo_id');
   if(pending.n+stored.n>=1000 || pending.bytes+stored.bytes+photo.buffer.length>512*1024*1024)fail(503,'media_budget_exceeded','Media upload budget reached');
   const key=mediaKey(cafe,id,photo.ext),hash=sha(photo.buffer);
   await run(env.DB,'INSERT INTO media_staging(object_key,photo_id,cafe_id,size,created_at) VALUES(?,?,?,?,?)',key,id,cafe,photo.buffer.length,now());
   await env.MEDIA.put(key,photo.buffer,{httpMetadata:{contentType:photo.mime},customMetadata:{sha256:hash}});
   return {key,hash};
  },
  async read(photo) {
   if(photo.object_key){if(!env.MEDIA)fail(503,'media_unavailable','Media storage temporarily unavailable');const object=await env.MEDIA.get(photo.object_key);if(!object)fail(503,'media_unavailable','Media storage temporarily unavailable');return {body:object.body,etag:object.httpEtag};}
   const old=await first(env.DB,'SELECT bytes FROM photo_bytes WHERE photo_id=?',photo.id);if(!old)fail(404,'not_found','Photo not found');
   const bytes=new Uint8Array(old.bytes);return {body:bytes,etag:'"'+sha(bytes)+'"'};
  }
 };
}
export function mediaResponse(req,photo,value) {
 const publicMedia=photo.visibility==='public';
 const headers={'Content-Type':photo.mime,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",ETag:value.etag,'Cache-Control':publicMedia?'public, max-age=300':'private, no-cache',Vary:publicMedia?'Accept-Encoding':'Cookie'};
 if(req.headers.get('if-none-match')?.split(',').map(s=>s.trim()).includes(value.etag))return new Response(null,{status:304,headers});
 return new Response(value.body,{headers});
}
// Operator-only reconciliation, never an HTTP delete endpoint. Refuse deletion
// unless staged, old enough, unreferenced, and scoped to the requested cafe.
export async function reconcileMedia(env,{cafeId,dryRun=true,olderThan=new Date(Date.now()-86400000).toISOString()}) {
 const rows=(await env.DB.prepare('SELECT * FROM media_staging WHERE cafe_id=? AND created_at<? LIMIT 100').bind(cafeId,olderThan).all()).results;
 const actions=[];for(const row of rows){const ref=await first(env.DB,'SELECT photo_id FROM media_objects WHERE object_key=?',row.object_key);actions.push({key:row.object_key,action:ref?'clear_journal':'remove_orphan'});if(!dryRun){if(!ref)await env.MEDIA.delete(row.object_key);await run(env.DB,'DELETE FROM media_staging WHERE object_key=?',row.object_key);}}return actions;
}
