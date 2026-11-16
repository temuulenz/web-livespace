import {createReviewService} from '../../shared/business/reviews.mjs';
import {transaction} from '../lib/db.mjs';
import {HttpError,readJson,sendJson} from '../lib/http.mjs';
import {newId} from '../lib/auth.mjs';
import {businessSqlError} from '../../shared/business/sql-errors.mjs';
export function register(router,{db,limit}){
 const fail=(...a)=>{throw new HttpError(...a);},sql={first:(q,...a)=>db.prepare(q).get(...a),all:(q,...a)=>db.prepare(q).all(...a),batch:async entries=>{try{return transaction(db,()=>entries.map(([q,...a])=>db.prepare(q).run(...a)));}catch(e){businessSqlError(e,fail);}}},reviews=createReviewService({sql,fail,id:newId});
 const wrap=fn=>async ctx=>{limit('reviews:'+ctx.ip,120,60000);await fn(ctx);};
 const read=ctx=>readJson(ctx,16384);
 for(const owner of [false,true]){
  const base='/api/v1/'+(owner?'owner/':'')+'cafes/:cafe';
  router.get(base+'/reviews',wrap(async ctx=>sendJson(ctx.res,200,await reviews.list(ctx.params.cafe,ctx.query,ctx.user,owner))));
  router.get(base+'/ratings',wrap(async ctx=>sendJson(ctx.res,200,await reviews.summary(ctx.params.cafe,ctx.user,owner))));
 }
 const base='/api/v1/cafes/:cafe/reviews';
 router.get('/api/v1/me/cafes/:cafe/review',wrap(async ctx=>sendJson(ctx.res,200,{review:await reviews.mine(ctx.params.cafe,ctx.user)})));
 router.post(base,wrap(async ctx=>sendJson(ctx.res,201,{review:await reviews.create(ctx.params.cafe,await read(ctx),ctx.user)})));
 router.patch(base+'/:review',wrap(async ctx=>sendJson(ctx.res,200,{review:await reviews.edit(ctx.params.cafe,ctx.params.review,await read(ctx),ctx.user)})));
 router.delete(base+'/:review',wrap(async ctx=>sendJson(ctx.res,200,await reviews.remove(ctx.params.cafe,ctx.params.review,await read(ctx),ctx.user))));
 router.post(base+'/:review/reports',wrap(async ctx=>sendJson(ctx.res,201,await reviews.report(ctx.params.cafe,ctx.params.review,await read(ctx),ctx.user))));
 for(const method of ['put','delete'])router[method]('/api/v1/owner/cafes/:cafe/reviews/:review/reply',wrap(async ctx=>sendJson(ctx.res,200,{reply:await reviews.reply(ctx.params.cafe,ctx.params.review,await read(ctx),ctx.user,method==='delete')})));
 for(const reports of [false,true])router.get('/api/v1/admin/'+(reports?'review-reports':'reviews/moderation'),wrap(async ctx=>sendJson(ctx.res,200,await reviews.queue(ctx.query,ctx.user,reports))));
 router.get('/api/v1/admin/cafes/:cafe/reviews/:review/moderation',wrap(async ctx=>sendJson(ctx.res,200,await reviews.audit(ctx.params.cafe,ctx.params.review,ctx.query,ctx.user))));
 router.post('/api/v1/admin/cafes/:cafe/reviews/:review/moderation',wrap(async ctx=>sendJson(ctx.res,200,{review:await reviews.moderate(ctx.params.cafe,ctx.params.review,await read(ctx),ctx.user)})));
}
