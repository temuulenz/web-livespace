// Accounts, sessions and favourites.
import { readJson, sendJson, HttpError, notFound } from '../lib/http.mjs';
import { hashPassword, verifyPassword, validateCredentials, publicUser, requireUser, newId, SESSION_COOKIE } from '../lib/auth.mjs';
import { now } from '../lib/db.mjs';

// Shared by regular and café-owner registration.
export async function createUser(db, { email, password, name }, role) {
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'email_taken', 'Энэ и-мэйлээр бүртгэл үүссэн байна. Нэвтэрнэ үү.', { email: 'Бүртгэлтэй и-мэйл' });
  const user = { id: newId('usr'), email, name, role, created_at: now() };
  db.prepare('INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(user.id, email, await hashPassword(password), name, role, user.created_at);
  return user;
}

export function register(router, { db, sessions, limit }) {
  router.post('/api/v1/auth/register', async ctx => {
    limit(`register:${ctx.ip}`, 10, 3600 * 1000);
    const input = validateCredentials(await readJson(ctx));
    const user = await createUser(db, input, 'user');
    sendJson(ctx.res, 201, { user: publicUser(user) }, { 'Set-Cookie': sessions.start(user.id) });
  });

  router.post('/api/v1/auth/login', async ctx => {
    limit(`login:${ctx.ip}`, 20, 15 * 60 * 1000);
    const { email, password } = await readJson(ctx);
    const user = typeof email === 'string' ? db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase()) : null;
    // Same message whether the e-mail or the password is wrong.
    if (!user || typeof password !== 'string' || !(await verifyPassword(password, user.password_hash))) throw new HttpError(401, 'invalid_credentials', 'И-мэйл эсвэл нууц үг буруу байна');
    sendJson(ctx.res, 200, { user: publicUser(user) }, { 'Set-Cookie': sessions.start(user.id) });
  });

  router.post('/api/v1/auth/logout', ctx => {
    sendJson(ctx.res, 200, { ok: true }, { 'Set-Cookie': sessions.end(ctx.cookies[SESSION_COOKIE]) });
  });

  router.get('/api/v1/auth/me', ctx => {
    requireUser(ctx);
    sendJson(ctx.res, 200, { user: publicUser(ctx.user) });
  });

  // Favourites (any signed-in role).
  const list = db.prepare('SELECT cafe_id FROM favorites WHERE user_id = ? ORDER BY created_at');
  router.get('/api/v1/me/favorites', ctx => { requireUser(ctx); sendJson(ctx.res, 200, { favorites: list.all(ctx.user.id).map(r => r.cafe_id) }); });

  router.put('/api/v1/me/favorites/:cafeId', ctx => {
    requireUser(ctx);
    if (!db.prepare("SELECT 1 FROM cafes WHERE id = ? AND status = 'active'").get(ctx.params.cafeId)) throw notFound('Кафе олдсонгүй');
    db.prepare('INSERT OR IGNORE INTO favorites (user_id, cafe_id, created_at) VALUES (?, ?, ?)').run(ctx.user.id, ctx.params.cafeId, now());
    sendJson(ctx.res, 200, { favorites: list.all(ctx.user.id).map(r => r.cafe_id) });
  });

  router.delete('/api/v1/me/favorites/:cafeId', ctx => {
    requireUser(ctx);
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND cafe_id = ?').run(ctx.user.id, ctx.params.cafeId);
    sendJson(ctx.res, 200, { favorites: list.all(ctx.user.id).map(r => r.cafe_id) });
  });

  // Merge favourites saved on this device before signing in (from the static demo).
  router.post('/api/v1/me/favorites/merge', async ctx => {
    requireUser(ctx);
    const { cafe_ids: ids } = await readJson(ctx);
    if (Array.isArray(ids)) {
      const add = db.prepare("INSERT OR IGNORE INTO favorites (user_id, cafe_id, created_at) SELECT ?, id, ? FROM cafes WHERE id = ? AND status = 'active'");
      for (const id of ids.slice(0, 100)) if (typeof id === 'string') add.run(ctx.user.id, now(), id);
    }
    sendJson(ctx.res, 200, { favorites: list.all(ctx.user.id).map(r => r.cafe_id) });
  });
}
