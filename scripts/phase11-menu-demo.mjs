// Self-contained local demonstration: temporary SQLite/files and simulated cafe.
// No remote calls, production data, credentials or frontend changes.
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {loadConfig} from '../server/config.mjs';
import {createApp} from '../server/app.mjs';
const directory=await mkdtemp(join(tmpdir(),'livespace-menu-demo-'));
const app=await createApp(loadConfig({LS_DATA_DIR:directory,LS_SEED_DEMO:'0'},{port:0,staticDir:resolve('.')}));
try{
 const {port}=await app.listen(0,'127.0.0.1'),base=`http://127.0.0.1:${port}`;
 let cookie='';
 const call=async(path,method='GET',body)=>{
  const res=await fetch(base+'/api/v1'+path,{method,headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];
  const value=await res.json();if(!res.ok)throw new Error(JSON.stringify(value));return value;
 };
 const user=(await call('/auth/register','POST',{email:'isolated-menu@example.invalid',password:crypto.randomUUID()})).user;
 app.deps.db.prepare("UPDATE users SET role='owner' WHERE id=?").run(user.id);
 const time=new Date().toISOString();
 app.deps.db.prepare("INSERT INTO cafes(id,name,owner_id,status,data_mode,created_at,updated_at) VALUES('isolated-menu','Isolated demonstration',?,'active','demo',?,?)").run(user.id,time,time);
 const prefix='/owner/cafes/isolated-menu/menu';
 const category=(await call(prefix+'/categories','POST',{name:'Demonstration only',published:true})).item;
 const product=(await call(prefix+'/products','POST',{category_id:category.id,name:'Simulated menu item',base_price:5000,published:true})).item;
 await call(prefix+'/variants','POST',{product_id:product.id,name:'Demonstration size',price:6000});
 await call('/owner/cafes/isolated-menu/inventory/mutations','POST',{idempotency_key:'isolated-inventory-fixture',updates:[{product_id:product.id,version:0,mode:'quantity',quantity:5,show_quantity:true,reason:'restock'}]});
 await call('/cafes/isolated-menu/reviews','POST',{taste:4,service:4,comfort:4,value:4,study:4,comment:'Simulated local API fixture; not actual customer feedback.'});
 const inventory=await call('/cafes/isolated-menu/inventory'),ratings=await call('/cafes/isolated-menu/ratings');
 const menu=await call('/cafes/isolated-menu/menu');
 console.log(JSON.stringify({isolated:true,temporary_database:true,menu,inventory,ratings},null,2));
}finally{await app.close();await rm(directory,{recursive:true,force:true});}
