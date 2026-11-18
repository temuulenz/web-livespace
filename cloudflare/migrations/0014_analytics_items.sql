-- Phase 11E: per-item (product/promotion) hourly aggregates. Aggregates only; no event identities or visitor data.
CREATE TABLE IF NOT EXISTS analytics_item_hourly(
 cafe_id TEXT NOT NULL REFERENCES cafes(id),hour TEXT NOT NULL,
 event_type TEXT NOT NULL CHECK(event_type IN('product_view','out_of_stock_view','promotion_view')),
 item_id TEXT NOT NULL,event_count INTEGER NOT NULL CHECK(event_count>=0),revision INTEGER NOT NULL,updated_at TEXT NOT NULL,
 PRIMARY KEY(cafe_id,hour,event_type,item_id));
