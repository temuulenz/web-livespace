// Passwords, sessions, roles and simple rate limiting.
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { HttpError, cookie } from './http.mjs';
import { now } from './db.mjs';

const scrypt = promisify(scryptCb);
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
export const SESSION_COOKIE = 'ls_session';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const newToken = (prefix = '') => prefix + randomBytes(32).toString('base64url');
export const newId = prefix => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, N, r, p, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p });
  return timingSafeEqual(key, expected);
}

export function validateCredentials({ email, password, name }) {
  const details = {};
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 200) details.email = 'И-мэйл хаяг буруу байна';
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) details.password = 'Нууц үг дор хаяж 8 тэмдэгт байна';
  if (name != null && (typeof name !== 'string' || name.length > 100)) details.name = 'Нэр хэт урт байна';
  if (Object.keys(details).length) throw new HttpError(422, 'validation_failed', 'Мэдээллээ шалгана уу', details);
  return { email: email.trim().toLowerCase(), password, name: (name || '').trim() };
}

export const publicUser = user => user && { id: user.id, email: user.email, name: user.name, role: user.role };

export function createSessions(db, { days = 30, secure = false } = {}) {
  const insert = db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)');
  const lookup = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?');
  const remove = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
  const purge = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');
  const maxAge = days * 24 * 3600;

  return {
    // Creates a session and returns the Set-Cookie header value.
    start(userId) {
      const token = newToken();
      insert.run(sha256(token), userId, now(), new Date(Date.now() + maxAge * 1000).toISOString());
      return cookie(SESSION_COOKIE, token, { maxAge, secure });
    },
    user(token) { return token ? lookup.get(sha256(token), now()) || null : null; },
    end(token) { if (token) remove.run(sha256(token)); return cookie(SESSION_COOKIE, '', { maxAge: 0, secure }); },
    purge() { purge.run(now()); }
  };
}

// Route guards.
export const requireUser = ctx => { if (!ctx.user) throw new HttpError(401, 'unauthorized', 'Нэвтэрнэ үү'); };
export const requireRole = (...roles) => ctx => {
  requireUser(ctx);
  if (!roles.includes(ctx.user.role)) throw new HttpError(403, 'forbidden', 'Энэ үйлдэл хийх эрхгүй');
};

// Cookie-authenticated writes must come from our own pages: browsers cannot send
// cross-site JSON without a CORS preflight, and the Origin (when present) must match.
export function sameOrigin(ctx) {
  const origin = ctx.req.headers.origin;
  if (!origin) return;
  const host = ctx.req.headers.host;
  try { if (new URL(origin).host === host) return; } catch { /* fall through */ }
  throw new HttpError(403, 'bad_origin', 'Cross-origin request rejected');
}

// Fixed-window limiter, in memory (one server process). Key by IP and purpose.
export function createRateLimiter() {
  const buckets = new Map();
  setInterval(() => { const t = Date.now(); for (const [key, b] of buckets) if (b.reset < t) buckets.delete(key); }, 60000).unref();
  return function limit(key, max, windowMs) {
    const t = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.reset < t) { bucket = { count: 0, reset: t + windowMs }; buckets.set(key, bucket); }
    if (++bucket.count > max) throw new HttpError(429, 'rate_limited', 'Хэт олон хүсэлт. Түр хүлээгээд дахин оролдоно уу.');
  };
}
