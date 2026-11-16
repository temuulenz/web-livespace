import { measuredSql,setMeasuredAlarm } from './resources.mjs';
import {notifyCafe} from './browser-rooms.mjs';
import { commitTelemetry } from './telemetry-storage.mjs';
import { DurableObject } from 'cloudflare:workers';
import { validateTelemetry, SENSOR_ID } from '../server/lib/telemetry-schema.mjs';
import { hashPassword, verifyPassword, APIError, fail, error, deviceAuth, source, first, batch, run, sha, now, isQuotaError } from './core.mjs';

// One coordinator per registered device. D1 remains the only credential/history store.
export class SensorGateway extends DurableObject {
 constructor(ctx,env) { super(ctx,env); this.ctx=ctx;this.env=env;this.sqlMetrics={};this.sql=measuredSql(ctx.storage.sql,this.sqlMetrics); this.tail=Promise.resolve(); this.sql.exec("CREATE TABLE IF NOT EXISTS rate_window(id INTEGER PRIMARY KEY CHECK(id=1),started INTEGER NOT NULL,count INTEGER NOT NULL)"); }
 stats(){return {...this.sqlMetrics,connections:this.ctx.getWebSockets().length};}
 async passwordHash(password) {
  if(typeof password!=='string' || password.length<8 || password.length>200)throw new Error('Invalid password');
  return hashPassword(password);
 }
 async passwordVerify(password,stored) {
  if(typeof password!=='string' || password.length>200)return false;
  return verifyPassword(password,stored);
 }
 async reserve(device,connection) {
  const sql=this.sql,t=Date.now();
  sql.exec('CREATE TABLE IF NOT EXISTS admissions(device TEXT PRIMARY KEY,connection TEXT NOT NULL,expires INTEGER NOT NULL)');
  sql.exec('DELETE FROM admissions WHERE expires<=?',t);
  const current=[...sql.exec('SELECT connection FROM admissions WHERE device=?',device)][0];
  if(!current && [...sql.exec('SELECT COUNT(*) n FROM admissions')][0].n>=500)return false;
  sql.exec('INSERT INTO admissions(device,connection,expires) VALUES(?,?,?) ON CONFLICT(device) DO UPDATE SET connection=excluded.connection,expires=excluded.expires',device,connection,t+90000);return true;
 }
 async release(device,connection) {this.sql.exec('DELETE FROM admissions WHERE device=? AND connection=?',device,connection);}
 coordinator() {return this.env.SENSORS.get(this.env.SENSORS.idFromName('admission'));}
 async fetch(req) {
  return this.ctx.blockConcurrencyWhile(()=>this.open(req));
 }
 async open(req) {
  try {
   if(this.quotaUntil>Date.now())throw new Error('D1 daily read limit exceeded');
   const d=await deviceAuth(this.env.DB,req.headers.get('authorization'));
   if(req.headers.get('upgrade')?.toLowerCase()!=='websocket')fail(426,'upgrade_required','WebSocket required');
   if(this.ctx.getWebSockets().some(ws=>ws.readyState===1))fail(409,'already_connected','Device already connected');
   const connection=crypto.randomUUID();if(!await this.coordinator().reserve(d.id,connection))fail(503,'capacity_reached','Connection capacity reached');
   const pair=new WebSocketPair(), client=pair[0],ws=pair[1];
   this.ctx.acceptWebSocket(ws);
   ws.serializeAttachment({connection,id:d.id,cafe:d.cafe_id,hash:d.token_hash,source:source(d),window:Date.now(),count:0,errors:0});
   await run(this.env.DB,"UPDATE devices SET connection_status='online' WHERE id=? AND connection_status!='online'",d.id);
   this.ctx.waitUntil(Promise.resolve(notifyCafe(this.env,d.cafe_id)).catch(()=>{}));
   await setMeasuredAlarm(this.ctx,this.sqlMetrics,Date.now()+30000);
   ws.send(JSON.stringify({type:'sensor.ready',schemaVersion:1,deviceId:d.id,locationId:d.cafe_id,dataSource:source(d),maxPayloadBytes:16384}));
   return new Response(null,{status:101,webSocket:client});
  } catch(e){return error(e);}
 }
 async webSocketMessage(ws,message) {
  // Serialize async D1 operations, including replay checks, across event interleaving.
  const task=this.tail.then(()=>this.receive(ws,message));this.tail=task.catch(()=>{});await task;
 }
 async receive(ws,message) {
  let a=ws.deserializeAttachment(),messageId;
  try {
   if(this.quotaUntil>Date.now())throw new Error('D1 daily read limit exceeded');
   const d=await first(this.env.DB,'SELECT * FROM devices WHERE id=? AND enabled=1 AND revoked_at IS NULL',a.id);
   if(!d || d.token_hash!==a.hash || d.cafe_id!==a.cafe || source(d)!==a.source)fail(401,'device_assignment_changed','Device authorization changed');
   const clock=Date.now();this.sql.exec('INSERT INTO rate_window(id,started,count) VALUES(1,?,1) ON CONFLICT(id) DO UPDATE SET started=CASE WHEN started<=?-60000 THEN ? ELSE started END,count=CASE WHEN started<=?-60000 THEN 1 ELSE count+1 END',clock,clock,clock,clock);
   const rate=[...this.sql.exec('SELECT count FROM rate_window WHERE id=1')][0];
   if(rate.count>120)fail(429,'rate_limited','Too many messages');
   if(typeof message!=='string')fail(415,'json_only','JSON text required');
   if(new TextEncoder().encode(message).length>16384){ws.close(1009,'Message too large');return;}
   let input;try{input=JSON.parse(message);}catch{fail(400,'invalid_json','Malformed JSON');}
   if(typeof input?.messageId==='string' && SENSOR_ID.test(input.messageId))messageId=input.messageId;
   const {value,errors}=validateTelemetry(input,Date.now(),{checkAge:false});
   if(errors.length)fail(422,'validation_failed','Invalid telemetry',errors);
   if(value.deviceId!==d.id || value.locationId!==d.cafe_id)fail(403,'unauthorized_location','Device and location must match the server assignment');
   if(value.dataSource==='simulated' && a.source!=='simulated')fail(403,'simulation_not_allowed','Simulator requires test registration');
   value.dataSource=a.source;
   const hash=sha(JSON.stringify(value));let saved=await first(this.env.DB,'SELECT * FROM sensor_receipts WHERE device_id=? AND message_id=?',d.id,value.messageId);
   if(saved && saved.payload_hash!==hash)fail(409,'message_id_conflict','Message ID was already used for different telemetry');
   if(!saved) {
    const age=validateTelemetry(input).errors;if(age.length)fail(422,'validation_failed','Invalid telemetry',age);
    const t=now(),v=value;
    // D1 batch is an atomic transaction. Conditional authorization guards a rotation
    // or reassignment racing the async validation/query steps. Receipt inserted last.
    const committed=await commitTelemetry(this.env.DB,d,a,v,t,hash);
    if(!committed.at(-1).meta.changes)fail(401,'device_assignment_changed','Device authorization changed');
    saved={accepted_at:t};
    this.ctx.waitUntil(Promise.resolve(notifyCafe(this.env,d.cafe_id)).catch(()=>{}));
    ws.send(JSON.stringify({type:'sensor.ack',messageId:v.messageId,status:'accepted',serverTimestamp:saved.accepted_at}));
   } else ws.send(JSON.stringify({type:'sensor.ack',messageId:value.messageId,status:'duplicate',serverTimestamp:saved.accepted_at}));
  }catch(e) {
   if(isQuotaError(e)){this.quotaUntil=Date.now()+900000;ws.send(JSON.stringify({type:'sensor.error',...(messageId?{messageId}:{}),error:{code:'storage_failed',message:'Temporary storage interruption; retain queued telemetry and retry later'}}));ws.close(1013,'Storage unavailable; retry after 900 seconds');return;}
   const known=e instanceof APIError;
   ws.send(JSON.stringify({type:'sensor.error',...(messageId?{messageId}:{}),error:{code:known?e.code:'storage_failed',message:known?e.message:'Unable to persist telemetry',...(known&&e.details?{details:e.details}:{})}}));
   if([401,403,429].includes(e.status) || ++a.errors>=5)ws.close(1008,'Policy violation');
  }finally {ws.serializeAttachment(a);}
 }
 async alarm() {
  try {
  if(this.quotaUntil>Date.now())return;
  for(const ws of this.ctx.getWebSockets()) {
   const a=ws.deserializeAttachment();if(ws.readyState!==1)continue;await this.coordinator().reserve(a.id,a.connection);const d=await first(this.env.DB,'SELECT * FROM devices WHERE id=?',a.id);
   if(!d || !d.enabled || d.revoked_at || d.token_hash!==a.hash || d.cafe_id!==a.cafe || source(d)!==a.source) {
    ws.send(JSON.stringify({type:'sensor.error',error:{code:'device_assignment_changed',message:'Device authorization changed'}}));ws.close(1008,'Authorization changed');
    if(d){await run(this.env.DB,"UPDATE devices SET connection_status='offline' WHERE id=? AND connection_status!='offline'",d.id);this.ctx.waitUntil(Promise.resolve(notifyCafe(this.env,d.cafe_id)).catch(()=>{}));}
   }
  }
  }catch(e){if(isQuotaError(e))this.quotaUntil=Date.now()+900000;else throw e;}finally{if(this.ctx.getWebSockets().length)await setMeasuredAlarm(this.ctx,this.sqlMetrics,Math.max(Date.now()+30000,this.quotaUntil || 0));}
 }
 async webSocketClose(ws,code,reason,wasClean) { const a=ws.deserializeAttachment();if(a){await this.coordinator().release(a.id,a.connection);if(!this.ctx.getWebSockets().some(other=>other!==ws && other.readyState===1))await run(this.env.DB,"UPDATE devices SET connection_status='offline' WHERE id=? AND connection_status!='offline'",a.id);}if(a)this.ctx.waitUntil(Promise.resolve(notifyCafe(this.env,a.cafe)).catch(()=>{}));try{ws.close(code===1006?1001:code,reason);}catch{} }
 async webSocketError(ws){await this.webSocketClose(ws,1011,'Connection error',false);}
}
