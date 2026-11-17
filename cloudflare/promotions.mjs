import {createPromotionService} from '../shared/business/promotions-service.mjs';
import {businessSqlError} from '../shared/business/sql-errors.mjs';
import {first,all,batch,id,fail,body,json,session} from './core.mjs';
export async function promotionsRoute(req,env,limit){
 const u=new URL(req.url),m=/^\/api\/v1\/(owner\/)?cafes\/([^/]+)\/promotions(?:\/([^/]+))?$/.exec(u.pathname);if(!m)return null;
 limit('promotions:'+(req.headers.get('cf-connecting-ip')||'local'),120,60000);
 const sql={first:(q,...a)=>first(env.DB,q,...a),all:(q,...a)=>all(env.DB,q,...a),batch:async entries=>{try{return await batch(env.DB,entries);}catch(e){businessSqlError(e,fail);}}},service=createPromotionService({sql,fail,id}),cafe=decodeURIComponent(m[2]);
 if(!m[1]){if(req.method==='GET'&&!m[3])return json(await service.publicList(cafe));fail(405,'method_not_allowed','Method not allowed');}
 const user=await session(env.DB,req);
 if(req.method==='GET'&&!m[3])return json(await service.list(cafe,Object.fromEntries(u.searchParams),user));
 if(req.method==='POST'&&!m[3])return json(await service.create(cafe,await body(req,16384),user),201);
 if(req.method==='POST'&&m[3]==='preview')return json(await service.preview(cafe,await body(req,16384),user));
 if(req.method==='PATCH'&&m[3])return json(await service.update(cafe,decodeURIComponent(m[3]),await body(req,16384),user));
 fail(405,'method_not_allowed','Method not allowed');
}
