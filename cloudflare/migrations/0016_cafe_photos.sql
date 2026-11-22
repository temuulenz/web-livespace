-- Public cafe gallery. Pending rows are private and can be reconciled; no legacy photo is published.
CREATE TABLE cafe_photos (
 id TEXT PRIMARY KEY, cafe_id TEXT NOT NULL REFERENCES cafes(id),
 mime TEXT NOT NULL CHECK(mime IN('image/jpeg','image/png','image/webp')),
 size INTEGER NOT NULL CHECK(size BETWEEN 1 AND 1048576),
 width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 8192),
 height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 8192),
 sha256 TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0,
 is_cover INTEGER NOT NULL DEFAULT 0 CHECK(is_cover IN(0,1)),
 ready INTEGER NOT NULL DEFAULT 0 CHECK(ready IN(0,1)),
 file TEXT, object_key TEXT, bytes BLOB, created_at TEXT NOT NULL,
 UNIQUE(id,cafe_id)
);
CREATE INDEX cafe_photos_order ON cafe_photos(cafe_id,ready,is_cover DESC,position,id);
CREATE UNIQUE INDEX cafe_photos_cover ON cafe_photos(cafe_id) WHERE is_cover=1 AND ready=1;
CREATE TRIGGER cafe_photo_capacity BEFORE INSERT ON cafe_photos
WHEN (SELECT count(*) FROM cafe_photos WHERE cafe_id=NEW.cafe_id)>=12 OR
     (SELECT coalesce(sum(size),0) FROM cafe_photos WHERE cafe_id=NEW.cafe_id)+NEW.size>12582912
BEGIN SELECT RAISE(ABORT,'cafe_photo_capacity'); END;
CREATE TRIGGER cafe_photo_tenant_immutable BEFORE UPDATE OF cafe_id ON cafe_photos
WHEN NEW.cafe_id<>OLD.cafe_id BEGIN SELECT RAISE(ABORT,'cafe_photo_tenant_immutable'); END;
CREATE TABLE cafe_photo_gc (
 id TEXT PRIMARY KEY, cafe_id TEXT NOT NULL, file TEXT, object_key TEXT,
 created_at TEXT NOT NULL
);
CREATE INDEX cafe_photo_gc_cafe ON cafe_photo_gc(cafe_id,created_at);
