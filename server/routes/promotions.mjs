import {createPromotionService} from '../../shared/business/promotions.mjs';
import {businessSqlError} from '../../shared/business/sql-errors.mjs';
import {transaction} from '../lib/db.mjs';
import {HttpError,readJson,sendJson} from '../lib/http.mjs';
import {newId} from '../lib/auth.mjs';
export function register(router,{db,limit}){
 const fail=(...a)=>{throw new HttpError(...a);},sql={first:(q,...a)=>db.prepare(q).get(...a),all:(q,...a)=>db.prepare(q).all(...a),batch:async entries=>{try{return transaction(db,()=>entries.map(([q,...a])=>db.prepare(q).run(...a)));}catch(e){businessSqlError(e,fail);}}},service=createPromotionService({sql,fail,id:newId});
 const wrap=fn=>async ctx=>{limit('promotions:'+ctx.ip,120,60000);await fn(ctx);};
 const base='/api/v1/owner/cafes/:cafe/promotions';
 router.get('/api/v1/cafes/:cafe/promotions',wrap(async ctx=>sendJson(ctx.res,200,await service.list(ctx.params.cafe,ctx.query,null,true))));
 router.get(base,wrap(async ctx=>sendJson(ctx.res,200,await service.list(ctx.params.cafe,ctx.query,ctx.user))));
 router.get(base+'/:entity',wrap(async ctx=>sendJson(ctx.res,200,{promotion:await service.get(ctx.params.cafe,ctx.params.entity,ctx.user)})));
 router.post(base+'/preview',wrap(async ctx=>sendJson(ctx.res,200,await service.preview(ctx.params.cafe,await readJson(ctx,16384),ctx.user))));
 router.post(base,wrap(async ctx=>sendJson(ctx.res,201,{promotion:await service.save(ctx.params.cafe,await readJson(ctx,16384),ctx.user)})));
 router.patch(base+'/:entity',wrap(async ctx=>sendJson(ctx.res,200,{promotion:await service.save(ctx.params.cafe,await readJson(ctx,16384),ctx.user,ctx.params.entity)})));
 router.delete(base+'/:entity',wrap(async ctx=>sendJson(ctx.res,200,await service.remove(ctx.params.cafe,ctx.params.entity,await readJson(ctx,16384),ctx.user))));
}
