
CREATE TABLE menu_media_gc (
 id TEXT PRIMARY KEY NOT NULL, cafe_id TEXT NOT NULL REFERENCES cafes(id), object_key TEXT, file TEXT,
 retired_at TEXT NOT NULL, cleaned_at TEXT
);
CREATE INDEX menu_media_gc_cafe ON menu_media_gc(cafe_id,cleaned_at,id);
CREATE TRIGGER menu_gc_capacity BEFORE INSERT ON menu_media_gc
WHEN (SELECT count(*) FROM menu_media_gc)>=1000
BEGIN SELECT RAISE(ABORT,'menu_gc_capacity'); END;
CREATE TRIGGER menu_image_reference_update BEFORE UPDATE OF image_ref ON menu_items
WHEN NEW.image_ref IS NOT NULL AND NOT EXISTS(SELECT 1 FROM menu_images WHERE id=NEW.image_ref AND cafe_id=NEW.cafe_id AND ready=1)
BEGIN SELECT RAISE(ABORT,'menu_image_reference'); END;
CREATE TRIGGER menu_image_reference_insert BEFORE INSERT ON menu_items
WHEN NEW.image_ref IS NOT NULL AND NOT EXISTS(SELECT 1 FROM menu_images WHERE id=NEW.image_ref AND cafe_id=NEW.cafe_id AND ready=1)
BEGIN SELECT RAISE(ABORT,'menu_image_reference'); END;
CREATE INDEX menu_items_image ON menu_items(cafe_id,image_ref) WHERE image_ref IS NOT NULL;
CREATE TRIGGER menu_image_reference_delete BEFORE DELETE ON menu_images
WHEN EXISTS(SELECT 1 FROM menu_items WHERE cafe_id=OLD.cafe_id AND image_ref=OLD.id)
BEGIN SELECT RAISE(ABORT,'menu_image_in_use'); END;
CREATE TABLE menu_tenant_usage (
 cafe_id TEXT PRIMARY KEY NOT NULL REFERENCES cafes(id),
 categories INTEGER NOT NULL DEFAULT 0 CHECK(categories BETWEEN 0 AND 100),
 products INTEGER NOT NULL DEFAULT 0 CHECK(products BETWEEN 0 AND 1000),
 variants INTEGER NOT NULL DEFAULT 0 CHECK(variants BETWEEN 0 AND 2000),
 images INTEGER NOT NULL DEFAULT 0 CHECK(images BETWEEN 0 AND 100),
 image_bytes INTEGER NOT NULL DEFAULT 0 CHECK(image_bytes BETWEEN 0 AND 20971520)
);
INSERT INTO menu_tenant_usage(cafe_id,categories,products,variants,images,image_bytes)
SELECT c.id,(SELECT count(*) FROM menu_categories WHERE cafe_id=c.id),
 (SELECT count(*) FROM menu_items WHERE cafe_id=c.id),(SELECT count(*) FROM menu_item_variants WHERE cafe_id=c.id),
 (SELECT count(*) FROM menu_images WHERE cafe_id=c.id),(SELECT coalesce(sum(size),0) FROM menu_images WHERE cafe_id=c.id) FROM cafes c;
CREATE TABLE menu_media_usage (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 images INTEGER NOT NULL CHECK(images BETWEEN 0 AND 1000),
 bytes INTEGER NOT NULL CHECK(bytes BETWEEN 0 AND 52428800)
);
INSERT INTO menu_media_usage SELECT 1,count(*),coalesce(sum(size),0) FROM menu_images;

CREATE TRIGGER menu_categories_quota_insert AFTER INSERT ON menu_categories BEGIN
 INSERT INTO menu_tenant_usage(cafe_id,categories) VALUES(NEW.cafe_id,1)
 ON CONFLICT(cafe_id) DO UPDATE SET categories=categories+1;
 
END;
CREATE TRIGGER menu_categories_quota_delete AFTER DELETE ON menu_categories BEGIN
 UPDATE menu_tenant_usage SET categories=categories-1 WHERE cafe_id=OLD.cafe_id;
 
END;
CREATE TRIGGER menu_categories_tenant_immutable BEFORE UPDATE OF cafe_id ON menu_categories WHEN NEW.cafe_id<>OLD.cafe_id
BEGIN SELECT RAISE(ABORT,'menu_tenant_immutable'); END;

CREATE TRIGGER menu_items_quota_insert AFTER INSERT ON menu_items BEGIN
 INSERT INTO menu_tenant_usage(cafe_id,products) VALUES(NEW.cafe_id,1)
 ON CONFLICT(cafe_id) DO UPDATE SET products=products+1;
 
END;
CREATE TRIGGER menu_items_quota_delete AFTER DELETE ON menu_items BEGIN
 UPDATE menu_tenant_usage SET products=products-1 WHERE cafe_id=OLD.cafe_id;
 
END;
CREATE TRIGGER menu_items_tenant_immutable BEFORE UPDATE OF cafe_id ON menu_items WHEN NEW.cafe_id<>OLD.cafe_id
BEGIN SELECT RAISE(ABORT,'menu_tenant_immutable'); END;

CREATE TRIGGER menu_item_variants_quota_insert AFTER INSERT ON menu_item_variants BEGIN
 INSERT INTO menu_tenant_usage(cafe_id,variants) VALUES(NEW.cafe_id,1)
 ON CONFLICT(cafe_id) DO UPDATE SET variants=variants+1;
 
END;
CREATE TRIGGER menu_item_variants_quota_delete AFTER DELETE ON menu_item_variants BEGIN
 UPDATE menu_tenant_usage SET variants=variants-1 WHERE cafe_id=OLD.cafe_id;
 
END;
CREATE TRIGGER menu_item_variants_tenant_immutable BEFORE UPDATE OF cafe_id ON menu_item_variants WHEN NEW.cafe_id<>OLD.cafe_id
BEGIN SELECT RAISE(ABORT,'menu_tenant_immutable'); END;

CREATE TRIGGER menu_images_quota_insert AFTER INSERT ON menu_images BEGIN
 INSERT INTO menu_tenant_usage(cafe_id,images,image_bytes) VALUES(NEW.cafe_id,1,NEW.size)
 ON CONFLICT(cafe_id) DO UPDATE SET images=images+1,image_bytes=image_bytes+NEW.size;
 UPDATE menu_media_usage SET images=images+1,bytes=bytes+NEW.size WHERE singleton=1;
END;
CREATE TRIGGER menu_images_quota_delete AFTER DELETE ON menu_images BEGIN
 UPDATE menu_tenant_usage SET images=images-1,image_bytes=image_bytes-OLD.size WHERE cafe_id=OLD.cafe_id;
 UPDATE menu_media_usage SET images=images-1,bytes=bytes-OLD.size WHERE singleton=1;
END;
CREATE TRIGGER menu_images_tenant_immutable BEFORE UPDATE OF cafe_id ON menu_images WHEN NEW.cafe_id<>OLD.cafe_id
BEGIN SELECT RAISE(ABORT,'menu_tenant_immutable'); END;

CREATE TRIGGER menu_image_size_immutable BEFORE UPDATE OF size ON menu_images WHEN NEW.size<>OLD.size
BEGIN SELECT RAISE(ABORT,'menu_image_size_immutable'); END;
