import {businessCommon} from './common.mjs';
import {validatePromotion,promotionPrice,promotionActive} from './promotions.mjs';
export function createPromotionService({sql,fail,id,clock=()=>new Date().toISOString()}) {
 const c=businessCommon({sql,fail});
 const decode=p=>({...p,published:!!p.published,recurrence:p.recurrence?JSON.parse(p.recurrence):null});
 const fields=['name','kind','value','product_id','category_id','starts_at','ends_at','published','recurrence'];
 const values=p=>fields.map(k=>k==='recurrence'?(p[k]?JSON.stringify(p[k]):null):k==='published'?Number(p[k]):p[k]);
 async function get(cafe,entity){const p=await sql.first('SELECT * FROM promotions WHERE cafe_id=? AND id=?',cafe,entity);if(!p)fail(404,'not_found','Promotion not found');return decode(p);}
 async function targets(cafe,p){for(const [key,table] of [['product_id','menu_items'],['category_id','menu_categories']])if(p[key]&&!await sql.first(`SELECT id FROM ${table} WHERE cafe_id=? AND id=?`,cafe,p[key]))c.invalid('Invalid tenant target');}
 const audit=(cafe,user,entity,action,guard=false)=>[guard?'INSERT INTO business_audit(id,cafe_id,actor_id,action,entity_id,at) VALUES(CASE WHEN changes()=1 THEN ? ELSE NULL END,?,?,?,?,?)':'INSERT INTO business_audit(id,cafe_id,actor_id,action,entity_id,at) VALUES(?,?,?,?,?,?)',id('audit'),cafe,user.id,action,entity,clock()];
 // Write-time ownership fence closes the gap between asynchronous validation and D1 batch.
 const fence=(cafe,user)=>['INSERT INTO business_audit(id,cafe_id,actor_id,action,entity_id,at) VALUES(CASE WHEN EXISTS(SELECT 1 FROM cafes c JOIN users u ON u.id=c.owner_id WHERE c.id=? AND u.id=? AND u.role IN (\'owner\',\'admin\') AND u.disabled_at IS NULL) THEN ? ELSE NULL END,?,?,?,?,?)',cafe,user.id,id('audit'),cafe,user.id,'promotions.authorize',cafe,clock()];
 return {
  async list(cafe,query={},user){await c.cafe(cafe,user);const page=c.page(query),rows=await sql.all('SELECT * FROM promotions WHERE cafe_id=? ORDER BY created_at,id LIMIT ? OFFSET ?',cafe,page.limit+1,page.offset);return {items:rows.slice(0,page.limit).map(decode),pagination:{...page,has_more:rows.length>page.limit}};},
  async create(cafe,input,user){await c.cafe(cafe,user);const p=validatePromotion(input,fail);await targets(cafe,p);const entity=id('promotion'),at=clock();await sql.batch([fence(cafe,user),['INSERT INTO promotions(id,cafe_id,'+fields.join(',')+',created_at,updated_at) VALUES('+Array(13).fill('?').join(',')+')',entity,cafe,...values(p),at,at],audit(cafe,user,entity,'promotions.create')]);return {promotion:await get(cafe,entity)};},
  async update(cafe,entity,input,user){
   await c.cafe(cafe,user);c.object(input,[...fields,'version']);const old=await get(cafe,entity);if(input.version!==old.version)fail(409,'version_conflict','Supply current version');
   const p=validatePromotion({...Object.fromEntries(fields.map(k=>[k,old[k]])),...Object.fromEntries(Object.entries(input).filter(([k])=>k!=='version'))},fail);await targets(cafe,p);
   await sql.batch([fence(cafe,user),['UPDATE promotions SET '+fields.map(k=>k+'=?').join(',')+',version=version+1,updated_at=? WHERE cafe_id=? AND id=? AND version=?',...values(p),clock(),cafe,entity,input.version],audit(cafe,user,entity,'promotions.update',true)]);return {promotion:await get(cafe,entity)};
  },
  async publicList(cafe){await c.cafe(cafe,null,true);const at=clock(),rows=await sql.all('SELECT * FROM promotions WHERE cafe_id=? AND published=1 AND starts_at<=? AND ends_at>? ORDER BY id LIMIT 100',cafe,at,at);return {cafe_id:cafe,at,promotions:rows.map(decode).filter(p=>promotionActive(p,at)).map(({id,name,kind,value,product_id,category_id,starts_at,ends_at,recurrence})=>({id,name,kind,value,product_id,category_id,starts_at,ends_at,recurrence}))};},
  async preview(cafe,input,user){await c.cafe(cafe,user);c.object(input,['promotion','product_id','at']);if(typeof input.product_id!=='string')c.invalid('Product required');const p=validatePromotion(input.promotion,fail);await targets(cafe,p);const product=await sql.first('SELECT id,category_id,base_price,discounted_price FROM menu_items WHERE cafe_id=? AND id=?',cafe,input.product_id);if(!product)fail(404,'not_found','Product not found');const at=input.at??clock();if(typeof at!=='string'||!/^\d{4}-.*Z$/.test(at)||!Number.isFinite(Date.parse(at)))c.invalid('UTC preview time required');return {at,price:promotionPrice(product,[{...p,published:true,id:'preview'}],at)};}
 };
}
