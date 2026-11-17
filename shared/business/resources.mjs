import {businessCommon} from './common.mjs';
export function createRuntimeMetrics(){
 const scopes=new Map(),started=new Date().toISOString();let database={operations:0,failures:0,total_latency_ms:0},jobs={runs:0,failures:0};
 const fresh=()=>({requests:0,errors:0,rate_limits:0,total_latency_ms:0,latencies:[]});
 function record(cafe,status,ms){for(const key of ['platform',...(cafe?['cafe:'+cafe]:[])]){if(!scopes.has(key)){if(scopes.size>=129&&key!=='platform')scopes.delete([...scopes.keys()].find(k=>k!=='platform'));scopes.set(key,fresh());}const s=scopes.get(key);s.requests++;s.errors+=status>=400?1:0;s.rate_limits+=status===429?1:0;s.total_latency_ms+=ms;s.latencies.push(ms);if(s.latencies.length>256)s.latencies.shift();}}
 return {record,db(ms,failed=false){database.operations++;database.failures+=failed?1:0;database.total_latency_ms+=ms;},job(failed=false){jobs.runs++;jobs.failures+=failed?1:0;},snapshot(cafe){const s=scopes.get(cafe?'cafe:'+cafe:'platform')||fresh(),sorted=[...s.latencies].sort((a,b)=>a-b);return {scope:'ephemeral_current_runtime_not_billing',started_at:started,api:{requests:s.requests,errors:s.errors,error_rate:s.requests?s.errors/s.requests:0,rate_limit_violations:s.rate_limits,mean_latency_ms:s.requests?s.total_latency_ms/s.requests:null,p95_latency_ms:sorted.length?sorted[Math.ceil(sorted.length*.95)-1]:null},database:cafe?{status:'unavailable_tenant_attribution'}:{...database},background:cafe?{status:'unavailable_tenant_attribution'}:{...jobs}};}};
}
export const runtimeMetrics=createRuntimeMetrics();
export function requestCafe(path){const m=/^\/api\/v1\/(?:(?:owner|admin)\/)?cafes\/([^/]+)/.exec(path);try{return m?decodeURIComponent(m[1]):null;}catch{return null;}}
export function protectRequest(path,user,client,limit,options){
 // Security, auth, telemetry and health retain their existing dedicated controls.
 if(!/^\/api\/v1\/(?:cafes|owner|analytics|me\/notifications|me\/notification-preferences)(?:\/|$)/.test(path))return;
 limit(user?'api-user:'+user.id:'api-anonymous:'+client,user?options.apiUser:options.apiAnonymous,60000);
 const cafe=requestCafe(path);if(cafe)limit('api-tenant:'+cafe,options.apiTenant,60000);
}
export function createResources({sql,fail,id,options,metrics=runtimeMetrics,clock=()=>new Date().toISOString(),runtime=()=>({})}){
 const c=businessCommon({sql,fail});
 async function authorize(cafe,user){c.user(user);if(user.role==='admin')return;if(!cafe)fail(403,'forbidden','Administrator required');await c.cafe(cafe,user);}
 async function usage(cafe){const row=await sql.first(`SELECT coalesce(sum(image_bytes),0) media_bytes,coalesce(sum(images),0) media_images FROM menu_tenant_usage${cafe?' WHERE cafe_id=?':''}`,...(cafe?[cafe]:[]));return {media_bytes:row.media_bytes,media_images:row.media_images};}
 return {
  authorize,
  async read(cafe,user){await authorize(cafe,user);const measured=await usage(cafe),pending=await sql.first(`SELECT count(*) n FROM notification_outbox WHERE processed_at IS NULL${cafe?' AND cafe_id=?':''}`,...(cafe?[cafe]:[])),analytics=await sql.first(`SELECT coalesce(sum(event_count),0) n FROM analytics_dimensions WHERE hour>=?${cafe?' AND cafe_id=?':''}`,clock().slice(0,10)+'T00:00:00.000Z',...(cafe?[cafe]:[])),devices=await sql.all(`SELECT connection_status,count(*) count FROM devices WHERE revoked_at IS NULL${cafe?' AND cafe_id=?':''} GROUP BY connection_status`,...(cafe?[cafe]:[]));
   const sensor=await sql.first(`SELECT count(*) n FROM measurements WHERE message_id IS NOT NULL AND received_at>=?${cafe?' AND cafe_id=?':''}`,clock().slice(0,10)+'T00:00:00.000Z',...(cafe?[cafe]:[]));
   const limits=await sql.all('SELECT key,value FROM application_limits'),runtimeInfo=cafe?{status:'unavailable_tenant_attribution'}:runtime();
   return {cafe_id:cafe||null,at:clock(),runtime:metrics.snapshot(cafe),application_measured:{...measured,pending_notification_events:pending.n,failed_external_deliveries:0,external_delivery:'not_configured',analytics_flushed_events_today:analytics.n,sensor_accepted_today:sensor.n,sensor_connectivity:devices},runtime_connections:runtimeInfo,storage:{media_bytes:measured.media_bytes,database_bytes:runtimeInfo.sqlite_database_bytes??null,database_bytes_status:runtimeInfo.sqlite_database_bytes===undefined?'provider_unavailable':'measured_sqlite_allocated_pages'},quotas:{...options,...Object.fromEntries(limits.map(r=>[r.key,r.value]))},provider_billing:{status:'unavailable',usage:null},controls:await sql.first('SELECT analytics_paused,updated_at FROM resource_controls WHERE scope=?',cafe?'cafe:'+cafe:'platform')||{analytics_paused:0}};
  },
  async controls(cafe,input,user){await authorize(cafe,user);if(user.role!=='admin')fail(403,'forbidden','Administrator required');c.object(input,['analytics_paused']);if(typeof input.analytics_paused!=='boolean')c.invalid('Boolean required');await sql.batch([['INSERT INTO resource_controls VALUES(?,?,?,?) ON CONFLICT(scope) DO UPDATE SET analytics_paused=excluded.analytics_paused,updated_at=excluded.updated_at,actor_id=excluded.actor_id',cafe?'cafe:'+cafe:'platform',Number(input.analytics_paused),clock(),user.id]]);return {updated:true};},
  async evaluate(cafe){
   const measured=await usage(cafe),key=cafe?'cafe:'+cafe:'platform',at=clock(),localDay=new Date(Date.parse(at)+28800000).toISOString().slice(0,10),since=new Date(Date.parse(localDay+'T00:00:00Z')-28800000).toISOString();
   const analytics=await sql.first(`SELECT coalesce(sum(event_count),0) n FROM analytics_dimensions WHERE hour>=?${cafe?' AND cafe_id=?':''}`,since,...(cafe?[cafe]:[]));
   const tenants=cafe?1:Math.max(1,(await sql.first("SELECT count(*) n FROM cafes WHERE status='active'")).n);
   const quotas=[['media_bytes',measured.media_bytes,cafe?options.tenantMediaBytes:52428800],['media_images',measured.media_images,cafe?100:1000],['analytics_flushed_daily',analytics.n,options.analyticsDaily*tenants]];
   if(!cafe){const notifications=await sql.first('SELECT coalesce(max(n),0) n FROM notification_budgets WHERE day=?',at.slice(0,10));quotas.push(['notification_recipient_daily_max',notifications.n,options.notificationDaily]);}
   const entries=[];
   for(const [metric,value,limit] of quotas){const ratio=value/limit,level=ratio>=1?3:ratio>=options.critical/100?2:ratio>=options.warning/100?1:0;
    entries.push(['INSERT INTO resource_incidents VALUES(?,?,?,1,?) ON CONFLICT(scope,metric) DO UPDATE SET level=excluded.level,episode=CASE WHEN resource_incidents.level=0 AND excluded.level>0 THEN resource_incidents.episode+1 ELSE resource_incidents.episode END,updated_at=excluded.updated_at WHERE resource_incidents.level<>excluded.level',key,metric,level,at]);
    entries.push(["INSERT OR IGNORE INTO notification_outbox SELECT 'resource:'||scope||':'||metric||':'||episode||':'||level,?,'resource',metric,NULL,?,?,NULL,0 FROM resource_incidents WHERE scope=? AND metric=? AND level>0",cafe,at,at,key,metric]);
   }await sql.batch(entries);
  }
 };
}
