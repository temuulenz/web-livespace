// Shared Node/SQLite and Workers/D1 policy. No authority is derived from request email.
export const SUPER_ADMIN_EMAIL = 'temuulenbayarjargal@icloud.com';
export const RECENT_AUTH_MS = 5 * 60 * 1000;
export const SUPER_ADMIN_SELECT = 'EXISTS(SELECT 1 FROM super_admin_identity sa WHERE sa.user_id=u.id) AS is_super_admin';
export const SESSION_SELECT = `SELECT u.*, ${SUPER_ADMIN_SELECT}, s.token_hash AS session_token_hash, s.authenticated_at FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>? AND u.disabled_at IS NULL AND u.auth_version=s.user_auth_version`;
export const accessUser = u => u && ({ id:u.id, email:u.email, name:u.name, role:u.role, is_super_admin:!!u.is_super_admin });
export function rejectPublicPrivilegeFields(input, fail) {
  if (!input || typeof input!=='object' || Array.isArray(input)) fail(422,'validation_failed','Expected account object');
  if (Object.keys(input).some(k => ['role','is_super_admin','super_admin','disabled_at','auth_version','id'].includes(k))) fail(422,'validation_failed','Account privileges cannot be supplied during registration');
  if (typeof input.email==='string' && input.email.trim().toLowerCase() === SUPER_ADMIN_EMAIL) fail(403,'reserved_account','This account requires operator provisioning');
}
export function createUserAccess({ sql, hashPassword, verifyPassword, fail, id, now = () => new Date().toISOString() }) {
  const get = userId => sql.first(`SELECT u.*, ${SUPER_ADMIN_SELECT} FROM users u WHERE u.id=?`,userId);
  const admin = actor => { if (!actor || actor.role!=='admin' || actor.disabled_at) fail(actor?403:401,'forbidden','Administrator access required'); };
  const fields = (body, allowed) => { if (!body || Array.isArray(body) || typeof body!=='object' || Object.keys(body).some(k=>!allowed.includes(k))) fail(422,'validation_failed','Unknown or protected account field'); };
  const password = value => { if (typeof value!=='string' || value.length<12 || value.length>200) fail(422,'validation_failed','Password must contain 12–200 characters'); };
  function authorize(actor, target, nextRole) {
    admin(actor);
    if (target?.is_super_admin) fail(403,'super_admin_protected','The Super Admin cannot be modified through user management');
    if ((target?.role==='admin' || nextRole==='admin') && !actor.is_super_admin) fail(403,'super_admin_required','Only the Super Admin may manage administrator accounts');
    if (!actor.authenticated_at || !Number.isFinite(Date.parse(actor.authenticated_at)) || Date.now()-Date.parse(actor.authenticated_at)>RECENT_AUTH_MS || Date.parse(actor.authenticated_at)>Date.now()+1000) fail(403,'recent_auth_required','Confirm your current password before managing accounts');
  }
  // Every write rechecks actor/session, recent auth, target version and root identity
  // in the mutation itself. Async password hashing cannot open a privilege race.
  function condition(actor, target, nextRole) {
    const sensitive = target?.role==='admin' || nextRole==='admin';
    return [`EXISTS(SELECT 1 FROM users a JOIN sessions s ON s.user_id=a.id WHERE a.id=? AND a.role='admin' AND a.disabled_at IS NULL AND a.auth_version=? AND s.token_hash=? AND s.user_auth_version=a.auth_version AND s.expires_at>? AND s.authenticated_at>=?${sensitive?" AND EXISTS(SELECT 1 FROM super_admin_identity sa WHERE sa.user_id=a.id)":''})`,actor.id,actor.auth_version,actor.session_token_hash,now(),new Date(Date.now()-RECENT_AUTH_MS).toISOString()];
  }
  async function commit(actor, targetId, action, mutation, details={}) {
    const eventId=id('audit'), at=now();
    await sql.batch([
      mutation,
      ["INSERT INTO user_audit_log(id,actor_id,target_id,action,at,details) SELECT ?,?,?,?,?,? WHERE changes()=1",eventId,actor.id,targetId,action,at,JSON.stringify(details)],
      ['DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM user_audit_log WHERE id=?)',targetId,eventId]
    ]);
    if (!await sql.first('SELECT id FROM user_audit_log WHERE id=?',eventId)) fail(409,'access_changed','Account permissions or authentication changed; reload and try again');
    return accessUser(await get(targetId));
  }
  return {
    async list(actor, role) {
      admin(actor);
      return sql.all(`SELECT u.id,u.email,u.name,u.role,u.disabled_at,u.created_at,${SUPER_ADMIN_SELECT},(SELECT GROUP_CONCAT(name,', ') FROM cafes c WHERE c.owner_id=u.id) cafes FROM users u ${['user','owner','admin'].includes(role)?'WHERE u.role=?':''} ORDER BY u.created_at DESC`,...(['user','owner','admin'].includes(role)?[role]:[]));
    },
    async reauthenticate(actor, value) {
      if (!actor) fail(401,'unauthorized','Sign in required');
      if (typeof value!=='string' || value.length>200 || !await verifyPassword(value,actor.password_hash)) fail(401,'invalid_credentials','Invalid current password');
      const results=await sql.batch([["UPDATE sessions SET authenticated_at=? WHERE token_hash=? AND user_id=? AND user_auth_version=? AND expires_at>? AND EXISTS(SELECT 1 FROM users WHERE id=? AND auth_version=? AND disabled_at IS NULL)",now(),actor.session_token_hash,actor.id,actor.auth_version,now(),actor.id,actor.auth_version]]);
      if((results?.[0]?.meta?.changes??results?.[0]?.changes)!==1)fail(409,'access_changed','Authentication changed; sign in again');
      return {ok:true};
    },
    async create(actor, body) {
      fields(body,['email','password','name','role']);
      const role=body.role || 'user'; if(!['user','owner','admin'].includes(role)) fail(422,'validation_failed','Invalid role');
      authorize(actor,null,role);
      if (typeof body.email!=='string' || body.email.length>200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) fail(422,'validation_failed','Invalid email');
      const email=body.email.trim().toLowerCase();
      if(email===SUPER_ADMIN_EMAIL) fail(403,'reserved_account','This account requires operator provisioning');
      if(await sql.first('SELECT id FROM users WHERE email=?',email)) fail(409,'email_taken','Email already registered');
      password(body.password); if(body.name!=null && (typeof body.name!=='string' || body.name.length>100)) fail(422,'validation_failed','Invalid name');
      const hash=await hashPassword(body.password), userId=id('usr'), [where,...args]=condition(actor,null,role);
      return commit(actor,userId,'user.create',[`INSERT INTO users(id,email,password_hash,name,role,created_at) SELECT ?,?,?,?,?,? WHERE ${where}`,userId,email,hash,(body.name || '').trim(),role,now(),...args],{role});
    },
    async update(actor, userId, body) {
      fields(body,['name','role','disabled']);
      const target=await get(userId); if(!target) fail(404,'not_found','User not found');
      const role=body.role ?? target.role; if(!['user','owner','admin'].includes(role)) fail(422,'validation_failed','Invalid role');
      authorize(actor,target,role);
      if(Object.hasOwn(body,'disabled') && typeof body.disabled!=='boolean') fail(422,'validation_failed','disabled must be boolean');
      if(body.name!=null && (typeof body.name!=='string' || body.name.length>100)) fail(422,'validation_failed','Invalid name');
      const [where,...args]=condition(actor,target,role);
      return commit(actor,userId,'user.update',[`UPDATE users SET name=?,role=?,disabled_at=?,auth_version=auth_version+1 WHERE id=? AND auth_version=? AND NOT EXISTS(SELECT 1 FROM super_admin_identity WHERE user_id=users.id) AND ${where}`,body.name?.trim() ?? target.name,role,body.disabled===undefined?target.disabled_at:body.disabled?now():null,userId,target.auth_version,...args],{from_role:target.role,to_role:role,disabled:body.disabled ?? !!target.disabled_at});
    },
    async resetPassword(actor,userId,body) {
      fields(body,['password']);
      const target=await get(userId); if(!target) fail(404,'not_found','User not found'); authorize(actor,target,target.role);password(body.password);
      const hash=await hashPassword(body.password), [where,...args]=condition(actor,target,target.role);
      return commit(actor,userId,'user.password_reset',[`UPDATE users SET password_hash=?,auth_version=auth_version+1 WHERE id=? AND auth_version=? AND NOT EXISTS(SELECT 1 FROM super_admin_identity WHERE user_id=users.id) AND ${where}`,hash,userId,target.auth_version,...args]);
    },
    async revokeSessions(actor,userId) {
      const target=await get(userId); if(!target) fail(404,'not_found','User not found'); authorize(actor,target,target.role);
      const [where,...args]=condition(actor,target,target.role);
      return commit(actor,userId,'user.sessions_revoke',[`UPDATE users SET auth_version=auth_version+1 WHERE id=? AND auth_version=? AND NOT EXISTS(SELECT 1 FROM super_admin_identity WHERE user_id=users.id) AND ${where}`,userId,target.auth_version,...args]);
    },
    async remove(actor,userId) {
      const target=await get(userId); if(!target) fail(404,'not_found','User not found'); authorize(actor,target,target.role);
      const [where,...args]=condition(actor,target,target.role),eventId=id('audit'),at=now();
      const hasClaims=!!await sql.first("SELECT 1 FROM sqlite_master WHERE type='table' AND name='claim_reservations'");
      // A user with ownership, favourites, claims, reviews or reports is retained.
      // Operational audit rows intentionally keep their historical actor/target ID.
      const unlinked=`NOT EXISTS(SELECT 1 FROM cafes WHERE owner_id=users.id)
        AND NOT EXISTS(SELECT 1 FROM applications WHERE owner_id=users.id)
        AND NOT EXISTS(SELECT 1 FROM favorites WHERE user_id=users.id)
        ${hasClaims?'AND NOT EXISTS(SELECT 1 FROM claim_reservations WHERE user_id=users.id)':''}
        AND NOT EXISTS(SELECT 1 FROM reviews WHERE author_id=users.id)
        AND NOT EXISTS(SELECT 1 FROM review_replies WHERE author_id=users.id)
        AND NOT EXISTS(SELECT 1 FROM review_reports WHERE reporter_id=users.id)`;
      await sql.batch([
        [`DELETE FROM users WHERE id=? AND auth_version=? AND NOT EXISTS(SELECT 1 FROM super_admin_identity WHERE user_id=users.id) AND ${unlinked} AND ${where}`,userId,target.auth_version,...args],
        ['INSERT INTO user_audit_log(id,actor_id,target_id,action,at,details) SELECT ?,?,?,?,?,? WHERE changes()=1',eventId,actor.id,userId,'user.delete',at,JSON.stringify({role:target.role})]
      ]);
      if(!await sql.first('SELECT id FROM user_audit_log WHERE id=?',eventId)) fail(409,'user_has_activity','User has linked cafe or activity, or access changed; suspend instead');
      return {deleted:true,id:userId};
    },
    async audit(actor) { admin(actor); if(!actor.is_super_admin) fail(403,'super_admin_required','Super Admin required'); return sql.all('SELECT * FROM user_audit_log ORDER BY at DESC LIMIT 200'); }
  };
}
