import { measuredSql,setMeasuredAlarm } from './resources.mjs';
import {DurableObject} from 'cloudflare:workers';
import {initializeAnalytics,acceptAnalytics,flushAnalytics} from './analytics-store.mjs';
import {validateAnalyticsBatch} from '../js/services/analytics-schema.js';
import {fail,all,isQuotaError} from './core.mjs';
export class AnalyticsAggregator extends DurableObject {
 constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.env=env;this.sqlMetrics={};this.store={storage:{sql:measuredSql(ctx.storage.sql,this.sqlMetrics),transactionSync:fn=>ctx.storage.transactionSync(fn)}};initializeAnalytics(this.store.storage.sql);this.tail=Promise.resolve();}
 stats(){return {...this.sqlMetrics};}
 async collect(input){
  if(this.env.LS_ANALYTICS_ENABLED!=='1')fail(503,'analytics_disabled','Optional analytics is disabled');
  let batch;try{batch=validateAnalyticsBatch(input);}catch{fail(422,'invalid_analytics','Invalid analytics batch');}
  let result;try{result=acceptAnalytics(this.store,batch);}catch(e){fail(e.message.includes('budget')?429:409,'analytics_rejected',e.message);}
  if(!await this.ctx.storage.getAlarm())await setMeasuredAlarm(this.ctx,this.sqlMetrics,Date.now()+900000);
  return result;
 }
 async flush(){const task=this.tail.then(()=>flushAnalytics(this.store,this.env.DB));this.tail=task.catch(()=>{});return task;}
 async alarm(){
  if(this.env.LS_ANALYTICS_ENABLED!=='1')return; // durable pending counters retained, no optional retry traffic
  try{const r=await this.flush();await setMeasuredAlarm(this.ctx,this.sqlMetrics,Date.now()+(r.pending?60000:86400000));}
  catch(e){await setMeasuredAlarm(this.ctx,this.sqlMetrics,Date.now()+(isQuotaError(e)?3600000:900000));}
 }
}
// Future owner interface: bounded summaries, never raw receipts or visitor data.
export async function readAnalytics(db,cafe,{granularity='hour',since=new Date(Date.now()-7*86400000).toISOString(),until=new Date().toISOString()}={}) {
 if(!['hour','day'].includes(granularity)||!Number.isFinite(Date.parse(since))||!Number.isFinite(Date.parse(until))||Date.parse(until)<=Date.parse(since)||Date.parse(until)-Date.parse(since)>31*86400000)fail(422,'invalid_range','Use an increasing range of at most 31 days');
 const bucket=granularity==='day'?"substr(hour,1,10)":"hour";
 return {schemaVersion:1,cafeId:cafe,timezone:'UTC',granularity,metric:'event_count',uniqueVisitors:null,rows:await all(db,`SELECT ${bucket} bucket,event_type,SUM(event_count) event_count FROM analytics_hourly WHERE cafe_id=? AND hour>=? AND hour<? GROUP BY bucket,event_type ORDER BY bucket LIMIT 5208`,cafe,new Date(since).toISOString(),new Date(until).toISOString())};
}
