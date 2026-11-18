import {authorizedBatch} from './write-authorization.mjs';
import {decodeImage} from '../image-validation.mjs';
import {createHash} from 'node:crypto';
// Storage adapter reuses Node uploads or optional R2; D1 bytes remain the fallback.
export function createMenuMedia({sql,menu,storage,fail,id,clock=()=>new Date().toISOString()}) {

 const write=(entries,cafe,user)=>sql.batch(businessWriteEntries(entries,cafe,user,id('audit'),clock()));
 return {
  async replace(cafe,product,input,user) {
   const item=await menu.get(cafe,'products',product,user);
   if(!input||Object.keys(input).some(k=>!['image','version'].includes(k))||input.version!==item.version)fail(409,'version_conflict','Supply current product version and image');
   let photo;try{photo=decodeImage(input.image,1048576);}catch{fail(422,'invalid_image','Expected valid JPEG, PNG or WebP up to 1 MiB');}
   const sha=createHash('sha256').update(photo.buffer).digest('hex');
   let image=await sql.first('SELECT * FROM menu_images WHERE cafe_id=? AND sha256=?',cafe,sha);
   if(image&&!image.ready)fail(409,'media_pending','Upload is pending; retry later or reconcile staging');
   if(!image){
    image={id:id('image'),cafe_id:cafe,mime:photo.mime,size:photo.buffer.length,sha256:sha};
    const location=storage.plan?.(cafe,image.id,photo)||{};
    // Planned physical location is durable before any byte write.
    await authorizedBatch(sql,fail,user,cafe,'owner',[['INSERT INTO menu_images(id,cafe_id,mime,size,sha256,created_at,object_key,file) VALUES(?,?,?,?,?,?,?,?)',image.id,cafe,image.mime,image.size,sha,clock(),location.object_key??null,location.file??null]]);
    const saved=await storage.save(cafe,image.id,photo);
    try{await authorizedBatch(sql,fail,user,cafe,'owner',[
     ['UPDATE menu_images SET object_key=?,file=?,bytes=?,ready=1 WHERE id=? AND cafe_id=? AND ready=0',saved.object_key??location.object_key??null,saved.file??location.file??null,saved.bytes??null,image.id,cafe],
     ['INSERT INTO business_audit(id,cafe_id,actor_id,action,entity_id,at) VALUES(CASE WHEN changes()=1 THEN ? ELSE NULL END,?,?,?,?,?)',id('audit'),cafe,user.id,'media.persist',image.id,clock()]
    ],cafe,user);}catch(e){
     // A GC tombstone fences late writers. Never delete after ambiguous persistence.
     if(await sql.first('SELECT id FROM menu_media_gc WHERE cafe_id=? AND id=?',cafe,image.id))await storage.remove?.({...location,...saved,id:image.id,cafe_id:cafe});
     throw e;
    }
   }
   // SQL version guard and audit are atomic; replacement never deletes old media.
   await authorizedBatch(sql,fail,user,cafe,'owner',[
    ['UPDATE menu_items SET image_ref=?,version=version+1,updated_at=? WHERE cafe_id=? AND id=? AND version=?',image.id,clock(),cafe,product,item.version],
    ['INSERT INTO business_audit(id,cafe_id,actor_id,action,entity_id,at) VALUES(CASE WHEN changes()=1 THEN ? ELSE NULL END,?,?,?,?,?)',id('audit'),cafe,user.id,'products.image',product,clock()]
   ],cafe,user);
   menu.invalidate(cafe);return menu.get(cafe,'products',product,user);
  },
  async remove(cafe,product,input,user) {
   const item=await menu.get(cafe,'products',product,user);
   if(!input||Object.keys(input).some(k=>k!=='version')||input.version!==item.version)fail(409,'version_conflict','Supply current product version');
   await authorizedBatch(sql,fail,user,cafe,'owner',[
    ['UPDATE menu_items SET image_ref=NULL,version=version+1,updated_at=? WHERE cafe_id=? AND id=? AND version=?',clock(),cafe,product,item.version],
    ['INSERT INTO business_audit(id,cafe_id,actor_id,action,entity_id,at) VALUES(CASE WHEN changes()=1 THEN ? ELSE NULL END,?,?,?,?,?)',id('audit'),cafe,user.id,'products.image.remove',product,clock()]
   ],cafe,user);menu.invalidate(cafe);return menu.get(cafe,'products',product,user);
  },
  async read(cafe,product,user,publicOnly) {
   let item;
   if(publicOnly){item=(await menu.publicMenu(cafe,{product_id:product})).products[0];if(!item)fail(404,'not_found','Product not found');}
   else item=await menu.get(cafe,'products',product,user);
   const image=item.image_ref&&await sql.first('SELECT * FROM menu_images WHERE cafe_id=? AND id=? AND ready=1',cafe,item.image_ref);
   if(!image)fail(404,'not_found','Image not found');
   return {image,body:await storage.read(image)};
  }
 };
}
