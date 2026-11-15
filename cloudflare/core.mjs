import { securityHeaders } from './security.mjs';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
export const now = () => new Date().toISOString();
export const sha = x => createHash('sha256').update(x).digest('hex');
export const token = (prefix = '') => prefix + randomBytes(32).toString('base64url');
export const id = prefix => `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0,16)}`;
export const parse = (x, fallback = null) => { try { return x == null ? fallback : JSON.parse(x); } catch { return fallback; } };
export class APIError extends Error { constructor(status, code, message, details) { super(message); Object.assign(this,{status,code,details}); } }
export const fail = (status,code,message,details) => { throw new APIError(status,code,message,details); };
export const json = (body, status=200, headers={}) => Response.json(body,{status,headers:{'Cache-Control':'no-store',...securityHeaders,...headers}});
export const error = e => json({error:{code:e.code || 'internal',message:e.status ? e.message : 'Internal server error',...(e.details ? {details:e.details}: {})}},e.status || 500);
export const first = (db,sql,...args) => db.prepare(sql).bind(...args).first();
export const all = async (db,sql,...args) => (await db.prepare(sql).bind(...args).all()).results;
export const run = (db,sql,...args) => db.prepare(sql).bind(...args).run();
export const batch = (db,entries) => db.batch(entries.map(([sql,...args])=>db.prepare(sql).bind(...args)));
export async function body(req, limit=65536) {
  if (!/^application\/json\b/i.test(req.headers.get('content-type') || '')) fail(415,'unsupported_media_type','Content-Type must be application/json');
  const reader=req.body?.getReader(); if(!reader) return {};
  const chunks=[]; let size=0;
  while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.byteLength; if(size>limit){await reader.cancel();fail(413,'payload_too_large','Request too large');} chunks.push(value); }
  const bytes=new Uint8Array(size); let i=0; for(const chunk of chunks){bytes.set(chunk,i); i+=chunk.length;}
  try { const value=JSON.parse(new TextDecoder().decode(bytes)); if(!value || typeof value!=='object' || Array.isArray(value)) throw 0; return value; } catch {fail(400,'bad_request','Malformed JSON object');}
}
const derive=promisify(scrypt);
export async function hashPassword(password) {
  const salt=randomBytes(16), key=await derive(password,salt,64,{N:16384,r:8,p:1});
  return `scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}
export async function verifyPassword(password,stored) {
  const [scheme,n,r,p,s,h]=String(stored).split('$');
  // Preserve the repository's exact scrypt cost; reject malformed or unbounded imported parameters.
  if(scheme!=='scrypt' || +n!==16384 || +r!==8 || +p!==1) return false;
  const expected=Buffer.from(h || '', 'base64'), salt=Buffer.from(s || '', 'base64');
  if(expected.length!==64 || salt.length!==16) return false;
  return timingSafeEqual(await derive(password,salt,64,{N:+n,r:+r,p:+p}),expected);
}
export function credentials(x) {
  if(typeof x.email!=='string' || x.email.length>200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email.trim()) || typeof x.password!=='string' || x.password.length<8 || x.password.length>200 || (x.name!=null && (typeof x.name!=='string' || x.name.length>100))) fail(422,'validation_failed','Invalid account details');
  return {email:x.email.trim().toLowerCase(),password:x.password,name:(x.name || '').trim()};
}
export const publicUser=u=>u && ({id:u.id,email:u.email,name:u.name,role:u.role});
export const guard=(user,...roles)=>{if(!user) fail(401,'unauthorized','Sign in required');if(roles.length && !roles.includes(user.role)) fail(403,'forbidden','Permission denied');};
export async function session(db,req) {
 const raw=/(?:^|;\s*)ls_session=([^;]+)/.exec(req.headers.get('cookie') || '')?.[1];
 return raw ? first(db,'SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?',sha(raw),now()) : null;
}
export async function startSession(db,userId,req) {
 const t=token();await run(db,'INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)',sha(t),userId,now(),new Date(Date.now()+2592000000).toISOString());
 return `ls_session=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${new URL(req.url).protocol==='https:'?'; Secure':''}`;
}
export const source=d=>d.is_test || d.kind==='simulator' ? 'simulated':'real';
export async function deviceAuth(db,header) {
 const t=/^Bearer (lsd_[A-Za-z0-9_-]{1,128})$/.exec(header || '')?.[1];
 const d=t && await first(db,'SELECT * FROM devices WHERE token_hash=? AND revoked_at IS NULL AND enabled=1',sha(t));
 if(!d) fail(401,'invalid_device_token','Unknown or revoked device token');return d;
}
