import {createInsights} from './insights.mjs';
import {createNotifications} from './notifications.mjs';
import {createResources} from './resources.mjs';
export function createPhase11(deps){
 const {sql,fail,options}=deps,insights=createInsights(deps),notifications=createNotifications(deps),resources=createResources(deps);
 return {insights,notifications,resources,
  async paused(cafe){return !!await sql.first("SELECT scope FROM resource_controls WHERE analytics_paused=1 AND scope IN('platform',?)",'cafe:'+cafe);},
  async maintenance(){await notifications.maintenance();const cursor=await sql.first('SELECT cafe FROM resource_maintenance_cursor WHERE id=1');if(!cursor.cafe)await resources.evaluate(null);const next=await sql.first("SELECT id FROM cafes WHERE id>(SELECT cafe FROM resource_maintenance_cursor WHERE id=1) ORDER BY id LIMIT 1");if(next)await resources.evaluate(next.id);await sql.batch([['UPDATE resource_maintenance_cursor SET cafe=? WHERE id=1',next?.id||'']]);const cutoff=new Date(Date.now()-options.retentionDays*86400000).toISOString();
   // Bounded optional aggregate retention. Never delete business content or sensor receipts.
   await sql.batch([['DELETE FROM analytics_dimensions WHERE rowid IN(SELECT rowid FROM analytics_dimensions WHERE hour<? LIMIT ?)',cutoff,options.batch],['DELETE FROM analytics_hourly WHERE rowid IN(SELECT rowid FROM analytics_hourly WHERE hour<? LIMIT ?)',cutoff,options.batch],['DELETE FROM analytics_session_days WHERE rowid IN(SELECT rowid FROM analytics_session_days WHERE day<? LIMIT ?)',cutoff.slice(0,10),options.batch],['DELETE FROM analytics_cohorts WHERE rowid IN(SELECT rowid FROM analytics_cohorts WHERE day<? LIMIT ?)',cutoff.slice(0,10),options.batch]]);
   const due=await sql.first('SELECT min(available_at) at FROM notification_outbox WHERE processed_at IS NULL');return {next_due:due?.at||null,more_tenants:!!next};
  },
  async route({path,method,query={},user,read,flush=async()=>{}}){
   let match=/^\/api\/v1\/(owner|admin)\/cafes\/([^/]+)\/(analytics|analytics\.csv|resources|resource-controls)$/.exec(path);
   if(match){const cafe=decodeURIComponent(match[2]);if(match[1]==='admin'&&user?.role!=='admin')fail(user?403:401,'forbidden','Administrator required');
    if(['analytics','analytics.csv'].includes(match[3])&&method==='GET'){await insights.authorize(cafe,user);await flush(cafe);const value=await insights.read(cafe,query,user);return match[3]==='analytics.csv'?{body:insights.csv(value),headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="livespace-analytics.csv"'}}:{body:value};}
    if(match[3]==='resources'&&method==='GET')return {body:await resources.read(cafe,user)};
    if(match[3]==='resource-controls'&&method==='PATCH')return {body:await resources.controls(cafe,await read(),user)};
    fail(405,'method_not_allowed','Method not allowed');
   }
   if(['/api/v1/admin/analytics','/api/v1/admin/analytics.csv'].includes(path)&&method==='GET'){const value=await insights.read(null,query,user);return path.endsWith('.csv')?{body:insights.csv(value),headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="livespace-platform-analytics.csv"'}}:{body:value};}
   if(path==='/api/v1/admin/resource-controls'&&method==='PATCH')return {body:await resources.controls(null,await read(),user)};
   if(path==='/api/v1/admin/resources/monitor'&&method==='GET')return {body:await resources.read(null,user)};
   if(path==='/api/v1/admin/maintenance'&&method==='POST'){if(!user)fail(401,'unauthorized','Sign in required');if(user.role!=='admin')fail(403,'forbidden','Administrator required');await this.maintenance();return {body:{processed:true}};}
   if(path==='/api/v1/me/notifications'&&method==='GET')return {body:await notifications.list(query,user)};
   if(path==='/api/v1/me/notifications/read-all'&&method==='POST')return {body:await notifications.read(null,user)};
   match=/^\/api\/v1\/me\/notifications\/([^/]+)\/read$/.exec(path);if(match&&method==='POST')return {body:await notifications.read(decodeURIComponent(match[1]),user)};
   if(path==='/api/v1/me/notification-preferences'&&['GET','PATCH'].includes(method))return {body:await notifications.preferences(user,method==='PATCH'?await read():undefined)};
   return null;
  }
 };
}
