import {authorizedBatch} from './write-authorization.mjs';
import {businessSqlError} from './sql-errors.mjs';
import {parseMenuCsv,previewHash} from './menu-csv.mjs';
// Runtime-neutral service. Adapters supply prepared SQL and atomic batch writes.
const types = {
 categories: { table:'menu_categories', fields:['name','description','display_order','published'], required:['name'] },
 products: { table:'menu_items', fields:['category_id','name','description','base_price','discounted_price','featured','published','archived','display_order'], required:['category_id','name','base_price'] },
 variants: { table:'menu_item_variants', fields:['product_id','name','price','discounted_price','active','display_order'], required:['product_id','name','price'] }
};
export function createMenuService({sql:storage,fail,id,clock=()=>new Date().toISOString()}) {
 const sql={...storage,batch:async entries=>{try{return await storage.batch(entries);}catch(e){businessSqlError(e,fail);}}};
 const commit=(cafe,user,entries)=>authorizedBatch(sql,fail,user,cafe,'owner',entries);
 const invalid=message=>fail(422,'validation_failed',message);
 async function cafe(cafeId,user,publicOnly=false) {
  if(!publicOnly){if(!user)fail(401,'unauthorized','Sign in required');if(!['owner','admin'].includes(user.role))fail(403,'forbidden','Owner role required');}
  const row=await sql.first('SELECT id,owner_id,status FROM cafes WHERE id=?',cafeId);
  if(!row || (publicOnly?row.status!=='active':row.owner_id!==user.id&&!user.is_super_admin))fail(404,'not_found','Cafe not found');
 }
 function spec(kind){if(!types[kind])fail(404,'not_found','Unknown menu entity');return types[kind];}
 function validate(kind,input,old) {
  const t=spec(kind);
  if(!input||typeof input!=='object'||Array.isArray(input))invalid('Expected JSON object');
  for(const key of Object.keys(input))if(!t.fields.includes(key)&&key!=='version')invalid('Unknown field: '+key);
  const out={};
  for(const key of t.fields)if(Object.hasOwn(input,key)) {
   let value=input[key];
   if(['name','description','category_id','product_id'].includes(key)){
    if(typeof value!=='string'||value.length>(key==='description'?2000:120)|| (key!=='description'&&!value.trim()))invalid('Invalid '+key);
    value=value.trim();
   } else if(['published','featured','archived','active'].includes(key)) {if(typeof value!=='boolean')invalid('Expected boolean '+key);value=Number(value);}
   else if(key==='discounted_price'&&value===null){}
   else if(!Number.isSafeInteger(value)||value<0||value>1000000000)invalid('Invalid integer '+key);
   out[key]=value;
  }
  const merged={...old,...out};
  for(const key of t.required)if(merged[key]===undefined)invalid('Required '+key);
  const price=merged.base_price??merged.price;
  if(merged.discounted_price!=null&&merged.discounted_price>price)invalid('Discount must not exceed price');
  return out;
 }
 async function relations(cafeId,kind,value) {
  const relation=kind==='products'?['menu_categories','category_id']:kind==='variants'?['menu_items','product_id']:null;
  if(relation&&!await sql.first(`SELECT id FROM ${relation[0]} WHERE id=? AND cafe_id=?`,value[relation[1]],cafeId))invalid('Invalid tenant relationship');
 }
 const audit=(cafeId,user,action,entity)=>['INSERT INTO business_audit(id,cafe_id,actor_id,action,entity_id,at) VALUES(?,?,?,?,?,?)',id('audit'),cafeId,user.id,action,entity,clock()];
 async function get(cafeId,kind,entityId){const t=spec(kind);const row=await sql.first(`SELECT * FROM ${t.table} WHERE cafe_id=? AND id=?`,cafeId,entityId);if(!row)fail(404,'not_found','Menu entity not found');return row;}
 const service = {
  async list(cafeId,kind,query={},user) {
   await cafe(cafeId,user);const t=spec(kind),limit=integer(query.limit,50,1,100),offset=integer(query.offset,0,0,10000);
   const where=['cafe_id=?'],args=[cafeId];
   if(query.q!==undefined){if(typeof query.q!=='string'||query.q.length>120)invalid('Invalid search');where.push('instr(lower(name),lower(?))>0');args.push(query.q);}
   for(const key of ['published','archived','featured','active','category_id','product_id'])if(query[key]!==undefined){if(!t.fields.includes(key))invalid('Unsupported filter');where.push(`${key}=?`);if(key.endsWith('_id'))args.push(query[key]);else{if(!['true','false'].includes(query[key]))invalid('Invalid filter');args.push(Number(query[key]==='true'));}}
   const rows=await sql.all(`SELECT * FROM ${t.table} WHERE ${where.join(' AND ')} ORDER BY display_order,id LIMIT ? OFFSET ?`,...args,limit+1,offset);
   return {items:rows.slice(0,limit),pagination:{limit,offset,has_more:rows.length>limit}};
  },
  async get(cafeId,kind,entityId,user){await cafe(cafeId,user);return get(cafeId,kind,entityId);},
  async create(cafeId,kind,input,user){
   await cafe(cafeId,user);const t=spec(kind),value=validate(kind,input);await relations(cafeId,kind,value);
   const entity=id(kind),at=clock(),keys=['id','cafe_id',...Object.keys(value),'created_at','updated_at'];
   await commit(cafeId,user,[[`INSERT INTO ${t.table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`,entity,cafeId,...Object.values(value),at,at],audit(cafeId,user,kind+'.create',entity)]);
   return get(cafeId,kind,entity);
  },
  async update(cafeId,kind,entityId,input,user){
   await cafe(cafeId,user);const t=spec(kind),old=await get(cafeId,kind,entityId),value=validate(kind,input,old);
   if(!Number.isSafeInteger(input.version)||input.version!==old.version)fail(409,'version_conflict','Supply current version');
   if(!Object.keys(value).length)invalid('No changes');await relations(cafeId,kind,{...old,...value});
   // Guard statement fails the entire batch on a concurrent version change.
   await commit(cafeId,user,[[`UPDATE ${t.table} SET ${Object.keys(value).map(k=>k+'=?').join(',')}, updated_at=?,version=version+1 WHERE cafe_id=? AND id=? AND version=?`,...Object.values(value),clock(),cafeId,entityId,input.version],
    ['INSERT INTO business_audit(id,cafe_id,actor_id,action,entity_id,at) VALUES(CASE WHEN changes()=1 THEN ? ELSE NULL END,?,?,?,?,?)',id('audit'),cafeId,user.id,kind+'.update',entityId,clock()]]);
   return get(cafeId,kind,entityId);
  },
  async remove(cafeId,kind,entityId,user){
   await cafe(cafeId,user);const old=await get(cafeId,kind,entityId);
   if(kind!=='categories')return this.update(cafeId,kind,entityId,{version:old.version,...(kind==='products'?{archived:true,published:false}:{active:false})},user);
   if(await sql.first('SELECT id FROM menu_items WHERE cafe_id=? AND category_id=? LIMIT 1',cafeId,entityId))fail(409,'category_in_use','Move products before deleting category');
   await commit(cafeId,user,[['DELETE FROM menu_categories WHERE cafe_id=? AND id=?',cafeId,entityId],audit(cafeId,user,'categories.delete',entityId)]);return {deleted:true};
  },
  async bulk(cafeId,kind,input,user) {
   await cafe(cafeId,user);const t=spec(kind);
   if(!input||!Array.isArray(input.items)||input.items.length<1||input.items.length>10)invalid('Expected 1–10 items');
   const entries=[],seen=new Set();
   for(const item of input.items){
    if(!item||typeof item.id!=='string'||seen.has(item.id))invalid('Invalid or repeated item');seen.add(item.id);
    const {id:entity,...patch}=item,old=await get(cafeId,kind,entity),value=validate(kind,patch,old);
    if(!Number.isSafeInteger(patch.version)||patch.version!==old.version)fail(409,'version_conflict','Supply current versions');
    if(!Object.keys(value).length)invalid('No changes');await relations(cafeId,kind,{...old,...value});
    entries.push([`UPDATE ${t.table} SET ${Object.keys(value).map(k=>k+'=?').join(',')},updated_at=?,version=version+1 WHERE cafe_id=? AND id=? AND version=?`,...Object.values(value),clock(),cafeId,entity,patch.version]);
    entries.push(['INSERT INTO business_audit(id,cafe_id,actor_id,action,entity_id,at) VALUES(CASE WHEN changes()=1 THEN ? ELSE NULL END,?,?,?,?,?)',id('audit'),cafeId,user.id,kind+'.bulk',entity,clock()]);
   }
   await commit(cafeId,user,entries);return {updated:input.items.length};
  },
  async importCsv(cafeId,input,user,confirm=false) {
   await cafe(cafeId,user);
   if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['csv','preview_id','confirm'].includes(k)))invalid('Invalid import request');
   const rows=parseMenuCsv(input.csv,fail);
   for(const row of rows){validate('products',row);await relations(cafeId,'products',row);}
   const preview_id=previewHash(cafeId,user.id,input.csv);
   if(!confirm)return {preview_id,products:rows,published:false,requires_confirmation:true};
   if(input.confirm!==true||input.preview_id!==preview_id)fail(409,'preview_mismatch','Confirm the exact validated preview');
   // Import receipts make an explicit confirmation safe to retry.
   const receipt=await sql.first('SELECT id FROM business_audit WHERE id=?','import:'+preview_id);
   if(receipt)return {imported:rows.length,duplicate:true};
   const total=await sql.first('SELECT count(*) n FROM menu_items WHERE cafe_id=?',cafeId);if(total.n+rows.length>1000)fail(409,'menu_limit','Tenant menu capacity reached');
   const entries=rows.map(row=>['INSERT INTO menu_items(id,cafe_id,category_id,name,description,base_price,discounted_price,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',id('products'),cafeId,row.category_id,row.name,row.description,row.base_price,row.discounted_price,clock(),clock()]);
   entries.push(['INSERT INTO business_audit(id,cafe_id,actor_id,action,entity_id,at) VALUES(?,?,?,?,?,?)','import:'+preview_id,cafeId,user.id,'products.import',preview_id,clock()]);
   await commit(cafeId,user,entries);return {imported:rows.length,duplicate:false};
  },
  async publicMenu(cafeId,query={}) {
   await cafe(cafeId,null,true);const limit=integer(query.limit,50,1,100),offset=integer(query.offset,0,0,10000);
   if(query.q!==undefined&&(typeof query.q!=='string'||query.q.length>120))invalid('Invalid search');
   const conditions=['p.cafe_id=?','p.published=1','p.archived=0','c.published=1'],args=[cafeId];
   if(query.category_id){conditions.push('p.category_id=?');args.push(query.category_id);}
   if(query.product_id){conditions.push('p.id=?');args.push(query.product_id);}
   if(query.featured!==undefined){if(!['true','false'].includes(query.featured))invalid('Invalid featured');conditions.push('p.featured=?');args.push(Number(query.featured==='true'));}
   if(query.q){conditions.push('instr(lower(p.name),lower(?))>0');args.push(query.q);}
   const products=await sql.all(`SELECT p.* FROM menu_items p JOIN menu_categories c ON c.id=p.category_id AND c.cafe_id=p.cafe_id WHERE ${conditions.join(' AND ')} ORDER BY p.display_order,p.id LIMIT ? OFFSET ?`,...args,limit+1,offset);
   const page=products.slice(0,limit),ids=page.map(p=>p.id);
   const variants=ids.length?await sql.all(`SELECT * FROM menu_item_variants WHERE cafe_id=? AND active=1 AND product_id IN(SELECT value FROM json_each(?)) ORDER BY display_order,id`,cafeId,JSON.stringify(ids)):[];
   const categories=await sql.all('SELECT * FROM menu_categories WHERE cafe_id=? AND published=1 ORDER BY display_order,id LIMIT 100',cafeId);
   return {cafe_id:cafeId,menu_url:`/api/v1/cafes/${encodeURIComponent(cafeId)}/menu`,categories,products:page.map(p=>({...p,variants:variants.filter(v=>v.product_id===p.id)})),pagination:{limit,offset,has_more:products.length>limit}};
  }
 };
 const cache=new Map();let generation=0;
 service.invalidate=cafeId=>{generation++;for(const [key,entry] of cache)if(entry.cafeId===cafeId)cache.delete(key);};
 const publicMenu=service.publicMenu.bind(service);
 service.publicMenu=async(cafeId,query={})=>{
  await cafe(cafeId,null,true);
  const key=JSON.stringify([cafeId,query]),saved=cache.get(key);
  if(saved&&saved.until>Date.now())return structuredClone(saved.value);
  const started=generation,value=await publicMenu(cafeId,query);
  if(started===generation){if(cache.size>=128)cache.delete(cache.keys().next().value);cache.set(key,{cafeId,until:Date.now()+5000,value:structuredClone(value)});}
  return value;
 };
 for(const method of ['create','update','remove','bulk','importCsv']){
  const original=service[method];service[method]=async function(cafeId,...args){const value=await original.call(service,cafeId,...args);if(method!=='importCsv'||args[2]===true){generation++;for(const [key,entry] of cache)if(entry.cafeId===cafeId)cache.delete(key);}return value;};
 }
 return service;
 function integer(raw,fallback,min,max){if(raw===undefined)return fallback;if(!/^\d+$/.test(String(raw))||!Number.isSafeInteger(Number(raw))||Number(raw)<min||Number(raw)>max)invalid('Invalid pagination');return Number(raw);}
}
