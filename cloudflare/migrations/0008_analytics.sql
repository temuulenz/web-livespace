-- No event identities or individual visitor histories in D1.
CREATE TABLE analytics_hourly (
 cafe_id TEXT NOT NULL REFERENCES cafes(id),
 hour TEXT NOT NULL,
 event_type TEXT NOT NULL,
 event_count INTEGER NOT NULL CHECK(event_count>=0),
 revision INTEGER NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(cafe_id,hour,event_type)
);
