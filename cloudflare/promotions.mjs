import {createPromotionService} from '../shared/business/promotions.mjs';
import {businessSqlError} from '../shared/business/sql-errors.mjs';
import {first,all,batch,fail,id,body,json,session} from './core.mjs';
export async function promotionsRoute(req,env,limit){
 const u=new URL(req.url),m=/^\/api\/v1\/(owner\/)?cafes\/([^/]+)\/promotions(?:\/([^/]+))?$/.exec(u.pathname);if(!m)return null;
 limit('promotions:'+(req.headers.get('cf-connecting-ip')||'local'),120,60000);
 const sql={first:(q,...a)=>first(env.DB,q,...a),all:(q,...a)=>all(env.DB,q,...a),batch:async entries=>{try{return await batch(env.DB,entries);}catch(e){businessSqlError(e,fail);}}},service=createPromotionService({sql,fail,id}),cafe=decodeURIComponent(m[2]),entity=m[3]?decodeURIComponent(m[3]):null,query=Object.fromEntries(u.searchParams);
 if(!m[1]&&req.method==='GET'&&!entity)return json(await service.list(cafe,query,null,true));
 if(!m[1])fail(405,'method_not_allowed','Method not allowed');const user=await session(env.DB,req),input=()=>body(req,16384);
 if(req.method==='GET')return json(entity?{promotion:await service.get(cafe,entity,user)}:await service.list(cafe,query,user));
 if(req.method==='POST'&&entity==='preview')return json(await service.preview(cafe,await input(),user));
 if(req.method==='POST'&&!entity)return json({promotion:await service.save(cafe,await input(),user)},201);
 if(req.method==='PATCH'&&entity)return json({promotion:await service.save(cafe,await input(),user,entity)});
 if(req.method==='DELETE'&&entity)return json(await service.remove(cafe,entity,await input(),user));
 fail(405,'method_not_allowed','Method not allowed');
}
