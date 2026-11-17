import {resourceSnapshot} from './resources.mjs';
import {createPhase11} from '../shared/business/phase11.mjs';
import {phase11Config} from '../shared/business/phase11-config.mjs';
import {first,all,batch,id,fail,body,json,session} from './core.mjs';
const services=new WeakMap();
export function phase11Service(env){let value=services.get(env.DB);if(value)return value;const sql={first:(q,...a)=>first(env.DB,q,...a),all:(q,...a)=>all(env.DB,q,...a),batch:entries=>batch(env.DB,entries)};value=createPhase11({sql,fail,id,options:phase11Config(env),runtime:()=>({sse:0,browser_websockets:null,sensor_websockets:null,connection_status:'per_gateway_metrics_only',d1:resourceSnapshot()})});services.set(env.DB,value);return value;}
export async function phase11Route(req,env,limit){
 const u=new URL(req.url),path=u.pathname;if(/^\/api\/v1\/(?:owner|admin)\/cafes\/[^/]+\/analytics$/.test(path)&&(u.searchParams.get('granularity')==='hour'||(u.searchParams.get('since')||'').includes('T')))return null;if(!/^\/api\/v1\/(?:me\/(?:notifications|notification-preferences)|admin\/(?:analytics|resources\/monitor|resource-controls|maintenance)|(?:owner|admin)\/cafes\/[^/]+\/(?:analytics|resources|resource-controls))/.test(path))return null;
 limit('phase11:'+(req.headers.get('cf-connecting-ip')||'local'),phase11Config(env).insightRequests,60000);
 const service=phase11Service(env),user=await session(env.DB,req),result=await service.route({path,method:req.method,query:Object.fromEntries(u.searchParams),user,read:()=>body(req,16384),flush:async cafe=>{if(env.ANALYTICS&&env.LS_ANALYTICS_ENABLED==='1')await env.ANALYTICS.get(env.ANALYTICS.idFromName('analytics:'+cafe)).flush();}});
 if(!result)return null;return result.headers?new Response(result.body,{headers:{'Cache-Control':'no-store',...result.headers}}):json(result.body);
}
