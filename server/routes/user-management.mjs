import { readJson, sendJson, HttpError } from '../lib/http.mjs';
import { hashPassword, verifyPassword, newId, requireRole } from '../lib/auth.mjs';
import { transaction } from '../lib/db.mjs';
import { createUserAccess } from '../services/user-access.mjs';

export function register(router,{db,limit}) {
  const access=createUserAccess({
    sql:{first:async(sql,...args)=>db.prepare(sql).get(...args),all:async(sql,...args)=>db.prepare(sql).all(...args),batch:async entries=>transaction(db,()=>entries.map(([sql,...args])=>db.prepare(sql).run(...args)))},
    hashPassword,verifyPassword,id:newId,fail:(status,code,message)=>{throw new HttpError(status,code,message);}
  });
  const protect=ctx=>{requireRole('admin')(ctx);limit(`user-management:${ctx.user.id}:${ctx.ip}`,30,60000);};
  router.get('/api/v1/admin/users',async ctx=>{protect(ctx);sendJson(ctx.res,200,{users:await access.list(ctx.user,ctx.query.role)});});
  router.post('/api/v1/admin/users',async ctx=>{protect(ctx);sendJson(ctx.res,201,{user:await access.create(ctx.user,await readJson(ctx))});});
  router.patch('/api/v1/admin/users/:id',async ctx=>{protect(ctx);sendJson(ctx.res,200,{user:await access.update(ctx.user,ctx.params.id,await readJson(ctx))});});
  router.post('/api/v1/admin/users/:id/password',async ctx=>{protect(ctx);sendJson(ctx.res,200,{user:await access.resetPassword(ctx.user,ctx.params.id,await readJson(ctx))});});
  router.get('/api/v1/admin/audit',async ctx=>{protect(ctx);sendJson(ctx.res,200,{events:await access.audit(ctx.user)});});
  router.post('/api/v1/auth/reauthenticate',async ctx=>{
    limit(`reauth:${ctx.ip}:${ctx.user?.id}`,10,900000);
    const input=await readJson(ctx);
    sendJson(ctx.res,200,await access.reauthenticate(ctx.user,input.password));
  });
}
