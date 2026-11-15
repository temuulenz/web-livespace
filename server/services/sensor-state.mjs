// Read projections over the existing measurements/devices; no duplicate state store.
export function deviceStatus(db, config, device) {
  if (device.revoked_at || device.enabled === 0) return 'disabled';
  const latest = db.prepare('SELECT MAX(ts) ts FROM measurements WHERE device_id = ? AND cafe_id = ? AND message_id IS NOT NULL').get(device.id, device.cafe_id);
  if (latest.ts || device.connection_status !== 'offline') {
    if (device.connection_status !== 'online') return device.connection_status;
    if (device.last_seen_at && Date.now() - Date.parse(device.last_seen_at) > config.deviceOfflineSec * 1000) return 'offline';
    if (latest.ts && Date.now() - Date.parse(latest.ts) > config.sensorStaleAfterSec * 1000) return 'stale';
    return 'online';
  }
  // Keep original HTTP-only devices working; they do not maintain a socket.
  return device.last_seen_at && Date.now() - Date.parse(device.last_seen_at) < config.deviceOfflineSec * 1000 ? 'online' : 'offline';
}

export function sensorSnapshot(db, config, cafeId, source) {
  const rows = db.prepare(`SELECT m.*, d.connection_status, d.enabled, d.revoked_at, d.last_seen_at, d.id AS registered_id
    FROM sensor_latest_readings m JOIN devices d ON d.id = m.device_id AND d.cafe_id = m.cafe_id
    WHERE m.cafe_id = ? AND m.data_source = ? AND d.revoked_at IS NULL
      AND m.data_source = CASE WHEN d.is_test = 1 OR d.kind = 'simulator' THEN 'simulated' ELSE 'real' END
    ORDER BY m.ts DESC, m.id DESC`).all(cafeId, source);
  if (!rows.length) return null;
  const people = rows.find(r => r.observed_people != null);
  const noise = rows.find(r => r.noise_dbfs != null || r.noise_db != null || r.noise_rms != null);
  const stale = row => !row || Date.now() - Date.parse(row.ts) > config.sensorStaleAfterSec * 1000;
  const states = rows.map(row => deviceStatus(db, config, { ...row, id: row.registered_id }));
  return {
    dataSource: source, timestamp: rows[0].ts, receivedAt: rows[0].received_at,
    status: states.includes('online') ? 'online' : states.includes('stale') ? 'stale' : 'offline',
    observedPeople: people?.observed_people ?? null, confidence: people?.occupancy_confidence ?? null,
    peopleTimestamp: people?.ts ?? null, peopleStale: stale(people),
    noise: { rms: noise?.noise_rms ?? null, dbfs: noise?.noise_dbfs ?? null, estimatedDbSpl: noise?.noise_calibrated ? noise.noise_db : null, calibrated: !!noise?.noise_calibrated },
    noiseTimestamp: noise?.ts ?? null, noiseStale: stale(noise),
    // Select the latest observation; overlapping cameras must never be summed.
    deviceCount: rows.length, aggregation: 'latest_observation'
  };
}
