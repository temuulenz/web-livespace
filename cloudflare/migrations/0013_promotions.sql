
CREATE TABLE promotions (
 id TEXT PRIMARY KEY NOT NULL,
 cafe_id TEXT NOT NULL REFERENCES cafes(id),
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
 kind TEXT NOT NULL CHECK(kind IN ('fixed','percentage')),
 value INTEGER NOT NULL CHECK(value BETWEEN 1 AND 1000000000 AND (kind<>'percentage' OR value<=100)),
 product_id TEXT,
 category_id TEXT,
 starts_at TEXT NOT NULL,
 ends_at TEXT NOT NULL CHECK(ends_at>starts_at),
 published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)),
 recurrence TEXT,
 version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 CHECK(product_id IS NULL OR category_id IS NULL),
 FOREIGN KEY(product_id,cafe_id) REFERENCES menu_items(id,cafe_id),
 FOREIGN KEY(category_id,cafe_id) REFERENCES menu_categories(id,cafe_id)
);
CREATE INDEX promotions_cafe ON promotions(cafe_id,published,ends_at);
CREATE TRIGGER promotions_capacity BEFORE INSERT ON promotions
WHEN (SELECT count(*) FROM promotions WHERE cafe_id=NEW.cafe_id)>=100
BEGIN SELECT RAISE(ABORT,'promotion_capacity'); END;
CREATE TRIGGER promotions_tenant_immutable BEFORE UPDATE OF cafe_id,id ON promotions
WHEN NEW.cafe_id<>OLD.cafe_id OR NEW.id<>OLD.id
BEGIN SELECT RAISE(ABORT,'promotion_identity'); END;
