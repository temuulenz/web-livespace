// Identical additive schema for SQLite and D1. Composite keys enforce tenancy.
export const MENU_SCHEMA = `
CREATE TABLE menu_categories (
 id TEXT PRIMARY KEY NOT NULL, cafe_id TEXT NOT NULL REFERENCES cafes(id),
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120), description TEXT NOT NULL DEFAULT '',
 display_order INTEGER NOT NULL DEFAULT 0, published INTEGER NOT NULL DEFAULT 0 CHECK(published IN(0,1)),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 UNIQUE(id,cafe_id)
);
CREATE INDEX menu_categories_order ON menu_categories(cafe_id,published,display_order,id);
CREATE TABLE menu_items (
 id TEXT PRIMARY KEY NOT NULL, cafe_id TEXT NOT NULL REFERENCES cafes(id), category_id TEXT NOT NULL,
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120), description TEXT NOT NULL DEFAULT '', image_ref TEXT,
 base_price INTEGER NOT NULL CHECK(typeof(base_price)='integer' AND base_price BETWEEN 0 AND 1000000000),
 discounted_price INTEGER CHECK(discounted_price IS NULL OR (typeof(discounted_price)='integer' AND discounted_price BETWEEN 0 AND base_price)),
 featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN(0,1)), published INTEGER NOT NULL DEFAULT 0 CHECK(published IN(0,1)),
 archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN(0,1)), display_order INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 UNIQUE(id,cafe_id), FOREIGN KEY(category_id,cafe_id) REFERENCES menu_categories(id,cafe_id)
);
CREATE INDEX menu_items_order ON menu_items(cafe_id,archived,published,display_order,id);
CREATE INDEX menu_items_category ON menu_items(cafe_id,category_id,archived,display_order,id);
CREATE TABLE menu_item_variants (
 id TEXT PRIMARY KEY NOT NULL, product_id TEXT NOT NULL, cafe_id TEXT NOT NULL REFERENCES cafes(id),
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
 price INTEGER NOT NULL CHECK(typeof(price)='integer' AND price BETWEEN 0 AND 1000000000),
 discounted_price INTEGER CHECK(discounted_price IS NULL OR (typeof(discounted_price)='integer' AND discounted_price BETWEEN 0 AND price)),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)), display_order INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 FOREIGN KEY(product_id,cafe_id) REFERENCES menu_items(id,cafe_id)
);
CREATE INDEX menu_variants_product ON menu_item_variants(cafe_id,product_id,active,display_order,id);
CREATE TABLE business_audit (
 id TEXT PRIMARY KEY NOT NULL, cafe_id TEXT NOT NULL REFERENCES cafes(id), actor_id TEXT NOT NULL,
 action TEXT NOT NULL, entity_id TEXT NOT NULL, at TEXT NOT NULL
);
CREATE TABLE menu_images (
 id TEXT PRIMARY KEY NOT NULL, cafe_id TEXT NOT NULL REFERENCES cafes(id),
 mime TEXT NOT NULL, size INTEGER NOT NULL CHECK(size BETWEEN 1 AND 1048576),
 object_key TEXT, file TEXT, bytes BLOB, sha256 TEXT NOT NULL,
 ready INTEGER NOT NULL DEFAULT 0 CHECK(ready IN(0,1)), created_at TEXT NOT NULL,
 UNIQUE(cafe_id,sha256)
);
CREATE INDEX menu_images_cafe ON menu_images(cafe_id,created_at);
CREATE TRIGGER menu_variant_capacity_insert BEFORE INSERT ON menu_item_variants
WHEN (SELECT count(*) FROM menu_item_variants WHERE cafe_id=NEW.cafe_id AND product_id=NEW.product_id)>=20
BEGIN SELECT RAISE(ABORT,'menu_variant_capacity'); END;
CREATE TRIGGER menu_variant_capacity_update BEFORE UPDATE OF product_id ON menu_item_variants
WHEN NEW.product_id<>OLD.product_id AND (SELECT count(*) FROM menu_item_variants WHERE cafe_id=NEW.cafe_id AND product_id=NEW.product_id)>=20
BEGIN SELECT RAISE(ABORT,'menu_variant_capacity'); END;
CREATE TRIGGER business_audit_immutable_update BEFORE UPDATE ON business_audit
BEGIN SELECT RAISE(ABORT,'business_audit_immutable'); END;
CREATE TRIGGER business_audit_immutable_delete BEFORE DELETE ON business_audit
BEGIN SELECT RAISE(ABORT,'business_audit_immutable'); END;
CREATE INDEX business_audit_cafe ON business_audit(cafe_id,at,id);
`;
