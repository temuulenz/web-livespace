import { latestSensorReadingsSql } from '../server/lib/sensor-latest.mjs';
import { all, first, parse, source } from './core.mjs';
import { noiseLevel, wifiLevel, occupancyPercent, openState, ulaanbaatarMinutes, walkFrom } from '../js/live/levels.js';
export function status(d,ts=null,staleAfterSec=30) {
 if(d.revoked_at || !d.enabled) return 'disabled';
 if(d.connection_status==='offline' || (d.last_seen_at && Date.now()-Date.parse(d.last_seen_at)>600000)) return 'offline';
 return ts && Date.now()-Date.parse(ts)>staleAfterSec*1000 ? 'stale':'online';
}
export async function deviceView(db,d,staleAfterSec=30) {
 const latest=await first(db,'SELECT MAX(ts) ts FROM measurements WHERE device_id=? AND cafe_id=? AND message_id IS NOT NULL',d.id,d.cafe_id);
 const {token_hash,...safe}=d; const s=status(d,latest?.ts,staleAfterSec);
 return {...safe,is_test:!!d.is_test,enabled:!!d.enabled,last_status:parse(d.last_status),status:s,online:s==='online'};
}
export async function snapshot(db,cafeId,dataSource,staleAfterSec=30) {
 const rows=await all(db,latestSensorReadingsSql,dataSource,cafeId,dataSource);
 if(!rows.length)return null;
 const people=rows.find(r=>r.observed_people!=null),noise=rows.find(r=>r.noise_dbfs!=null || r.noise_db!=null || r.noise_rms!=null);
 const states=rows.map(r=>status(r,r.ts,staleAfterSec));const stale=r=>!r || Date.now()-Date.parse(r.ts)>staleAfterSec*1000;
 return {dataSource,timestamp:rows[0].ts,receivedAt:rows[0].received_at,status:states.includes('online')?'online':states.includes('stale')?'stale':'offline',observedPeople:people?.observed_people??null,confidence:people?.occupancy_confidence??null,peopleTimestamp:people?.ts??null,peopleStale:stale(people),noise:{rms:noise?.noise_rms??null,dbfs:noise?.noise_dbfs??null,estimatedDbSpl:noise?.noise_calibrated?noise.noise_db:null,calibrated:!!noise?.noise_calibrated},noiseTimestamp:noise?.ts??null,noiseStale:stale(noise),deviceCount:rows.length,aggregation:'latest_observation'};
}
export async function liveSummary(db,row,staleAfterSec=30) {
 if(row.data_mode==='demo')return {mode:'demo',updated_at:null,stale:false};
 const real=await snapshot(db,row.id,'real',staleAfterSec),sim=real?null:await snapshot(db,row.id,'simulated',staleAfterSec);
 const legacy=await all(db,`SELECT * FROM measurements WHERE cafe_id=? AND is_test=? AND (available_seats IS NOT NULL OR occupied_seats IS NOT NULL OR noise_db IS NOT NULL OR wifi_quality IS NOT NULL OR wifi_down_mbps IS NOT NULL) ORDER BY ts DESC,id DESC LIMIT 30`,row.id,0);
 // Prefer real observations; use simulations only when no real measurements exist.
 const sensor=real || (legacy.length?null:sim);const rows=legacy.length?legacy:await all(db,`SELECT * FROM measurements WHERE cafe_id=? AND is_test=1 AND (available_seats IS NOT NULL OR occupied_seats IS NOT NULL OR noise_db IS NOT NULL OR wifi_quality IS NOT NULL OR wifi_down_mbps IS NOT NULL) ORDER BY ts DESC,id DESC LIMIT 30`,row.id);
 if(!sensor && !rows.length)return {mode:'none',updated_at:null,stale:false};
 const seats=rows.find(r=>r.available_seats!=null || r.occupied_seats!=null),noise=rows.find(r=>r.noise_db!=null),wifi=rows.find(r=>r.wifi_quality!=null || r.wifi_down_mbps!=null);
 const updated=[sensor?.timestamp,...rows.map(r=>r.ts)].filter(Boolean).sort().at(-1);
 return {mode:real || legacy.length?'live':'test',updated_at:updated,stale:Date.now()-Date.parse(updated)>(sensor?staleAfterSec*1000:900000),...(sensor?{sensor}:{}),...(seats?{available_seats:seats.available_seats,occupied_seats:seats.occupied_seats,total_seats:seats.total_seats,free_pct:occupancyPercent(seats)==null?null:100-occupancyPercent(seats)}:{}),...(noise?{noise_db:noise.noise_db,noise_level:noiseLevel(noise.noise_db)}:{}),...(wifi?{wifi_quality:wifi.wifi_quality,wifi_level:wifiLevel(wifi.wifi_quality),wifi_mbps:wifi.wifi_down_mbps}:{})};
}
export async function cafeView(db,row,staleAfterSec=30) {
 const visualization=parse(row.visualization,{}),live=await liveSummary(db,row,staleAfterSec);
 const base={id:row.id,name:row.name,x:row.map_x,y:row.map_y,hours:row.hours,tags:parse(row.tags,[]),category:row.category,district:row.district,address:row.address,description:row.description,visualization:{status:visualization.status || 'not_started',layout:visualization.status==='ready'?visualization.layout || null:null}};
 if(row.data_mode==='demo' && parse(row.demo))return {...base,...parse(row.demo),live};
 const {open,opens}=openState(row.hours,ulaanbaatarMinutes()),{dist,walk}=walkFrom(row.map_x??500,row.map_y??340),has=['live','test'].includes(live.mode);
 return {...base,dist,walk,open:open&&has,opens:has?opens:null,note:row.description.slice(0,120),status_text:has?null:'Бодит хэмжилт хараахан ирээгүй',occ:live.free_pct!=null?100-live.free_pct:null,sound:live.noise_level||0,wifi:live.wifi_level||0,mbps:live.wifi_mbps!=null?Math.round(live.wifi_mbps):null,live};
}
export const liveUpdate=c=>({id:c.id,open:c.open,opens:c.opens,status_text:c.status_text??null,occ:c.occ,sound:c.sound,wifi:c.wifi,mbps:c.mbps,live:c.live});
export async function ownerView(db,row,staleAfterSec=30) {
 const app=await first(db,'SELECT * FROM applications WHERE cafe_id=? ORDER BY created_at LIMIT 1',row.id);
 const photos=app?await all(db,'SELECT id,mime,size,position FROM application_photos WHERE application_id=? ORDER BY position',app.id):[];
 const devices=await all(db,'SELECT * FROM devices WHERE cafe_id=? AND revoked_at IS NULL',row.id);
 const visualization=parse(row.visualization,{status:'not_started'});
 return {...row,owner_id:undefined,demo:undefined,tags:parse(row.tags,[]),application:app?{id:app.id,created_at:app.created_at,form:parse(app.form,{}),photos:photos.map(p=>({...p,url:`/api/v1/files/photos/${p.id}`}))}:null,devices:await Promise.all(devices.map(d=>deviceView(db,d,staleAfterSec))),history:await all(db,'SELECT from_status,to_status,note,at FROM status_history WHERE cafe_id=? ORDER BY id',row.id),visualization,live:await liveSummary(db,row,staleAfterSec)};
}
