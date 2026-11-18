// LIMIT 0 resolves required columns without scanning user or telemetry rows.
// Optional R2/KV and not-yet-implemented features are deliberately not probed.
export const READINESS_SQL=`SELECT u.auth_version,s.user_auth_version,c.status,d.enabled,m.message_id,r.payload_hash,mi.version,i.version,rv.version
 FROM users u,sessions s,cafes c,devices d,measurements m,sensor_receipts r,menu_items mi,inventory i,reviews rv,promotions p LIMIT 0`;
export async function databaseReady(sql){try{await sql.first(READINESS_SQL);return true;}catch{return false;}}
export const readinessPayload=ok=>ok?{ok:true}:{ok:false,error:{code:'not_ready',message:'Service temporarily unavailable'}};
