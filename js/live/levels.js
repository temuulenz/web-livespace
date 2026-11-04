/* Shared, dependency-free rules used by both the browser and the server.
 *
 * Sensors report physical values (dB, a 0–100 Wi-Fi quality score, seat counts).
 * The interface shows LiveSpace's existing levels: noise 1–5 (SS in cafes.js),
 * Wi-Fi 1–4 (WIFI in cafes.js) and occupancy as a percentage.
 */

// Noise in dBA → the five familiar comparisons (library … school break).
const NOISE_LIMITS = [45, 55, 65, 75];
export const noiseLevel = db => db == null || !Number.isFinite(+db) ? 0 : 1 + NOISE_LIMITS.filter(limit => +db >= limit).length;

// Wi-Fi quality score 0–100 → Сул / Дундаж / Сайн / Маш сайн.
export const wifiLevel = quality => quality == null || !Number.isFinite(+quality) ? 0 : +quality < 25 ? 1 : +quality < 50 ? 2 : +quality < 75 ? 3 : 4;

// Seat counts → occupied percentage (the `occ` field of a café record).
export function occupancyPercent({ available_seats: available, occupied_seats: occupied, total_seats: total }) {
  const all = Number.isFinite(total) && total > 0 ? total : (available ?? 0) + (occupied ?? 0);
  if (!all) return null;
  const busy = Number.isFinite(occupied) ? occupied : all - available;
  return Math.max(0, Math.min(100, Math.round(busy / all * 100)));
}

/* ---------- opening hours ---------- */

// "08:00–22:00" (en dash or hyphen). An end of 00:00 means midnight; an end before
// the start means the café closes after midnight.
export function parseHours(hours) {
  const match = /^(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})$/.exec(String(hours || '').trim());
  if (!match) return null;
  const open = +match[1] * 60 + +match[2];
  let close = +match[3] * 60 + +match[4];
  if (close <= open) close += 24 * 60;
  return { open, close };
}

// `minutes` is the local time of day in minutes (Ulaanbaatar time on the server).
export function openState(hours, minutes) {
  const span = parseHours(hours);
  if (!span) return { open: true, opens: null };
  const inside = (minutes >= span.open && minutes < span.close) || (minutes + 1440 >= span.open && minutes + 1440 < span.close);
  if (inside) return { open: true, opens: null };
  const hh = String(Math.floor(span.open / 60)).padStart(2, '0'), mm = String(span.open % 60).padStart(2, '0');
  return { open: false, opens: `${minutes < span.open ? 'Өнөөдөр' : 'Маргааш'} ${hh}:${mm}` };
}

export function ulaanbaatarMinutes(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ulaanbaatar', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(p => [p.type, p.value]));
  return +parts.hour * 60 + +parts.minute;
}

/* ---------- map ---------- */

// The illustrated map (1000×680 units) shows central Ulaanbaatar around Sükhbaatar
// Square. This linear projection is approximate and only places pins on the drawing.
export const MAP_BOUNDS = { west: 106.8950, east: 106.9450, north: 47.9267, south: 47.9017 };
export const YOU_ARE_HERE = [575, 292];

export function projectToMap(lat, lng) {
  const { west, east, north, south } = MAP_BOUNDS;
  return { x: Math.round((lng - west) / (east - west) * 1000), y: Math.round((north - lat) / (north - south) * 680) };
}
export function mapToLatLng(x, y) {
  const { west, east, north, south } = MAP_BOUNDS;
  return { lat: +(north - y / 680 * (north - south)).toFixed(6), lng: +(west + x / 1000 * (east - west)).toFixed(6) };
}

// Straight-line distance to the «Та энд» marker (≈3.7 m per map unit) and walking time at 80 m/min.
export function walkFrom(x, y) {
  const meters = Math.round(Math.hypot(x - YOU_ARE_HERE[0], y - YOU_ARE_HERE[1]) * 3.7 / 10) * 10;
  return { dist: meters < 1000 ? `${meters} м` : `${(meters / 1000).toFixed(1)} км`, walk: Math.max(1, Math.round(meters / 80)) };
}

/* ---------- setup workflow ---------- */

export const SETUP_STEPS = [
  ['submitted', 'Хүсэлт ирсэн'],
  ['under_review', 'Хянаж байна'],
  ['contacting', 'Эзэмшигчтэй холбогдож байна'],
  ['visualization', 'Зураглал бэлтгэж байна'],
  ['sensors', 'Мэдрэгч суурилуулж байна'],
  ['testing', 'Турших, шалгах'],
  ['active', 'Идэвхтэй']
];
export const SETUP_STATUSES = [...SETUP_STEPS.map(([key]) => key), 'rejected'];
export const statusLabel = key => key === 'rejected' ? 'Татгалзсан' : (SETUP_STEPS.find(([k]) => k === key)?.[1] || key);

export const VIS_STATUSES = [['not_started', 'Эхлээгүй'], ['in_progress', 'Бэлтгэж байна'], ['ready', 'Бэлэн']];
