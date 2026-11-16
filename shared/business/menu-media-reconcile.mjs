// Trusted operator utility, not an unauthenticated HTTP delete endpoint.
// Tombstones are bounded and retained to catch late writes after crashes.
export async function reconcileMenuMedia({sql,storage,fail,clock=()=>new Date().toISOString()},{cafe_id,older_than,dry_run=true}){
 if(typeof dry_run!=='boolean')fail(422,'validation_failed','dry_run must be boolean');
 if(typeof cafe_id!=='string'||!cafe_id||!Number.isFinite(Date.parse(older_than))||Date.parse(older_than)>Date.parse(clock())-86400000)fail(422,'validation_failed','Cafe and cutoff at least 24 hours old required');
 const cutoff=new Date(Date.parse(older_than)).toISOString();
 const candidates=await sql.all('SELECT id,cafe_id,object_key,file FROM menu_images m WHERE cafe_id=? AND created_at<? AND NOT EXISTS(SELECT 1 FROM menu_items p WHERE p.cafe_id=m.cafe_id AND p.image_ref=m.id) ORDER BY created_at,id LIMIT 20',cafe_id,cutoff);
 if(dry_run)return {dry_run:true,candidates:candidates.map(x=>({id:x.id}))};
 for(const image of candidates){
  await sql.batch([
   ['INSERT OR IGNORE INTO menu_media_gc(id,cafe_id,object_key,file,retired_at) SELECT id,cafe_id,object_key,file,? FROM menu_images m WHERE cafe_id=? AND id=? AND NOT EXISTS(SELECT 1 FROM menu_items p WHERE p.cafe_id=m.cafe_id AND p.image_ref=m.id)',clock(),cafe_id,image.id],
   ['DELETE FROM menu_images WHERE cafe_id=? AND id=? AND EXISTS(SELECT 1 FROM menu_media_gc g WHERE g.cafe_id=menu_images.cafe_id AND g.id=menu_images.id)',cafe_id,image.id]
  ]);
 }
 const journal=await sql.all('SELECT * FROM menu_media_gc WHERE cafe_id=? ORDER BY cleaned_at,id LIMIT 20',cafe_id);
 for(const row of journal){
  if(await sql.first('SELECT id FROM menu_items WHERE cafe_id=? AND image_ref=? LIMIT 1',cafe_id,row.id))fail(409,'media_conflict','Referenced image is protected');
  await storage.remove(row);
  await sql.batch([['UPDATE menu_media_gc SET cleaned_at=? WHERE cafe_id=? AND id=?',clock(),cafe_id,row.id]]);
 }
 return {dry_run:false,retired:candidates.length,cleaned:journal.length};
}
