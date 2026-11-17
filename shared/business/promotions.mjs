// Pure promotion validation/pricing; shared by Node and Workers adapters.
// Money is integer MNT. Promotions never stack; the lowest final price wins.
const zone = new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Ulaanbaatar',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const weekdays=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
export function validatePromotion(input,fail) {
 const invalid=message=>fail(422,'validation_failed',message);
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['name','kind','value','product_id','category_id','starts_at','ends_at','published','recurrence'].includes(k)))invalid('Invalid promotion fields');
 if(typeof input.name!=='string'||!input.name.trim()||input.name.length>120)invalid('Invalid name');
 if(!['fixed','percentage'].includes(input.kind))invalid('Invalid discount kind');
 if(!Number.isSafeInteger(input.value)||input.value<1||input.value>(input.kind==='percentage'?100:1000000000))invalid('Invalid discount value');
 const result={name:input.name.trim(),kind:input.kind,value:input.value,product_id:null,category_id:null,published:false};
 for(const key of ['product_id','category_id'])if(input[key]!=null){if(typeof input[key]!=='string'||!input[key].length||input[key].length>120)invalid('Invalid target');result[key]=input[key];}
 if(result.product_id&&result.category_id)invalid('Choose one target');
 if(input.published!==undefined){if(typeof input.published!=='boolean')invalid('Invalid published flag');result.published=input.published;}
 for(const key of ['starts_at','ends_at']){
  const value=input[key];if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)||!Number.isFinite(Date.parse(value)))invalid('UTC timestamp required');
  const normalized=new Date(value).toISOString();if(normalized.slice(0,19)!==value.slice(0,19))invalid('Invalid calendar date');result[key]=normalized;
 }
 if(result.starts_at>=result.ends_at)invalid('Invalid schedule');
 result.recurrence=null;
 if(input.recurrence!=null){
  const r=input.recurrence;
  if(typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(k=>!['days','start_minute','end_minute'].includes(k))||!Array.isArray(r.days)||!r.days.length||r.days.length>7||new Set(r.days).size!==r.days.length||r.days.some(d=>!Number.isInteger(d)||d<1||d>7)||!Number.isInteger(r.start_minute)||!Number.isInteger(r.end_minute)||r.start_minute<0||r.start_minute>1439||r.end_minute<0||r.end_minute>1439||r.start_minute===r.end_minute)invalid('Invalid recurrence');
  result.recurrence={days:[...r.days].sort((a,b)=>a-b),start_minute:r.start_minute,end_minute:r.end_minute};
 }
 return result;
}
export function promotionActive(p,at) {
 const time=Date.parse(at);if(!Number.isFinite(time)||!p.published||time<Date.parse(p.starts_at)||time>=Date.parse(p.ends_at))return false;
 if(!p.recurrence)return true;
 const r=p.recurrence,parts=Object.fromEntries(zone.formatToParts(new Date(time)).map(x=>[x.type,x.value]));
 const day=weekdays.indexOf(parts.weekday)+1,minute=Number(parts.hour)*60+Number(parts.minute);
 if(r.start_minute<r.end_minute)return r.days.includes(day)&&minute>=r.start_minute&&minute<r.end_minute;
 // For an overnight recurrence, the early portion belongs to the previous day.
 return minute>=r.start_minute?r.days.includes(day):minute<r.end_minute&&r.days.includes(day===1?7:day-1);
}
export function promotionPrice(product,promotions,at=new Date().toISOString()) {
 const base=product.base_price;
 if(!Number.isSafeInteger(base)||base<0||base>1000000000)throw new TypeError('Invalid base price');
 if(product.discounted_price!=null&&(!Number.isSafeInteger(product.discounted_price)||product.discounted_price<0||product.discounted_price>base))throw new TypeError('Invalid discounted price');
 let price=product.discounted_price??base,winner=null;
 for(const p of [...promotions].sort((a,b)=>(String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0))){
  if(!promotionActive(p,at)||(p.product_id&&p.product_id!==product.id)||(p.category_id&&p.category_id!==product.category_id))continue;
  const candidate=p.kind==='fixed'?Math.max(0,base-p.value):Math.floor(base*(100-p.value)/100);
  if(candidate<price){price=candidate;winner=p.id;}
 }
 return {base_price:base,effective_price:price,promotion_id:winner};
}
