import {businessCommon,payloadHash} from './common.mjs';
export function createInventoryService({sql,fail,id,clock=()=>new Date().toISOString(),afterCommit=async()=>{}}){
 const c=businessCommon({sql,fail});
 const reasons=['restock','manual_adjustment','correction','waste'];
 const projection=row=>({product_id:row.product_id,variant_id:row.variant_id,status:row.status,low_stock:row.mode==='quantity'&&row.quantity>0&&row.quantity<=row.low_stock_threshold,version:row.version,...(row.mode==='quantity'&&row.show_quantity?{quantity:row.quantity}:{})});
 async function publicRows(cafe,query={},targets=null){
  const {limit,offset}=c.page(query),where=['i.cafe_id=?',...(targets?[]:['i.enabled=1']),'p.published=1','p.archived=0','c.published=1','(i.variant_id IS NULL OR v.active=1)'],args=[cafe];
  if(targets){where.push("EXISTS(SELECT 1 FROM json_each(?) t WHERE json_extract(t.value,'$.product_id')=i.product_id AND json_extract(t.value,'$.variant_id') IS i.variant_id)");args.push(JSON.stringify(targets));}
  if(query.product_id){where.push('i.product_id=?');args.push(query.product_id);}
  const rows=await sql.all(`SELECT i.* FROM inventory i JOIN menu_items p ON p.id=i.product_id AND p.cafe_id=i.cafe_id JOIN menu_categories c ON c.id=p.category_id AND c.cafe_id=p.cafe_id LEFT JOIN menu_item_variants v ON v.id=i.variant_id AND v.cafe_id=i.cafe_id WHERE ${where.join(' AND ')} ORDER BY i.product_id,i.id LIMIT ? OFFSET ?`,...args,limit+1,offset);
  return {items:rows.slice(0,limit).map(row=>row.enabled?projection(row):{product_id:row.product_id,variant_id:row.variant_id,version:row.version,removed:true}),pagination:{limit,offset,has_more:rows.length>limit}};
 }
 return {
  async list(cafe,query={},user){await c.cafe(cafe,user);const {limit,offset}=c.page(query),where=['cafe_id=?'],args=[cafe];
   if(query.product_id){where.push('product_id=?');args.push(query.product_id);}
   for(const key of ['sold_out','low_stock'])if(query[key]!==undefined){if(!['true','false'].includes(query[key]))c.invalid('Invalid stock filter');where.push((query[key]==='false'?'NOT ':'')+(key==='sold_out'?"(enabled=1 AND status='sold_out')":"(enabled=1 AND mode='quantity' AND quantity>0 AND quantity<=low_stock_threshold)"));}
   const rows=await sql.all(`SELECT * FROM inventory WHERE ${where.join(' AND ')} ORDER BY product_id,id LIMIT ? OFFSET ?`,...args,limit+1,offset);return {items:rows.slice(0,limit),pagination:{limit,offset,has_more:rows.length>limit}};
  },
  async movements(cafe,query={},user){await c.cafe(cafe,user);const {limit,offset}=c.page(query),where=['cafe_id=?'],args=[cafe];for(const key of ['product_id','variant_id'])if(query[key]){where.push(key+'=?');args.push(query[key]);}const rows=await sql.all(`SELECT * FROM inventory_movements WHERE ${where.join(' AND ')} ORDER BY at DESC,id LIMIT ? OFFSET ?`,...args,limit+1,offset);return {items:rows.slice(0,limit),pagination:{limit,offset,has_more:rows.length>limit}};},
  async snapshot(cafe,query={}){
   await c.cafe(cafe,null,true);
   for(let attempt=0;attempt<2;attempt++){
    const before=(await sql.first('SELECT revision FROM inventory_revisions WHERE cafe_id=?',cafe))?.revision||0;
    const value=await publicRows(cafe,query);
    const after=(await sql.first('SELECT revision FROM inventory_revisions WHERE cafe_id=?',cafe))?.revision||0;
    if(before===after)return {cafe_id:cafe,revision:after,...value,semantics:'Missing inventory is unconfigured, not sold out.'};
   }
   fail(409,'snapshot_changed','Inventory changed during read; retry snapshot');
  },
  async mutate(cafe,input,user){
   await c.cafe(cafe,user);c.object(input,['idempotency_key','updates']);if(typeof input.idempotency_key!=='string'||! /^[A-Za-z0-9_.:-]{1,80}$/.test(input.idempotency_key)||!Array.isArray(input.updates)||input.updates.length<1||input.updates.length>5)c.invalid('Require idempotency_key and 1–5 updates');
   const hash=payloadHash(input.updates),receipt=await sql.first('SELECT * FROM inventory_receipts WHERE cafe_id=? AND request_id=?',cafe,input.idempotency_key);
   const replay=row=>{if(row.actor_id!==user.id||row.payload_hash!==hash)fail(409,'idempotency_conflict','Key already used for a different mutation');return {...JSON.parse(row.response),duplicate:true};};
   if(receipt)return replay(receipt);
   const entries=[],results=[],seen=new Set(),at=clock();
   for(const update of input.updates){
    c.object(update,['product_id','variant_id','version','mode','quantity','delta','status','low_stock_threshold','show_quantity','enabled','reason']);
    if(typeof update.product_id!=='string'||!update.product_id.length||update.product_id.length>120||(update.variant_id!=null&&(typeof update.variant_id!=='string'||!update.variant_id.length||update.variant_id.length>120))||!reasons.includes(update.reason))c.invalid('Invalid product, variant or reason');
    for(const field of ['mode','quantity','status','low_stock_threshold'])if(Object.hasOwn(update,field)&&update[field]===null)c.invalid('Null is not valid for '+field);
    c.int(update.version);const variant=update.variant_id??null,key=JSON.stringify([update.product_id,variant]);if(seen.has(key))c.invalid('Repeated target');seen.add(key);
    if(!await sql.first('SELECT id FROM menu_items WHERE cafe_id=? AND id=?',cafe,update.product_id))fail(404,'not_found','Product not found');
    if(variant&&!await sql.first('SELECT id FROM menu_item_variants WHERE cafe_id=? AND product_id=? AND id=?',cafe,update.product_id,variant))c.invalid('Variant does not belong to product');
    const old=await sql.first('SELECT * FROM inventory WHERE cafe_id=? AND product_id=? AND variant_id IS ?',cafe,update.product_id,variant);
    if(update.version!==(old?.version||0))fail(409,'version_conflict','Retrieve current inventory version');
    const mode=update.mode??old?.mode??'availability';if(!['availability','quantity'].includes(mode))c.invalid('Invalid mode');
    if(update.quantity!==undefined&&update.delta!==undefined)c.invalid('Specify exact quantity or delta');
    let quantity=mode==='quantity'?(update.quantity??old?.quantity):null;
    if(update.delta!==undefined){if(mode!=='quantity'||old?.mode!=='quantity')c.invalid('Delta requires configured quantity inventory');c.int(update.delta,-1000000000);quantity=old.quantity+update.delta;}
    if(mode==='quantity')c.int(quantity);else if(update.quantity!==undefined||update.delta!==undefined)c.invalid('Availability mode has no quantity');
    let status=update.status??old?.status??'available';if(!['available','sold_out','temporarily_unavailable'].includes(status))c.invalid('Invalid availability');
    if(mode==='quantity')status=quantity===0?'sold_out':status==='temporarily_unavailable'?status:'available';
    const threshold=c.int(update.low_stock_threshold??old?.low_stock_threshold??0);
    for(const k of ['show_quantity','enabled'])if(update[k]!==undefined&&typeof update[k]!=='boolean')c.invalid('Expected boolean '+k);
    const show=update.show_quantity===undefined?(old?.show_quantity||0):Number(update.show_quantity),enabled=update.enabled===undefined?(old?.enabled??1):Number(update.enabled);
    const next={id:old?.id||id('stock'),cafe_id:cafe,product_id:update.product_id,variant_id:variant,mode,quantity,status,low_stock_threshold:threshold,show_quantity:show,enabled,version:(old?.version||0)+1,updated_at:at};
    if(old)entries.push(['UPDATE inventory SET mode=?,quantity=?,status=?,low_stock_threshold=?,show_quantity=?,enabled=?,version=version+1,updated_at=? WHERE id=? AND cafe_id=? AND version=?',mode,quantity,status,threshold,show,enabled,at,old.id,cafe,old.version]);
    else entries.push(['INSERT INTO inventory(id,cafe_id,product_id,variant_id,mode,quantity,status,low_stock_threshold,show_quantity,enabled,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',next.id,cafe,update.product_id,variant,mode,quantity,status,threshold,show,enabled,at]);
    entries.push(['INSERT INTO business_audit(id,cafe_id,actor_id,action,entity_id,at) VALUES(CASE WHEN changes()=1 THEN ? ELSE NULL END,?,?,?,?,?)',id('audit'),cafe,user.id,'inventory.mutate',next.id,at]);
    entries.push(['INSERT INTO inventory_movements(id,cafe_id,inventory_id,product_id,variant_id,previous_quantity,new_quantity,change_amount,reason,actor_id,at,version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id('movement'),cafe,next.id,update.product_id,variant,old?.quantity??null,quantity,old?.quantity!=null&&quantity!=null?quantity-old.quantity:null,update.reason,user.id,at,next.version]);
    results.push(next);
   }
   const response={items:results,duplicate:false};
   entries.push(['INSERT INTO inventory_receipts(cafe_id,request_id,actor_id,payload_hash,response,at) VALUES(?,?,?,?,?,?)',cafe,input.idempotency_key,user.id,hash,JSON.stringify(response),at]);
   try{await sql.batch(entries);}catch(e){const saved=await sql.first('SELECT * FROM inventory_receipts WHERE cafe_id=? AND request_id=?',cafe,input.idempotency_key);if(saved)return replay(saved);throw e;}
   // Persistence and all movement/audit/receipt writes have committed before fan-out.
   try{const revision=(await sql.first('SELECT revision FROM inventory_revisions WHERE cafe_id=?',cafe))?.revision||0;const eligible=await c.cafe(cafe,null,true);if(eligible){const items=(await publicRows(cafe,{limit:'100'},results.map(({product_id,variant_id})=>({product_id,variant_id})))).items;await afterCommit({type:'inventory.changed',schemaVersion:1,cafe_id:cafe,revision,items,snapshot_url:`/api/v1/cafes/${encodeURIComponent(cafe)}/inventory`});}}catch{/* Best effort: snapshot recovery remains authoritative. */}
   return response;
  }
 };
}
