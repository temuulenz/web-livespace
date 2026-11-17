import {createMenuStorage,menuImageEtag} from './menu-media-storage.mjs';
import {businessSqlError} from '../shared/business/sql-errors.mjs';
import {createMenuMedia} from '../shared/business/menu-media.mjs';
import {mediaResponse} from './media.mjs';
import {createMenuService} from '../shared/business/menu.mjs';
import {first,all,batch,fail,id,body,json,session} from './core.mjs';
const services=new WeakMap();
export async function menuRoute(req,env,limit) {
 const url=new URL(req.url);
 const imageMatch=/^\/api\/v1\/(owner\/)?cafes\/([^/]+)\/menu\/products\/([^/]+)\/image$/.exec(url.pathname);
 const match=/^\/api\/v1\/(owner\/)?cafes\/([^/]+)\/menu(?:\/(categories|products|variants|import)(?:\/([^/]+))?)?$/.exec(url.pathname);
 if(!match&&!imageMatch)return null;
 limit('menu:'+(req.headers.get('cf-connecting-ip')||'local'),120,60000);
 const [,owner,cafeRaw,kind,entityRaw]=match||[null,imageMatch[1],imageMatch[2],"products",imageMatch[3]],cafe=decodeURIComponent(cafeRaw),entity=entityRaw?decodeURIComponent(entityRaw):null;
 const sql={first:(q,...a)=>first(env.DB,q,...a),all:(q,...a)=>all(env.DB,q,...a),batch:async entries=>{try{return await batch(env.DB,entries);}catch(e){businessSqlError(e,fail);}}};
 let menu=services.get(env.DB);if(!menu){menu=createMenuService({id,fail,sql});services.set(env.DB,menu);}
 if(imageMatch){
  const media=createMenuMedia({sql,menu,id,fail,storage:createMenuStorage(env)});
  const user=owner?await session(env.DB,req):null;
  if(req.method==='GET'){const {image,body:value}=await media.read(cafe,entity,user,!owner);return mediaResponse(req,{mime:image.mime,visibility:'private'},{body:value,etag:menuImageEtag(image)});}
  if(owner&&['PUT','DELETE'].includes(req.method))return json({item:await media[req.method==='PUT'?'replace':'remove'](cafe,entity,await body(req,1450000),user)});
  fail(405,'method_not_allowed','Method not allowed');
 }

 if(owner&&req.method==='POST'&&entity){const user=await session(env.DB,req);if(kind==='import'&&['preview','confirm'].includes(entity))return json(await menu.importCsv(cafe,await body(req,16384),user,entity==='confirm'));if(kind!=='import'&&entity==='bulk')return json(await menu.bulk(cafe,kind,await body(req,16384),user));}
 const query=Object.fromEntries(url.searchParams);
 if(!owner&&req.method==='GET'&&!kind)return json(await menu.publicMenu(cafe,query));
 if(!owner||!kind)fail(405,'method_not_allowed','Method not allowed');
 const user=await session(env.DB,req);
 if(req.method==='GET')return json(entity?{item:await menu.get(cafe,kind,entity,user)}:await menu.list(cafe,kind,query,user));
 if(req.method==='POST'&&!entity)return json({item:await menu.create(cafe,kind,await body(req,16384),user)},201);
 if(req.method==='PATCH'&&entity)return json({item:await menu.update(cafe,kind,entity,await body(req,16384),user)});
 if(req.method==='DELETE'&&entity)return json(await menu.remove(cafe,kind,entity,user));
 fail(405,'method_not_allowed','Method not allowed');
}
