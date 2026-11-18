import {createHash} from 'node:crypto';
export function businessCommon({sql,fail}){
 const invalid=m=>fail(422,'validation_failed',m);
 const object=(value,allowed)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))invalid('Invalid JSON fields');};
 const int=(value,min=0,max=1000000000)=>{if(!Number.isSafeInteger(value)||value<min||value>max)invalid('Invalid integer');return value;};
 const page=q=>({limit:q.limit===undefined?50:int(Number(q.limit),1,100),offset:q.offset===undefined?0:int(Number(q.offset),0,10000)});
 async function cafe(cafe_id,user,publicOnly=false){
  if(!publicOnly){if(!user)fail(401,'unauthorized','Sign in required');if(!['owner','admin'].includes(user.role))fail(403,'forbidden','Owner role required');}
  const row=await sql.first('SELECT id,owner_id,status FROM cafes WHERE id=?',cafe_id);
  if(!row||(publicOnly?row.status!=='active':row.owner_id!==user.id))fail(404,'not_found','Cafe not found');return row;
 }
 const user=u=>{if(!u)fail(401,'unauthorized','Sign in required');};
 return {invalid,object,int,page,cafe,user};
}
function canonical(x){if(Array.isArray(x))return x.map(canonical);if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])]));return x;}
export const payloadHash=x=>createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
