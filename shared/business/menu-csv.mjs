import {createHash} from 'node:crypto';
// RFC4180 subset: comma separator, escaped quotes, CRLF/LF; bounded by caller.
export function parseMenuCsv(csv,fail) {
 const invalid=m=>fail(422,'invalid_csv',m);
 if(typeof csv!=='string'||Buffer.byteLength(csv)>12000)invalid('CSV must be at most 12000 bytes');
 const rows=[];let row=[],field='',quoted=false,closed=false;
 for(let i=0;i<csv.length;i++){
  const c=csv[i];
  if(quoted){if(c==='"'){if(csv[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
  if(c==='"'){if(field||closed)invalid('Unexpected quote');quoted=true;continue;}
  if(c===','||c==='\n'||c==='\r'){
   row.push(field);field='';closed=false;
   if(c!==','){if(c==='\r'&&csv[i+1]==='\n')i++;rows.push(row);row=[];}continue;
  }
  if(closed)invalid('Unexpected text after quote');field+=c;
 }
 if(quoted)invalid('Unclosed quote');if(field||row.length||closed){row.push(field);rows.push(row);}
 const header=rows.shift();
 if(!header||header.join(',')!=='category_id,name,description,base_price,discounted_price')invalid('Expected category_id,name,description,base_price,discounted_price header');
 if(!rows.length||rows.length>20)invalid('Import requires 1–20 products');
 return rows.map((r,index)=>{
  if(r.length!==5||!/^\d+$/.test(r[3])||(r[4]!==''&&!/^\d+$/.test(r[4])))invalid('Invalid columns or prices on row '+(index+2));
  return {category_id:r[0],name:r[1],description:r[2],base_price:Number(r[3]),discounted_price:r[4]===''?null:Number(r[4])};
 });
}
export const previewHash=(cafe,user,csv)=>createHash('sha256').update(JSON.stringify([cafe,user,csv])).digest('hex');
