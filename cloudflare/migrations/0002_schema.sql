ALTER TABLE devices ADD COLUMN connection_status TEXT NOT NULL DEFAULT 'offline'
     CHECK (connection_status IN ('online', 'stale', 'offline'));
   CREATE INDEX devices_token ON devices(token_hash);
   ALTER TABLE measurements ADD COLUMN message_id TEXT;
   ALTER TABLE measurements ADD COLUMN data_source TEXT NOT NULL DEFAULT 'real'
     CHECK (data_source IN ('real', 'simulated', 'manual'));
   ALTER TABLE measurements ADD COLUMN observed_people INTEGER;
   ALTER TABLE measurements ADD COLUMN occupancy_confidence REAL;
   ALTER TABLE measurements ADD COLUMN noise_rms REAL;
   ALTER TABLE measurements ADD COLUMN noise_dbfs REAL;
   ALTER TABLE measurements ADD COLUMN noise_calibrated INTEGER;
   ALTER TABLE measurements ADD COLUMN battery_pct REAL;
   ALTER TABLE measurements ADD COLUMN battery_temperature_c REAL;
   ALTER TABLE measurements ADD COLUMN charging INTEGER;
   ALTER TABLE measurements ADD COLUMN inference_ms REAL;
   ALTER TABLE measurements ADD COLUMN uptime_seconds INTEGER;
   UPDATE measurements SET data_source = 'simulated', is_test = 1
     WHERE is_test = 1 OR device_id IN (SELECT id FROM devices WHERE kind = 'simulator');
   UPDATE devices SET is_test = 1 WHERE kind = 'simulator';
   CREATE UNIQUE INDEX measurements_message ON measurements(device_id, message_id) WHERE message_id IS NOT NULL;
   CREATE INDEX measurements_sensor_latest ON measurements(device_id, cafe_id, data_source, ts DESC, id DESC);
   CREATE INDEX measurements_source_ts ON measurements(data_source, ts);
   -- Keep small receipts even when optional history retention is enabled.
   CREATE TABLE sensor_receipts (
     device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
     message_id TEXT NOT NULL,
     payload_hash TEXT NOT NULL,
     accepted_at TEXT NOT NULL,
     PRIMARY KEY (device_id, message_id)
   );
   CREATE VIEW sensor_latest_readings AS
     SELECT * FROM (
       SELECT m.*, ROW_NUMBER() OVER (
         PARTITION BY device_id, cafe_id, data_source ORDER BY ts DESC, id DESC
       ) AS latest_rank FROM measurements m WHERE message_id IS NOT NULL
     ) WHERE latest_rank = 1;
