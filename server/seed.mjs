// Seeds the existing demo cafés (js/cafes.js) so the public site looks the same with
// or without the backend. They stay labelled as demo data (data_mode = 'demo').
import { getCafes } from '../js/cafes.js';
import { DEMO_LAYOUT } from '../js/simulation/layouts.js';
import { mapToLatLng } from '../js/live/levels.js';
import { now } from './lib/db.mjs';
import { hashPassword, newId } from './lib/auth.mjs';

export function seedDemoCafes(db) {
  if (db.prepare('SELECT COUNT(*) AS n FROM cafes').get().n) return 0;
  const insert = db.prepare(`INSERT INTO cafes (id, name, status, data_mode, category, district, address, lat, lng, map_x, map_y, hours, description, tags, total_seats, demo, visualization, sort_order, created_at, updated_at)
    VALUES (?, ?, 'active', 'demo', 'Кафе', 'Сүхбаатар', '', ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`);
  const t = now();
  getCafes().forEach((c, i) => {
    const { lat, lng } = mapToLatLng(c.x, c.y);
    const demo = { dist: c.dist, walk: c.walk, open: c.open, ...(c.opens ? { opens: c.opens } : {}), occ: c.occ, sound: c.sound, wifi: c.wifi, mbps: c.mbps, note: c.note };
    const visualization = { status: 'ready', layout: { preset: DEMO_LAYOUT[c.id] || 'classic', overrides: {} }, generator: 'manual', updated_at: t };
    insert.run(c.id, c.name, lat, lng, c.x, c.y, c.hours, c.note, JSON.stringify(c.tags), JSON.stringify(demo), JSON.stringify(visualization), i, t, t);
  });
  return getCafes().length;
}

// Creates the first admin (or promotes an existing account). Credentials come from
// LS_ADMIN_EMAIL / LS_ADMIN_PASSWORD or `npm run create-admin`; nothing is hard-coded.
export async function ensureAdmin(db, email, password, name = 'Admin') {
  email = email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) { db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(existing.id); return existing.id; }
  const id = newId('usr');
  db.prepare("INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, 'admin', ?)").run(id, email, await hashPassword(password), name, now());
  return id;
}
