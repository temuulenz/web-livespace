// Café-owner dashboard data. Owners only ever see their own cafés.
import { readJson, sendJson, notFound, HttpError } from '../lib/http.mjs';
import { requireRole } from '../lib/auth.mjs';
import { json, now } from '../lib/db.mjs';
import { parseHours } from '../../js/live/levels.js';

export function ownerCafeView({ db, config, cafes }, row) {
  const app = db.prepare('SELECT * FROM applications WHERE cafe_id = ? ORDER BY created_at LIMIT 1').get(row.id);
  const photos = app ? db.prepare('SELECT id, mime, size, position FROM application_photos WHERE application_id = ? ORDER BY position').all(app.id) : [];
  const devices = db.prepare('SELECT id, label, kind, is_test, last_seen_at, last_status, revoked_at FROM devices WHERE cafe_id = ? AND revoked_at IS NULL').all(row.id)
    .map(d => ({ ...d, is_test: !!d.is_test, last_status: json(d.last_status), online: !!d.last_seen_at && Date.now() - Date.parse(d.last_seen_at) < config.deviceOfflineSec * 1000 }));
  const history = db.prepare('SELECT from_status, to_status, note, at FROM status_history WHERE cafe_id = ? ORDER BY id').all(row.id);
  const visualization = json(row.visualization, { status: 'not_started' });
  return {
    id: row.id, name: row.name, status: row.status, data_mode: row.data_mode, category: row.category, district: row.district, address: row.address,
    hours: row.hours, phone: row.phone, contact_name: row.contact_name, email: row.email, description: row.description, tags: json(row.tags, []), total_seats: row.total_seats,
    created_at: row.created_at, updated_at: row.updated_at,
    application: app ? { id: app.id, created_at: app.created_at, form: json(app.form, {}), photos: photos.map(p => ({ ...p, url: `/api/v1/files/photos/${p.id}` })) } : null,
    visualization: { status: visualization.status, layout: visualization.status === 'ready' ? visualization.layout : null, updated_at: visualization.updated_at || null },
    devices,
    history,
    // Only real measurements are shown to owners as their café's live state.
    live: row.data_mode === 'demo' ? { mode: 'demo' } : cafes.liveSummary(row)
  };
}

export function register(router, deps) {
  const { db } = deps;
  const ownerOnly = requireRole('owner', 'admin');

  router.get('/api/v1/owner/cafes', ctx => {
    ownerOnly(ctx);
    const rows = db.prepare('SELECT * FROM cafes WHERE owner_id = ? ORDER BY created_at').all(ctx.user.id);
    sendJson(ctx.res, 200, { cafes: rows.map(row => ownerCafeView(deps, row)) });
  });

  // Owners may keep their contact details, hours and description up to date.
  router.patch('/api/v1/owner/cafes/:id', async ctx => {
    ownerOnly(ctx);
    const row = db.prepare('SELECT * FROM cafes WHERE id = ? AND owner_id = ?').get(ctx.params.id, ctx.user.id);
    if (!row) throw notFound('Кафе олдсонгүй');
    const body = await readJson(ctx);
    const next = {};
    for (const [key, max] of [['hours', 20], ['phone', 30], ['contact_name', 80], ['description', 1000]]) {
      if (body[key] == null) continue;
      if (typeof body[key] !== 'string' || body[key].length > max) throw new HttpError(422, 'validation_failed', 'Маягтаа шалгана уу', { [key]: `${max} тэмдэгтээс ихгүй` });
      next[key] = body[key].trim();
    }
    if (next.hours && !parseHours(next.hours)) throw new HttpError(422, 'validation_failed', 'Маягтаа шалгана уу', { hours: 'Цагийг 08:00–22:00 хэлбэрээр оруулна уу' });
    if (Object.keys(next).length) db.prepare(`UPDATE cafes SET ${Object.keys(next).map(k => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...Object.values(next), now(), row.id);
    sendJson(ctx.res, 200, { cafe: ownerCafeView(deps, db.prepare('SELECT * FROM cafes WHERE id = ?').get(row.id)) });
  });

  // Application photographs: visible to the café's owner and to admins only.
  router.get('/api/v1/files/photos/:id', async ctx => {
    requireRole('owner', 'admin', 'user')(ctx);
    const photo = db.prepare('SELECT p.*, a.owner_id FROM application_photos p JOIN applications a ON a.id = p.application_id WHERE p.id = ?').get(ctx.params.id);
    if (!photo || (ctx.user.role !== 'admin' && photo.owner_id !== ctx.user.id)) throw notFound('Зураг олдсонгүй');
    const data = await deps.uploads.read(photo.file);
    ctx.res.writeHead(200, { 'Content-Type': photo.mime, 'Content-Length': data.length, 'Cache-Control': 'private, max-age=3600' });
    ctx.res.end(data);
  });
}
