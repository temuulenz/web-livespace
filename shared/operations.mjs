// Fixed-schema operational events: never serialize requests, errors or user input.
import {randomUUID} from 'node:crypto';
export const requestId=()=>randomUUID();
export function routeGroup(path){
 if(path==='/api/v1/ready')return 'readiness';
 if(path==='/api/v1/health')return 'health';
 if(path.startsWith('/api/v1/auth/'))return 'auth';
 if(path.startsWith('/api/v1/analytics/'))return 'analytics';
 if(path.includes('/notifications')||path.includes('/notification-preferences'))return 'notifications';
 if(path.startsWith('/api/v1/admin/'))return 'admin';
 if(path.startsWith('/api/v1/owner/'))return 'owner';
 if(path.startsWith('/api/v1/cafes'))return 'cafes';
 return 'other';
}
export function operationalLog(event,{request_id,route,status,duration_ms,runtime,job}={},sink=line=>console.log(line)){
 if(!['http_request','background_failure'].includes(event))throw new Error('Unknown operational event');
 const entry={timestamp:new Date().toISOString(),event};
 if(typeof request_id==='string'&&/^[a-f0-9-]{36}$/.test(request_id))entry.request_id=request_id;
 if(['readiness','health','auth','analytics','notifications','admin','owner','cafes','other'].includes(route))entry.route=route;
 if(Number.isInteger(status)&&status>=100&&status<=599)entry.status=status;
 if(Number.isFinite(duration_ms)&&duration_ms>=0)entry.duration_ms=Math.round(duration_ms*100)/100;
 if(['node','cloudflare'].includes(runtime))entry.runtime=runtime;
 if(['maintenance','analytics_flush','sessions'].includes(job))entry.job=job;
 sink(JSON.stringify(entry));return entry;
}
// Read-only SQL/schema probe. Minimal public output deliberately excludes diagnostics.
export async function readiness(sql,bindingsReady=true){
 try{
  const row=await sql.first("SELECT count(*) n FROM sqlite_master WHERE (type='table' AND name IN('users','sessions','cafes','devices','sensor_receipts','menu_items','inventory','inventory_receipts','reviews','promotions','analytics_dimensions','analytics_cohorts','notification_outbox','notifications','application_limits','resource_controls','resource_maintenance_cursor')) OR (type='trigger' AND name IN('menu_media_configured_limit','notify_review','inventory_movement_no_update'))");
  const limits=await sql.first('SELECT count(*) n FROM application_limits');
  const ready=bindingsReady&&row?.n===20&&limits?.n===4;
  return {ready,api:'1'};
 }catch{return {ready:false,api:'1'};}
}
