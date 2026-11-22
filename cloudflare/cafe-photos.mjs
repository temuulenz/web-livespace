import {createCafePhotos} from '../shared/business/cafe-photos.mjs';
import {businessSqlError} from '../shared/business/sql-errors.mjs';
import {createMenuStorage} from './menu-media-storage.mjs';
import {mediaResponse} from './media.mjs';
import {first,all,batch,fail,id,body,json,session} from './core.mjs';

export async function cafePhotosRoute(req,env,limit) {
 const path=new URL(req.url).pathname;
 const match=/^\/api\/v1\/(owner\/)?cafes\/([^/]+)\/photos(?:\/([^/]+)(?:\/(file|cover))?)?$/.exec(path);
 if(!match)return null;
 limit('cafe-photo:'+(req.headers.get('cf-connecting-ip')||'local'),40,60000);
 const [,owner,cafeRaw,photoRaw,operation]=match,cafe=decodeURIComponent(cafeRaw),photo=photoRaw?decodeURIComponent(photoRaw):null;
 const sql={first:(q,...p)=>first(env.DB,q,...p),all:(q,...p)=>all(env.DB,q,...p),batch:async entries=>{try{return await batch(env.DB,entries);}catch(e){businessSqlError(e,fail);}}};
 const photos=createCafePhotos({sql,storage:createMenuStorage(env),fail,id});
 const actor=owner?await session(env.DB,req):null;
 if(req.method==='GET'&&!photo)return json(await photos.list(cafe,actor,!owner));
 if(req.method==='GET'&&operation==='file'){
  const {image,body:value}=await photos.read(cafe,photo,actor,!owner);
  return mediaResponse(req,{mime:image.mime,visibility:owner?'private':'public'},{body:value,etag:'"'+image.sha256+'"'});
 }
 if(!owner)fail(405,'method_not_allowed','Method not allowed');
 if(req.method==='POST'&&!photo)return json(await photos.upload(cafe,await body(req,1450000),actor),201);
 if(req.method==='PUT'&&photo==='order'&&!operation)return json(await photos.reorder(cafe,await body(req,16384),actor));
 if(req.method==='PUT'&&photo&&operation==='cover')return json(await photos.setCover(cafe,photo,actor));
 if(req.method==='PUT'&&photo&&!operation)return json(await photos.replace(cafe,photo,await body(req,1450000),actor));
 if(req.method==='DELETE'&&photo&&!operation)return json(await photos.remove(cafe,photo,actor));
 fail(405,'method_not_allowed','Method not allowed');
}
