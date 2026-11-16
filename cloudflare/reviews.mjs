import {createReviewService} from '../shared/business/reviews.mjs';
import {businessSqlError} from '../shared/business/sql-errors.mjs';
import {first,all,batch,id,fail,session,body,json} from './core.mjs';
const services=new WeakMap();
export async function reviewsRoute(req,env,limit){
 const u=new URL(req.url),m=/^\/api\/v1\/(owner\/)?cafes\/([^/]+)\/(reviews|ratings)(?:\/([^/]+)(?:\/(reply|reports))?)?$/.exec(u.pathname),mine=/^\/api\/v1\/me\/cafes\/([^/]+)\/review$/.exec(u.pathname),moderate=/^\/api\/v1\/admin\/cafes\/([^/]+)\/reviews\/([^/]+)\/moderation$/.exec(u.pathname),queue=['/api/v1/admin/review-reports','/api/v1/admin/reviews/moderation'].includes(u.pathname);
 if(!m&&!mine&&!moderate&&!queue)return null;limit('reviews:'+(req.headers.get('cf-connecting-ip')||'local'),120,60000);
 let reviews=services.get(env.DB);if(!reviews){const sql={first:(q,...a)=>first(env.DB,q,...a),all:(q,...a)=>all(env.DB,q,...a),batch:async entries=>{try{return await batch(env.DB,entries);}catch(e){businessSqlError(e,fail);}}};reviews=createReviewService({sql,fail,id});services.set(env.DB,reviews);}
 const user=await session(env.DB,req),query=Object.fromEntries(u.searchParams),input=()=>body(req,16384);
 if(mine&&req.method==='GET')return json({review:await reviews.mine(decodeURIComponent(mine[1]),user)});
 if(queue&&req.method==='GET')return json(await reviews.queue(query,user,u.pathname.endsWith('review-reports')));
 if(moderate&&req.method==='GET')return json(await reviews.audit(decodeURIComponent(moderate[1]),decodeURIComponent(moderate[2]),query,user));
 if(moderate&&req.method==='POST')return json({review:await reviews.moderate(decodeURIComponent(moderate[1]),decodeURIComponent(moderate[2]),await input(),user)});
 if(m){const [,owner,raw,kind,r,action]=m,cafe=decodeURIComponent(raw),review=r?decodeURIComponent(r):null;
  if(req.method==='GET'&&!review)return json(kind==='ratings'?await reviews.summary(cafe,user,!!owner):await reviews.list(cafe,query,user,!!owner));
  if(kind==='reviews'){
   if(owner&&review&&action==='reply'&&['PUT','DELETE'].includes(req.method))return json({reply:await reviews.reply(cafe,review,await input(),user,req.method==='DELETE')});
   if(!owner&&!review&&req.method==='POST')return json({review:await reviews.create(cafe,await input(),user)},201);
   if(!owner&&review&&!action&&req.method==='PATCH')return json({review:await reviews.edit(cafe,review,await input(),user)});
   if(!owner&&review&&!action&&req.method==='DELETE')return json(await reviews.remove(cafe,review,await input(),user));
   if(!owner&&review&&action==='reports'&&req.method==='POST')return json(await reviews.report(cafe,review,await input(),user),201);
  }
 }
 fail(405,'method_not_allowed','Method not allowed');
}
