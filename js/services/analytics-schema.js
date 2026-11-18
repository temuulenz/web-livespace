export const ANALYTICS_TYPES=Object.freeze(['cafe_view','menu_view','product_view','favorite_add','directions_click','promotion_view','out_of_stock_view']);
// Optional item references (Phase 11E): only these types may name one published menu product or promotion of the batch cafe.
export const ANALYTICS_ITEM_KINDS=Object.freeze({product_view:'product',out_of_stock_view:'product',promotion_view:'promotion'});
const ITEM_ID=/^[A-Za-z0-9_.:-]{1,80}$/;
export function validateAnalyticsBatch(input,clock=Date.now()) {
 if(!input||input.schemaVersion!==1||typeof input.cafeId!=='string'||!/^[A-Za-z0-9_.:-]{1,80}$/.test(input.cafeId)||!Array.isArray(input.events)||input.events.length<1||input.events.length>32||Object.keys(input).some(k=>!['schemaVersion','cafeId','events'].includes(k)))throw new Error('Invalid analytics batch');
 const events=input.events.map(e=>{if(!e||Object.keys(e).some(k=>!['id','type','timestamp','itemId'].includes(k))||typeof e.id!=='string'||!/^[A-Za-z0-9_-]{8,64}$/.test(e.id)||!ANALYTICS_TYPES.includes(e.type)||typeof e.timestamp!=='string'||!e.timestamp.endsWith('Z')||!Number.isFinite(Date.parse(e.timestamp))||Date.parse(e.timestamp)<clock-86400000||Date.parse(e.timestamp)>clock+60000)throw new Error('Invalid analytics event');
  if(e.itemId!==undefined&&(!ANALYTICS_ITEM_KINDS[e.type]||typeof e.itemId!=='string'||!ITEM_ID.test(e.itemId)))throw new Error('Invalid analytics item');
  return {id:e.id,type:e.type,timestamp:new Date(e.timestamp).toISOString(),hour:new Date(e.timestamp).toISOString().slice(0,13)+':00:00.000Z',itemId:e.itemId??null};});
 return {schemaVersion:1,cafeId:input.cafeId,events};
}
