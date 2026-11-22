import {authorizedWrite} from '../lib/authorized-write.mjs';
// Internal admin / developer API. Every route requires the admin role.
import { readJson, sendJson, notFound, HttpError, badRequest } from '../lib/http.mjs';
import { requireRole, newId, newToken, sha256, publicUser } from '../lib/auth.mjs';
import { json, now, transaction } from '../lib/db.mjs';
import { SETUP_STATUSES, VIS_STATUSES, parseHours, projectToMap } from '../../js/live/levels.js';
import { sanitizeLayout } from '../services/visualization.mjs';
import { ownerCafeView } from './owner.mjs';
import { deviceStatus } from '../services/sensor-state.mjs';
import { createCafeOwnership } from '../services/cafe-ownership.mjs';

const EDITABLE = { name: ['text', 80], category: ['text', 40], district: ['text', 40], address: ['text', 200], hours: ['hours'], phone: ['text', 30], contact_name: ['text', 80], email: ['text', 200], description: ['text', 1000], lat: ['number', -90, 90], lng: ['number', -180, 180], map_x: ['number', 0, 1000], map_y: ['number', 0, 680], total_seats: ['int', 1, 2000], sort_order: ['int', 0, 100000], data_mode: ['enum', ['demo', 'live']], tags: ['tags'], demo: ['demo'] };

function cleanEdit(body) {
  const out = {}, details = {};
  for (const [key, [type, a, b]] of Object.entries(EDITABLE)) {
    if (!(key in body)) continue;
    const v = body[key];
    if (v === null && ['number', 'int'].includes(type)) { out[key] = null; continue; }
    if (type === 'text') { if (typeof v !== 'string' || v.length > a) details[key] = `≤ ${a} тэмдэгт`; else out[key] = v.trim(); }
    else if (type === 'hours') { if (!parseHours(v)) details[key] = '08:00–22:00 хэлбэр'; else out[key] = v.trim(); }
    else if (type === 'number') { if (!Number.isFinite(v) || v < a || v > b) details[key] = `${a}…${b}`; else out[key] = v; }
    else if (type === 'int') { if (!Number.isInteger(v) || v < a || v > b) details[key] = `${a}…${b} бүхэл тоо`; else out[key] = v; }
    else if (type === 'enum') { if (!a.includes(v)) details[key] = a.join(' | '); else out[key] = v; }
    else if (type === 'tags') { if (!Array.isArray(v) || !v.every(t => typeof t === 'string' && t.length <= 30)) details[key] = 'мөрийн жагсаалт'; else out[key] = JSON.stringify(v.slice(0, 10)); }
    else if (type === 'demo') { if (v !== null && (typeof v !== 'object' || Array.isArray(v))) details[key] = 'объект эсвэл null'; else out[key] = v === null ? null : JSON.stringify(v); }
  }
  if (Object.keys(details).length) throw new HttpError(422, 'validation_failed', 'Маягтаа шалгана уу', details);
  return out;
}

export function register(router, deps) {
  const { db, config, cafes, hub, customizer, uploads } = deps;
  const admin = requireRole('admin');
  const online = lastSeen => !!lastSeen && Date.now() - Date.parse(lastSeen) < config.deviceOfflineSec * 1000;
  const getCafe = id => { const row = db.prepare('SELECT * FROM cafes WHERE id = ?').get(id); if (!row) throw notFound('Кафе олдсонгүй'); return row; };
  const deviceView = d => ({ ...d, token_hash: undefined, is_test: !!d.is_test, enabled: !!d.enabled, status: deviceStatus(db, config, d), last_status: json(d.last_status), online: deviceStatus(db, config, d) === 'online' });

  router.get('/api/v1/admin/settings/featured-cafe', ctx => {
    admin(ctx);
    if (!ctx.user.is_super_admin) throw new HttpError(403, 'super_admin_required', 'Super Admin required');
    sendJson(ctx.res, 200, { cafe_id: db.prepare("SELECT value FROM platform_settings WHERE key='featured_cafe_id'").get()?.value || null });
  });
  router.put('/api/v1/admin/settings/featured-cafe', async ctx => {
    admin(ctx);
    if (!ctx.user.is_super_admin) throw new HttpError(403, 'super_admin_required', 'Super Admin required');
    deps.limit(`featured:${ctx.user.id}:${ctx.ip}`, 20, 60000);
    const body = await readJson(ctx);
    if (!body || (body.cafe_id !== null && (typeof body.cafe_id !== 'string' || !/^[A-Za-z0-9_.:-]{1,80}$/.test(body.cafe_id)))) throw new HttpError(422, 'validation_failed', 'Invalid cafe ID');
    if (body.cafe_id) {
      const cafe = getCafe(body.cafe_id);
      if (cafe.status !== 'active' || cafe.data_mode !== 'live') throw new HttpError(422, 'validation_failed', 'Featured cafe must be active and real');
    }
    authorizedWrite(db, ctx.user, null, 'admin', () => {
      if (!db.prepare('SELECT 1 FROM super_admin_identity WHERE user_id=?').get(ctx.user.id)) throw new HttpError(403, 'super_admin_required', 'Super Admin required');
      if (body.cafe_id) db.prepare("INSERT INTO platform_settings(key,value,updated_at,actor_id) VALUES('featured_cafe_id',?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,actor_id=excluded.actor_id").run(body.cafe_id, now(), ctx.user.id);
      else db.prepare("DELETE FROM platform_settings WHERE key='featured_cafe_id'").run();
      db.prepare('INSERT INTO user_audit_log(id,actor_id,target_id,action,at,details) VALUES(?,?,?,?,?,?)').run(newId('aud'), ctx.user.id, body.cafe_id || 'platform', 'platform.featured_cafe.set', now(), '{}');
    });
    sendJson(ctx.res, 200, { cafe_id: body.cafe_id });
  });

  // Tell open browsers when the public catalogue or a café's state changed.
  // Anonymous subscribers only learn about cafés that are, or just stopped being, public:
  // non-public setup states (under review, rejected, ...) never leave the admin surface.
  function publish(row, previousStatus = row.status) {
    if (row.status === 'active') { const cafe = cafes.publicCafe(row); hub.broadcast('cafe', cafe); }
    if (row.status === 'active' || previousStatus === 'active') hub.broadcast('catalog', { id: row.id, status: row.status === 'active' ? 'active' : 'removed' });
  }

  router.get('/api/v1/admin/overview', ctx => {
    admin(ctx);
    const count = (sql, ...args) => db.prepare(sql).get(...args).n;
    sendJson(ctx.res, 200, {
      cafes: count('SELECT COUNT(*) n FROM cafes'),
      active: count("SELECT COUNT(*) n FROM cafes WHERE status = 'active'"),
      pending_applications: count("SELECT COUNT(*) n FROM cafes c JOIN applications a ON a.cafe_id = c.id WHERE c.status NOT IN ('active', 'rejected')"),
      owners: count("SELECT COUNT(*) n FROM users WHERE role = 'owner'"),
      devices: count('SELECT COUNT(*) n FROM devices WHERE revoked_at IS NULL'),
      devices_online: db.prepare('SELECT * FROM devices WHERE revoked_at IS NULL').all().filter(d => deviceStatus(db, config, d) === 'online').length,
      measurements_24h: count('SELECT COUNT(*) n FROM measurements WHERE received_at > ?', new Date(Date.now() - 86400000).toISOString()),
      stream_clients: hub.size,
      config: { poll_interval_sec: config.pollIntervalSec, stale_after_sec: config.staleAfterSec, device_offline_sec: config.deviceOfflineSec, visualization_provider: customizer.provider }
    });
  });

  router.get('/api/v1/admin/cafes', ctx => {
    admin(ctx);
    const rows = db.prepare(`SELECT c.*, u.email AS owner_email,
        (SELECT COUNT(*) FROM devices d WHERE d.cafe_id = c.id AND d.revoked_at IS NULL) AS device_count,
        (SELECT MAX(ts) FROM measurements m WHERE m.cafe_id = c.id) AS last_measurement_at,
        (SELECT id FROM applications a WHERE a.cafe_id = c.id LIMIT 1) AS application_id
      FROM cafes c LEFT JOIN users u ON u.id = c.owner_id ORDER BY c.sort_order, c.created_at`).all();
    sendJson(ctx.res, 200, { cafes: rows.map(r => ({ id: r.id, name: r.name, status: r.status, data_mode: r.data_mode, owner_email: r.owner_email, district: r.district, hours: r.hours, device_count: r.device_count, last_measurement_at: r.last_measurement_at, application_id: r.application_id, visualization_status: json(r.visualization, {}).status || 'not_started', created_at: r.created_at, updated_at: r.updated_at })) });
  });

  router.get('/api/v1/admin/cafes/:id', ctx => {
    admin(ctx);
    const row = getCafe(ctx.params.id);
    const owner = row.owner_id ? publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(row.owner_id)) : null;
    sendJson(ctx.res, 200, { cafe: { ...ownerCafeView(deps, row), owner, lat: row.lat, lng: row.lng, map_x: row.map_x, map_y: row.map_y, sort_order: row.sort_order, demo: json(row.demo), visualization: json(row.visualization, { status: 'not_started' }), public: row.status === 'active' ? cafes.publicCafe(row) : null } });
  });

  router.patch('/api/v1/admin/cafes/:id', async ctx => {
    admin(ctx);
    const row = getCafe(ctx.params.id);
    const next = cleanEdit(await readJson(ctx));
    // Moving the address moves the pin unless the map position is set explicitly.
    if ((next.lat != null || next.lng != null) && next.map_x === undefined && next.map_y === undefined) {
      const p = projectToMap(next.lat ?? row.lat, next.lng ?? row.lng); next.map_x = p.x; next.map_y = p.y;
    }
    if (Object.keys(next).length) authorizedWrite(db,ctx.user,null,'admin',()=>db.prepare(`UPDATE cafes SET ${Object.keys(next).map(k => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...Object.values(next), now(), row.id));
    const updated = getCafe(row.id);
    publish(updated);
    sendJson(ctx.res, 200, { ok: true });
  });

  // Assign, change or remove the café's owner account (shared policy with Cloudflare).
  const ownership = createCafeOwnership({
    sql: { first: async (q, ...args) => db.prepare(q).get(...args), batch: async entries => transaction(db, () => entries.map(([q, ...args]) => db.prepare(q).run(...args))) },
    id: newId, fail: (status, code, message) => { throw new HttpError(status, code, message); }
  });
  router.put('/api/v1/admin/cafes/:id/owner', async ctx => {
    admin(ctx);
    deps.limit(`cafe-owner:${ctx.user.id}:${ctx.ip}`, 30, 60000);
    sendJson(ctx.res, 200, await ownership.setOwner(ctx.user, ctx.params.id, await readJson(ctx)));
  });

  // Setup workflow: submitted → under_review → contacting → visualization → sensors → testing → active (or rejected).
  router.post('/api/v1/admin/cafes/:id/status', async ctx => {
    admin(ctx);
    const row = getCafe(ctx.params.id);
    const { status, note = '' } = await readJson(ctx);
    if (!SETUP_STATUSES.includes(status)) throw badRequest(`status must be one of ${SETUP_STATUSES.join(', ')}`);
    if (status === 'active' && row.data_mode === 'live' && row.map_x == null) throw new HttpError(422, 'missing_location', 'Идэвхжүүлэхээс өмнө газрын зураг дээрх байршлыг оруулна уу');
    authorizedWrite(db,ctx.user,null,'admin', () => {
      db.prepare('UPDATE cafes SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), row.id);
      db.prepare('INSERT INTO status_history (cafe_id, from_status, to_status, note, actor_id, at) VALUES (?, ?, ?, ?, ?, ?)').run(row.id, row.status, status, String(note).slice(0, 500), ctx.user.id, now());
    });
    publish(getCafe(row.id), row.status);
    sendJson(ctx.res, 200, { ok: true, status });
  });

  router.put('/api/v1/admin/cafes/:id/visualization', async ctx => {
    admin(ctx);
    const row = getCafe(ctx.params.id);
    const body = await readJson(ctx);
    if (!VIS_STATUSES.some(([key]) => key === body.status)) throw badRequest('status must be not_started, in_progress or ready');
    const current = json(row.visualization, {});
    const layout = body.layout ? sanitizeLayout(body.layout) : current.layout || null;
    if (body.status === 'ready' && !layout) throw badRequest('A ready visualization needs a layout');
    const visualization = { ...current, status: body.status, layout, notes: typeof body.notes === 'string' ? body.notes.slice(0, 2000) : current.notes || '', generator: body.generator || 'manual', updated_at: now() };
    authorizedWrite(db,ctx.user,null,'admin',()=>db.prepare('UPDATE cafes SET visualization = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(visualization), now(), row.id));
    publish(getCafe(row.id));
    sendJson(ctx.res, 200, { visualization });
  });

  // Suggest a layout from the café's details and photos (rule-based today, AI provider later).
  router.post('/api/v1/admin/cafes/:id/visualization/suggest', async ctx => {
    admin(ctx);
    const row = getCafe(ctx.params.id);
    const app = db.prepare('SELECT * FROM applications WHERE cafe_id = ? LIMIT 1').get(row.id);
    const photos = app ? db.prepare('SELECT id, mime, file FROM application_photos WHERE application_id = ? ORDER BY position').all(app.id).map(p => ({ id: p.id, mime: p.mime, read: () => uploads.read(p.file) })) : [];
    sendJson(ctx.res, 200, { suggestion: await customizer.suggest({ cafe: row, form: json(app?.form, {}), photos }) });
  });

  router.get('/api/v1/admin/applications', ctx => {
    admin(ctx);
    const rows = db.prepare(`SELECT a.id, a.cafe_id, a.created_at, a.form, a.owner_id IS NOT NULL AS has_owner, c.status, c.name, u.email AS owner_email,
        (SELECT COUNT(*) FROM application_photos p WHERE p.application_id = a.id) AS photo_count
      FROM applications a JOIN cafes c ON c.id = a.cafe_id LEFT JOIN users u ON u.id = a.owner_id ORDER BY a.created_at DESC`).all();
    sendJson(ctx.res, 200, { applications: rows.map(r => ({ ...r, has_owner: !!r.has_owner, form: json(r.form, {}) })) });
  });

  /* ---------- devices ---------- */
  router.get('/api/v1/admin/devices', ctx => {
    admin(ctx);
    const rows = db.prepare('SELECT d.*, c.name AS cafe_name FROM devices d JOIN cafes c ON c.id = d.cafe_id ORDER BY d.revoked_at IS NOT NULL, d.created_at DESC').all();
    sendJson(ctx.res, 200, { devices: rows.map(deviceView) });
  });

  router.post('/api/v1/admin/devices', async ctx => {
    admin(ctx);
    const body = await readJson(ctx);
    const id = body.id ? String(body.id).trim() : newId('dev');
    if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(id)) throw new HttpError(422, 'validation_failed', 'Маягтаа шалгана уу', { id: 'A–Z, 0–9, _ . : - (≤ 64)' });
    if (typeof body.cafe_id !== 'string' || !body.cafe_id) throw new HttpError(422, 'validation_failed', 'cafe_id is required');
    getCafe(body.cafe_id);
    if (db.prepare('SELECT 1 FROM devices WHERE id = ?').get(id)) throw new HttpError(409, 'device_exists', 'Ийм ID-тай төхөөрөмж бүртгэлтэй байна');
    const token = newToken('lsd_');
    authorizedWrite(db,ctx.user,null,'admin',()=>db.prepare('INSERT INTO devices (id, cafe_id, label, kind, is_test, token_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, body.cafe_id, String(body.label || '').slice(0, 80), ['sensor', 'camera', 'gateway', 'simulator'].includes(body.kind) ? body.kind : 'sensor', body.is_test || body.kind === 'simulator' ? 1 : 0, sha256(token), now()));
    // The token is shown once; only its hash is stored.
    sendJson(ctx.res, 201, { device: deviceView(db.prepare('SELECT * FROM devices WHERE id = ?').get(id)), token });
  });

  router.patch('/api/v1/admin/devices/:id', async ctx => {
    admin(ctx);
    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(ctx.params.id);
    if (!device) throw notFound('Төхөөрөмж олдсонгүй');
    const body = await readJson(ctx);
    if (body.cafe_id) getCafe(body.cafe_id);
    const kind = ['sensor', 'camera', 'gateway', 'simulator'].includes(body.kind) ? body.kind : device.kind;
    if (body.enabled != null && typeof body.enabled !== 'boolean') throw new HttpError(422, 'validation_failed', 'enabled must be a boolean');
    authorizedWrite(db,ctx.user,null,'admin',()=>db.prepare('UPDATE devices SET label = ?, kind = ?, is_test = ?, cafe_id = ?, enabled = ? WHERE id = ?').run(
      body.label != null ? String(body.label).slice(0, 80) : device.label,
      kind,
      kind === 'simulator' || (body.is_test != null ? body.is_test : device.is_test) ? 1 : 0,
      body.cafe_id || device.cafe_id, body.enabled == null ? device.enabled : Number(body.enabled), device.id));
    if (body.enabled === false || (body.cafe_id && body.cafe_id !== device.cafe_id)) deps.sensors.setStatus(device, 'offline');
    publish(getCafe(device.cafe_id));
    if (body.cafe_id && body.cafe_id !== device.cafe_id) publish(getCafe(body.cafe_id));
    sendJson(ctx.res, 200, { device: deviceView(db.prepare('SELECT * FROM devices WHERE id = ?').get(device.id)) });
  });

  router.post('/api/v1/admin/devices/:id/token', ctx => {
    admin(ctx);
    const device = db.prepare('SELECT * FROM devices WHERE id = ? AND revoked_at IS NULL').get(ctx.params.id);
    if (!device) throw notFound('Төхөөрөмж олдсонгүй');
    const token = newToken('lsd_');
    authorizedWrite(db,ctx.user,null,'admin',()=>db.prepare('UPDATE devices SET token_hash = ? WHERE id = ?').run(sha256(token), device.id));
    sendJson(ctx.res, 200, { token });
  });

  router.delete('/api/v1/admin/devices/:id', ctx => {
    admin(ctx);
    authorizedWrite(db,ctx.user,null,'admin',()=>db.prepare('UPDATE devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(now(), ctx.params.id));
    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(ctx.params.id);
    if (device) deps.sensors.setStatus(device, 'offline');
    sendJson(ctx.res, 200, { ok: true });
  });

  /* ---------- measurements ---------- */
  router.get('/api/v1/admin/measurements', ctx => {
    admin(ctx);
    const where = [], args = [];
    if (ctx.query.cafe_id) { where.push('cafe_id = ?'); args.push(ctx.query.cafe_id); }
    if (ctx.query.device_id) { where.push('device_id = ?'); args.push(ctx.query.device_id); }
    if (ctx.query.since) { where.push('ts >= ?'); args.push(ctx.query.since); }
    if (ctx.query.before) { where.push('id < ?'); args.push(+ctx.query.before); }
    const limit = Math.min(500, Math.max(1, +ctx.query.limit || 100));
    const rows = db.prepare(`SELECT * FROM measurements ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ${limit}`).all(...args);
    sendJson(ctx.res, 200, { measurements: rows.map(r => ({ ...r, is_test: !!r.is_test, raw: json(r.raw) })) });
  });
}
