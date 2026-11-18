import {createInventoryService} from '../../shared/business/inventory.mjs';
import {businessSqlError} from '../../shared/business/sql-errors.mjs';
import {transaction} from '../lib/db.mjs';
import {newId} from '../lib/auth.mjs';
import {HttpError,readJson,sendJson} from '../lib/http.mjs';
export function register(router,{db,hub,limit}){
 const fail=(...a)=>{throw new HttpError(...a);};
 const sql={first:(q,...a)=>db.prepare(q).get(...a),all:(q,...a)=>db.prepare(q).all(...a),batch:async entries=>{try{return transaction(db,()=>entries.map(([q,...a])=>db.prepare(q).run(...a)));}catch(e){businessSqlError(e,fail);}}};
 const service=createInventoryService({sql,fail,id:newId,afterCommit:event=>hub.broadcastCafe(event.cafe_id,'inventory.changed',event)});
 const throttle=ctx=>limit('inventory:'+ctx.ip,120,60000);
 router.get('/api/v1/cafes/:cafe/inventory',async ctx=>{throttle(ctx);sendJson(ctx.res,200,await service.snapshot(ctx.params.cafe,ctx.query));});
 router.get('/api/v1/cafes/:cafe/inventory/stream',async ctx=>{throttle(ctx);const snapshot=await service.snapshot(ctx.params.cafe,{});hub.subscribe(ctx.req,ctx.res,{ip:ctx.ip,cafeId:ctx.params.cafe});ctx.res.write(`event: inventory.snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);});
 const base='/api/v1/owner/cafes/:cafe/inventory';
 router.get(base,async ctx=>{throttle(ctx);sendJson(ctx.res,200,await service.list(ctx.params.cafe,ctx.query,ctx.user));});
 router.get(base+'/movements',async ctx=>{throttle(ctx);sendJson(ctx.res,200,await service.movements(ctx.params.cafe,ctx.query,ctx.user));});
 router.post(base+'/mutations',async ctx=>{throttle(ctx);sendJson(ctx.res,200,await service.mutate(ctx.params.cafe,await readJson(ctx,16384),ctx.user));});
}
