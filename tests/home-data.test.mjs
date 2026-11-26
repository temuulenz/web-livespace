// Нүүр хуудасны (Design C) өгөгдлийн дүрэм: зөвхөн бодит/шошготой өгөгдөл, мэдээлэлгүйг нуух.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  liveInfo, featureTags, CATEGORIES, categoryCounts, liveSummary, featuredCafes, sortCafes, distanceKm, distanceText, levelOf
} from '../js/features/home/home-data.js';
import { photosOf } from '../js/features/home/cafe-photos.js';

const now = Date.parse('2026-11-26T04:00:00Z');
const iso = sec => new Date(now - sec * 1000).toISOString();
const demo = (id, occ, extra = {}) => ({ id, name: 'Кафе ' + id, open: true, hours: '08:00–22:00', occ, sound: 2, wifi: 3, tags: ['Сурах'], ...extra });
const real = (id, free, extra = {}) => ({ id, name: id, open: true, hours: '08:00–22:00', tags: [], live: { mode: 'live', updated_at: iso(120), free_pct: free, wifi_level: 4 }, ...extra });
const ctxOf = c => ({ live: liveInfo(c, { now, staleAfterSec: 900 }), km: null });

test('occupancy levels, badges and freshness come from the measurement', () => {
  assert.deepEqual([levelOf(10), levelOf(49), levelOf(50), levelOf(74), levelOf(75)], ['free', 'free', 'mid', 'mid', 'full']);
  const live = liveInfo(real('r', 72), { now });
  assert.equal(live.has, true); assert.equal(live.occupied, 28); assert.equal(live.badge, 'ШУУД · Сул'); assert.equal(live.age, '2 мин өмнө');
  const test_ = liveInfo({ ...real('t', 10), live: { mode: 'test', updated_at: iso(30), free_pct: 10 } }, { now });
  assert.equal(test_.badge, 'ТУРШИЛТ · Дүүрэн');
  const sample = liveInfo(demo('A', 36), { now });
  assert.equal(sample.badge, 'ДЕМО · Сул'); assert.equal(sample.demo, true); assert.equal(sample.age, '');
});

test('unknown, stale and closed cafés never show an invented percentage', () => {
  const none = liveInfo({ id: 'n', open: false, status_text: 'Бодит хэмжилт хараахан ирээгүй', live: { mode: 'none' } }, { now });
  assert.equal(none.has, false); assert.equal(none.occupied, undefined);
  const noSeats = liveInfo({ ...real('s', null) }, { now });
  assert.equal(noSeats.has, false);
  const stale = liveInfo({ ...real('x', 50), live: { mode: 'live', stale: true, updated_at: iso(7200), free_pct: 50 } }, { now });
  assert.equal(stale.has, false); assert.match(stale.note, /хуучирсан/);
  const closed = liveInfo(demo('O', 0, { open: false, opens: 'Маргааш 09:00' }), { now });
  assert.equal(closed.has, false); assert.equal(closed.open, false); assert.match(closed.note, /Хаалттай/);
});

test('feature tags and category counts only use data that exists', () => {
  assert.deepEqual(featureTags(demo('A', 30, { tags: ['Хүүхдийн булан'] })).map(t => t.text), ['Намуухан', 'Сайн', 'Хүүхдийн булантай']);
  assert.deepEqual(featureTags({ id: 'z', open: true, tags: [], live: { mode: 'none' } }), []);
  const cafes = [demo('A', 20), demo('B', 90, { sound: 4, wifi: 1, tags: ['Найзуудтай'] }), demo('C', 60, { open: false })];
  const counts = categoryCounts(cafes, ctxOf);
  assert.equal(counts.all, 3); assert.equal(counts.seats, 1); assert.equal(counts.study, 2); assert.equal(counts.quiet, 1);
  assert.equal(counts.wifi, 1); assert.equal(counts.meet, 1); assert.equal(counts.plug, 0); assert.equal(counts.kids, 0); assert.equal(counts.near, 0);
  for (const cat of CATEGORIES) assert.equal(cafes.filter(c => cat.test(c, ctxOf(c))).length, counts[cat.key], cat.key);
});

test('live summary hides unknown values and flags demo data', () => {
  assert.deepEqual(liveSummary([], ctxOf), { open: null, free: null, quiet: null, demo: false });
  assert.deepEqual(liveSummary([demo('A', 20), demo('B', 90, { sound: 4 })], ctxOf), { open: 2, free: 1, quiet: 1, demo: true });
  assert.deepEqual(liveSummary([{ id: 'x', open: false, tags: [], live: { mode: 'none' } }], ctxOf), { open: null, free: null, quiet: null, demo: false });
});

test('featured cafés need a photo; live ones come first', () => {
  const photos = c => c.p ? [{ src: '/a.webp' }] : [];
  const list = [demo('A', 20, { p: 1 }), demo('B', 20), real('R', 50, { p: 1 }), { id: 'N', open: true, tags: [], live: { mode: 'none' }, p: 1 }];
  assert.deepEqual(featuredCafes(list, photos, ctxOf).map(c => c.id), ['R', 'A', 'N']);
  assert.deepEqual(featuredCafes([demo('B', 20)], photos, ctxOf), []);
});

test('sorting: free seats first, unknown last, closed after open; near and rating', () => {
  const list = [demo('A', 70), { id: 'U', open: true, tags: [], live: { mode: 'none' } }, demo('B', 10), demo('C', 5, { open: false })];
  assert.deepEqual(sortCafes(list, 'seats', ctxOf).map(c => c.id), ['B', 'A', 'U', 'C']);
  const km = { A: 2, B: .3 };
  assert.deepEqual(sortCafes([demo('A', 1), demo('B', 1)], 'near', c => ({ ...ctxOf(c), km: km[c.id] })).map(c => c.id), ['B', 'A']);
  assert.deepEqual(sortCafes([demo('A', 1), demo('B', 1)], 'rating', ctxOf, c => ({ A: 4.1, B: 4.8 })[c.id]).map(c => c.id), ['B', 'A']);
});

test('distance is real geometry, formatted in metres or kilometres', () => {
  const km = distanceKm([106.9176, 47.9188], [106.9176, 47.9228]);
  assert.ok(Math.abs(km - .445) < .01, String(km));
  assert.equal(distanceText(km), '440 м'); assert.equal(distanceText(1.234), '1.2 км'); assert.equal(distanceText(null), '');
});

test('photos: Sunny Day by its design file, API photos first, unsafe URLs dropped', () => {
  const sunny = photosOf({ id: 'x1', name: 'Sunny Day Coffee' });
  assert.equal(sunny.length, 4);
  assert.match(sunny[0].src, /photos\/sunny-day-1\.webp$/); assert.match(sunny[0].small, /sunny-day-1-s\.webp$/);
  assert.deepEqual(photosOf({ id: 'A', name: 'Кафе A' }), []);
  const api = photosOf({ id: 'p', name: 'P', photos: ['https://cdn.example/1.webp', 'javascript:alert(1)', { url: '/media/2.webp', alt: 'Тайлбар' }, '//evil/3.webp'] });
  assert.deepEqual(api.map(p => p.src), ['https://cdn.example/1.webp', '/media/2.webp']);
  assert.equal(api[1].alt, 'Тайлбар');
});
