// Read latest history through the existing per-device index. The compatibility
// window view remains available, but public polling must not rescan all history
// once per cafe/source. No competing latest-state table is introduced.
export const latestSensorReadingsSql = `SELECT m.*, d.connection_status, d.enabled, d.revoked_at, d.last_seen_at, d.id AS registered_id
 FROM devices d JOIN measurements m ON m.id = (
  SELECT id FROM measurements WHERE device_id=d.id AND cafe_id=d.cafe_id
   AND data_source=? AND message_id IS NOT NULL ORDER BY ts DESC,id DESC LIMIT 1
 ) WHERE d.cafe_id=? AND d.revoked_at IS NULL
 AND ?=CASE WHEN d.is_test=1 OR d.kind='simulator' THEN 'simulated' ELSE 'real' END
 ORDER BY m.ts DESC,m.id DESC`;
