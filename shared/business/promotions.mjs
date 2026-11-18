import {businessCommon} from './common.mjs';
import {authorizedBatch} from './write-authorization.mjs';
const TYPES=['percentage','fixed_amount','product_discount','category_discount','happy_hour','student_discount','combo_announcement'];
const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ulaanbaatar',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function promotionState(p,at=new Date().toISOString()){
 if(!p.published||p.archived)return 'draft';if(at>=p.ends_at)return 'expired';if(at<p.starts_at)return 'upcoming';
 if(p.schedule){const schedule=typeof p.schedule==='string'?JSON.parse(p.schedule):p.schedule,parts=Object.fromEntries(formatter.formatToParts(new Date(at)).map(x=>[x.type,x.value]));
 const day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday),minute=Number(parts.hour)*60+Number(parts.minute),parse=x=>Number(x.slice(0,2))*60+Number(x.slice(3)),start=parse(schedule.start),end=parse(schedule.end);
 const active=end>start?schedule.days.includes(day)&&minute>=start&&minute<end:(minute>=start&&schedule.days.includes(day))||(minute<end&&schedule.days.includes((day+6)%7));if(!active)return 'upcoming';}
 return 'active';
}
export function createPromotionService({sql,fail,id,clock=()=>new Date().toISOString()}){
 const c=businessCommon({sql,fail});
 const fields=['title','description','type','discount_kind','discount_value','starts_at','ends_at','schedule','terms','published','featured','product_ids','category_ids','version'];
 const timestamp=value=>{if(typeof value!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value)))c.invalid('Timestamp requires timezone');const iso=new Date(value).toISOString();if(!/^\d{4}-/.test(iso))c.invalid('Unsupported timestamp year');return iso;};
 function validate(input,old){c.object(input,fields);const p={title:'',description:'',terms:'',published:0,featured:0,schedule:null,discount_kind:null,discount_value:null,product_ids:[],category_ids:[],...old,...input};
  for(const [key,max] of [['title',120],['description',2000],['terms',2000]]){if(typeof p[key]!=='string'||p[key].length>max||(key==='title'&&!p[key].trim()))c.invalid('Invalid '+key);p[key]=p[key].trim();}
  if(!TYPES.includes(p.type))c.invalid('Invalid promotion type');p.starts_at=timestamp(p.starts_at);p.ends_at=timestamp(p.ends_at);if(p.starts_at>=p.ends_at)c.invalid('End must follow start');
  for(const key of ['published','featured']){if(Object.hasOwn(input,key)&&typeof input[key]!=='boolean')c.invalid('Boolean required');p[key]=Number(p[key]);}
  if(['student_discount','combo_announcement'].includes(p.type)){if(p.discount_kind!=null||p.discount_value!=null)c.invalid('Informational promotion has no price rule');}
  else{if(['percentage','fixed_amount'].includes(p.type))p.discount_kind=p.type;if(!['percentage','fixed_amount'].includes(p.discount_kind))c.invalid('Discount kind required');c.int(p.discount_value,1,p.discount_kind==='percentage'?100:1000000000);}
  for(const key of ['product_ids','category_ids'])if(!Array.isArray(p[key])||p[key].length>20||new Set(p[key]).size!==p[key].length||p[key].some(x=>typeof x!=='string'||!x.length||x.length>120))c.invalid('Invalid associations');
  if(p.type==='product_discount'&&!p.product_ids.length)c.invalid('Product association required');if(p.type==='category_discount'&&!p.category_ids.length)c.invalid('Category association required');
  if(p.schedule!==null){if(typeof p.schedule==='string')c.invalid('Schedule must be an object');c.object(p.schedule,['days','start','end']);if(!Array.isArray(p.schedule.days)||!p.schedule.days.length||p.schedule.days.length>7||new Set(p.schedule.days).size!==p.schedule.days.length)c.invalid('Invalid schedule days');for(const d of p.schedule.days)c.int(d,0,6);for(const k of ['start','end'])if(typeof p.schedule[k]!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.schedule[k]))c.invalid('Invalid local time');if(p.schedule.start===p.schedule.end)c.invalid('Schedule interval cannot be empty');}
  return p;
 }
 async function hydrate(cafe,rows,publicOnly=false){const ids=JSON.stringify(rows.map(p=>p.id));
  const products=await sql.all(`SELECT pp.promotion_id,pp.product_id FROM promotion_products pp JOIN menu_items p ON p.id=pp.product_id AND p.cafe_id=pp.cafe_id JOIN menu_categories c ON c.id=p.category_id AND c.cafe_id=p.cafe_id WHERE pp.cafe_id=? AND pp.promotion_id IN(SELECT value FROM json_each(?)) ${publicOnly?'AND p.published=1 AND p.archived=0 AND c.published=1':''}`,cafe,ids);
  const categories=await sql.all(`SELECT pc.promotion_id,pc.category_id FROM promotion_categories pc JOIN menu_categories c ON c.id=pc.category_id AND c.cafe_id=pc.cafe_id WHERE pc.cafe_id=? AND pc.promotion_id IN(SELECT value FROM json_each(?)) ${publicOnly?'AND c.published=1':''}`,cafe,ids);
  return rows.map(p=>({...p,schedule:p.schedule?JSON.parse(p.schedule):null,product_ids:products.filter(x=>x.promotion_id===p.id).map(x=>x.product_id),category_ids:categories.filter(x=>x.promotion_id===p.id).map(x=>x.category_id)}));
 }
 async function get(cafe,entity){const row=await sql.first('SELECT * FROM promotions WHERE cafe_id=? AND id=? AND archived=0',cafe,entity);if(!row)fail(404,'not_found','Promotion not found');return (await hydrate(cafe,[row]))[0];}
 const audit=(cafe,user,entity,action,guard=false)=>['INSERT INTO business_audit(id,cafe_id,actor_id,entity_id,action,at) VALUES('+(guard?'CASE WHEN changes()=1 THEN ? ELSE NULL END':'?')+',?,?,?,?,?)',id('audit'),cafe,user.id,entity,action,clock()];
 return {
  async get(cafe,entity,user){await c.cafe(cafe,user);return get(cafe,entity);},
  async save(cafe,input,user,entity=null){await c.cafe(cafe,user);const old=entity?await get(cafe,entity):null,p=validate(input,old);if(old&&input.version!==old.version)fail(409,'version_conflict','Retrieve current promotion version');
   const key=entity||id('promotion'),at=clock(),keys=['title','description','type','discount_kind','discount_value','starts_at','ends_at','schedule','terms','published','featured'];
   const values=keys.map(k=>k==='schedule'?(p.schedule?JSON.stringify(p.schedule):null):p[k]);
   const mutation=old?[`UPDATE promotions SET ${keys.map(k=>k+'=?').join(',')},version=version+1,updated_at=? WHERE cafe_id=? AND id=? AND version=? AND archived=0`,...values,at,cafe,key,old.version]:[`INSERT INTO promotions(id,cafe_id,${keys.join(',')},created_at,updated_at) VALUES(${Array(keys.length+4).fill('?').join(',')})`,key,cafe,...values,at,at];
   const entries=[mutation,audit(cafe,user,key,old?'promotion.edit':'promotion.create',true)];
   for(const [kind,ids] of [['products',p.product_ids],['categories',p.category_ids]]){const column=kind==='products'?'product_id':'category_id',table=kind==='products'?'menu_items':'menu_categories';
    entries.push([`DELETE FROM promotion_${kind} WHERE cafe_id=? AND promotion_id=?`,cafe,key]);
    // One prepared JSON insert per association set; foreign keys fence tenancy.
    if(ids.length){const found=await sql.all(`SELECT id FROM ${table} WHERE cafe_id=? AND id IN(SELECT value FROM json_each(?))`,cafe,JSON.stringify(ids));if(found.length!==ids.length)c.invalid('Cross-cafe or missing association');entries.push([`INSERT INTO promotion_${kind}(promotion_id,cafe_id,${column}) SELECT ?,?,value FROM json_each(?)`,key,cafe,JSON.stringify(ids)]);}
   }
   await authorizedBatch(sql,fail,user,cafe,'owner',entries);return get(cafe,key);
  },
  async remove(cafe,entity,input,user){await c.cafe(cafe,user);c.object(input,['version']);const old=await get(cafe,entity);if(input.version!==old.version)fail(409,'version_conflict','Retrieve current version');await authorizedBatch(sql,fail,user,cafe,'owner',[
   ['UPDATE promotions SET archived=1,published=0,version=version+1,updated_at=? WHERE cafe_id=? AND id=? AND version=?',clock(),cafe,entity,old.version],audit(cafe,user,entity,'promotion.archive',true)]);return {archived:true};},
  async list(cafe,query={},user=null,publicOnly=false){await c.cafe(cafe,user,publicOnly);const {limit,offset}=c.page(query);if(query.state&&!['active','upcoming','expired','draft'].includes(query.state))c.invalid('Invalid state');
   // At most 100 per tenant. Filter schedules before pagination, not after LIMIT.
   const rows=await sql.all("SELECT p.*,EXISTS(SELECT 1 FROM promotion_products pp WHERE pp.promotion_id=p.id) has_products,EXISTS(SELECT 1 FROM promotion_categories pc WHERE pc.promotion_id=p.id) has_categories FROM promotions p WHERE cafe_id=? AND archived=0 "+(publicOnly?'AND published=1 ':'')+'ORDER BY starts_at,id LIMIT 100',cafe);
   const at=clock(),eligible=rows.filter(p=>(!publicOnly||promotionState(p,at)==='active')&&(!query.state||promotionState(p,at)===query.state));
   const hydrated=await hydrate(cafe,eligible,publicOnly);
   const visible=hydrated.filter(p=>!publicOnly||(!p.has_products||p.product_ids.length)&&(!p.has_categories||p.category_ids.length));
   return {items:visible.slice(offset,offset+limit).map(({has_products,has_categories,...p})=>({...p,state:promotionState(p,at)})),pagination:{limit,offset,has_more:visible.length>offset+limit}};
  },
  async preview(cafe,input,user){await c.cafe(cafe,user);c.object(input,['product_id','variant_id','at','promotion_id']);if(typeof input.product_id!=='string'||!input.product_id.length||input.product_id.length>120)c.invalid('Product ID required');for(const k of ['variant_id','promotion_id'])if(input[k]!==undefined&&!(k==='variant_id'&&input[k]===null)&&(typeof input[k]!=='string'||!input[k].length||input[k].length>120))c.invalid('Invalid '+k);if(input.at!==undefined)timestamp(input.at);const product=await sql.first('SELECT * FROM menu_items WHERE cafe_id=? AND id=? AND archived=0',cafe,input.product_id);if(!product)fail(404,'not_found','Product not found');let price=product.discounted_price??product.base_price;
   if(input.variant_id){const v=await sql.first('SELECT * FROM menu_item_variants WHERE cafe_id=? AND product_id=? AND id=? AND active=1',cafe,product.id,input.variant_id);if(!v)c.invalid('Variant does not belong to product');price=v.discounted_price??v.price;}
   const at=input.at?timestamp(input.at):clock(),rows=input.promotion_id?[await get(cafe,input.promotion_id)]:await hydrate(cafe,await sql.all('SELECT * FROM promotions WHERE cafe_id=? AND archived=0 AND published=1 ORDER BY id LIMIT 100',cafe));
   const candidates=rows.filter(p=>promotionState({...p,published:input.promotion_id?1:p.published},at)==='active'&&p.discount_kind&&(!p.product_ids.length||p.product_ids.includes(product.id))&&(!p.category_ids.length||p.category_ids.includes(product.category_id))).map(p=>({id:p.id,price:Math.max(0,price-(p.discount_kind==='percentage'?Math.floor(price*p.discount_value/100):p.discount_value))})).sort((a,b)=>a.price-b.price||(a.id<b.id?-1:a.id>b.id?1:0));
   const selected=candidates[0];return {product_id:product.id,variant_id:input.variant_id??null,at,currency:'MNT',listed_price:price,resulting_price:selected?.price??price,applied_promotion_id:selected?.id??null,stacking:false};
  }
 };
}
