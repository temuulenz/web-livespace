import { measuredSql,setMeasuredAlarm } from './resources.mjs';
import {DurableObject} from 'cloudflare:workers';
import {SESSION_SELECT} from '../server/services/user-access.mjs';
import {first,all,session,sha,now,error,fail,guard,isQuotaError} from './core.mjs';
import {cafeView,liveUpdate,deviceView} from './views.mjs';
export class BrowserRoom extends DurableObject {
 constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.env=env;this.sqlMetrics={};this.sql=measuredSql(ctx.storage.sql,this.sqlMetrics);this.refreshing=null;this.quotaUntil=0;
  this.sql.exec('CREATE TABLE IF NOT EXISTS room_state(id INTEGER PRIMARY KEY CHECK(id=1),cafe TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT,at INTEGER NOT NULL)');
  ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'));
 }
 stats(){return {...this.sqlMetrics,connections:this.ctx.getWebSockets().length};}
 bind(cafe){const state=[...this.sql.exec('SELECT * FROM room_state WHERE id=1')][0];if(state&&state.cafe!==cafe)fail(403,'tenant_mismatch','Room tenant mismatch');if(!state)this.sql.exec('INSERT INTO room_state VALUES(1,?,0,NULL,0)',cafe);return state;}
 async authorized(a){
  const row=await first(this.env.DB,'SELECT * FROM cafes WHERE id=?',a.cafe);if(!row)return null;
  if(a.scope==='public')return row.status==='active'?row:null;
  const user=await first(this.env.DB,SESSION_SELECT,a.sessionHash,now());
  if(!user || (a.scope==='admin'?user.role!=='admin':!['owner','admin'].includes(user.role)) || (user.role!=='admin' && row.owner_id!==user.id))return null;
  return row;
 }
 async fetch(req){try{
  if(this.quotaUntil>Date.now())fail(503,'d1_quota_exhausted','Temporary service interruption');
  const url=new URL(req.url),cafe=decodeURIComponent(url.pathname.split('/').at(-1)),scope=url.searchParams.get('scope')||'public';
  if(!['public','owner','admin'].includes(scope)||[...url.searchParams.keys()].some(k=>k!=='scope'))fail(400,'bad_subscription','Invalid subscription');
  if(req.headers.get('origin')!==url.origin)fail(403,'bad_origin','WebSocket origin rejected');
  if(req.headers.get('upgrade')?.toLowerCase()!=='websocket')fail(426,'upgrade_required','WebSocket required');
  if(this.ctx.getWebSockets().length>=600)fail(429,'room_capacity','Room connection limit reached');
  // Read-only tenant check first; room storage is only written (via snapshot→bind) after the café is authorized.
  const bound=[...this.sql.exec('SELECT cafe FROM room_state WHERE id=1')][0];if(bound&&bound.cafe!==cafe)fail(403,'tenant_mismatch','Room tenant mismatch');const a={cafe,scope};
  if(scope!=='public'){const user=await session(this.env.DB,req);guard(user,...(scope==='admin'?['admin']:['owner','admin']));const raw=/(?:^|;\s*)ls_session=([^;]+)/.exec(req.headers.get('cookie')||'')?.[1];a.sessionHash=sha(raw);}
  const row=await this.authorized(a);if(!row)fail(404,'not_found','Cafe not found');
  const snapshot=await this.snapshot(row,scope!=='public',scope!=='public');
  const pair=new WebSocketPair(),ws=pair[1];this.ctx.acceptWebSocket(ws,[scope]);ws.serializeAttachment(a);
  ws.send(JSON.stringify(this.frame(snapshot,a)));
  if(!await this.ctx.storage.getAlarm())await setMeasuredAlarm(this.ctx,this.sqlMetrics,Date.now()+60000);
  return new Response(null,{status:101,webSocket:pair[0]});
 }catch(e){return error(e);}}
 frame(snapshot,a){return {type:'live.snapshot',schemaVersion:1,version:snapshot.version,data:snapshot.data,inventory:snapshot.inventory,...(a.scope!=='public'?{diagnostics:snapshot.diagnostics}:{})};}
 async snapshot(row,force=true,privateNeeded=false){
  if(this.refreshing){const current=await this.refreshing;if(privateNeeded&&!current.privateReady)return this.snapshot(row,true,true);return current;}
  const state=this.bind(row.id);if(!force&&state?.payload&&Date.now()-state.at<5000)return JSON.parse(state.payload);
  this.refreshing=(async()=>{
   const view=await cafeView(this.env.DB,row,Number(this.env.LS_SENSOR_STALE_AFTER_SEC||30));
   const needsPrivate=privateNeeded||this.ctx.getWebSockets().some(ws=>ws.deserializeAttachment()?.scope!=='public');
   const devices=needsPrivate?await all(this.env.DB,'SELECT * FROM devices WHERE cafe_id=? AND revoked_at IS NULL LIMIT 100',row.id):[];
   const diagnostics=(await Promise.all(devices.map(d=>deviceView(this.env.DB,d)))).map(d=>({id:d.id,status:d.status,last_seen_at:d.last_seen_at,last_status:d.last_status}));
   const revision=await first(this.env.DB,'SELECT revision FROM inventory_revisions WHERE cafe_id=?',row.id);
   const current=this.bind(row.id),snapshot={inventory:{revision:revision?.revision||0,snapshot_url:`/api/v1/cafes/${encodeURIComponent(row.id)}/inventory`},version:(current?.version||0)+1,data:liveUpdate(view),diagnostics,privateReady:needsPrivate};
   this.sql.exec('UPDATE room_state SET version=?,payload=?,at=? WHERE id=1',snapshot.version,JSON.stringify(snapshot),Date.now());return snapshot;
  })().finally(()=>this.refreshing=null);return this.refreshing;
 }
 // Trusted business RPC: only public, persisted inventory projections enter rooms.
 async publishInventory(cafe,event){
  this.bind(cafe);if(event.cafe_id!==cafe||event.type!=='inventory.changed')fail(403,'tenant_mismatch','Room tenant mismatch');
  this.sql.exec('UPDATE room_state SET at=0 WHERE id=1');
  if(!this.ctx.getWebSockets().length)return;
  const publicCafe=await first(this.env.DB,'SELECT id,status FROM cafes WHERE id=?',cafe),privateChecks=new Map();
  for(const ws of this.ctx.getWebSockets()){try{
   const a=ws.deserializeAttachment();let row=publicCafe;
   if(a.scope!=='public'){const key=a.scope+':'+a.sessionHash;if(!privateChecks.has(key))privateChecks.set(key,this.authorized(a));row=await privateChecks.get(key);}
   if(!row||row.status!=='active'){ws.close(1008,'Subscription authorization changed');continue;}ws.send(JSON.stringify(event));
  }catch{try{ws.close(1011,'Delivery interrupted');}catch{}}}
 }
 // Trusted RPC only. No HTTP publish endpoint. Scheduling coalesces replay bursts.
 async publish(cafe){this.bind(cafe);if(!this.ctx.getWebSockets().length)return;const alarm=await this.ctx.storage.getAlarm();if(!alarm||alarm>Date.now()+500)await setMeasuredAlarm(this.ctx,this.sqlMetrics,Date.now()+500);}
 async alarm(){
  const sockets=this.ctx.getWebSockets();if(!sockets.length)return;
  try{
   if(this.quotaUntil>Date.now()){await setMeasuredAlarm(this.ctx,this.sqlMetrics,this.quotaUntil);return;}
   const state=[...this.sql.exec('SELECT cafe FROM room_state WHERE id=1')][0];
   const row=await first(this.env.DB,'SELECT * FROM cafes WHERE id=?',state.cafe);
   const snapshot=row?await this.snapshot(row):null;
   // Private authorization is indexed and checked before every private delivery.
   // Public data is projected once per room, never once per browser.
   for(const ws of sockets){try{const a=ws.deserializeAttachment();const allowed=a.scope==='public'?row?.status==='active':await this.authorized(a);if(!allowed){ws.close(1008,'Subscription authorization changed');continue;}ws.send(JSON.stringify(this.frame(snapshot,a)));}catch(e){if(isQuotaError(e))throw e;try{ws.close(1011,'Delivery interrupted');}catch{}}}
  }catch(e){if(isQuotaError(e)){this.quotaUntil=Date.now()+900000;for(const ws of sockets){try{ws.send(JSON.stringify({type:'service.unavailable',schemaVersion:1,retryAfter:900}));ws.close(1013,'Storage temporarily unavailable');}catch{}}}else throw e;
  }finally{if(this.ctx.getWebSockets().length){const next=Math.max(Date.now()+60000,this.quotaUntil),pending=await this.ctx.storage.getAlarm();if(!pending||pending>next)await setMeasuredAlarm(this.ctx,this.sqlMetrics,next);}}
 }
 async webSocketMessage(ws,message){
  if(message!=='{"type":"resync","schemaVersion":1}') {ws.close(1008,'Unsupported browser message');return;}
  // Reconnection is the bounded resync path; never allow client-driven D1 loops.
  ws.close(1012,'Reconnect for authoritative snapshot');
 }
 webSocketClose(ws,code,reason){try{ws.close(code===1006?1001:code,reason);}catch{}}
 webSocketError(ws){try{ws.close(1011,'Connection error');}catch{}}
}
export function notifyCafe(env,cafe){if(env.LS_BROWSER_REALTIME_ENABLED!=='1')return;return env.BROWSER_ROOMS?.get(env.BROWSER_ROOMS.idFromName('cafe:'+cafe)).publish(cafe);}
