import {createHash,randomBytes} from 'node:crypto';
export const BEHAVIOR_EVENTS=['cafe_view','cafe_search','filter_apply','menu_view','product_view','favorite_add','favorite_remove','promotion_view','promotion_click','directions_click','review_submit','out_of_stock_view'];
export function analyticsSession(cookieHeader='') {
 const old=/(?:^|;\s*)ls_analytics=([a-f0-9]{48})(?:;|$)/.exec(cookieHeader)?.[1];
 return {token:old||randomBytes(24).toString('hex'),fresh:!old};
}
export const analyticsCookie=(token,secure)=>`ls_analytics=${token}; Path=/api/v1/analytics; HttpOnly; SameSite=Lax${secure?'; Secure':''}`;
export function validateBehavior(input,token,clock=Date.now()) {
 const invalid=()=>{throw new Error('Invalid analytics batch');};
 if(!input||input.schemaVersion!==2||Object.keys(input).some(k=>!['schemaVersion','cafeId','events'].includes(k))||typeof input.cafeId!=='string'||!/^[A-Za-z0-9_.:-]{1,80}$/.test(input.cafeId)||!Array.isArray(input.events)||!input.events.length||input.events.length>32)invalid();
 const sessionHash=createHash('sha256').update(input.cafeId+':'+token).digest('hex'),timestamp=new Date(clock).toISOString();
 const events=input.events.map(e=>{
  if(!e||typeof e!=='object'||Array.isArray(e)||Object.keys(e).some(k=>!['id','type','productId','promotionId','filter'].includes(k))||typeof e.id!=='string'||!/^[A-Za-z0-9_-]{8,64}$/.test(e.id)||!BEHAVIOR_EVENTS.includes(e.type))invalid();
  for(const k of ['productId','promotionId'])if(e[k]!==undefined&&(typeof e[k]!=='string'||!/^[A-Za-z0-9_.:-]{1,120}$/.test(e[k])))invalid();
  if(e.type==='product_view'&&!e.productId)invalid();
  if(['promotion_view','promotion_click'].includes(e.type)&&!e.promotionId)invalid();
  if(e.filter!==undefined&&(e.type!=='filter_apply'||!['noise','wifi','availability','goal','district'].includes(e.filter)))invalid();
  const fingerprint=createHash('sha256').update(JSON.stringify([e.type,e.productId||'',e.promotionId||'',e.filter||'',sessionHash])).digest('hex');
  return {id:e.id,type:e.type,productId:e.productId||'',promotionId:e.promotionId||'',fingerprint,timestamp,hour:timestamp.slice(0,13)+':00:00.000Z'};
 });return {schemaVersion:2,cafeId:input.cafeId,sessionHash,events};
}
export async function authorizeBehaviorTargets(sql,batch,fail) {
 if(!await sql.first("SELECT id FROM cafes WHERE id=? AND status='active'",batch.cafeId))fail(404,'not_found','Cafe not found');
 const products=[...new Set(batch.events.map(e=>e.productId).filter(Boolean))],promotions=[...new Set(batch.events.map(e=>e.promotionId).filter(Boolean))];
 if(products.length){const found=await sql.all('SELECT p.id FROM menu_items p JOIN menu_categories c ON c.id=p.category_id AND c.cafe_id=p.cafe_id WHERE p.cafe_id=? AND p.published=1 AND p.archived=0 AND c.published=1 AND p.id IN(SELECT value FROM json_each(?))',batch.cafeId,JSON.stringify(products));if(found.length!==products.length)fail(422,'invalid_analytics','Invalid product reference');}
 if(promotions.length){const found=await sql.all('SELECT id FROM promotions WHERE cafe_id=? AND published=1 AND id IN(SELECT value FROM json_each(?))',batch.cafeId,JSON.stringify(promotions));if(found.length!==promotions.length)fail(422,'invalid_analytics','Invalid promotion reference');}
}
