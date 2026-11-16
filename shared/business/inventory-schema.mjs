export const INVENTORY_SCHEMA = `
CREATE UNIQUE INDEX menu_variants_tenant_product ON menu_item_variants(id,cafe_id,product_id);
CREATE TABLE inventory (
 id TEXT PRIMARY KEY NOT NULL,cafe_id TEXT NOT NULL REFERENCES cafes(id),product_id TEXT NOT NULL,variant_id TEXT,
 mode TEXT NOT NULL CHECK(mode IN('availability','quantity')),
 quantity INTEGER CHECK(quantity IS NULL OR (typeof(quantity)='integer' AND quantity BETWEEN 0 AND 1000000000)),
 status TEXT NOT NULL CHECK(status IN('available','sold_out','temporarily_unavailable')),
 low_stock_threshold INTEGER NOT NULL DEFAULT 0 CHECK(typeof(low_stock_threshold)='integer' AND low_stock_threshold BETWEEN 0 AND 1000000000),
 show_quantity INTEGER NOT NULL DEFAULT 0 CHECK(show_quantity IN(0,1)),enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)),
 version INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL,
 UNIQUE(id,cafe_id),FOREIGN KEY(product_id,cafe_id) REFERENCES menu_items(id,cafe_id),
 FOREIGN KEY(variant_id,cafe_id,product_id) REFERENCES menu_item_variants(id,cafe_id,product_id),
 CHECK((mode='availability' AND quantity IS NULL) OR (mode='quantity' AND quantity IS NOT NULL AND ((quantity=0 AND status='sold_out') OR (quantity>0 AND status IN('available','temporarily_unavailable')))))
);
CREATE UNIQUE INDEX inventory_product ON inventory(cafe_id,product_id) WHERE variant_id IS NULL;
CREATE UNIQUE INDEX inventory_variant ON inventory(cafe_id,variant_id) WHERE variant_id IS NOT NULL;
CREATE INDEX inventory_cafe_status ON inventory(cafe_id,enabled,status,product_id,id);
CREATE TRIGGER inventory_source_insert BEFORE INSERT ON inventory WHEN NEW.enabled=1 AND EXISTS(
 SELECT 1 FROM inventory WHERE cafe_id=NEW.cafe_id AND product_id=NEW.product_id AND enabled=1 AND (variant_id IS NULL OR NEW.variant_id IS NULL))
BEGIN SELECT RAISE(ABORT,'inventory_source_conflict'); END;
CREATE TRIGGER inventory_source_update BEFORE UPDATE OF enabled ON inventory WHEN NEW.enabled=1 AND EXISTS(
 SELECT 1 FROM inventory WHERE cafe_id=NEW.cafe_id AND product_id=NEW.product_id AND id<>NEW.id AND enabled=1 AND (variant_id IS NULL OR NEW.variant_id IS NULL))
BEGIN SELECT RAISE(ABORT,'inventory_source_conflict'); END;
CREATE TRIGGER inventory_identity BEFORE UPDATE OF cafe_id,product_id,variant_id ON inventory
WHEN NEW.cafe_id<>OLD.cafe_id OR NEW.product_id<>OLD.product_id OR NEW.variant_id IS NOT OLD.variant_id
BEGIN SELECT RAISE(ABORT,'inventory_identity_immutable'); END;
CREATE TABLE inventory_movements (
 id TEXT PRIMARY KEY NOT NULL,cafe_id TEXT NOT NULL,inventory_id TEXT NOT NULL,product_id TEXT NOT NULL,variant_id TEXT,
 previous_quantity INTEGER,new_quantity INTEGER,change_amount INTEGER,
 reason TEXT NOT NULL CHECK(reason IN('restock','manual_adjustment','correction','waste')),
 actor_id TEXT NOT NULL,at TEXT NOT NULL,version INTEGER NOT NULL,
 FOREIGN KEY(inventory_id,cafe_id) REFERENCES inventory(id,cafe_id),UNIQUE(inventory_id,version)
);
CREATE INDEX inventory_movements_cafe ON inventory_movements(cafe_id,at DESC,id);
CREATE INDEX inventory_movements_product ON inventory_movements(cafe_id,product_id,at DESC,id);
CREATE TABLE inventory_receipts (
 cafe_id TEXT NOT NULL REFERENCES cafes(id),request_id TEXT NOT NULL,actor_id TEXT NOT NULL,payload_hash TEXT NOT NULL,response TEXT NOT NULL,at TEXT NOT NULL,
 PRIMARY KEY(cafe_id,request_id)
);
CREATE TABLE inventory_revisions(cafe_id TEXT PRIMARY KEY NOT NULL REFERENCES cafes(id),revision INTEGER NOT NULL DEFAULT 0);
CREATE TRIGGER inventory_revision_insert AFTER INSERT ON inventory BEGIN
 INSERT INTO inventory_revisions(cafe_id,revision) VALUES(NEW.cafe_id,1) ON CONFLICT(cafe_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER inventory_revision_update AFTER UPDATE ON inventory BEGIN
 INSERT INTO inventory_revisions(cafe_id,revision) VALUES(NEW.cafe_id,1) ON CONFLICT(cafe_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER inventory_movement_no_update BEFORE UPDATE ON inventory_movements BEGIN SELECT RAISE(ABORT,'inventory_movement_immutable'); END;
CREATE TRIGGER inventory_movement_no_delete BEFORE DELETE ON inventory_movements BEGIN SELECT RAISE(ABORT,'inventory_movement_immutable'); END;
`;
