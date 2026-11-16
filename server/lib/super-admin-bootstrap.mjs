import { randomUUID } from 'node:crypto';
import { hashPassword } from './auth.mjs';
import { SUPER_ADMIN_EMAIL } from '../services/user-access.mjs';

// Operator-only bootstrap; never reachable through registration or application APIs.
// SQL is parameterized by the caller and the binding is immutable once established.
export async function superAdminBootstrap({ sql, password, expectedId }) {
  const binding=await sql.first('SELECT user_id FROM super_admin_identity WHERE singleton=1');
  const existing=await sql.first('SELECT id,role,disabled_at FROM users WHERE email=? COLLATE NOCASE',SUPER_ADMIN_EMAIL);
  if(binding) {
    if(existing?.id!==binding.user_id || (expectedId && binding.user_id!==expectedId)) throw new Error('Super Admin identity mismatch; manual security review required');
    return {userId:binding.user_id,existing:true,unchanged:true};
  }
  if(expectedId && existing?.id!==expectedId) throw new Error('Resolved account ID does not match the expected immutable ID');
  if(existing?.disabled_at) throw new Error('Designated account is disabled; resolve this explicitly before bootstrap');
  const userId=existing?.id || `usr_${randomUUID().replaceAll('-','').slice(0,16)}`;
  const at=new Date().toISOString();
  const entries=[];
  if(!existing) {
    if(typeof password!=='string' || password.length<12 || password.length>200) throw new Error('A new account requires a securely entered 12–200 character password');
    const hash=await hashPassword(password);
    entries.push(["INSERT INTO users(id,email,password_hash,name,role,created_at) VALUES(?,?,?,'Super Admin','admin',?)",userId,SUPER_ADMIN_EMAIL,hash,at]);
  } else if(existing.role!=='admin') entries.push(["UPDATE users SET role='admin' WHERE id=? AND email=? COLLATE NOCASE AND disabled_at IS NULL",userId,SUPER_ADMIN_EMAIL]);
  entries.push(['INSERT INTO super_admin_identity(singleton,user_id,bound_at) VALUES(1,?,?)',userId,at]);
  await sql.batch(entries);
  return {userId,existing:!!existing,unchanged:false};
}
