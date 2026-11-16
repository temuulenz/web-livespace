export function businessSqlError(e,fail){
 const message=String(e.message)+' '+String(e.cause?.message);
 if(/business_audit.id/.test(message))fail(409,'version_conflict','Concurrent edit; retrieve current version');
 if(/menu_variant_capacity|categories BETWEEN|products BETWEEN|variants BETWEEN/.test(message))fail(409,'menu_limit','Menu capacity reached');
 if(/images BETWEEN|image_bytes BETWEEN|bytes BETWEEN|menu_gc_capacity/.test(message))fail(409,'media_budget','Media capacity reached');
 if(/reviews.cafe_id, reviews.author_id/.test(message))fail(409,'review_exists','One active review per cafe');
 if(/review_reports.review_id|review_replies.review_id/.test(message))fail(409,'review_conflict','Review report or reply already exists');
 if(/inventory_source_conflict|inventory.cafe_id|inventory.variant_id/.test(message))fail(409,'inventory_source_conflict','Conflicting inventory source');
 if(/inventory_movement|inventory.quantity/.test(message))fail(409,'inventory_conflict','Inventory mutation conflicts with durable state');
 if(/menu_image_reference|menu_image_in_use/.test(message))fail(409,'media_conflict','Media reference changed; retry');
 throw e;
}
