import test from 'node:test';
import assert from 'node:assert/strict';
import {startServer,ADMIN,tinyJpeg} from './support/server.mjs';
import {hashPassword} from '../server/lib/auth.mjs';
import {superAdminBootstrap} from '../server/lib/super-admin-bootstrap.mjs';
import {SUPER_ADMIN_EMAIL} from '../server/services/user-access.mjs';
import {transaction} from '../server/lib/db.mjs';
import {createCafePhotos} from '../shared/business/cafe-photos.mjs';

test('public cafe gallery is owner scoped, validated, ordered, audited and kept out of private applications',async()=>{
 const server=await startServer(),db=server.app.deps.db;
 try{
  const rootPassword='root-photo-password-123',ownerPassword='owner-photo-password-123',at=new Date().toISOString();
  db.prepare("INSERT INTO users(id,email,password_hash,name,role,created_at) VALUES('photo-root',?,?,'Root','user',?)").run(SUPER_ADMIN_EMAIL,await hashPassword(rootPassword),at);
  db.prepare("INSERT INTO users(id,email,password_hash,name,role,created_at) VALUES('photo-owner','owner-photo@test.mn',?,'Owner','owner',?)").run(await hashPassword(ownerPassword),at);
  await superAdminBootstrap({sql:{first:async(q,...a)=>db.prepare(q).get(...a),batch:async entries=>transaction(db,()=>entries.map(([q,...a])=>db.prepare(q).run(...a)))},expectedId:'photo-root'});
  db.prepare("UPDATE cafes SET owner_id='photo-owner' WHERE id='A'").run();
  const owner=server.client(),root=server.client(),admin=server.client(),guest=server.client();
  assert.equal((await owner.post('/api/v1/auth/login',{email:'owner-photo@test.mn',password:ownerPassword})).status,200);
  assert.equal((await root.post('/api/v1/auth/login',{email:SUPER_ADMIN_EMAIL,password:rootPassword})).status,200);
  assert.equal((await admin.post('/api/v1/auth/login',ADMIN)).status,200);
  const base='/api/v1/owner/cafes/A/photos',publicBase='/api/v1/cafes/A/photos',image=tinyJpeg();
  assert.equal((await guest.post(base,{image})).status,401);
  assert.equal((await owner.post('/api/v1/owner/cafes/B/photos',{image})).status,403);
  assert.equal((await admin.post(base,{image})).status,403);
  assert.equal((await owner.post(base,{image:image.replace('image/jpeg','image/png')})).status,422);
  assert.equal((await owner.post(base,{image:'data:image/jpeg;base64,'+Buffer.from('<script/>').toString('base64')})).status,422);
  const first=await owner.post(base,{image});assert.equal(first.status,201,JSON.stringify(first.data));assert.equal(first.data.photo.is_cover,true);
  const second=await root.post(base,{image});assert.equal(second.status,201,JSON.stringify(second.data));assert.equal(second.data.photo.is_cover,false);
  const third=await root.put(base+'/'+second.data.photo.id+'/cover');assert.equal(third.status,200);assert.equal(third.data.photos[0].id,second.data.photo.id);
  assert.equal((await guest.get(publicBase)).data.photos.length,2);
  assert.equal((await guest.get('/api/v1/cafes')).data.cafes.find(c=>c.id==='A').cover_photo_id,second.data.photo.id);
  const file=await fetch(server.origin+publicBase+'/'+second.data.photo.id+'/file');assert.equal(file.status,200);assert.equal(file.headers.get('content-type'),'image/jpeg');assert.equal(file.headers.get('x-content-type-options'),'nosniff');
  assert.equal((await owner.put(base+'/order',{ids:[second.data.photo.id,first.data.photo.id]})).status,200);
  assert.equal((await owner.put(base+'/order',{ids:[first.data.photo.id]})).status,409);
  assert.equal((await owner.del(base+'/'+second.data.photo.id)).status,200);
  assert.equal((await guest.get(publicBase)).data.photos[0].id,first.data.photo.id);
  assert.equal((await guest.get(publicBase+'/'+second.data.photo.id+'/file')).status,404);
  const replacement=await owner.put(base+'/'+first.data.photo.id,{image});
  assert.equal(replacement.status,200,JSON.stringify(replacement.data));
  assert.equal(replacement.data.photo.is_cover,false); // replacement response is the initial upload snapshot
  assert.equal((await guest.get(publicBase)).data.photos[0].id,replacement.data.photo.id);
  assert.equal((await guest.get(publicBase+'/'+first.data.photo.id+'/file')).status,404);
  assert.equal((await guest.get(publicBase+'/'+replacement.data.photo.id+'/file')).status,200);
  db.prepare("UPDATE cafes SET status='archived' WHERE id='A'").run();
  assert.equal((await guest.get(publicBase)).status,404);
  assert.equal((await guest.get(publicBase+'/'+replacement.data.photo.id+'/file')).status,404);
  assert.equal((await owner.get(base)).data.photos.length,1);
  db.prepare("UPDATE cafes SET status='active',owner_id=NULL WHERE id='A'").run();
  assert.equal((await owner.get(base)).status,403);
  assert.equal((await root.get(base)).status,200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cafe_photo_gc').get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM cafe_photos WHERE cafe_id='A' AND ready=0").get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM application_photos').get().n,0);
  assert.ok(db.prepare("SELECT COUNT(*) n FROM business_audit WHERE cafe_id='A' AND action LIKE 'cafe.photo.%'").get().n>=4);
 }finally{await server.stop();}
});

test('failed object storage write clears pending metadata through its durable cleanup journal',async()=>{
 const server=await startServer(),db=server.app.deps.db;
 try {
  const actor=db.prepare("SELECT id,role,auth_version,disabled_at FROM users WHERE email=?").get(ADMIN.email);
  db.prepare('UPDATE cafes SET owner_id=? WHERE id=?').run(actor.id,'A');
  const removed=[];
  const service=createCafePhotos({
   sql:{first:async(q,...p)=>db.prepare(q).get(...p),all:async(q,...p)=>db.prepare(q).all(...p),batch:async entries=>transaction(db,()=>entries.map(([q,...p])=>db.prepare(q).run(...p)))},
   storage:{plan:()=>({object_key:'test/photo.jpg'}),save:async()=>{throw Error('simulated storage outage');},remove:async row=>removed.push(row.object_key)},
   fail:(status,code,message)=>{throw Object.assign(Error(message),{status,code});},id:()=> 'photo-failed'
  });
  await assert.rejects(service.upload('A',{image:tinyJpeg()},actor),/simulated storage outage/);
  assert.deepEqual(removed,['test/photo.jpg']);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM cafe_photos WHERE id='photo-failed'").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM cafe_photo_gc WHERE id='photo-failed'").get().n,0);
 } finally {await server.stop();}
});
