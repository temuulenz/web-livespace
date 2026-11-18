-- Measured empty legacy projection previously walked every Android row.
-- Android people/dBFS-only readings do not enter this partial index.
CREATE INDEX measurements_legacy_latest ON measurements(cafe_id,is_test,ts DESC,id DESC)
WHERE available_seats IS NOT NULL OR occupied_seats IS NOT NULL OR noise_db IS NOT NULL OR wifi_quality IS NOT NULL OR wifi_down_mbps IS NOT NULL;
