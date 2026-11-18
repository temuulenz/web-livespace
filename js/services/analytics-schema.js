export const ANALYTICS_TYPES=Object.freeze(['cafe_view','menu_view','product_view','favorite_add','directions_click','promotion_view','out_of_stock_view']);
export function validateAnalyticsBatch(input,clock=Date.now()) {
 if(!input||input.schemaVersion!==1||typeof input.cafeId!=='string'||!/^[A-Za-z0-9_.:-]{1,80}$/.test(input.cafeId)||!Array.isArray(input.events)||input.events.length<1||input.events.length>32||Object.keys(input).some(k=>!['schemaVersion','cafeId','events'].includes(k)))throw new Error('Invalid analytics batch');
 const events=input.events.map(e=>{if(!e||Object.keys(e).some(k=>!['id','type','timestamp'].includes(k))||typeof e.id!=='string'||!/^[A-Za-z0-9_-]{8,64}$/.test(e.id)||!ANALYTICS_TYPES.includes(e.type)||typeof e.timestamp!=='string'||!e.timestamp.endsWith('Z')||!Number.isFinite(Date.parse(e.timestamp))||Date.parse(e.timestamp)<clock-86400000||Date.parse(e.timestamp)>clock+60000)throw new Error('Invalid analytics event');return {id:e.id,type:e.type,timestamp:new Date(e.timestamp).toISOString(),hour:new Date(e.timestamp).toISOString().slice(0,13)+':00:00.000Z'};});
 return {schemaVersion:1,cafeId:input.cafeId,events};
}
