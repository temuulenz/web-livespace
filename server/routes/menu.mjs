import {businessSqlError} from '../../shared/business/sql-errors.mjs';
import {createMenuMedia} from '../../shared/business/menu-media.mjs';
import { createMenuService } from '../../shared/business/menu.mjs';
import { transaction } from '../lib/db.mjs';
import { newId } from '../lib/auth.mjs';
import { HttpError, readJson, sendJson } from '../lib/http.mjs';
export function register(router,{db,limit,uploads}) {
 const fail=(...args)=>{throw new HttpError(...args);};
 const sql={
  first:(q,...a)=>db.prepare(q).get(...a),all:(q,...a)=>db.prepare(q).all(...a),
  batch:entries=>{try{return transaction(db,()=>entries.map(([q,...a])=>db.prepare(q).run(...a)));}catch(e){businessSqlError(e,fail);}}
 };
 const menu=createMenuService({id:newId,fail,sql});
 const media=createMenuMedia({id:newId,fail,sql,menu,storage:{plan:(cafe,id,photo)=>({file:`menu-${encodeURIComponent(cafe)}/${id}.${photo.ext}`}),remove:image=>uploads.remove(image.file),save:async(cafe,id,photo)=>({file:await uploads.save("menu-"+encodeURIComponent(cafe),id,photo)}),read:image=>uploads.read(image.file)}});
 const throttle=ctx=>limit('menu:'+ctx.ip,120,60000);
 router.get('/api/v1/cafes/:cafe/menu',async ctx=>{throttle(ctx);sendJson(ctx.res,200,await menu.publicMenu(ctx.params.cafe,ctx.query));});
 for(const owner of [false,true])router.get('/api/v1/'+(owner?'owner/':'')+'cafes/:cafe/menu/products/:product/image',async ctx=>{
  throttle(ctx);const {image,body}=await media.read(ctx.params.cafe,ctx.params.product,ctx.user,!owner);
  const etag='"'+image.sha256+'"';const headers={'Content-Type':image.mime,'Cache-Control':'private, no-cache',ETag:etag,'X-Content-Type-Options':'nosniff'};
  ctx.res.writeHead(ctx.req.headers['if-none-match']===etag?304:200,headers);ctx.res.end(ctx.req.headers['if-none-match']===etag?undefined:body);
 });
 for(const action of ['put','delete'])router[action]('/api/v1/owner/cafes/:cafe/menu/products/:product/image',async ctx=>{throttle(ctx);const input=await readJson(ctx,1450000);sendJson(ctx.res,200,{item:await media[action==='put'?'replace':'remove'](ctx.params.cafe,ctx.params.product,input,ctx.user)});});
 for(const action of ['preview','confirm'])router.post('/api/v1/owner/cafes/:cafe/menu/import/'+action,async ctx=>{throttle(ctx);sendJson(ctx.res,200,await menu.importCsv(ctx.params.cafe,await readJson(ctx,16384),ctx.user,action==='confirm'));});
 for(const kind of ['categories','products','variants']) {
  const path='/api/v1/owner/cafes/:cafe/menu/'+kind;
  router.post(path+'/bulk',async ctx=>{throttle(ctx);sendJson(ctx.res,200,await menu.bulk(ctx.params.cafe,kind,await readJson(ctx,16384),ctx.user));});
  router.get(path,async ctx=>{throttle(ctx);sendJson(ctx.res,200,await menu.list(ctx.params.cafe,kind,ctx.query,ctx.user));});
  router.get(path+'/:entity',async ctx=>{throttle(ctx);sendJson(ctx.res,200,{item:await menu.get(ctx.params.cafe,kind,ctx.params.entity,ctx.user)});});
  router.post(path,async ctx=>{throttle(ctx);sendJson(ctx.res,201,{item:await menu.create(ctx.params.cafe,kind,await readJson(ctx,16384),ctx.user)});});
  router.patch(path+'/:entity',async ctx=>{throttle(ctx);sendJson(ctx.res,200,{item:await menu.update(ctx.params.cafe,kind,ctx.params.entity,await readJson(ctx,16384),ctx.user)});});
  router.delete(path+'/:entity',async ctx=>{throttle(ctx);sendJson(ctx.res,200,await menu.remove(ctx.params.cafe,kind,ctx.params.entity,ctx.user));});
 }
}
