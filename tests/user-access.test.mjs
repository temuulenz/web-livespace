import test from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN,startServer } from './support/server.mjs';
import { hashPassword } from '../server/lib/auth.mjs';
import { superAdminBootstrap } from '../server/lib/super-admin-bootstrap.mjs';
import { SUPER_ADMIN_EMAIL } from '../server/services/user-access.mjs';
import { transaction } from '../server/lib/db.mjs';
const ROOT={email:SUPER_ADMIN_EMAIL,password:'root-test-password-123'};
async function setup() {
  const server=await startServer(),db=server.app.deps.db;
  db.prepare("INSERT INTO users(id,email,password_hash,name,role,created_at) VALUES('root-id',?,?,'Root','user',?)").run(ROOT.email,await hashPassword(ROOT.password),new Date().toISOString());
  const before=db.prepare("SELECT password_hash FROM users WHERE id='root-id'").get().password_hash;
  const sql={first:async(q,...p)=>db.prepare(q).get(...p),batch:async entries=>transaction(db,()=>entries.forEach(([q,...p])=>db.prepare(q).run(...p)))};
  await superAdminBootstrap({sql,expectedId:'root-id'});
  assert.equal(db.prepare("SELECT password_hash FROM users WHERE id='root-id'").get().password_hash,before);
  const root=server.client(),admin=server.client();
  assert.equal((await root.post('/api/v1/auth/login',ROOT)).data.user.is_super_admin,true);
  await admin.post('/api/v1/auth/login',ADMIN);
  return {server,db,root,admin,sql};
}

test('only immutable-ID Super Admin can create, promote, demote, disable or reset administrators',async()=>{
  const {server,root,admin,db}=await setup();
  try {
    assert.equal((await admin.post('/api/v1/admin/users',{email:'another-admin@test.mn',password:'a-test-password-123',role:'admin'})).status,403);
    const created=await root.post('/api/v1/admin/users',{email:'new-admin@test.mn',password:'a-test-password-123',role:'admin'});
    assert.equal(created.status,201,JSON.stringify(created.data));const target=created.data.user.id;
    for(const input of [{name:'Changed'},{role:'user'},{disabled:true},{is_super_admin:true}]) assert.ok([403,422].includes((await admin.patch('/api/v1/admin/users/'+target,input)).status));
    assert.equal((await admin.post(`/api/v1/admin/users/${target}/password`,{password:'changed-password-123'})).status,403);
    const normal=await admin.post('/api/v1/admin/users',{email:'normal@test.mn',password:'a-test-password-123',role:'user'});assert.equal(normal.status,201);
    assert.equal((await admin.patch('/api/v1/admin/users/'+normal.data.user.id,{role:'admin'})).status,403);
    assert.equal((await root.patch('/api/v1/admin/users/'+normal.data.user.id,{role:'admin'})).status,200);
    assert.equal((await root.patch('/api/v1/admin/users/'+target,{role:'owner'})).status,200);
    assert.equal((await admin.post(`/api/v1/admin/users/${target}/password`,{password:'changed-password-123'})).status,200,'regular admins may manage an owner');
    assert.equal((await root.patch('/api/v1/admin/users/'+normal.data.user.id,{disabled:true})).status,200);
    const events=(await root.get('/api/v1/admin/audit')).data.events;
    assert.ok(events.some(e=>e.action==='user.create'));assert.ok(events.some(e=>e.action==='user.password_reset'));
    assert.ok(!JSON.stringify(events).includes('password-123'));assert.ok(!JSON.stringify(events).includes('scrypt$'));
    assert.equal((await admin.get('/api/v1/admin/audit')).status,403);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM super_admin_identity').get().n,1);
  } finally {await server.stop();}
});

test('Super Admin is immutable and public requests cannot claim its authority',async()=>{
  const {server,root,admin,db,sql}=await setup();
  try {
    for(const actor of [root,admin]) {
      for(const input of [{role:'user'},{disabled:true},{name:'Alter root'},{is_super_admin:false},{email:'other@test.mn'}]) assert.ok([403,422].includes((await actor.patch('/api/v1/admin/users/root-id',input)).status));
      assert.equal((await actor.post('/api/v1/admin/users/root-id/password',{password:'changed-password-123'})).status,403);
      assert.ok([404,405].includes((await actor.del('/api/v1/admin/users/root-id')).status));
    }
    const guest=server.client();
    assert.equal((await guest.post('/api/v1/auth/register',{email:'escalation@test.mn',password:'test-password-123',role:'admin'})).status,422);
    assert.equal((await guest.post('/api/v1/auth/register',{email:ROOT.email.toUpperCase(),password:'test-password-123'})).status,403);
    const user=await guest.post('/api/v1/auth/register',{email:'safe@test.mn',password:'test-password-123'});assert.equal(user.data.user.is_super_admin,false);
    assert.equal((await guest.patch('/api/v1/admin/users/'+user.data.user.id,{role:'admin'})).status,403);
    assert.equal((await guest.post('/api/v1/admin/users',{email:'steal@test.mn',password:'test-password-123',role:'admin'})).status,403);
    for(const query of ["UPDATE users SET role='user' WHERE id='root-id'","UPDATE users SET email='other@test.mn' WHERE id='root-id'","UPDATE users SET id='different' WHERE id='root-id'","UPDATE users SET disabled_at='now' WHERE id='root-id'","DELETE FROM users WHERE id='root-id'","UPDATE super_admin_identity SET user_id='someone'","DELETE FROM super_admin_identity","DELETE FROM user_audit_log"]) assert.throws(()=>db.exec(query));
    assert.deepEqual(await superAdminBootstrap({sql,expectedId:'root-id'}),{userId:'root-id',existing:true,unchanged:true});
    await assert.rejects(superAdminBootstrap({sql,expectedId:'wrong-id'}));
  } finally {await server.stop();}
});

test('recent authentication is required and sessions are invalidated by password/privilege changes',async()=>{
  const {server,root,admin,db}=await setup();
  try {
    db.prepare("UPDATE sessions SET authenticated_at='2000-01-01T00:00:00.000Z' WHERE user_id='root-id'").run();
    const body={email:'reauth-admin@test.mn',password:'test-password-123',role:'admin'};
    assert.equal((await root.post('/api/v1/admin/users',body)).data.error.code,'recent_auth_required');
    assert.equal((await root.post('/api/v1/auth/reauthenticate',{password:'wrong'})).status,401);
    assert.equal((await root.post('/api/v1/auth/reauthenticate',{password:ROOT.password})).status,200);
    assert.equal((await root.post('/api/v1/admin/users',body)).status,201);
    const target=server.client(),record=await target.post('/api/v1/auth/register',{email:'target@test.mn',password:'old-password-123'}),id=record.data.user.id;
    assert.equal((await target.get('/api/v1/auth/me')).status,200);
    assert.equal((await root.patch('/api/v1/admin/users/'+id,{role:'admin'})).status,200);
    assert.equal((await target.get('/api/v1/auth/me')).status,401);
    await target.post('/api/v1/auth/login',{email:'target@test.mn',password:'old-password-123'});
    assert.equal((await root.post(`/api/v1/admin/users/${id}/password`,{password:'new-password-123'})).status,200);
    assert.equal((await target.get('/api/v1/auth/me')).status,401);
    assert.equal((await target.post('/api/v1/auth/login',{email:'target@test.mn',password:'old-password-123'})).status,401);
    assert.equal((await target.post('/api/v1/auth/login',{email:'target@test.mn',password:'new-password-123'})).status,200);
    await root.patch('/api/v1/admin/users/'+id,{disabled:true});
    assert.equal((await target.get('/api/v1/auth/me')).status,401);
    assert.equal((await target.post('/api/v1/auth/login',{email:'target@test.mn',password:'new-password-123'})).status,401);
    assert.equal((await admin.patch('/api/v1/admin/users/root-id',{role:'owner'})).status,403);
  } finally {await server.stop();}
});

test('bootstrap requires a new password only when absent and never rotates an existing credential',async()=>{
  const server=await startServer(),db=server.app.deps.db;
  const sql={first:async(q,...p)=>db.prepare(q).get(...p),batch:async entries=>transaction(db,()=>entries.forEach(([q,...p])=>db.prepare(q).run(...p)))};
  try {
    await assert.rejects(superAdminBootstrap({sql}),/securely entered/);
    const result=await superAdminBootstrap({sql,password:ROOT.password});assert.equal(result.existing,false);
    const root=server.client();assert.equal((await root.post('/api/v1/auth/login',ROOT)).data.user.is_super_admin,true);
    assert.equal((await sql.first('SELECT COUNT(*) n FROM super_admin_identity')).n,1);
    const hash=(await sql.first('SELECT password_hash FROM users WHERE id=?',result.userId)).password_hash;
    await superAdminBootstrap({sql,password:'this-must-not-replace-credentials'});
    assert.equal((await sql.first('SELECT password_hash FROM users WHERE id=?',result.userId)).password_hash,hash);
  } finally {await server.stop();}
});

test('authorization is rechecked atomically after asynchronous password hashing',async()=>{
  const {server,admin,db}=await setup();
  try {
    const {createUserAccess}=await import('../server/services/user-access.mjs');
    const {verifyPassword}=await import('../server/lib/auth.mjs');
    const actor=server.app.deps.sessions.user(admin.cookie.split('=')[1]);
    const target=await admin.post('/api/v1/admin/users',{email:'race@test.mn',role:'user',password:'original-test-password'});
    const targetId=target.data.user.id;
    const access=createUserAccess({
      sql:{first:async(q,...p)=>db.prepare(q).get(...p),all:async(q,...p)=>db.prepare(q).all(...p),batch:async entries=>transaction(db,()=>entries.forEach(([q,...p])=>db.prepare(q).run(...p)))},
      hashPassword:async password=>{const hash=await hashPassword(password);db.prepare("UPDATE users SET role='admin',auth_version=auth_version+1 WHERE id=?").run(targetId);return hash;},
      verifyPassword,id:()=> 'race-event',fail:(status,code,message)=>{const error=new Error(message);error.code=code;throw error;}
    });
    await assert.rejects(access.resetPassword(actor,targetId,{password:'new-test-password'}),error=>error.code==='access_changed');
    assert.equal(await verifyPassword('original-test-password',db.prepare('SELECT password_hash FROM users WHERE id=?').get(targetId).password_hash),true);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM user_audit_log WHERE id='race-event'").get().n,0);
  } finally {await server.stop();}
});
