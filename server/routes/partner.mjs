// Partnership applications ("Хамтран ажиллах") and café-owner account creation.
//
// 1. A guest submits the application with 3–4 photos (no account needed).
// 2. The response carries a one-time claim token.
// 3. The browser immediately offers owner registration with that token; the new
//    owner account is linked to the café. A signed-in user can claim instead.
import { readJson, sendJson, HttpError } from '../lib/http.mjs';
import { newId, newToken, sha256, validateCredentials, publicUser, requireUser } from '../lib/auth.mjs';
import { now, transaction } from '../lib/db.mjs';
import { createUser } from './auth.mjs';
import { decodePhoto } from '../services/uploads.mjs';
import { parseHours, projectToMap } from '../../js/live/levels.js';

const DISTRICTS = ['Сүхбаатар', 'Чингэлтэй', 'Баянгол', 'Хан-Уул', 'Баянзүрх', 'Сонгинохайрхан'];
const CATEGORIES = ['Кафе', 'Коворкинг', 'Номын сан'];
const PURPOSES = ['Сурах', 'Ажиллах', 'Найзуудтай', 'Тухтай'];

function validateApplication(input) {
  const details = {};
  const text = (key, max, required = true) => {
    const value = typeof input[key] === 'string' ? input[key].trim() : '';
    if (required && !value) details[key] = 'Энэ талбарыг бөглөнө үү';
    else if (value.length > max) details[key] = `${max} тэмдэгтээс ихгүй`;
    return value;
  };
  const form = {
    cafe_name: text('cafe_name', 80), contact_name: text('contact_name', 80), phone: text('phone', 30), email: text('email', 200),
    district: text('district', 40), category: text('category', 40), address: text('address', 200), hours: text('hours', 20),
    description: text('description', 1000), extra: text('extra', 2000, false)
  };
  if (form.phone && form.phone.replace(/\D/g, '').length < 8) details.phone = '8 оронтой дугаар оруулна уу';
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) details.email = 'И-мэйл хаяг буруу байна';
  if (form.district && !DISTRICTS.includes(form.district)) details.district = 'Дүүргээ сонгоно уу';
  if (form.category && !CATEGORIES.includes(form.category)) details.category = 'Төрлөө сонгоно уу';
  if (form.hours && !parseHours(form.hours)) details.hours = 'Цагийг 08:00–22:00 хэлбэрээр оруулна уу';
  form.purposes = Array.isArray(input.purposes) ? [...new Set(input.purposes.filter(p => PURPOSES.includes(p)))] : [];
  form.seats = input.seats == null || input.seats === '' ? null : Number(input.seats);
  if (form.seats != null && (!Number.isInteger(form.seats) || form.seats < 1 || form.seats > 2000)) details.seats = '1–2000 хооронд бүхэл тоо';
  form.lat = Number.isFinite(input.lat) ? input.lat : null;
  form.lng = Number.isFinite(input.lng) ? input.lng : null;
  const photos = Array.isArray(input.photos) ? input.photos : [];
  if (photos.length < 3 || photos.length > 4) details.photos = 'Кафены 3–4 зураг оруулна уу';
  if (Object.keys(details).length) throw new HttpError(422, 'validation_failed', 'Маягтаа шалгана уу', details);
  return { form, photos };
}

export function register(router, { db, config, limit, uploads, sessions }) {
  router.post('/api/v1/applications', async ctx => {
    limit(`apply:${ctx.ip}`, 5, 3600 * 1000);
    const input = await readJson(ctx, 4 * Math.ceil(config.maxPhotoBytes * 1.37) + 64 * 1024);
    const { form, photos } = validateApplication(input);
    const decoded = photos.map(p => decodePhoto(p, config.maxPhotoBytes));

    const applicationId = newId('app'), cafeId = newId('cafe'), token = newToken('lsc_'), t = now();
    const position = form.lat != null && form.lng != null ? projectToMap(form.lat, form.lng) : { x: null, y: null };
    const files = [];
    try {
      for (const [i, photo] of decoded.entries()) files.push({ id: newId('pho'), file: await uploads.save(applicationId, `photo-${i + 1}`, photo), mime: photo.mime, size: photo.buffer.length, position: i });
      transaction(db, () => {
        db.prepare(`INSERT INTO cafes (id, name, status, data_mode, category, district, address, lat, lng, map_x, map_y, hours, phone, contact_name, email, description, tags, total_seats, created_at, updated_at)
          VALUES (?, ?, 'submitted', 'live', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(cafeId, form.cafe_name, form.category, form.district, form.address, form.lat, form.lng, position.x, position.y, form.hours, form.phone, form.contact_name, form.email, form.description, JSON.stringify(form.purposes), form.seats, t, t);
        db.prepare('INSERT INTO applications (id, cafe_id, claim_token_hash, owner_id, form, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(applicationId, cafeId, sha256(token), null, JSON.stringify(form), t);
        const addPhoto = db.prepare('INSERT INTO application_photos (id, application_id, file, mime, size, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
        for (const f of files) addPhoto.run(f.id, applicationId, f.file, f.mime, f.size, f.position, t);
        db.prepare("INSERT INTO status_history (cafe_id, from_status, to_status, note, actor_id, at) VALUES (?, NULL, 'submitted', 'Хүсэлт илгээгдсэн', NULL, ?)").run(cafeId, t);
      });
    } catch (error) {
      await uploads.removeFolder(applicationId);
      throw error;
    }
    // A signed-in user is linked straight away; otherwise the claim token is used.
    if (ctx.user) claim(ctx.user, applicationId);
    sendJson(ctx.res, 201, { application_id: applicationId, cafe_id: cafeId, claim_token: ctx.user ? null : token, status: 'submitted' });
  });

  function claim(user, applicationId) {
    const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId);
    transaction(db, () => {
      db.prepare('UPDATE applications SET owner_id = ?, claim_token_hash = NULL WHERE id = ?').run(user.id, app.id);
      db.prepare('UPDATE cafes SET owner_id = ?, updated_at = ? WHERE id = ?').run(user.id, now(), app.cafe_id);
      if (user.role === 'user') db.prepare("UPDATE users SET role = 'owner' WHERE id = ?").run(user.id);
    });
  }

  const findByToken = token => typeof token === 'string' && token.startsWith('lsc_') ? db.prepare('SELECT * FROM applications WHERE claim_token_hash = ?').get(sha256(token)) : null;

  // Step 4–5 of the owner flow: create the owner account for a just-submitted application.
  router.post('/api/v1/auth/register-owner', async ctx => {
    limit(`register:${ctx.ip}`, 10, 3600 * 1000);
    const body = await readJson(ctx);
    const app = findByToken(body.claim_token);
    if (!app) throw new HttpError(400, 'invalid_claim', 'Хүсэлтийн холбоос хүчингүй эсвэл аль хэдийн ашиглагдсан байна');
    const input = validateCredentials(body);
    const user = await createUser(db, input, 'owner');
    claim(user, app.id);
    sendJson(ctx.res, 201, { user: publicUser({ ...user, role: 'owner' }), cafe_id: app.cafe_id }, { 'Set-Cookie': sessions.start(user.id) });
  });

  // An existing account (e.g. a regular user) claims the application instead.
  router.post('/api/v1/applications/claim', async ctx => {
    requireUser(ctx);
    const app = findByToken((await readJson(ctx)).claim_token);
    if (!app) throw new HttpError(400, 'invalid_claim', 'Хүсэлтийн холбоос хүчингүй эсвэл аль хэдийн ашиглагдсан байна');
    claim(ctx.user, app.id);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(ctx.user.id);
    sendJson(ctx.res, 200, { user: publicUser(user), cafe_id: app.cafe_id });
  });
}
