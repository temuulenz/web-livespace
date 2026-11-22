import {createCafePhotos} from '../../shared/business/cafe-photos.mjs';
import {businessSqlError} from '../../shared/business/sql-errors.mjs';
import {transaction} from '../lib/db.mjs';
import {newId} from '../lib/auth.mjs';
import {HttpError,readJson,sendJson} from '../lib/http.mjs';

export function register(router,{db,uploads,limit}) {
 const fail=(...args)=>{throw new HttpError(...args);};
 const sql={first:(q,...p)=>db.prepare(q).get(...p),all:(q,...p)=>db.prepare(q).all(...p),batch:entries=>{try{return transaction(db,()=>entries.map(([q,...p])=>db.prepare(q).run(...p)));}catch(e){businessSqlError(e,fail);}}};
 const folder=cafe=>'cafe-'+encodeURIComponent(cafe);
 const storage={
  plan:(cafe,image,photo)=>({file:`${folder(cafe)}/${image}.${photo.ext}`}),
  save:async(cafe,image,photo)=>({file:await uploads.save(folder(cafe),image,photo)}),
  remove:image=>image.file?uploads.remove(image.file):undefined,
  read:image=>uploads.read(image.file)
 };
 const photos=createCafePhotos({sql,storage,fail,id:newId});
 const throttle=ctx=>limit(`cafe-photo:${ctx.user?.id||ctx.ip}`,40,60000);
 for(const owner of [false,true]) {
  const base='/api/v1/'+(owner?'owner/':'')+'cafes/:cafe/photos';
  router.get(base,async ctx=>{throttle(ctx);sendJson(ctx.res,200,await photos.list(ctx.params.cafe,ctx.user,!owner));});
  router.get(base+'/:photo/file',async ctx=>{
   throttle(ctx);const {image,body}=await photos.read(ctx.params.cafe,ctx.params.photo,ctx.user,!owner);
   const etag='"'+image.sha256+'"';ctx.res.writeHead(ctx.req.headers['if-none-match']===etag?304:200,{'Content-Type':image.mime,'Content-Length':body.length,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Cache-Control':owner?'private, no-cache':'public, max-age=300',ETag:etag});
   ctx.res.end(ctx.req.headers['if-none-match']===etag?undefined:body);
  });
 }
 const base='/api/v1/owner/cafes/:cafe/photos';
 router.post(base,async ctx=>{throttle(ctx);sendJson(ctx.res,201,await photos.upload(ctx.params.cafe,await readJson(ctx,1450000),ctx.user));});
 router.put(base+'/order',async ctx=>{throttle(ctx);sendJson(ctx.res,200,await photos.reorder(ctx.params.cafe,await readJson(ctx,16384),ctx.user));});
 router.put(base+'/:photo/cover',async ctx=>{throttle(ctx);sendJson(ctx.res,200,await photos.setCover(ctx.params.cafe,ctx.params.photo,ctx.user));});
 router.put(base+'/:photo',async ctx=>{throttle(ctx);sendJson(ctx.res,200,await photos.replace(ctx.params.cafe,ctx.params.photo,await readJson(ctx,1450000),ctx.user));});
 router.delete(base+'/:photo',async ctx=>{throttle(ctx);sendJson(ctx.res,200,await photos.remove(ctx.params.cafe,ctx.params.photo,ctx.user));});
}
