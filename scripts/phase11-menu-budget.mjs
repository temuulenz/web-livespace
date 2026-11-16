// Disposable SQLite query/count evidence; NOT D1 billing metadata.
import {openDatabase,transaction} from '../server/lib/db.mjs';
import {createMenuService} from '../shared/business/menu.mjs';
const db=openDatabase(':memory:');let statements=0;
try{
 db.prepare("INSERT INTO users(id,email,password_hash,name,role,created_at) VALUES('owner','budget@example.invalid','unused','','owner','2026-01-01')").run();
 db.prepare("INSERT INTO cafes(id,name,owner_id,status,data_mode,created_at,updated_at) VALUES('budget','Simulated budget fixture','owner','active','demo','2026-01-01','2026-01-01')").run();
 const sql={first:(q,...a)=>{statements++;return db.prepare(q).get(...a);},all:(q,...a)=>{statements++;return db.prepare(q).all(...a);},batch:entries=>transaction(db,()=>entries.map(([q,...a])=>{statements++;return db.prepare(q).run(...a);}))};
 const menu=createMenuService({sql,id:p=>p+crypto.randomUUID(),fail:(s,c,m)=>{throw new Error(c+': '+m);}}),user={id:'owner',role:'owner'};
 const category=await menu.create('budget','categories',{name:'Simulated category',published:true},user);
 for(let i=0;i<30;i++)await menu.create('budget','products',{category_id:category.id,name:'Simulated product '+i,base_price:5000,published:true},user);
 statements=0;await menu.publicMenu('budget');const cold=statements;
 statements=0;await menu.publicMenu('budget');const warm=statements;
 const plans={products:db.prepare('EXPLAIN QUERY PLAN SELECT * FROM menu_items WHERE cafe_id=? AND archived=0 AND published=1 ORDER BY display_order,id LIMIT 51').all('budget'),variants:db.prepare('EXPLAIN QUERY PLAN SELECT * FROM menu_item_variants WHERE cafe_id=? AND product_id=? AND active=1 ORDER BY display_order,id').all('budget','fixture'),categories:db.prepare('EXPLAIN QUERY PLAN SELECT * FROM menu_categories WHERE cafe_id=? AND published=1 ORDER BY display_order,id LIMIT 100').all('budget')};
 console.log(JSON.stringify({source:'disposable Node SQLite',products:30,sql_statements:{cold_menu:cold,warm_menu:warm},plans,d1_rows_read:'unmeasured',d1_rows_written:'unmeasured',warning:'Statement counts exclude SQLite index maintenance and are not D1 row billing.'},null,2));
}finally{db.close();}
