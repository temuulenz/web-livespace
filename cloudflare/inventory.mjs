import {createInventoryService} from '../shared/business/inventory.mjs';
import {businessSqlError} from '../shared/business/sql-errors.mjs';
import {first,all,batch,id,fail,body,json,session} from './core.mjs';
export async function inventoryRoute(req,env,limit){
 const u=new URL(req.url),m=/^\/api\/v1\/(owner\/)?cafes\/([^/]+)\/inventory(?:\/(mutations|movements))?$/.exec(u.pathname);if(!m)return null;
 limit('inventory:'+(req.headers.get('cf-connecting-ip')||'local'),120,60000);
 const cafe=decodeURIComponent(m[2]),sql={first:(q,...a)=>first(env.DB,q,...a),all:(q,...a)=>all(env.DB,q,...a),batch:async entries=>{try{return await batch(env.DB,entries);}catch(e){businessSqlError(e,fail);}}};
 const service=createInventoryService({sql,fail,id,afterCommit:event=>env.LS_BROWSER_REALTIME_ENABLED==='1'?env.BROWSER_ROOMS?.get(env.BROWSER_ROOMS.idFromName('cafe:'+cafe)).publishInventory(cafe,event):undefined});
 const query=Object.fromEntries(u.searchParams);
 if(!m[1]&&req.method==='GET'&&!m[3])return json(await service.snapshot(cafe,query));
 if(!m[1])fail(405,'method_not_allowed','Method not allowed');const user=await session(env.DB,req);
 if(req.method==='GET'&&!m[3])return json(await service.list(cafe,query,user));
 if(req.method==='GET'&&m[3]==='movements')return json(await service.movements(cafe,query,user));
 if(req.method==='POST'&&m[3]==='mutations')return json(await service.mutate(cafe,await body(req,16384),user));
 fail(405,'method_not_allowed','Method not allowed');
}
