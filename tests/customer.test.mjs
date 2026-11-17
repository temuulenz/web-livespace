import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatMNT, parsePrice, normalizePhone, phoneError, formatPhone, maskPhone, otpCodeError, mmss,
  validateMenuItem, groupMenu, IMAGE_MAX_BYTES, setQty, cartLines, linesTotal, validateGoing,
  arrivalAt, expiresAt, isActive, goingPhase, countdown, arrivingWithin, canTransition, GRACE_MIN, MAX_QTY
} from '../js/services/customer-rules.js';
import { createMockAdapter, memoryStorage, seedMenu, DEMO_CODE } from '../js/services/customer-adapter.js';

const MIN = 60000;
const clock = (start = Date.UTC(2026, 10, 17, 4, 0)) => { let t = start; const now = () => t; now.advance = ms => { t += ms; }; return now; };
const rejects = (promise, code) => assert.rejects(promise, error => { assert.equal(error.code, code, error.message); return true; });

test('₮ formatting and price parsing', () => {
  assert.equal(formatMNT(12500), '12,500₮');
  assert.equal(formatMNT(4000), '4,000₮');
  assert.equal(formatMNT(950), '950₮');
  assert.equal(formatMNT(1250000), '1,250,000₮');
  assert.equal(formatMNT(0), '0₮');
  assert.equal(parsePrice('4 500'), 4500);
  assert.equal(parsePrice('12,500₮'), 12500);
  assert.ok(Number.isNaN(parsePrice('4.5')));
  assert.ok(Number.isNaN(parsePrice('-100')));
});

test('Mongolian phone numbers are normalised and validated with Mongolian messages', () => {
  for (const input of ['99112233', '+976 9911 2233', '+976-9911-2233', '976 99112233', '00976 99112233', '9911-2233', ' (9911) 22.33 ']) assert.equal(normalizePhone(input), '99112233', input);
  assert.equal(normalizePhone('88001122'), '88001122');
  for (const input of ['9911223', '991122334', '+1 9911 2233', '19112233', '9911a233', '', '+97699112233+', '97699112233x']) assert.equal(normalizePhone(input), null, input);
  assert.equal(phoneError(''), 'Утасны дугаараа оруулна уу');
  assert.equal(phoneError('9911abcd'), 'Утасны дугаарт зөвхөн тоо оруулна уу');
  assert.equal(phoneError('991122'), 'Утасны дугаар 8 оронтой байна');
  assert.equal(phoneError('19112233'), 'Гар утасны дугаар 5–9 тоогоор эхэлнэ');
  assert.equal(phoneError('+976 9911-2233'), null);
  assert.equal(formatPhone('99112233'), '+976 9911 2233');
  assert.equal(maskPhone('99112233'), '•••• 2233');
  assert.equal(otpCodeError('123456'), null);
  assert.ok(otpCodeError('12345'));
  assert.ok(otpCodeError('12a456'));
  assert.equal(mmss(65), '1:05');
});

test('menu item validation covers name, price > 0, category and image type/size', () => {
  const ok = { name: 'Латте', price: '8500', category: 'Кофе' };
  assert.deepEqual(validateMenuItem(ok), {});
  assert.deepEqual(validateMenuItem(ok, { type: 'image/webp', size: 1000 }), {});
  assert.equal(validateMenuItem({ ...ok, name: '  ' }).name, 'Бүтээгдэхүүний нэрийг оруулна уу');
  assert.ok(validateMenuItem({ ...ok, name: 'x'.repeat(61) }).name);
  assert.equal(validateMenuItem({ ...ok, price: '' }).price, 'Үнээ оруулна уу');
  assert.equal(validateMenuItem({ ...ok, price: '0' }).price, 'Үнэ 0-ээс их байх ёстой');
  assert.equal(validateMenuItem({ ...ok, price: 'abc' }).price, 'Үнийг зөвхөн тоогоор оруулна уу');
  assert.equal(validateMenuItem({ ...ok, category: 'Пицца' }).category, 'Ангиллаа сонгоно уу');
  assert.equal(validateMenuItem(ok, { type: 'image/gif', size: 10 }).photo, 'Зөвхөн JPG, PNG эсвэл WEBP зураг оруулна уу');
  assert.equal(validateMenuItem(ok, { type: 'image/png', size: IMAGE_MAX_BYTES + 1 }).photo, 'Зургийн хэмжээ 2 МБ-аас ихгүй байна');
});

test('menu grouping keeps category order and lists sold-out items last or hidden', () => {
  const items = [
    { id: 1, name: 'Б', category: 'Цай', available: true }, { id: 2, name: 'А', category: 'Кофе', available: false },
    { id: 3, name: 'В', category: 'Кофе', available: true }
  ];
  assert.deepEqual(groupMenu(items).map(([c, l]) => [c, l.map(i => i.id)]), [['Кофе', [3, 2]], ['Цай', [1]]]);
  assert.deepEqual(groupMenu(items, { hideUnavailable: true }).map(([c, l]) => [c, l.map(i => i.id)]), [['Кофе', [3]], ['Цай', [1]]]);
});

test('cart quantities, totals and pre-order validation', () => {
  const menu = [{ id: 'a', name: 'Латте', price: 8500, available: true }, { id: 'b', name: 'Чизкейк', price: 9500, available: false }];
  let cart = setQty({}, 'a', 2);
  cart = setQty(cart, 'a', 3);
  assert.deepEqual(cart, { a: 3 });
  assert.deepEqual(setQty(cart, 'a', 0), {});
  assert.equal(setQty({}, 'a', 999).a, MAX_QTY);
  const lines = cartLines({ a: 3, b: 1, gone: 2 }, menu);
  assert.deepEqual(lines, [{ itemId: 'a', name: 'Латте', price: 8500, qty: 3, subtotal: 25500 }]);
  assert.equal(linesTotal(lines), 25500);
  assert.equal(validateGoing({ minutes: 30, cart: { a: 1 } }, menu), null);
  assert.equal(validateGoing({ minutes: 45 }, menu), 'Ирэх хугацаагаа сонгоно уу');
  assert.equal(validateGoing({ minutes: 15, cart: { b: 1 } }, menu), '«Чизкейк» өнөөдөр дууссан байна');
  assert.ok(validateGoing({ minutes: 15, note: 'x'.repeat(201) }, menu));
});

test('a going visit counts down, enters the grace period and then expires', () => {
  const start = 1_000_000;
  const going = { createdAt: start, minutes: 30, status: 'pending' };
  assert.equal(arrivalAt(going), start + 30 * MIN);
  assert.equal(expiresAt(going), start + (30 + GRACE_MIN) * MIN);
  assert.deepEqual(countdown(going, start), { phase: 'travel', seconds: 1800, text: '30:00' });
  assert.equal(goingPhase(going, start + 30 * MIN), 'grace');
  assert.equal(countdown(going, start + 31 * MIN).text, '14:00');
  assert.ok(isActive(going, start + 44 * MIN));
  assert.ok(!isActive(going, start + 45 * MIN));
  assert.equal(goingPhase(going, start + 45 * MIN), 'expired');
  assert.ok(!isActive({ ...going, status: 'cancelled' }, start));
  assert.equal(arrivingWithin([going, { createdAt: start, minutes: 60, status: 'pending' }], start + 10 * MIN), 2);
  assert.equal(arrivingWithin([{ createdAt: start, minutes: 60, status: 'pending' }], start - 10 * MIN, 60), 0);
});

test('order status transitions follow accept → ready, cancel only before ready', () => {
  assert.ok(canTransition('pending', 'accepted'));
  assert.ok(canTransition('pending', 'cancelled'));
  assert.ok(canTransition('accepted', 'ready'));
  assert.ok(canTransition('accepted', 'cancelled'));
  assert.ok(!canTransition('pending', 'ready'));
  assert.ok(!canTransition('ready', 'cancelled'));
  assert.ok(!canTransition('cancelled', 'accepted'));
});

test('mock OTP: demo code, resend cooldown, attempt limit and expiry', async () => {
  const now = clock(), storage = memoryStorage(), adapter = createMockAdapter({ storage, now });
  await rejects(adapter.auth.requestCode('123'), 'invalid_phone');
  const sent = await adapter.auth.requestCode('+976 9911-2233');
  assert.equal(sent.phone, '99112233');
  assert.equal(sent.demoCode, DEMO_CODE);
  await rejects(adapter.auth.requestCode('99112233'), 'too_soon');
  for (let left = 4; left >= 1; left--) await assert.rejects(adapter.auth.verifyCode('99112233', '000000'), { code: 'wrong_code', message: `Код буруу байна. ${left} оролдлого үлдлээ.` });
  await rejects(adapter.auth.verifyCode('99112233', '000000'), 'locked');
  await rejects(adapter.auth.verifyCode('99112233', DEMO_CODE), 'locked');
  now.advance(61_000);
  await adapter.auth.requestCode('99112233');
  now.advance(301_000);
  await rejects(adapter.auth.verifyCode('99112233', DEMO_CODE), 'expired');
  await adapter.auth.requestCode('99112233');
  const user = await adapter.auth.verifyCode('9911 2233', DEMO_CODE);
  assert.deepEqual(user, { id: 'phone:99112233', phone: '99112233' });
  assert.deepEqual(await adapter.auth.current(), user);
  await adapter.auth.signOut();
  assert.equal(await adapter.auth.current(), null);
});

test('mock menu editing persists and validates', async () => {
  const storage = memoryStorage(), adapter = createMockAdapter({ storage, now: clock() });
  const seeded = await adapter.menu.list('A');
  assert.deepEqual(seeded, seedMenu('A'));
  assert.ok(seeded.some(item => !item.available), 'seed shows a sold-out item');
  await assert.rejects(adapter.menu.save('A', { name: '', price: 0, category: 'Кофе' }), error => error.code === 'validation' && !!error.details.name && !!error.details.price);
  await rejects(adapter.menu.save('A', { name: 'X', price: 100, category: 'Кофе', photo: 'data:image/svg+xml,<svg/>' }), 'validation');
  const { item } = await adapter.menu.save('A', { name: ' Мокка ', price: 9900, category: 'Кофе', photo: 'data:image/webp;base64,AAAA' });
  assert.equal(item.name, 'Мокка');
  const full = { ...memoryStorage(), set: () => false };
  await rejects(createMockAdapter({ storage: full, now: clock() }).menu.save('A', { name: 'Том зураг', price: 100, category: 'Кофе' }), 'storage');
  await adapter.menu.setAvailable('A', item.id, false);
  await adapter.menu.save('A', { ...item, price: 10900, available: false });
  const reloaded = createMockAdapter({ storage, now: clock() });
  const saved = (await reloaded.menu.list('A')).find(m => m.id === item.id);
  assert.deepEqual([saved.price, saved.available], [10900, false]);
  await reloaded.menu.remove('A', item.id);
  assert.ok(!(await reloaded.menu.list('A')).some(m => m.id === item.id));
  await rejects(reloaded.menu.remove('A', item.id), 'not_found');
  assert.deepEqual(await reloaded.menu.list('B'), seedMenu('B'), 'other cafés are untouched');
});

test('admins and owners both maintain a menu; each item remembers who changed it last', async () => {
  const now = clock(), adapter = createMockAdapter({ storage: memoryStorage(), now });
  const { item } = await adapter.menu.save('A', { name: 'Раф кофе', price: 11000, category: 'Кофе', editedBy: 'admin' });
  assert.equal(item.editedBy, 'admin');
  assert.equal(item.editedAt, now());
  now.advance(MIN);
  await adapter.menu.save('A', { ...item, price: 11500, editedBy: 'owner' });
  let saved = (await adapter.menu.list('A')).find(m => m.id === item.id);
  assert.deepEqual([saved.price, saved.editedBy], [11500, 'owner']);
  await adapter.menu.setAvailable('A', item.id, false, 'staff');
  saved = (await adapter.menu.list('A')).find(m => m.id === item.id);
  assert.deepEqual([saved.available, saved.editedBy], [false, 'staff']);
  const { item: unknown } = await adapter.menu.save('A', { name: 'Тест', price: 100, category: 'Цай', editedBy: 'hacker' });
  assert.ok(!('editedBy' in unknown), 'unknown roles are not recorded');
});

test('mock going: login required, one active visit, pre-order snapshot, staff statuses, auto-expiry, privacy', async () => {
  const now = clock(), storage = memoryStorage(), adapter = createMockAdapter({ storage, now });
  let changes = 0; adapter.subscribe(() => changes++);
  await rejects(adapter.going.create({ cafeId: 'A', minutes: 30 }), 'login_required');
  await adapter.auth.requestCode('99112233'); await adapter.auth.verifyCode('99112233', DEMO_CODE);
  const menu = await adapter.menu.list('A'), latte = menu.find(m => m.name === 'Латте'), soldOut = menu.find(m => !m.available);
  await rejects(adapter.going.create({ cafeId: 'A', minutes: 30, cart: { [soldOut.id]: 1 } }), 'validation');
  const before = (await adapter.going.publicSummary('A')).count;
  const visit = await adapter.going.create({ cafeId: 'A', cafeName: 'Кафе A', minutes: 15, cart: { [latte.id]: 2 }, note: ' Цонхны дэргэд ' });
  assert.equal(visit.total, latte.price * 2);
  assert.equal(visit.note, 'Цонхны дэргэд');
  assert.equal(visit.status, 'pending');
  await rejects(adapter.going.create({ cafeId: 'I', minutes: 15 }), 'already_going');
  assert.equal((await adapter.going.publicSummary('A')).count, before + 1);

  // Public summary is a bare count; staff see the order with a masked phone and no user id.
  assert.deepEqual(Object.keys(await adapter.going.publicSummary('A')), ['count']);
  const incoming = await adapter.going.incoming('A');
  const mine = incoming.find(v => v.id === visit.id);
  assert.equal(mine.phone, '•••• 2233');
  assert.ok(!('userId' in mine));
  assert.ok(!JSON.stringify(incoming).includes('99112233'));
  assert.ok(incoming.some(v => v.simulated), 'simulated visitors are tagged');

  // A later menu price change does not alter the placed order.
  await adapter.menu.save('A', { ...latte, price: 99999 });
  assert.equal((await adapter.going.active()).total, latte.price * 2);

  await rejects(adapter.going.setStatus(visit.id, 'ready'), 'invalid_status');
  await adapter.going.setStatus(visit.id, 'accepted');
  await adapter.going.setStatus(visit.id, 'ready');
  assert.equal((await adapter.going.active()).status, 'ready');
  await rejects(adapter.going.setStatus(visit.id, 'cancelled'), 'invalid_status');

  // 15 min + 15 min grace → expires automatically and frees the visitor for a new one.
  now.advance(29 * MIN);
  assert.ok(await adapter.going.active());
  now.advance(1 * MIN);
  assert.equal(await adapter.going.active(), null);
  assert.equal(storage.get('mock_goings')[0].status, 'expired');
  const next = await adapter.going.create({ cafeId: 'I', minutes: 60 });
  await adapter.going.cancel(next.id);
  assert.equal(await adapter.going.active(), null);
  await rejects(adapter.going.cancel(next.id), 'not_found');
  assert.ok(changes > 0);
});

test('simulated visitors exist for the staff demo and expire like real ones', async () => {
  const now = clock(), adapter = createMockAdapter({ storage: memoryStorage(), now });
  const incoming = await adapter.going.incoming('A');
  assert.ok(incoming.length >= 2 && incoming.some(v => v.lines.length));
  const pending = incoming.find(v => v.status === 'pending');
  await adapter.going.setStatus(pending.id, 'cancelled');
  assert.ok(!(await adapter.going.incoming('A')).some(v => v.id === pending.id));
  now.advance(2 * 3600 * 1000);
  assert.deepEqual(await adapter.going.incoming('A'), []);
  assert.equal((await adapter.going.publicSummary('A')).count, 0);
});
