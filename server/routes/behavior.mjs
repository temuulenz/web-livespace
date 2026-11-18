import {analyticsSession,analyticsCookie,validateBehavior,authorizeBehaviorTargets} from '../../shared/business/behavior.mjs';
import {validateAnalyticsBatch} from '../../js/services/analytics-schema.js';
import {HttpError,readJson,sendJson} from '../lib/http.mjs';
export function register(router,{db,config,behavior,phase11,limit}){
 const fail=(...a)=>{throw new HttpError(...a);},sql={first:(q,...a)=>db.prepare(q).get(...a),all:(q,...a)=>db.prepare(q).all(...a)};
 router.post('/api/v1/analytics/session',async ctx=>{if(!config.phase11.analyticsEnabled)fail(404,'analytics_disabled','Analytics disabled');limit('analytics-session:'+ctx.ip,20,60000);const s=analyticsSession(ctx.req.headers.cookie);sendJson(ctx.res,200,{ready:true},s.fresh?{'Set-Cookie':analyticsCookie(s.token,config.secureCookies)}:{});});
 router.post('/api/v1/analytics/events',async ctx=>{
  if(!config.phase11.analyticsEnabled)fail(404,'analytics_disabled','Analytics disabled');limit('analytics:'+ctx.ip,config.phase11.analyticsBatches,60000);
  const input=await readJson(ctx,16384),s=analyticsSession(ctx.req.headers.cookie);let batch;try{batch=input?.schemaVersion===2?validateBehavior(input,s.token):validateAnalyticsBatch(input);}catch{fail(422,'invalid_analytics','Invalid analytics batch');}
  if(await phase11.paused(batch.cafeId))fail(503,'analytics_paused','Optional analytics paused');
  await authorizeBehaviorTargets(sql,batch,fail);let result;try{result=behavior.collect(batch);}catch(e){fail(e.message.includes('budget')?429:409,'analytics_rejected','Analytics budget or event conflict');}
  sendJson(ctx.res,202,result,s.fresh?{'Set-Cookie':analyticsCookie(s.token,config.secureCookies)}:{});
 });
}
