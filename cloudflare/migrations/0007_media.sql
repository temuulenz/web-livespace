-- Optional R2 pointers; legacy photo_bytes and application_photos remain intact.
CREATE TABLE media_objects (
 photo_id TEXT PRIMARY KEY REFERENCES application_photos(id) ON DELETE CASCADE,
 cafe_id TEXT NOT NULL REFERENCES cafes(id),
 object_key TEXT NOT NULL UNIQUE,
 visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('public','private')),
 sha256 TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX media_objects_cafe ON media_objects(cafe_id);
-- Durable staging journal enables crash/orphan reconciliation without deleting
-- successfully committed objects following an ambiguous D1 response.
CREATE TABLE media_staging (
 object_key TEXT PRIMARY KEY,
 photo_id TEXT NOT NULL,
 cafe_id TEXT NOT NULL,
 size INTEGER NOT NULL,
 created_at TEXT NOT NULL
);
