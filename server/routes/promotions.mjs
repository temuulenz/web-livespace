import {createPromotionService} from '../../shared/business/promotions-service.mjs';
import {businessSqlError} from '../../shared/business/sql-errors.mjs';
import {transaction} from '../lib/db.mjs';
import {newId} from '../lib/auth.mjs';
import {HttpError,readJson,sendJson} from '../lib/http.mjs';
export function register(router,{db,limit}) {
 const fail=(...args)=>{throw new HttpError(...args);};
 const sql={first:(q,...a)=>db.prepare(q).get(...a),all:(q,...a)=>db.prepare(q).all(...a),batch:async entries=>{try{return transaction(db,()=>entries.map(([q,...a])=>db.prepare(q).run(...a)));}catch(e){businessSqlError(e,fail);}}};
 const service=createPromotionService({sql,fail,id:newId});
 const wrap=fn=>async ctx=>{limit('promotions:'+ctx.ip,120,60000);await fn(ctx);};
 const base='/api/v1/owner/cafes/:cafe/promotions';
 router.get('/api/v1/cafes/:cafe/promotions',wrap(async ctx=>sendJson(ctx.res,200,await service.publicList(ctx.params.cafe))));
 router.get(base,wrap(async ctx=>sendJson(ctx.res,200,await service.list(ctx.params.cafe,ctx.query,ctx.user))));
 router.post(base,wrap(async ctx=>sendJson(ctx.res,201,await service.create(ctx.params.cafe,await readJson(ctx,16384),ctx.user))));
 router.patch(base+'/:promotion',wrap(async ctx=>sendJson(ctx.res,200,await service.update(ctx.params.cafe,ctx.params.promotion,await readJson(ctx,16384),ctx.user))));
 router.post(base+'/preview',wrap(async ctx=>sendJson(ctx.res,200,await service.preview(ctx.params.cafe,await readJson(ctx,16384),ctx.user))));
}
