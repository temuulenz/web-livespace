
CREATE TABLE resource_incidents(scope TEXT NOT NULL,metric TEXT NOT NULL,level INTEGER NOT NULL,episode INTEGER NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(scope,metric));
CREATE TABLE resource_maintenance_cursor(id INTEGER PRIMARY KEY CHECK(id=1),cafe TEXT NOT NULL);
INSERT INTO resource_maintenance_cursor VALUES(1,'');
CREATE TABLE resource_controls(scope TEXT PRIMARY KEY NOT NULL,analytics_paused INTEGER NOT NULL DEFAULT 0 CHECK(analytics_paused IN(0,1)),updated_at TEXT NOT NULL,actor_id TEXT NOT NULL REFERENCES users(id));
CREATE TABLE application_limits(key TEXT PRIMARY KEY NOT NULL,value INTEGER NOT NULL);
INSERT INTO application_limits VALUES('tenant_media_bytes',20971520),('media_upload_bytes',1048576),('csv_rows',20),('csv_bytes',12000);
CREATE TRIGGER menu_media_configured_limit BEFORE INSERT ON menu_images BEGIN
 SELECT CASE WHEN ((SELECT value FROM application_limits WHERE key='media_upload_bytes')<1048576 AND NEW.size>(SELECT value FROM application_limits WHERE key='media_upload_bytes')) OR ((SELECT value FROM application_limits WHERE key='tenant_media_bytes')<20971520 AND (coalesce((SELECT image_bytes FROM menu_tenant_usage WHERE cafe_id=NEW.cafe_id),0)+NEW.size)>(SELECT value FROM application_limits WHERE key='tenant_media_bytes')) THEN RAISE(ABORT,'media_configured_limit') END;
END;
