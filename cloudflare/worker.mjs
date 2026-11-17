import {operationalLog,requestId,routeGroup,readiness} from '../shared/operations.mjs';
import {phase11Route,phase11Service} from './phase11.mjs';
import {runtimeMetrics,requestCafe,protectRequest} from '../shared/business/resources.mjs';
import {analyticsSession,analyticsCookie,validateBehavior} from '../shared/business/behavior.mjs';
import {phase11Config} from '../shared/business/phase11-config.mjs';
import {promotionsRoute} from './promotions.mjs';
import {reviewsRoute} from './reviews.mjs';
import {inventoryRoute} from './inventory.mjs';
import { menuRoute } from './menu.mjs';
import { resourceSnapshot } from './resources.mjs';
import { validateAnalyticsBatch } from '../js/services/analytics-schema.js';
import { readAnalytics } from './analytics.mjs';
export { AnalyticsAggregator } from './analytics.mjs';
import { notifyCafe } from './browser-rooms.mjs';
export { BrowserRoom } from './browser-rooms.mjs';
import { PublicProfileCache } from './public-cache.mjs';
import { createUserAccess, SUPER_ADMIN_SELECT } from '../server/services/user-access.mjs';
import { createCafeOwnership } from '../server/services/cafe-ownership.mjs';
import { DurableObject } from 'cloudflare:workers';
import { ingest } from './ingest.mjs';
import { partner } from './partner.mjs';
import { sanitizeLayout, ruleBasedProvider } from '../server/services/visualization.mjs';
import { all, first, run, batch, json, error, fail, body, credentials, hashPassword, verifyPassword, publicUser, guard, session, isQuotaError, startSession, now, id, token, sha, parse, deviceAuth } from './core.mjs';
import { cafeView as rawCafeView, liveUpdate, ownerView as rawOwnerView, deviceView as rawDeviceView } from './views.mjs';
import { createSensorHistory } from './history.mjs';
import { SENSOR_ID } from '../server/lib/telemetry-schema.mjs';
import { parseHours, SETUP_STATUSES, projectToMap } from '../js/live/levels.js';
export { SensorGateway } from './sensors.mjs';

// Isolate-local limiter supplements Cloudflare's platform protections. It is not
// an account-wide admission limit; production rollout must account for this.
const buckets=new Map();
function limit(key,max,ms) {const t=Date.now();if(buckets.size>10000)for(const [k,b]of buckets)if(b.until<t)buckets.delete(k);let b=buckets.get(key);if(!b || b.until<t){b={count:0,until:t+ms};buckets.set(key,b);}if(++b.count>max)fail(429,'rate_limited','Too many requests');}
const routeId=(p,re)=>re.exec(p)?.slice(1).map(x=>x===undefined?undefined:decodeURIComponent(x));
async function createUser(db,input,role='user',auth) {
 const x=credentials(input);if(await first(db,'SELECT id FROM users WHERE email=?',x.email))fail(409,'email_taken','Email already registered');
 const u={id:id('usr'),email:x.email,name:x.name,role};
 await run(db,'INSERT INTO users(id,email,password_hash,name,role,created_at) VALUES(?,?,?,?,?,?)',u.id,u.email,await auth.passwordHash(x.password),u.name,u.role,now());return u;
}
async function handle(req,env,historyCache=new Map(),profiles,ctx) {
 const u=new URL(req.url),p=u.pathname,m=req.method,db=env.DB,query=Object.fromEntries(u.searchParams);
 const expectedIntervalSec=Number(env.LS_SENSOR_EXPECTED_INTERVAL_SEC || 15),staleAfterSec=Number(env.LS_SENSOR_STALE_AFTER_SEC || 30);
 const cafeView=(db,row)=>rawCafeView(db,row,staleAfterSec),ownerView=(db,row)=>rawOwnerView(db,row,staleAfterSec),deviceView=(db,d)=>rawDeviceView(db,d,staleAfterSec);
 if(p.startsWith('/ws/browser/')) {
  if(env.LS_BROWSER_REALTIME_ENABLED!=='1'||!env.BROWSER_ROOMS)fail(404,'not_found','Browser realtime disabled');
  if(u.protocol!=='https:'&&!['127.0.0.1','localhost','[::1]'].includes(u.hostname))fail(426,'secure_transport_required','Use WSS');
  if(!/^\/ws\/browser\/[^/]+$/.test(p))fail(404,'not_found','Room not found');
  const cafe=decodeURIComponent(p.split('/').at(-1));if(!/^[A-Za-z0-9_.:-]{1,80}$/.test(cafe))fail(400,'bad_subscription','Invalid cafe');
  limit('browser-upgrade:'+(req.headers.get('cf-connecting-ip')||'local'),1000,60000);
  return env.BROWSER_ROOMS.get(env.BROWSER_ROOMS.idFromName('cafe:'+cafe)).fetch(req);
 }
 if(p==='/ws/sensors') {
  if(u.protocol!=='https:' && !['127.0.0.1','localhost','[::1]'].includes(u.hostname))fail(426,'secure_transport_required','Use WSS');
  if(u.search)fail(403,'query_not_allowed','Use the Authorization header');
  limit(`upgrade:${req.headers.get('cf-connecting-ip') || 'local'}`,60,60000);
  const d=await deviceAuth(db,req.headers.get('authorization'));
  return env.SENSORS.get(env.SENSORS.idFromName('device:'+d.id)).fetch(req);
 }
 if(!p.startsWith('/api/'))return env.ASSETS.fetch(req);
 if(m!=='GET' && m!=='HEAD') {
  const origin=req.headers.get('origin');if(origin && origin!==u.origin)fail(403,'bad_origin','Cross-origin request rejected');
 }
 if(/^\/api\/v1\/(?:cafes|owner|analytics|me\/notifications|me\/notification-preferences)(?:\/|$)/.test(p)){const identity=await session(db,req);protectRequest(p,identity,req.headers.get('cf-connecting-ip')||'local',limit,phase11Config(env));}
 const phase11Response=await phase11Route(req,env,limit);if(phase11Response)return phase11Response;
 const promotionResponse=await promotionsRoute(req,env,limit);if(promotionResponse)return promotionResponse;
 const reviewResponse=await reviewsRoute(req,env,limit);if(reviewResponse)return reviewResponse;
 const inventoryResponse=await inventoryRoute(req,env,limit);if(inventoryResponse)return inventoryResponse;
 const menuResponse=await menuRoute(req,env,limit);if(menuResponse)return menuResponse;
 if(p==='/api/v1/analytics/session' && m==='POST') {
  if(env.LS_ANALYTICS_ENABLED!=='1')fail(404,'analytics_disabled','Analytics disabled');limit('analytics-session:'+(req.headers.get('cf-connecting-ip')||'local'),20,60000);
  const s=analyticsSession(req.headers.get('cookie')||'');return json({ready:true},200,s.fresh?{'Set-Cookie':analyticsCookie(s.token,u.protocol==='https:')}:{});
 }
 if(p==='/api/v1/analytics/events' && m==='POST') {
  if(env.LS_ANALYTICS_ENABLED!=='1'||!env.ANALYTICS)fail(404,'not_found','Analytics collection disabled');
  limit('analytics:'+(req.headers.get('cf-connecting-ip')||'local'),phase11Config(env).analyticsBatches,60000);
  const input=await body(req,16384),s=analyticsSession(req.headers.get('cookie')||'');let valid;try{valid=input?.schemaVersion===2?validateBehavior(input,s.token):validateAnalyticsBatch(input);}catch{fail(422,'invalid_analytics','Invalid analytics batch');}
  const cafe=await first(db,"SELECT id FROM cafes WHERE id=? AND status='active'",valid.cafeId);if(!cafe)fail(404,'not_found','Cafe not found');
  if(await phase11Service(env).paused(valid.cafeId))fail(503,'analytics_paused','Optional analytics paused');
  const value=await env.ANALYTICS.get(env.ANALYTICS.idFromName('analytics:'+valid.cafeId)).collect(input,s.token);
  return json(value,202,s.fresh?{'Set-Cookie':analyticsCookie(s.token,u.protocol==='https:')}:{});
 }
 if(p==='/api/v1/ingest/measurements' && m==='POST')return ingest(req,db,limit,env,ctx);
 if(p==='/api/v1/health') {
  try {await first(db,'SELECT id FROM devices LIMIT 1');await first(db,'SELECT message_id FROM sensor_receipts LIMIT 1');await first(db,'SELECT photo_id FROM photo_bytes LIMIT 1');return json({ok:true,api:'1',time:now(),deployment:'cloudflare',database:'d1',sensorGateway:!!env.SENSORS,transport:'polling',schema:5});}
  catch(e){if(isQuotaError(e))throw e;return json({ok:false,api:'1',deployment:'cloudflare',database:'unavailable_or_unmigrated'},503);}
 }
 if(p==='/api/v1/config')return json({poll_interval_sec:Number(env.LS_POLL_INTERVAL_SEC || 10),stale_after_sec:900,sensor_stale_after_sec:staleAfterSec,sensor_expected_interval_sec:expectedIntervalSec,stream_enabled:false,browser_realtime:env.LS_BROWSER_REALTIME_ENABLED==='1'&&!!env.BROWSER_ROOMS});
 if(p==='/api/v1/stream')return json({error:{code:'polling_required',message:'Use /api/v1/live polling'}},503,{'Retry-After':'60'});
 if((p==='/api/v1/cafes' || p==='/api/v1/live') && m==='GET') {
  const rows=await all(db,"SELECT * FROM cafes WHERE status='active' ORDER BY sort_order,created_at");const cafes=await Promise.all(rows.map(r=>cafeView(db,r)));
  return json(p.endsWith('/live')?{updates:cafes.filter(c=>c.live.mode!=='demo').map(liveUpdate),server_time:now()}:{cafes,server_time:now()});
 }
 const profile=routeId(p,/^\/api\/v1\/cafes\/([^/]+)\/profile$/);
 if(profile && m==='GET') {
  const value=await profiles.get(profile[0],()=>first(db,"SELECT id,name,category,district,address,hours,description FROM cafes WHERE id=? AND status='active'",profile[0]));
  if(!value)fail(404,'not_found','Cafe not found');return json({profile:value});
 }
 let a=routeId(p,/^\/api\/v1\/cafes\/([^/]+)$/);
 if(a && m==='GET'){const row=await first(db,"SELECT * FROM cafes WHERE id=? AND status='active'",a[0]);if(!row)fail(404,'not_found','Cafe not found');return json({cafe:await cafeView(db,row)});}
 const user=await session(db,req);
 if(p==='/api/v1/admin/resources' && m==='GET') {
  guard(user,'admin');if(!user.is_super_admin)fail(403,'super_admin_required','Super Admin required');
  const stats={resources:resourceSnapshot(),cache:profiles?.metrics,features:{r2:env.LS_R2_MEDIA_ENABLED==='1',kv:env.LS_KV_PUBLIC_ENABLED==='1',analytics:env.LS_ANALYTICS_ENABLED==='1',browserRealtime:env.LS_BROWSER_REALTIME_ENABLED==='1'}};
  if(query.cafe_id&&/^[A-Za-z0-9_.:-]{1,80}$/.test(query.cafe_id)){stats.room=await env.BROWSER_ROOMS.get(env.BROWSER_ROOMS.idFromName('cafe:'+query.cafe_id)).stats();if(env.ANALYTICS)stats.analytics=await env.ANALYTICS.get(env.ANALYTICS.idFromName('analytics:'+query.cafe_id)).stats();}
  if(query.device_id&&/^[A-Za-z0-9_.:-]{1,80}$/.test(query.device_id))stats.sensor=await env.SENSORS.get(env.SENSORS.idFromName('device:'+query.device_id)).stats();
  return json(stats);
 }
 const flush=routeId(p,/^\/api\/v1\/admin\/resources\/analytics-flush\/([^/]+)$/);
 if(flush&&m==='POST'){guard(user,'admin');if(!user.is_super_admin)fail(403,'super_admin_required','Super Admin required');if(env.LS_ANALYTICS_ENABLED!=='1')fail(503,'analytics_disabled','Analytics disabled');return json(await env.ANALYTICS.get(env.ANALYTICS.idFromName('analytics:'+flush[0])).flush());}
 const analyticsRead=routeId(p,/^\/api\/v1\/(owner|admin)\/cafes\/([^/]+)\/analytics$/);
 if(analyticsRead && m==='GET') {guard(user,...(analyticsRead[0]==='admin'?['admin']:['owner','admin']));const row=await first(db,'SELECT owner_id FROM cafes WHERE id=?',analyticsRead[1]);if(!row||(user.role!=='admin'&&row.owner_id!==user.id))fail(404,'not_found','Cafe not found');return json(await readAnalytics(db,analyticsRead[1],query));}
 const auth=env.SENSORS.get(env.SENSORS.idFromName('auth'));
 const registerUser=(db,input,role='user')=>createUser(db,input,role,auth);
 const userAccess=createUserAccess({sql:{first:(query,...args)=>first(db,query,...args),all:(query,...args)=>all(db,query,...args),batch:entries=>batch(db,entries)},hashPassword:password=>auth.passwordHash(password),verifyPassword:(password,hash)=>auth.passwordVerify(password,hash),fail,id});
 const cafeOwnership=createCafeOwnership({sql:{first:(query,...args)=>first(db,query,...args),batch:entries=>batch(db,entries)},fail,id});
 if(p==='/api/v1/auth/reauthenticate' && m==='POST'){limit(`reauth:${user?.id}:${req.headers.get('cf-connecting-ip')}`,10,900000);return json(await userAccess.reauthenticate(user,(await body(req)).password));}
 if(p==='/api/v1/admin/users' || /^\/api\/v1\/admin\/users\/[^/]+(?:\/password)?$/.test(p) || p==='/api/v1/admin/audit') {
  guard(user,'admin');limit(`user-management:${user.id}`,30,60000);
  if(p==='/api/v1/admin/users' && m==='GET')return json({users:await userAccess.list(user,query.role)});
  if(p==='/api/v1/admin/users' && m==='POST')return json({user:await userAccess.create(user,await body(req))},201);
  const target=routeId(p,/^\/api\/v1\/admin\/users\/([^/]+)(\/password)?$/);
  if(target && !target[1] && m==='PATCH')return json({user:await userAccess.update(user,target[0],await body(req))});
  if(target?.[1] && m==='POST')return json({user:await userAccess.resetPassword(user,target[0],await body(req))});
  if(p==='/api/v1/admin/audit' && m==='GET')return json({events:await userAccess.audit(user)});
  fail(405,'method_not_allowed','Method not allowed');
 }

 const partnerResponse=await partner(req,db,user,registerUser,limit,env);if(partnerResponse)return partnerResponse;
 if(p==='/api/v1/auth/register' && m==='POST') {limit(`register:${req.headers.get('cf-connecting-ip')}`,10,3600000);const user=await registerUser(db,await body(req));return json({user:publicUser(user)},201,{'Set-Cookie':await startSession(db,user.id,req)});}
 if(p==='/api/v1/auth/login' && m==='POST') {
  limit(`login:${req.headers.get('cf-connecting-ip')}`,20,900000);const x=await body(req);const found=typeof x.email==='string'?await first(db,`SELECT u.*, ${SUPER_ADMIN_SELECT} FROM users u WHERE email=?`,x.email.trim().toLowerCase()):null;
  if(!found || found.disabled_at || typeof x.password!=='string' || x.password.length>200 || !await auth.passwordVerify(x.password,found.password_hash))fail(401,'invalid_credentials','Invalid email or password');
  return json({user:publicUser(found)},200,{'Set-Cookie':await startSession(db,found.id,req,found.auth_version)});
 }
 if(p==='/api/v1/auth/me'){guard(user);return json({user:publicUser(user)});}
 if(p==='/api/v1/auth/logout' && m==='POST'){const t=/(?:^|;\s*)ls_session=([^;]+)/.exec(req.headers.get('cookie') || '')?.[1];if(t)await run(db,'DELETE FROM sessions WHERE token_hash=?',sha(t));return json({ok:true},200,{'Set-Cookie':`ls_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${u.protocol==='https:'?'; Secure':''}`});}
 if(p.startsWith('/api/v1/me/favorites')) {
  guard(user);a=routeId(p,/^\/api\/v1\/me\/favorites\/([^/]+)$/);
  if(a && m==='PUT'){if(!await first(db,"SELECT id FROM cafes WHERE id=? AND status='active'",a[0]))fail(404,'not_found','Cafe not found');await run(db,'INSERT OR IGNORE INTO favorites(user_id,cafe_id,created_at) VALUES(?,?,?)',user.id,a[0],now());}
  else if(a && m==='DELETE')await run(db,'DELETE FROM favorites WHERE user_id=? AND cafe_id=?',user.id,a[0]);
  else if(p.endsWith('/merge') && m==='POST'){const x=await body(req);if(Array.isArray(x.cafe_ids))for(const c of x.cafe_ids.slice(0,100))if(typeof c==='string')await run(db,"INSERT OR IGNORE INTO favorites(user_id,cafe_id,created_at) SELECT ?,id,? FROM cafes WHERE id=? AND status='active'",user.id,now(),c);}
  else if(m!=='GET' || a)fail(405,'method_not_allowed','Method not allowed');
  return json({favorites:(await all(db,'SELECT cafe_id FROM favorites WHERE user_id=? ORDER BY created_at',user.id)).map(x=>x.cafe_id)});
 }
 a=routeId(p,/^\/api\/v1\/(?:(owner|admin)\/)?cafes\/([^/]+)\/sensor-history$/);
 if(a && m==='GET') {
  const [scope,cafeId]=a;const row=await first(db,'SELECT * FROM cafes WHERE id=?',cafeId);
  if(scope==='admin')guard(user,'admin');else if(scope==='owner'){guard(user,'owner','admin');if(row && row.owner_id!==user.id && user.role!=='admin')fail(404,'not_found','Cafe not found');}
  else {limit(`history:${req.headers.get('cf-connecting-ip')}`,120,60000);if(row?.status!=='active' || row.data_mode!=='live')fail(404,'not_found','Cafe not found');}
  if(!row)fail(404,'not_found','Cafe not found');
  // Authorization above is deliberately outside result caching, including hits.
  const key=JSON.stringify([cafeId,!!scope,Object.entries(query).sort()]);
  let cached=historyCache.get(key);
  if(!cached || cached.until<=Date.now()) {
   if(historyCache.size>=128)historyCache.delete(historyCache.keys().next().value);
   const promise=createSensorHistory(db,{sensorExpectedIntervalSec:expectedIntervalSec,sensorStaleAfterSec:staleAfterSec}).read(cafeId,query,{privateView:!!scope});
   cached={until:Date.now()+600000,promise};historyCache.set(key,cached);
   promise.catch(()=>{if(historyCache.get(key)===cached)historyCache.delete(key);});
  }
  return json(await cached.promise);
 }
 if(p==='/api/v1/owner/cafes' && m==='GET'){guard(user,'owner','admin');const rows=await all(db,'SELECT * FROM cafes WHERE owner_id=? ORDER BY created_at',user.id);return json({cafes:await Promise.all(rows.map(r=>ownerView(db,r)))});}
 a=routeId(p,/^\/api\/v1\/owner\/cafes\/([^/]+)$/);
 if(a && m==='PATCH') {
  guard(user,'owner','admin');const row=await first(db,'SELECT * FROM cafes WHERE id=? AND owner_id=?',a[0],user.id);if(!row)fail(404,'not_found','Cafe not found');
  const x=await body(req),next={};for(const [k,max]of [['hours',20],['phone',30],['contact_name',80],['description',1000]])if(x[k]!=null){if(typeof x[k]!=='string' || x[k].length>max)fail(422,'validation_failed','Invalid '+k);next[k]=x[k].trim();}
  if(next.hours && !parseHours(next.hours))fail(422,'validation_failed','Invalid hours');await update(db,'cafes',row.id,{...next,updated_at:now()});return json({cafe:await ownerView(db,await first(db,'SELECT * FROM cafes WHERE id=?',row.id))});
 }
 if(p.startsWith('/api/v1/admin/')) {
  guard(user,'admin');
  if(p==='/api/v1/admin/overview' && m==='GET') {
   const count=async(sql,...args)=>(await first(db,sql,...args)).n;
   const devices=await all(db,'SELECT * FROM devices WHERE revoked_at IS NULL');const views=await Promise.all(devices.map(d=>deviceView(db,d)));
   return json({cafes:await count('SELECT COUNT(*) n FROM cafes'),active:await count("SELECT COUNT(*) n FROM cafes WHERE status='active'"),pending_applications:await count("SELECT COUNT(*) n FROM applications a JOIN cafes c ON c.id=a.cafe_id WHERE c.status NOT IN ('active','rejected')"),owners:await count("SELECT COUNT(*) n FROM users WHERE role='owner'"),devices:devices.length,devices_online:views.filter(d=>d.online).length,measurements_24h:await count('SELECT COUNT(*) n FROM measurements WHERE received_at>?',new Date(Date.now()-86400000).toISOString()),stream_clients:0,config:{poll_interval_sec:10,stale_after_sec:900,device_offline_sec:600,visualization_provider:'manual'}});
  }
  if(p==='/api/v1/admin/applications' && m==='GET')return json({applications:(await all(db,`SELECT a.id,a.cafe_id,a.created_at,a.form,a.owner_id IS NOT NULL has_owner,c.status,c.name,u.email owner_email,(SELECT COUNT(*) FROM application_photos p WHERE p.application_id=a.id) photo_count FROM applications a JOIN cafes c ON c.id=a.cafe_id LEFT JOIN users u ON u.id=a.owner_id ORDER BY a.created_at DESC`)).map(r=>({...r,has_owner:!!r.has_owner,form:parse(r.form,{})}))});
  if(p==='/api/v1/admin/cafes' && m==='GET')return json({cafes:await all(db,`SELECT c.*,u.email owner_email,(SELECT COUNT(*) FROM devices d WHERE d.cafe_id=c.id AND d.revoked_at IS NULL) device_count,(SELECT MAX(ts) FROM measurements m WHERE m.cafe_id=c.id) last_measurement_at,(SELECT id FROM applications a WHERE a.cafe_id=c.id LIMIT 1) application_id,json_extract(c.visualization,'$.status') visualization_status FROM cafes c LEFT JOIN users u ON u.id=c.owner_id ORDER BY sort_order,created_at`)});
  a=routeId(p,/^\/api\/v1\/admin\/cafes\/([^/]+)(?:\/(status|visualization|owner))?$/);
  if(a) {
   const row=await first(db,'SELECT * FROM cafes WHERE id=?',a[0]);if(!row)fail(404,'not_found','Cafe not found');
   if(a[1]==='owner' && m==='PUT'){limit(`cafe-owner:${user.id}:${req.headers.get('cf-connecting-ip')}`,30,60000);return json(await cafeOwnership.setOwner(user,row.id,await body(req)));}
   if(m==='GET' && !a[1])return json({cafe:{...await ownerView(db,row),owner:row.owner_id?publicUser(await first(db,'SELECT * FROM users WHERE id=?',row.owner_id)):null,public:row.status==='active'?await cafeView(db,row):null}});
   if(m==='PATCH' && !a[1]){const x=cleanCafe(await body(req));if((x.lat!=null || x.lng!=null) && x.map_x===undefined && x.map_y===undefined){const position=projectToMap(x.lat??row.lat,x.lng??row.lng);x.map_x=position.x;x.map_y=position.y;}await update(db,'cafes',row.id,{...x,updated_at:now()});return json({ok:true});}
   if(a[1]==='visualization' && m==='PUT'){const x=await body(req);if(!['not_started','in_progress','ready'].includes(x.status))fail(400,'bad_request','Invalid visualization status');const current=parse(row.visualization,{});const layout=x.layout?sanitizeLayout(x.layout):current.layout || null;if(x.status==='ready' && !layout)fail(400,'bad_request','Ready visualization needs layout');const visualization={...current,status:x.status,layout,notes:typeof x.notes==='string'?x.notes.slice(0,2000):current.notes || '',generator:'manual',updated_at:now()};await update(db,'cafes',row.id,{visualization:JSON.stringify(visualization),updated_at:now()});return json({visualization});}
   if(a[1]==='status' && m==='POST'){const x=await body(req);if(!SETUP_STATUSES.includes(x.status))fail(400,'bad_request','Invalid status');if(x.status==='active' && row.data_mode==='live' && row.map_x==null)fail(422,'missing_location','Map location required');await batch(db,[['UPDATE cafes SET status=?,updated_at=? WHERE id=?',x.status,now(),row.id],['INSERT INTO status_history(cafe_id,from_status,to_status,note,actor_id,at) VALUES(?,?,?,?,?,?)',row.id,row.status,x.status,String(x.note || '').slice(0,500),user.id,now()]]);return json({ok:true,status:x.status});}
  }
  const suggest=routeId(p,/^\/api\/v1\/admin\/cafes\/([^/]+)\/visualization\/suggest$/);
  if(suggest && m==='POST'){const cafe=await first(db,'SELECT * FROM cafes WHERE id=?',suggest[0]);if(!cafe)fail(404,'not_found','Cafe not found');const app=await first(db,'SELECT form FROM applications WHERE cafe_id=? LIMIT 1',cafe.id);return json({suggestion:await ruleBasedProvider.suggest({cafe,form:parse(app?.form,{})})});}
  if(p==='/api/v1/admin/devices' && m==='GET'){const rows=await all(db,`SELECT d.*,c.name cafe_name FROM devices d LEFT JOIN cafes c ON c.id=d.cafe_id ${query.cafe_id?'WHERE d.cafe_id=?':''} ORDER BY d.created_at DESC`,...(query.cafe_id?[query.cafe_id]:[]));return json({devices:await Promise.all(rows.map(d=>deviceView(db,d)))});}
  if(p==='/api/v1/admin/devices' && m==='POST') {
   const x=await body(req);if(typeof x.cafe_id!=='string' || !await first(db,'SELECT id FROM cafes WHERE id=?',x.cafe_id))fail(422,'validation_failed','Existing cafe_id required');
   const deviceId=x.id || id('dev');if(typeof deviceId!=='string' || !SENSOR_ID.test(deviceId) || !['sensor','camera','gateway','simulator'].includes(x.kind || 'sensor') || (x.is_test!=null && typeof x.is_test!=='boolean'))fail(422,'validation_failed','Invalid device');
   if(await first(db,'SELECT id FROM devices WHERE id=?',deviceId))fail(409,'device_exists','Device ID already registered');
   if(x.label!=null && (typeof x.label!=='string' || x.label.length>100))fail(422,'validation_failed','Invalid label');
   const t=token('lsd_');await run(db,'INSERT INTO devices(id,cafe_id,label,kind,is_test,token_hash,created_at) VALUES(?,?,?,?,?,?,?)',deviceId,x.cafe_id,x.label || '',x.kind || 'sensor',x.is_test || x.kind==='simulator'?1:0,sha(t),now());return json({device:await deviceView(db,await first(db,'SELECT * FROM devices WHERE id=?',deviceId)),token:t},201);
  }
  a=routeId(p,/^\/api\/v1\/admin\/devices\/([^/]+)(?:\/(token))?$/);
  if(a) {
   const d=await first(db,'SELECT * FROM devices WHERE id=?',a[0]);if(!d)fail(404,'not_found','Device not found');
   if(a[1]==='token' && m==='POST'){if(d.revoked_at)fail(409,'device_revoked','Device revoked');const t=token('lsd_');await update(db,'devices',d.id,{token_hash:sha(t),connection_status:'offline'});return json({token:t});}
   if(m==='DELETE'){await update(db,'devices',d.id,{revoked_at:now(),connection_status:'offline'});return json({ok:true});}
   if(m==='PATCH') {
    const x=await body(req),next={};if(x.cafe_id!==undefined){if(typeof x.cafe_id!=='string' || !await first(db,'SELECT id FROM cafes WHERE id=?',x.cafe_id))fail(422,'validation_failed','Invalid cafe');next.cafe_id=x.cafe_id;}
    if(x.kind!==undefined){if(!['sensor','camera','gateway','simulator'].includes(x.kind))fail(422,'validation_failed','Invalid kind');next.kind=x.kind;}
    for(const k of ['enabled','is_test'])if(x[k]!==undefined){if(typeof x[k]!=='boolean')fail(422,'validation_failed','Boolean required');next[k]=Number(x[k]);}
    if((next.kind || d.kind)==='simulator')next.is_test=1;
    if(x.label!==undefined){if(typeof x.label!=='string' || x.label.length>100)fail(422,'validation_failed','Invalid label');next.label=x.label;}
    await update(db,'devices',d.id,{...next,connection_status:'offline'});return json({device:await deviceView(db,await first(db,'SELECT * FROM devices WHERE id=?',d.id))});
   }
  }

  if(p==='/api/v1/admin/measurements' && m==='GET'){let where=[],args=[];for(const k of ['cafe_id','device_id'])if(query[k]){where.push(`${k}=?`);args.push(query[k]);}if(query.since){where.push('ts>=?');args.push(query.since);}if(query.before){where.push('id<?');args.push(Number(query.before));}const n=Math.min(500,Math.max(1,Number(query.limit)||100));return json({measurements:(await all(db,`SELECT * FROM measurements ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY id DESC LIMIT ?`,...args,n)).map(r=>({...r,is_test:!!r.is_test,raw:parse(r.raw)}))});}
 }
 fail(404,'not_found','Endpoint not available');
}
async function update(db,table,key,x) {const keys=Object.keys(x);if(keys.length)await run(db,`UPDATE ${table} SET ${keys.map(k=>`${k}=?`).join(',')} WHERE id=?`,...Object.values(x),key);}
function cleanCafe(x) {
 const out={};const text={name:80,category:40,district:40,address:200,hours:20,phone:30,contact_name:80,email:200,description:1000};
 for(const [k,max]of Object.entries(text))if(k in x){if(typeof x[k]!=='string' || x[k].length>max || (k==='hours' && !parseHours(x[k])))fail(422,'validation_failed','Invalid '+k);out[k]=x[k].trim();}
 for(const [k,min,max,int]of [['lat',-90,90],['lng',-180,180],['map_x',0,1000],['map_y',0,680],['total_seats',1,2000,true],['sort_order',0,100000,true]])if(k in x){if(x[k]!==null && (!Number.isFinite(x[k]) || x[k]<min || x[k]>max || (int&&!Number.isInteger(x[k]))))fail(422,'validation_failed','Invalid '+k);out[k]=x[k];}
 if('data_mode'in x){if(!['demo','live'].includes(x.data_mode))fail(422,'validation_failed','Invalid data mode');out.data_mode=x.data_mode;}
 if('tags'in x){if(!Array.isArray(x.tags)||!x.tags.every(t=>typeof t==='string'&&t.length<=30))fail(422,'validation_failed','Invalid tags');out.tags=JSON.stringify(x.tags.slice(0,10));}
 if('demo'in x){if(x.demo!==null && (typeof x.demo!=='object'||Array.isArray(x.demo)))fail(422,'validation_failed','Invalid demo');out.demo=x.demo===null?null:JSON.stringify(x.demo);}
 return out;
}
// Application API work (including bounded image JSON processing) runs in a
// SQLite-backed DO with the platform's DO CPU budget, rather than the 10 ms
// Free HTTP Worker budget. D1 remains the application database.
export class AppBackend extends DurableObject {
 // This existing singleton DO owns disposable public live state and shared history
 // results. D1 remains the durable source and only credential store. No private
 // response or authorization decision enters the public cache.
 constructor(ctx,env) { super(ctx,env);this.ctx=ctx;this.env=env;this.cache=new Map();this.historyCache=new Map();this.pending=new Map();this.quotaUntil=0;this.generation=0;this.profiles=new PublicProfileCache({kv:env.PUBLIC_CACHE,storage:ctx.storage,enabled:env.LS_KV_PUBLIC_ENABLED==='1'}); }
 async fetch(req) {
  const start=performance.now(),path=new URL(req.url).pathname,correlation=requestId();
  let response;try{response=await this.fetchInternal(req);}catch(e){response=error(e);}
  const elapsed=performance.now()-start;runtimeMetrics.record(requestCafe(path),response.status,elapsed);
  if(this.env.LS_REQUEST_LOGS==='1'||response.status>=500)operationalLog('http_request',{request_id:correlation,route:routeGroup(path),status:response.status,duration_ms:elapsed,runtime:'cloudflare'});
  const result=new Response(response.body,response);result.headers.set('X-Request-ID',correlation);return result;
 }
 async alarm(){let delay=900000;try{const result=await phase11Service(this.env).maintenance();if(result?.more_tenants)delay=1000;else if(result?.next_due)delay=Math.max(1000,Math.min(900000,Date.parse(result.next_due)-Date.now()));runtimeMetrics.job();}catch{runtimeMetrics.job(true);operationalLog('background_failure',{runtime:'cloudflare',job:'maintenance'});}finally{await this.ctx.storage.setAlarm(Date.now()+delay);}}
 async fetchInternal(req) {
  if(new URL(req.url).pathname==='/api/v1/ready'&&req.method==='GET'){
   limit('readiness:'+(req.headers.get('cf-connecting-ip')||'local'),30,60000);
   let validConfig=true;try{phase11Config(this.env);}catch{validConfig=false;}
   const readyBindings=validConfig&&!!(this.env.DB&&this.env.SENSORS&&this.env.BACKEND)&&(! (this.env.LS_ANALYTICS_ENABLED==='1')||!!this.env.ANALYTICS)&&(!(this.env.LS_BROWSER_REALTIME_ENABLED==='1')||!!this.env.BROWSER_ROOMS)&&(!(this.env.LS_R2_MEDIA_ENABLED==='1')||!!this.env.MEDIA)&&(!(this.env.LS_KV_PUBLIC_ENABLED==='1')||!!this.env.PUBLIC_CACHE);
   const value=await readiness({first:(q,...a)=>first(this.env.DB,q,...a)},readyBindings);return json(value,value.ready?200:503);
  }
  if(!this.phase11Scheduled){const options=phase11Config(this.env);await batch(this.env.DB,[["UPDATE application_limits SET value=? WHERE key='tenant_media_bytes'",options.tenantMediaBytes],["UPDATE application_limits SET value=? WHERE key='media_upload_bytes'",options.mediaBytes],["UPDATE application_limits SET value=? WHERE key='csv_rows'",options.csvRows],["UPDATE application_limits SET value=? WHERE key='csv_bytes'",options.csvBytes]]);this.phase11Scheduled=true;if(!await this.ctx.storage.getAlarm())await this.ctx.storage.setAlarm(Date.now()+30000);}
  const u=new URL(req.url),p=u.pathname;
  const publicPath=p==='/api/v1/live' || p==='/api/v1/cafes' || /^\/api\/v1\/cafes\/[^/]+$/.test(p);
  const ttl=req.method==='GET'?(p==='/api/v1/health'?60000:publicPath?5000:0):0,key=p; // public projections ignore cookies and query parameters
  try {
   if(this.quotaUntil>Date.now())return error(new Error('D1 daily read limit exceeded'));
   if(ttl) {
    const generation=this.generation,pendingKey=generation+':'+key;
    const saved=this.cache.get(key);if(saved?.until>Date.now())return saved.response.clone();
    if(this.pending.has(pendingKey))return (await this.pending.get(pendingKey)).clone();
    const task=handle(req,this.env,this.historyCache,this.profiles,this.ctx).then(response=>{
     if(response.ok && generation===this.generation){if(this.cache.size>=256)this.cache.delete(this.cache.keys().next().value);this.cache.set(key,{until:Date.now()+ttl,response:response.clone()});}
     return response;
    }).finally(()=>this.pending.delete(pendingKey));
    this.pending.set(pendingKey,task);return (await task).clone();
   }
   // Auth and management always execute. Successful mutations invalidate cached
   // public projections so disabling devices/hiding cafes cannot serve old state.
   const deviceMutation=req.method!=='GET'?/^\/api\/v1\/admin\/devices\/([^/]+)/.exec(p):null;
   const previous=deviceMutation?await first(this.env.DB,'SELECT cafe_id FROM devices WHERE id=?',decodeURIComponent(deviceMutation[1])):null;
   const response=await handle(req,this.env,this.historyCache,this.profiles,this.ctx);
   if(req.method!=='GET'&&response.ok&&!p.startsWith('/api/v1/analytics/')){const alarm=await this.ctx.storage.getAlarm();if(!alarm||alarm>Date.now()+1000)await this.ctx.storage.setAlarm(Date.now()+1000);}
   if(req.method!=='GET' && response.ok && !/^\/api\/v1\/(?:(?:owner|admin)\/)?cafes\/[^/]+\/(?:menu|inventory|reviews|ratings)(?:\/|$)/.test(p)){if(previous)this.ctx.waitUntil(Promise.resolve(notifyCafe(this.env,previous.cafe_id)).catch(()=>{}));this.generation++;this.cache.clear();const cafe=/^\/api\/v1\/(?:admin\/|owner\/)?cafes\/([^/]+)/.exec(p)?.[1];if(cafe){const id=decodeURIComponent(cafe);await this.profiles.invalidate(id);this.ctx.waitUntil(Promise.resolve(notifyCafe(this.env,id)).catch(()=>{}));}}
   return response;
  }catch(e){if(isQuotaError(e))this.quotaUntil=Date.now()+900000;return error(e);}
 }
}
export default {async fetch(req,env,ctx){try{
 if(new URL(req.url).pathname==='/api/v1/ready'&&req.method==='GET'&&!env.BACKEND)return json({ready:false,api:'1'},503,{'X-Request-ID':requestId()});
 if(req.method==='GET' && new URL(req.url).pathname==='/api/v1/config' && globalThis.caches?.default){
  const cached=await caches.default.match(req);if(cached)return cached;
  const response=await env.BACKEND.get(env.BACKEND.idFromName('application')).fetch(req);
  if(response.ok){const copy=new Response(response.body,response);copy.headers.set('Cache-Control','public, max-age=60');ctx.waitUntil(caches.default.put(req,copy.clone()));return copy;}
  return response;
 }
 if(new URL(req.url).pathname.startsWith('/api/'))return env.BACKEND.get(env.BACKEND.idFromName('application')).fetch(req);
 return await handle(req,env);
}catch(e){return error(e);}}};
