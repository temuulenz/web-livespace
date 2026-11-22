import {createHash} from 'node:crypto';
import {decodeImage} from '../image-validation.mjs';
import {authorizedBatch} from './write-authorization.mjs';

const MAX_BYTES=1048576;
const project=row=>({id:row.id,cafe_id:row.cafe_id,mime:row.mime,width:row.width,height:row.height,size:row.size,position:row.position,is_cover:!!row.is_cover,ready:!!row.ready,created_at:row.created_at,
 url:`/api/v1/cafes/${encodeURIComponent(row.cafe_id)}/photos/${encodeURIComponent(row.id)}/file`});

export function createCafePhotos({sql,storage,fail,id,clock=()=>new Date().toISOString()}) {
 const cafeRow=async cafe=>{const row=await sql.first('SELECT id,status,owner_id FROM cafes WHERE id=?',cafe);if(!row)fail(404,'not_found','Cafe not found');return row;};
 const manage=async(cafe,user)=>{
  const row=await cafeRow(cafe);
  if(!user||user.disabled_at||!((['owner','admin'].includes(user.role)&&row.owner_id===user.id)||(user.role==='admin'&&user.is_super_admin&&await sql.first('SELECT 1 FROM super_admin_identity WHERE user_id=?',user.id))))fail(user?403:401,'forbidden','Cafe photo management requires its owner or Super Admin');
  return row;
 };
 const rows=(cafe,publicOnly)=>sql.all(`SELECT id,cafe_id,mime,size,width,height,position,is_cover,ready,created_at FROM cafe_photos WHERE cafe_id=? ${publicOnly?'AND ready=1':''} ORDER BY is_cover DESC,position,id`,cafe);
 const photoRow=(cafe,photo)=>sql.first('SELECT * FROM cafe_photos WHERE cafe_id=? AND id=?',cafe,photo);
 async function gc(row) {
  try {await storage.remove?.(row);await sql.batch([['DELETE FROM cafe_photo_gc WHERE id=? AND cafe_id=?',row.id,row.cafe_id]]);}catch{/* Durable tombstone remains for operator reconciliation. */}
 }
 return {
  async list(cafe,user,publicOnly=false) {
   if(publicOnly){const row=await cafeRow(cafe);if(row.status!=='active')fail(404,'not_found','Cafe not found');}
   else await manage(cafe,user);
   return {photos:(await rows(cafe,publicOnly)).map(project)};
  },
  async upload(cafe,input,user) {
   await manage(cafe,user);
   if(!input||Object.keys(input).some(k=>k!=='image'))fail(422,'invalid_image','Supply one image');
   let photo;try{photo=decodeImage(input.image,MAX_BYTES);}catch{fail(422,'invalid_image','Expected valid JPEG, PNG or WebP up to 1 MiB');}
   const photoId=id('cphoto'),at=clock(),sha=createHash('sha256').update(photo.buffer).digest('hex');
   const location=storage.plan?.(cafe,photoId,photo)||{};
   await authorizedBatch(sql,fail,user,cafe,'owner',[
    ['INSERT INTO cafe_photos(id,cafe_id,mime,size,width,height,sha256,position,file,object_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',photoId,cafe,photo.mime,photo.buffer.length,photo.width,photo.height,sha,(await rows(cafe,false)).length,location.file??null,location.object_key??null,at],
    // Keep a durable cleanup pointer before writing external storage. A failed
    // final commit must never leave an untracked object in R2 or on disk.
    ['INSERT INTO cafe_photo_gc(id,cafe_id,file,object_key,created_at) VALUES(?,?,?,?,?)',photoId,cafe,location.file??null,location.object_key??null,at]
   ]);
   try {
    const saved=await storage.save(cafe,photoId,photo);
    await authorizedBatch(sql,fail,user,cafe,'owner',[
     ['UPDATE cafe_photos SET file=?,object_key=?,bytes=?,ready=1,is_cover=CASE WHEN NOT EXISTS(SELECT 1 FROM cafe_photos WHERE cafe_id=? AND ready=1 AND is_cover=1) THEN 1 ELSE 0 END WHERE id=? AND cafe_id=? AND ready=0',saved.file??location.file??null,saved.object_key??location.object_key??null,saved.bytes??null,cafe,photoId,cafe],
     ['INSERT INTO business_audit(id,cafe_id,actor_id,action,entity_id,at) VALUES(CASE WHEN changes()=1 THEN ? ELSE NULL END,?,?,?,?,?)',id('audit'),cafe,user.id,'cafe.photo.upload',photoId,clock()],
     ['DELETE FROM cafe_photo_gc WHERE id=? AND cafe_id=?',photoId,cafe]
    ]);
   } catch(error) {
    // Exact generated ID is safe to clean up even if ownership changed while
    // the object write was in flight. Keep the journal if physical removal fails.
    let cleared=false;
    try {await sql.batch([['DELETE FROM cafe_photos WHERE id=? AND cafe_id=? AND ready=0',photoId,cafe]]);cleared=true;} catch {}
    if(cleared)await gc({id:photoId,cafe_id:cafe,...location});
    throw error;
   }
   const row=await photoRow(cafe,photoId);if(!row?.ready)fail(409,'photo_pending','Upload pending; retry after access is restored');
   return {photo:project(row)};
  },
  async setCover(cafe,photo,user) {
   await manage(cafe,user);const row=await photoRow(cafe,photo);if(!row?.ready)fail(404,'not_found','Ready photo not found');
   await authorizedBatch(sql,fail,user,cafe,'owner',[
    ['UPDATE cafe_photos SET is_cover=0 WHERE cafe_id=? AND is_cover=1',cafe],
    ['UPDATE cafe_photos SET is_cover=1 WHERE cafe_id=? AND id=? AND ready=1',cafe,photo],
    ['INSERT INTO business_audit(id,cafe_id,actor_id,action,entity_id,at) VALUES(?,?,?,?,?,?)',id('audit'),cafe,user.id,'cafe.photo.cover',photo,clock()]
   ]);return this.list(cafe,user);
  },
  async reorder(cafe,input,user) {
   await manage(cafe,user);if(!input||Object.keys(input).some(k=>k!=='ids')||!Array.isArray(input.ids))fail(422,'validation_failed','Supply photo IDs');
   const current=(await rows(cafe,true)).map(row=>row.id),ids=input.ids;
   if(ids.length!==current.length||new Set(ids).size!==ids.length||ids.some(value=>!current.includes(value)))fail(409,'gallery_changed','Reload gallery before reordering');
   await authorizedBatch(sql,fail,user,cafe,'owner',[
    ...ids.map((photo,i)=>['UPDATE cafe_photos SET position=? WHERE cafe_id=? AND id=? AND ready=1',i,cafe,photo]),
    ['INSERT INTO business_audit(id,cafe_id,actor_id,action,entity_id,at) VALUES(?,?,?,?,?,?)',id('audit'),cafe,user.id,'cafe.photo.reorder',cafe,clock()]
   ]);return this.list(cafe,user);
  },
  async remove(cafe,photo,user) {
   await manage(cafe,user);const row=await photoRow(cafe,photo);if(!row)fail(404,'not_found','Photo not found');
   await authorizedBatch(sql,fail,user,cafe,'owner',[
    ['INSERT INTO cafe_photo_gc(id,cafe_id,file,object_key,created_at) VALUES(?,?,?,?,?)',row.id,cafe,row.file,row.object_key,clock()],
    ['DELETE FROM cafe_photos WHERE cafe_id=? AND id=?',cafe,photo],
    ['UPDATE cafe_photos SET is_cover=1 WHERE id=(SELECT id FROM cafe_photos WHERE cafe_id=? AND ready=1 ORDER BY position,id LIMIT 1) AND NOT EXISTS(SELECT 1 FROM cafe_photos WHERE cafe_id=? AND ready=1 AND is_cover=1)',cafe,cafe],
    ['INSERT INTO business_audit(id,cafe_id,actor_id,action,entity_id,at) VALUES(?,?,?,?,?,?)',id('audit'),cafe,user.id,'cafe.photo.delete',photo,clock()]
   ]);await gc(row);return this.list(cafe,user);
  },
  async replace(cafe,photo,input,user) {
   await manage(cafe,user);const old=await photoRow(cafe,photo);if(!old)fail(404,'not_found','Photo not found');
   const created=await this.upload(cafe,input,user);
   if(old.is_cover)await this.setCover(cafe,created.photo.id,user);
   await this.remove(cafe,photo,user);
   return {photo:created.photo,photos:(await this.list(cafe,user)).photos};
  },
  async read(cafe,photo,user,publicOnly=true) {
   const row=await cafeRow(cafe);
   if(publicOnly){if(row.status!=='active')fail(404,'not_found','Photo not found');}
   else await manage(cafe,user);
   const image=await photoRow(cafe,photo);if(!image?.ready)fail(404,'not_found','Photo not found');
   const body=await storage.read(image);
   if(!body)fail(503,'media_unavailable','Image unavailable');
   return {image,body};
  }
 };
}
