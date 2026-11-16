// Shared atomic D1 path for ingestion and reproducible row-write measurement.
import { batch } from './core.mjs';
export function commitTelemetry(db,d,a,v,t,hash) {
    const auth='EXISTS(SELECT 1 FROM devices WHERE id=? AND token_hash=? AND cafe_id=? AND enabled=1 AND revoked_at IS NULL AND CASE WHEN is_test=1 OR kind=\'simulator\' THEN \'simulated\' ELSE \'real\' END=?)';
    const args=[d.id,a.hash,a.cafe,a.source];
    return batch(db,[
     [`INSERT INTO measurements(cafe_id,device_id,ts,received_at,is_test,raw,message_id,data_source,observed_people,occupancy_confidence,noise_rms,noise_dbfs,noise_db,noise_calibrated,battery_pct,battery_temperature_c,charging,inference_ms,uptime_seconds)
      SELECT ${Array(19).fill('?').join(',')} WHERE ${auth}`,d.cafe_id,d.id,v.timestamp,t,a.source==='simulated'?1:0,JSON.stringify(v),v.messageId,a.source,v.occupancy.observedPeople,v.occupancy.confidence,v.noise.rms,v.noise.dbfs,v.noise.calibrated?v.noise.estimatedDbSpl:null,Number(v.noise.calibrated),v.device.batteryPercent,v.device.batteryTemperatureC,v.device.charging==null?null:Number(v.device.charging),v.device.inferenceMs,v.device.uptimeSeconds,...args],
     [`UPDATE devices SET last_seen_at=?,connection_status='online',last_status=(SELECT json_object('state','online','battery_pct',battery_pct,'batteryPercent',battery_pct,'batteryTemperatureC',battery_temperature_c,'charging',json_extract(raw,'$.device.charging'),'inferenceMs',inference_ms,'uptimeSeconds',uptime_seconds) FROM measurements WHERE device_id=? AND cafe_id=? AND data_source=? AND message_id IS NOT NULL ORDER BY ts DESC,id DESC LIMIT 1) WHERE id=? AND ${auth}`,t,d.id,d.cafe_id,a.source,d.id,...args],
     [`INSERT INTO sensor_receipts(device_id,message_id,payload_hash,accepted_at) SELECT ?,?,?,? WHERE ${auth}`,d.id,v.messageId,hash,t,...args]
    ]);
}
