export const NOTIFICATIONS_SCHEMA=`
CREATE TABLE notification_outbox(id TEXT PRIMARY KEY NOT NULL,cafe_id TEXT REFERENCES cafes(id),category TEXT NOT NULL,entity_id TEXT NOT NULL,recipient_id TEXT REFERENCES users(id),available_at TEXT NOT NULL,created_at TEXT NOT NULL,processed_at TEXT,attempts INTEGER NOT NULL DEFAULT 0);
CREATE INDEX notification_due ON notification_outbox(processed_at,available_at,id);
CREATE TABLE notifications(id TEXT PRIMARY KEY NOT NULL,recipient_id TEXT NOT NULL REFERENCES users(id),cafe_id TEXT REFERENCES cafes(id),category TEXT NOT NULL,entity_id TEXT NOT NULL,event_id TEXT NOT NULL,created_at TEXT NOT NULL,severity TEXT NOT NULL DEFAULT 'info',read_at TEXT,UNIQUE(recipient_id,event_id));
CREATE INDEX notifications_recipient ON notifications(recipient_id,created_at DESC,id);
CREATE INDEX notifications_unread ON notifications(recipient_id,read_at);
CREATE TABLE notification_deliveries(event_id TEXT NOT NULL,recipient_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('in_app','suppressed')),PRIMARY KEY(event_id,recipient_id));
CREATE TABLE notification_preferences(user_id TEXT NOT NULL REFERENCES users(id),category TEXT NOT NULL,enabled INTEGER NOT NULL CHECK(enabled IN(0,1)),PRIMARY KEY(user_id,category));
CREATE TABLE notification_incidents(device_id TEXT PRIMARY KEY NOT NULL REFERENCES devices(id),active INTEGER NOT NULL,incident TEXT NOT NULL);
CREATE TABLE notification_cooldowns(recipient_id TEXT NOT NULL,category TEXT NOT NULL,entity_id TEXT NOT NULL,last_at TEXT NOT NULL,PRIMARY KEY(recipient_id,category,entity_id));
CREATE TABLE notification_budgets(recipient_id TEXT NOT NULL,day TEXT NOT NULL,n INTEGER NOT NULL,PRIMARY KEY(recipient_id,day));
CREATE TRIGGER notify_review AFTER INSERT ON reviews BEGIN
 INSERT OR IGNORE INTO notification_outbox VALUES('review:'||NEW.id,NEW.cafe_id,'review_submitted',NEW.id,NULL,NEW.created_at,NEW.created_at,NULL,0);
END;
CREATE TRIGGER notify_reply_insert AFTER INSERT ON review_replies BEGIN
 INSERT OR IGNORE INTO notification_outbox SELECT 'reply:'||NEW.review_id||':'||NEW.version,NEW.cafe_id,'review_reply',NEW.review_id,r.author_id,NEW.updated_at,NEW.updated_at,NULL,0 FROM reviews r WHERE r.id=NEW.review_id AND r.deleted_at IS NULL;
END;
CREATE TRIGGER notify_reply_update AFTER UPDATE OF version ON review_replies BEGIN
 INSERT OR IGNORE INTO notification_outbox SELECT 'reply:'||NEW.review_id||':'||NEW.version,NEW.cafe_id,'review_reply',NEW.review_id,r.author_id,NEW.updated_at,NEW.updated_at,NULL,0 FROM reviews r WHERE r.id=NEW.review_id AND r.deleted_at IS NULL;
END;
CREATE TRIGGER notify_stock_insert AFTER INSERT ON inventory WHEN NEW.enabled=1 AND (NEW.status<>'available' OR (NEW.mode='quantity' AND NEW.quantity<=NEW.low_stock_threshold)) BEGIN
 INSERT OR IGNORE INTO notification_outbox VALUES('stock:'||NEW.id||':'||NEW.version,NEW.cafe_id,'inventory',NEW.id,NULL,NEW.updated_at,NEW.updated_at,NULL,0);
END;
CREATE TRIGGER notify_stock_update AFTER UPDATE ON inventory WHEN NEW.enabled=1 AND (NEW.status='sold_out' AND OLD.status<>'sold_out' OR NEW.mode='quantity' AND NEW.quantity<=NEW.low_stock_threshold AND (OLD.quantity IS NULL OR OLD.quantity>OLD.low_stock_threshold OR OLD.enabled=0)) BEGIN
 INSERT OR IGNORE INTO notification_outbox VALUES('stock:'||NEW.id||':'||NEW.version,NEW.cafe_id,'inventory',NEW.id,NULL,NEW.updated_at,NEW.updated_at,NULL,0);
END;
CREATE TRIGGER notify_moderation AFTER INSERT ON review_moderation_audit BEGIN
 INSERT OR IGNORE INTO notification_outbox SELECT 'moderation-author:'||NEW.id,NEW.cafe_id,'moderation',NEW.review_id,r.author_id,NEW.at,NEW.at,NULL,0 FROM reviews r WHERE r.id=NEW.review_id;
 INSERT OR IGNORE INTO notification_outbox VALUES('moderation-owner:'||NEW.id,NEW.cafe_id,'moderation',NEW.review_id,NULL,NEW.at,NEW.at,NULL,0);
END;
CREATE TRIGGER notify_promotion_insert AFTER INSERT ON promotions WHEN NEW.published=1 BEGIN
 INSERT OR IGNORE INTO notification_outbox VALUES('promotion:'||NEW.id||':'||NEW.version,NEW.cafe_id,'promotion',NEW.id,NULL,MAX(NEW.starts_at,NEW.updated_at),NEW.updated_at,NULL,0);
END;
CREATE TRIGGER notify_promotion_publish AFTER UPDATE OF published ON promotions WHEN NEW.published=1 AND OLD.published=0 BEGIN
 INSERT OR IGNORE INTO notification_outbox VALUES('promotion:'||NEW.id||':'||NEW.version,NEW.cafe_id,'promotion',NEW.id,NULL,MAX(NEW.starts_at,NEW.updated_at),NEW.updated_at,NULL,0);
END;
CREATE TRIGGER notify_sensor_offline AFTER UPDATE OF connection_status ON devices WHEN NEW.cafe_id=OLD.cafe_id AND NEW.connection_status='offline' AND OLD.connection_status<>'offline' AND NEW.last_seen_at IS NOT NULL AND NEW.enabled=1 AND NEW.revoked_at IS NULL AND NEW.is_test=0 AND NEW.kind<>'simulator' BEGIN
 INSERT INTO notification_incidents VALUES(NEW.id,1,NEW.last_seen_at) ON CONFLICT(device_id) DO UPDATE SET active=1,incident=NEW.last_seen_at;
 INSERT OR IGNORE INTO notification_outbox VALUES('sensor-offline:'||NEW.id||':'||NEW.last_seen_at,NEW.cafe_id,'sensor_offline',NEW.id,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL,0);
END;
CREATE TRIGGER notify_sensor_recovered AFTER UPDATE OF connection_status ON devices WHEN NEW.cafe_id=OLD.cafe_id AND NEW.enabled=1 AND NEW.revoked_at IS NULL AND NEW.is_test=0 AND NEW.kind<>'simulator' AND NEW.connection_status='online' AND OLD.connection_status<>'online' AND EXISTS(SELECT 1 FROM notification_incidents WHERE device_id=NEW.id AND active=1) BEGIN
 INSERT OR IGNORE INTO notification_outbox SELECT 'sensor-recovered:'||NEW.id||':'||incident,NEW.cafe_id,'sensor_recovered',NEW.id,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL,0 FROM notification_incidents WHERE device_id=NEW.id;
 UPDATE notification_incidents SET active=0 WHERE device_id=NEW.id;
END;
`;
