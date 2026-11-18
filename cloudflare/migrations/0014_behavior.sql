
CREATE TABLE IF NOT EXISTS analytics_hourly(cafe_id TEXT NOT NULL REFERENCES cafes(id),hour TEXT NOT NULL,event_type TEXT NOT NULL,event_count INTEGER NOT NULL CHECK(event_count>=0),revision INTEGER NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(cafe_id,hour,event_type));
CREATE TABLE analytics_dimensions(cafe_id TEXT NOT NULL REFERENCES cafes(id),hour TEXT NOT NULL,event_type TEXT NOT NULL,product_id TEXT NOT NULL DEFAULT '',promotion_id TEXT NOT NULL DEFAULT '',event_count INTEGER NOT NULL CHECK(event_count>=0),revision INTEGER NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(cafe_id,hour,event_type,product_id,promotion_id));
CREATE TABLE analytics_session_days(cafe_id TEXT NOT NULL REFERENCES cafes(id),day TEXT NOT NULL,session_hash TEXT NOT NULL,PRIMARY KEY(cafe_id,day,session_hash));
CREATE TABLE analytics_cohorts(cafe_id TEXT NOT NULL REFERENCES cafes(id),day TEXT NOT NULL,event_type TEXT NOT NULL,product_id TEXT NOT NULL,promotion_id TEXT NOT NULL,session_hash TEXT NOT NULL,PRIMARY KEY(cafe_id,day,event_type,product_id,promotion_id,session_hash));
CREATE INDEX analytics_cohort_expiry ON analytics_cohorts(day);
CREATE INDEX analytics_session_expiry ON analytics_session_days(day);
CREATE INDEX analytics_dimensions_time ON analytics_dimensions(hour,cafe_id);
