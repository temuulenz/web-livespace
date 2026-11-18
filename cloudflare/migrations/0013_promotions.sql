
CREATE TABLE promotions(
 id TEXT PRIMARY KEY NOT NULL,cafe_id TEXT NOT NULL REFERENCES cafes(id),title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',
 type TEXT NOT NULL CHECK(type IN('percentage','fixed_amount','product_discount','category_discount','happy_hour','student_discount','combo_announcement')),
 discount_kind TEXT CHECK(discount_kind IN('percentage','fixed_amount')),discount_value INTEGER,
 starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,schedule TEXT,terms TEXT NOT NULL DEFAULT '',
 published INTEGER NOT NULL DEFAULT 0 CHECK(published IN(0,1)),featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN(0,1)),archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN(0,1)),
 version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(id,cafe_id),CHECK(starts_at<ends_at),
 CHECK((type IN('student_discount','combo_announcement') AND discount_kind IS NULL AND discount_value IS NULL) OR
 (type NOT IN('student_discount','combo_announcement') AND discount_kind IS NOT NULL AND typeof(discount_value)='integer' AND discount_value BETWEEN 1 AND 1000000000 AND (discount_kind<>'percentage' OR discount_value<=100)))
);
CREATE INDEX promotions_tenant ON promotions(cafe_id,archived,published,starts_at,id);
CREATE TRIGGER promotion_capacity BEFORE INSERT ON promotions WHEN (SELECT count(*) FROM promotions WHERE cafe_id=NEW.cafe_id)>=100
BEGIN SELECT RAISE(ABORT,'promotion_capacity');END;
CREATE TABLE promotion_products(promotion_id TEXT NOT NULL,cafe_id TEXT NOT NULL,product_id TEXT NOT NULL,
 PRIMARY KEY(promotion_id,product_id),FOREIGN KEY(promotion_id,cafe_id) REFERENCES promotions(id,cafe_id),FOREIGN KEY(product_id,cafe_id) REFERENCES menu_items(id,cafe_id));
CREATE TABLE promotion_categories(promotion_id TEXT NOT NULL,cafe_id TEXT NOT NULL,category_id TEXT NOT NULL,
 PRIMARY KEY(promotion_id,category_id),FOREIGN KEY(promotion_id,cafe_id) REFERENCES promotions(id,cafe_id),FOREIGN KEY(category_id,cafe_id) REFERENCES menu_categories(id,cafe_id));
