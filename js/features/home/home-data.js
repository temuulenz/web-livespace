// Нүүр хуудасны (Design C) өгөгдлийн цэвэр функцууд — DOM-гүй, Node-д тестлэгдэнэ
// (tests/home-data.test.mjs).
//
// Зарчим: зөвхөн API/каталогийн бодит өгөгдөл. Хэмжээгүй утгыг 0 гэж харуулахгүй, нуух;
// демо, туршилтын утга үргэлж ДЕМО/ТУРШИЛТ шошготой; хүний тооноос сул суудал таамаглахгүй.
import { trustState, seatState, wifiState, ageShort, openState, dataModeOf } from '../../live/status.js';

export const NOISE_WORD = ['', 'Нам гүм', 'Намуухан', 'Яриатай', 'Шуугиантай', 'Чанга'];
export const WIFI_WORD = ['', 'Сул', 'Дундаж', 'Сайн', 'Маш сайн'];
export const LEVEL_LABEL = { free: 'Сул', mid: 'Дунд', full: 'Дүүрэн' };
const BADGE_PREFIX = { live: 'ШУУД', test: 'ТУРШИЛТ', demo: 'ДЕМО' };

// Дүүргэлтийн түвшин (эзэлсэн %): <50 сул, <75 дунд, бусад дүүрэн (газрын зургийн өнгөтэй ижил хязгаар).
export const levelOf = occupied => occupied < 50 ? 'free' : occupied < 75 ? 'mid' : 'full';

// Нэг кафены шууд төлөв. has=false бол баар, хувь харуулахгүй.
export function liveInfo(c, { now = Date.now(), staleAfterSec = 900 } = {}) {
  const trust = trustState(c, { now, staleAfterSec });
  const open = openState(c);
  const base = { kind: trust.kind, demo: trust.kind === 'demo', open: open.open, openText: open.text };
  if (!c.open) return { ...base, has: false, note: open.text };
  if (trust.kind === 'stale') return { ...base, has: false, note: trust.text };
  if (trust.kind === 'none') return { ...base, has: false, note: 'Шууд хэмжилтгүй' };
  const seat = seatState(c, { now, staleAfterSec });
  if (!seat.known) return { ...base, has: false, note: 'Шууд хэмжилтгүй' };
  const free = trust.kind === 'demo' ? 100 - c.occ : c.live.free_pct;
  if (!Number.isFinite(free) || free < 0 || free > 100) return { ...base, has: false, note: 'Шууд хэмжилтгүй' };
  const occupied = Math.round(100 - free), level = levelOf(occupied);
  const at = c.live?.sensor?.timestamp || c.live?.updated_at;
  return {
    ...base, has: true, occupied, level, label: LEVEL_LABEL[level],
    badge: `${BADGE_PREFIX[trust.kind] || 'ДЕМО'} · ${LEVEL_LABEL[level]}`,
    age: trust.kind === 'demo' ? '' : ageShort(at, now)
  };
}

const hasTag = (c, words) => (c.tags || []).some(tag => words.some(w => String(tag).toLowerCase().includes(w)));
const noiseKnown = c => c.open && Number.isInteger(c.sound) && c.sound >= 1 && c.sound <= 5;
const wifiLevelOf = c => { const w = wifiState(c); return w.known ? (dataModeOf(c) === 'demo' ? c.wifi : c.live?.wifi_level) || 0 : 0; };

// Картын доод мөрийн шошгууд: дуу, Wi-Fi, онцлог (зөвхөн мэдээлэл байвал).
export function featureTags(c) {
  const tags = [];
  if (noiseKnown(c)) tags.push({ key: 'noise', text: NOISE_WORD[c.sound] });
  const wifi = wifiLevelOf(c);
  if (wifi) tags.push({ key: 'wifi', text: WIFI_WORD[wifi] });
  if (hasTag(c, ['залгуур'])) tags.push({ key: 'plug', text: 'Залгууртай' });
  if (hasTag(c, ['хүүхд', 'хүүхэд'])) tags.push({ key: 'kids', text: 'Хүүхдийн булантай' });
  return tags;
}

// Ангиллын мөр. test(c, ctx): ctx = { live, km }. Тоо нь 0 бол ангиллыг нууна.
export const CATEGORIES = [
  { key: 'all', label: 'Бүгд', test: () => true },
  { key: 'seats', label: 'Сул суудал', test: (c, x) => x.live.has && x.live.level === 'free' },
  { key: 'study', label: 'Хичээл хийх', test: c => hasTag(c, ['сурах', 'хичээл']) },
  { key: 'quiet', label: 'Нам гүм', test: c => noiseKnown(c) && c.sound <= 2 },
  { key: 'wifi', label: 'Wi-Fi сайн', test: c => wifiLevelOf(c) >= 3 },
  { key: 'plug', label: 'Залгууртай', test: c => hasTag(c, ['залгуур']) },
  { key: 'kids', label: 'Хүүхэдтэй', test: c => hasTag(c, ['хүүхд', 'хүүхэд']) },
  { key: 'meet', label: 'Уулзалт', test: c => hasTag(c, ['найз', 'уулзалт']) },
  { key: 'near', label: 'Ойрхон', test: (c, x) => x.km != null && x.km <= 1 }
];
export const categoryByKey = key => CATEGORIES.find(c => c.key === key) || CATEGORIES[0];

export function categoryCounts(cafes, ctxOf) {
  const counts = Object.fromEntries(CATEGORIES.map(c => [c.key, 0]));
  for (const cafe of cafes) { const ctx = ctxOf(cafe); for (const cat of CATEGORIES) if (cat.test(cafe, ctx)) counts[cat.key]++; }
  return counts;
}

// Дээд талын «шууд» хураангуй. Утга нь null бол тухайн pill-ийг нууна.
export function liveSummary(cafes, ctxOf) {
  if (!cafes.length) return { open: null, free: null, quiet: null, demo: false };
  let open = 0, free = 0, quiet = 0, demo = false;
  for (const c of cafes) {
    const ctx = ctxOf(c);
    if (c.open) { open++; if (ctx.live.demo) demo = true; }
    if (ctx.live.has && ctx.live.level === 'free') free++;
    if (noiseKnown(c) && c.sound <= 2) quiet++;
  }
  return { open: open || null, free: free || null, quiet: quiet || null, demo };
}

// Онцлох кафе: идэвхтэй (каталогид байгаа), дор хаяж нэг зурагтай; шууд хэмжилттэй нь эхэнд.
// TODO: төлбөртэй байрлал бий болоход энд сонгож, «Сурталчилгаа» гэж шошголно.
export function featuredCafes(cafes, photosOf, ctxOf) {
  const rank = c => { const x = ctxOf(c).live; return x.kind === 'live' && x.has ? 0 : x.has ? 1 : 2; };
  return cafes.filter(c => photosOf(c).length > 0)
    .map((c, i) => ({ c, i, r: rank(c) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(x => x.c);
}

// Эрэмбэ: seats (сул суудал ихтэй нь эхэнд, мэдээлэлгүй нь сүүлд), near, rating.
export function sortCafes(cafes, mode, ctxOf, ratingOf = () => null) {
  const value = c => {
    const x = ctxOf(c);
    if (mode === 'near') return x.km ?? Infinity;
    if (mode === 'rating') { const r = ratingOf(c); return r == null ? Infinity : -r; }
    return x.live.has ? x.live.occupied : Infinity;
  };
  return cafes.map((c, i) => ({ c, i, v: value(c), open: c.open ? 0 : 1 }))
    .sort((a, b) => a.open - b.open || a.v - b.v || a.i - b.i)
    .map(x => x.c);
}

// Хоёр цэгийн зай (км), haversine. Байршлыг хэрэглэгч зөвшөөрсөн үед л тооцно.
export function distanceKm([lng1, lat1], [lng2, lat2]) {
  const rad = d => d * Math.PI / 180, R = 6371;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
export const distanceText = km => km == null ? '' : km < 1 ? `${Math.max(10, Math.round(km * 100) * 10)} м` : `${km.toFixed(1)} км`;
