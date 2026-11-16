import {openDatabase,transaction} from '../../server/lib/db.mjs';
import {createMenuService} from '../../shared/business/menu.mjs';
import {businessSqlError} from '../../shared/business/sql-errors.mjs';
export const fail=(status,code,message)=>{throw Object.assign(new Error(message),{status,code});};
export const id=p=>p+'_'+crypto.randomUUID();
export function businessFixture(){
 const db=openDatabase(':memory:');
 const sql={first:(q,...a)=>db.prepare(q).get(...a),all:(q,...a)=>db.prepare(q).all(...a),batch:async entries=>{try{return transaction(db,()=>entries.map(([q,...a])=>db.prepare(q).run(...a)));}catch(e){businessSqlError(e,fail);}}};
 for(const x of ['owner','other','customer','admin'])db.prepare('INSERT INTO users(id,email,password_hash,name,role,created_at) VALUES(?,?,?,?,?,?)').run(x,x+'@example.invalid','unused',x,x==='customer'?'user':x==='admin'?'admin':'owner','2026-01-01');
 for(const [cafe,owner] of [['a','owner'],['b','other'],['c','owner']])db.prepare("INSERT INTO cafes(id,name,owner_id,status,data_mode,created_at,updated_at) VALUES(?,?,?,'active','demo','2026-01-01','2026-01-01')").run(cafe,cafe,owner);
 return {db,sql,menu:createMenuService({sql,fail,id}),owner:{id:'owner',role:'owner'},other:{id:'other',role:'owner'},customer:{id:'customer',role:'user'},admin:{id:'admin',role:'admin'}};
}
