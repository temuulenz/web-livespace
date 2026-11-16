import {notifyCafe} from './browser-rooms.mjs';
import { deviceAuth, source, body, batch, json, now, fail } from './core.mjs';
import { validateMeasurement } from '../server/lib/sensor-schema.mjs';
export async function ingest(req,db,limit,env,ctx) {
 let d=await deviceAuth(db,req.headers.get('authorization'));limit(`ingest:${d.id}`,120,60000);
 const x=await body(req,524288);d=await deviceAuth(db,req.headers.get('authorization'));
 const frames=Array.isArray(x.measurements_batch)?x.measurements_batch.slice(0,100):[x],accepted=[],results=[];
 for(const [index,frame]of frames.entries()) {
  const {value,errors}=validateMeasurement(frame);
  if(!errors.length && value.device_id!==d.id)errors.push({path:'device_id',message:'does not match the token'});
  if(!errors.length && value.cafe_id!==d.cafe_id)errors.push({path:'cafe_id',message:'device is not registered to this cafe'});
  results.push({index,accepted:!errors.length,...(errors.length?{errors}:{})});if(!errors.length)accepted.push(value);
 }
 if(accepted.length) {
  const t=now(),simulated=source(d)==='simulated',auth='EXISTS(SELECT 1 FROM devices WHERE id=? AND token_hash=? AND cafe_id=? AND enabled=1 AND revoked_at IS NULL AND is_test=? AND kind=?)',args=[d.id,d.token_hash,d.cafe_id,d.is_test,d.kind];
  const entries=accepted.map(v=>{const m=v.measurements;return [`INSERT INTO measurements(cafe_id,device_id,ts,received_at,available_seats,occupied_seats,total_seats,noise_db,wifi_quality,wifi_down_mbps,wifi_up_mbps,wifi_latency_ms,temperature_c,humidity_pct,co2_ppm,is_test,raw,data_source) SELECT ${Array(18).fill('?').join(',')} WHERE ${auth}`,v.cafe_id,v.device_id,v.timestamp,t,m.available_seats??null,m.occupied_seats??null,m.total_seats??null,m.noise_level_db??null,m.wifi_quality??null,m.wifi_download_mbps??null,m.wifi_upload_mbps??null,m.wifi_latency_ms??null,m.temperature_c??null,m.humidity_pct??null,m.co2_ppm??null,Number(simulated),JSON.stringify(v),source(d),...args];});
  entries.push([`UPDATE devices SET last_seen_at=?,last_status=?,connection_status='online' WHERE id=? AND ${auth}`,t,JSON.stringify(accepted.at(-1).device_status || {state:'online'}),d.id,...args]);
  const committed=await batch(db,entries);if(!committed[0].meta.changes)fail(401,'device_assignment_changed','Device authorization changed');
  if(env)ctx?.waitUntil(Promise.resolve(notifyCafe(env,d.cafe_id)).catch(()=>{}));
 }
 return json({accepted:accepted.length,rejected:frames.length-accepted.length,results},accepted.length===frames.length?202:accepted.length?207:422);
}
