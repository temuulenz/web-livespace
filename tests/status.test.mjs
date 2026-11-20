import test from 'node:test';
import assert from 'node:assert/strict';
import { ageShort, trustState, openState, seatState, wifiState, noiseState, walkText, closingTime } from '../js/live/status.js';
import { statusLinesHTML } from '../js/live/status-ui.js';

const NOW = Date.parse('2026-11-17T06:00:00Z');
const ago = s => new Date(NOW - s * 1000).toISOString();
const demo = { id: 'A', name: 'Кафе A', open: true, hours: '08:00–22:00', occ: 36, sound: 2, wifi: 4, walk: 6 };
const live = (live, extra = {}) => ({ id: 'R', name: 'Кафе R', open: true, hours: '09:00–21:00', occ: null, sound: 0, wifi: 0, ...extra, live: { mode: 'live', updated_at: ago(20), ...live } });
const sensor = (s = {}) => ({ status: 'online', dataSource: 'real', timestamp: ago(20), observedPeople: 8, noise: { dbfs: -40 }, ...s });

test('age is short and never negative', () => {
  assert.equal(ageShort(ago(3), NOW), 'дөнгөж сая');
  assert.equal(ageShort(ago(20), NOW), '20 сек өмнө');
  assert.equal(ageShort(ago(12 * 60), NOW), '12 мин өмнө');
  assert.equal(ageShort(ago(3 * 3600), NOW), '3 цагийн өмнө');
  assert.equal(ageShort(new Date(NOW + 5000).toISOString(), NOW), 'дөнгөж сая');
  assert.equal(ageShort('nonsense', NOW), '');
});

test('trust line names demo, live, stale, test and missing data', () => {
  assert.deepEqual(trustState(demo, { now: NOW }), { kind: 'demo', text: 'Демо · Жишээ өгөгдөл' });
  assert.equal(trustState(live({}), { now: NOW }).text, 'Бодит мэдээлэл · 20 сек өмнө');
  assert.equal(trustState(live({ stale: true, updated_at: ago(12 * 60) }), { now: NOW }).text, 'Мэдээлэл хуучирсан · 12 мин өмнө');
  assert.equal(trustState(live({ sensor: sensor({ timestamp: ago(12 * 60) }) }), { now: NOW }).kind, 'stale');
  assert.equal(trustState(live({ mode: 'test' }), { now: NOW }).kind, 'test');
  assert.equal(trustState(live({ mode: 'none' }), { now: NOW }).kind, 'none');
});

test('open state is always written out', () => {
  assert.equal(closingTime('08:00–22:00'), '22:00');
  assert.equal(openState(demo).text, 'Нээлттэй · 22:00 хүртэл');
  assert.equal(openState({ open: false, opens: 'Маргааш 09:00' }).text, 'Хаалттай · Маргааш 09:00 нээгдэнэ');
  assert.equal(openState({ open: false, status_text: 'Бодит хэмжилт хараахан ирээгүй' }).text, 'Бодит хэмжилт хараахан ирээгүй');
});

test('seats are never shown as 0 when unmeasured and never inferred from people', () => {
  assert.equal(seatState(demo, { now: NOW }).text, '~64% сул (жишээ)');
  assert.equal(seatState(live({ free_pct: 40, available_seats: 8, total_seats: 20 }), { now: NOW }).text, '8/20 сул суудал · 40%');
  const people = seatState(live({ sensor: sensor() }), { now: NOW });
  assert.equal(people.text, '8 хүн ажиглагдсан · Сул суудал тодорхойгүй');
  assert.equal(people.known, false);
  const none = seatState(live({}), { now: NOW });
  assert.equal(none.text, 'Суудлын мэдээлэл алга');
  assert.doesNotMatch(none.short, /\b0\b/);
  assert.equal(seatState({ ...demo, open: false }, { now: NOW }).known, false);
});

test('Wi-Fi says where its value came from', () => {
  assert.deepEqual([wifiState(demo).short, wifiState(demo).source], ['Wi-Fi: Маш сайн', 'Жишээ утга · бодит хэмжилт биш']);
  assert.equal(wifiState(live({ wifi_level: 3, wifi_mbps: 51.4 })).source, 'Мэдрэгчийн хэмжилт · 51 Mbps');
  assert.equal(wifiState(live({})).short, 'Wi-Fi: мэдээлэлгүй');
  assert.equal(wifiState(live({})).source, 'Wi-Fi хэмжигдээгүй');
});

test('noise and walk wording', () => {
  assert.equal(noiseState(demo, { now: NOW }).short, 'Дуу: Намуухан');
  assert.equal(noiseState(live({ sensor: sensor() }), { now: NOW }).short, 'Дуу: хэмжсэн');
  assert.equal(noiseState(live({ sensor: sensor({ noise: {} }) }), { now: NOW }).short, 'Дуу: хэмжилтгүй');
  assert.equal(walkText(demo), '~6 мин алхана · жишээ байршлаас');
  assert.equal(walkText({}), '');
});

test('status lines keep one order and escape server text', () => {
  const html = statusLinesHTML({ ...demo, open: false, status_text: '<b>x</b>' }, { now: NOW });
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
  const order = statusLinesHTML(demo, { now: NOW }).match(/cs-(open|facts|trust)/g);
  assert.deepEqual(order, ['cs-open', 'cs-facts', 'cs-trust']);
});
