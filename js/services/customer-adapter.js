// Customer data adapter: menu, «Очих» visits with pre-orders, and phone sign-in.
//
// Every customer screen talks only to this interface, so the mock below can later be
// replaced by an HTTP adapter over /api/v1 without touching the UI:
//
//   adapter.mode                                  'mock' (shows ДЕМО notices) | 'http'
//   adapter.subscribe(fn) → unsubscribe           fn() after any change (also from other tabs)
//   adapter.menu.list(cafeId)                     → items [{ id, name, price, category, photo, available }]
//   adapter.menu.save(cafeId, item)               → { item }  (no id = create)
//   adapter.menu.remove(cafeId, id)
//   adapter.menu.setAvailable(cafeId, id, bool)
//   adapter.auth.current()                        → { id, phone } | null
//   adapter.auth.requestCode(phone)               → { phone, resendAt, expiresAt, demoCode? }
//   adapter.auth.verifyCode(phone, code)          → user
//   adapter.auth.signOut()
//   adapter.going.active()                        → the signed-in visitor's active visit | null
//   adapter.going.create({ cafeId, cafeName, minutes, cart, note })
//   adapter.going.cancel(id)
//   adapter.going.publicSummary(cafeId)           → { count }   (aggregate only — never names or phones)
//   adapter.going.incoming(cafeId)                → active visits for staff (phone masked)
//   adapter.going.setStatus(id, status)           pending → accepted → ready, or → cancelled
//
// Failures throw CustomerError with a Mongolian message and a stable `code`.
// The mock keeps edits in localStorage (ls_mock_* keys); other visitors are simulated in
// memory, tagged `simulated: true`, and every screen labels them ДЕМО. No payment exists.
import {
  validateMenuItem, normalizePhone, phoneError, otpCodeError, maskPhone,
  OTP_RESEND_SEC, OTP_TTL_SEC, OTP_MAX_ATTEMPTS, ARRIVAL_OPTIONS, isActive, canTransition,
  cartLines, linesTotal, validateGoing, NOTE_MAX
} from './customer-rules.js';

export class CustomerError extends Error {
  constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}

export const DEMO_CODE = '123456';

// localStorage with failures reported (quota, private mode) instead of swallowed.
export const browserStorage = {
  get(key, fallback) { try { const v = globalThis.localStorage?.getItem('ls_' + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { globalThis.localStorage.setItem('ls_' + key, JSON.stringify(value)); return true; } catch { return false; } }
};
export function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  return { get: (k, d) => data.has(k) ? JSON.parse(data.get(k)) : d, set: (k, v) => { data.set(k, JSON.stringify(v)); return true; }, data };
}

/* ---------------- demo seed ---------------- */
const SEED_MENU = [
  ['Американо', 6500, 'Кофе'], ['Латте', 8500, 'Кофе'], ['Капучино', 8500, 'Кофе'], ['Флэт уайт', 9000, 'Кофе'],
  ['Сүүтэй цай', 4000, 'Цай'], ['Цэцгийн цай', 6000, 'Цай'], ['Чацарганын цай', 7500, 'Цай'],
  ['Нимбэгний ундаа', 7000, 'Ундаа'], ['Жүржийн шүүс', 8000, 'Ундаа'],
  ['Чизкейк', 9500, 'Амттан'], ['Шоколадтай брауни', 7500, 'Амттан'], ['Круассан', 6000, 'Амттан'],
  ['Тахиатай сэндвич', 12500, 'Хоол'], ['Бууз (6 ширхэг)', 9000, 'Хоол']
];
const hash = text => [...String(text)].reduce((h, ch) => Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0, 2166136261);
function rng(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function seedMenu(cafeId) {
  const h = hash(cafeId), offset = (h % 3) * 500;
  const soldOut = new Set([h % SEED_MENU.length, (h >>> 4) % SEED_MENU.length]);
  return SEED_MENU.map(([name, price, category], i) => ({ id: `seed-${i}`, name, price: price + offset, category, photo: null, available: !soldOut.has(i) }));
}

// A few other (simulated) visitors per café, created relative to the adapter start time.
function seedVisitors(cafeId, menu, now) {
  const random = rng(hash('visit:' + cafeId));
  const count = cafeId === 'A' ? 4 : Math.floor(random() * 4);
  const available = menu.filter(item => item.available);
  return Array.from({ length: count }, (_, i) => {
    const minutes = ARRIVAL_OPTIONS[Math.floor(random() * 3)];
    const cart = {};
    if (available.length && (cafeId === 'A' ? i < 3 : random() < .6)) for (let n = 1 + Math.floor(random() * 2); n > 0; n--) { const item = available[Math.floor(random() * available.length)]; cart[item.id] = (cart[item.id] || 0) + 1 + Math.floor(random() * 2); }
    const lines = cartLines(cart, menu);
    return { id: `sim-${cafeId}-${i}`, code: `LS-${100 + Math.floor(random() * 900)}`, cafeId, userId: `sim-${i}`, phone: `9${String(Math.floor(random() * 1e7)).padStart(7, '0')}`, minutes, createdAt: now - Math.floor(random() * Math.min(minutes, 20)) * 60000, lines, total: linesTotal(lines), note: '', status: i === 0 && lines.length ? 'accepted' : 'pending', simulated: true };
  });
}

/* ---------------- mock adapter ---------------- */
export function createMockAdapter({ storage = browserStorage, now = Date.now, window: win = globalThis.window } = {}) {
  const listeners = new Set();
  const emit = () => listeners.forEach(fn => { try { fn(); } catch { /* a view's error must not stop the others */ } });
  const simulated = new Map();        // cafeId → simulated visits (memory only)
  let counter = storage.get('mock_seq', 0);
  const nextId = prefix => { counter += 1; storage.set('mock_seq', counter); return `${prefix}${now().toString(36)}${counter}`; };

  // Menus: edited cafés are stored; untouched ones come from the seed.
  const menus = () => storage.get('mock_menus', {});
  const menuOf = cafeId => menus()[cafeId] || seedMenu(cafeId);
  const writeMenu = (cafeId, items) => { const all = menus(); all[cafeId] = items; const ok = storage.set('mock_menus', all); emit(); return ok; };
  const findItem = (cafeId, id) => { const item = menuOf(cafeId).find(m => m.id === id); if (!item) throw new CustomerError('not_found', 'Бүтээгдэхүүн олдсонгүй'); return item; };

  // Visits: the visitor's own are stored; status changes on simulated ones stay in memory.
  const ownVisits = () => storage.get('mock_goings', []);
  const writeVisits = list => { storage.set('mock_goings', list); emit(); };
  const simulatedFor = cafeId => { if (!simulated.has(cafeId)) simulated.set(cafeId, seedVisitors(cafeId, menuOf(cafeId), now())); return simulated.get(cafeId); };
  const visitsFor = cafeId => [...simulatedFor(cafeId), ...ownVisits().filter(v => v.cafeId === cafeId)];
  const user = () => storage.get('customer', null);
  const requireUser = () => { const u = user(); if (!u) throw new CustomerError('login_required', 'Эхлээд утасны дугаараараа нэвтэрнэ үү'); return u; };

  // Expired visits are closed whenever they are read (client-side auto-expiry).
  function expireOwn() {
    const list = ownVisits(); let changed = false;
    for (const v of list) if (['pending', 'accepted', 'ready'].includes(v.status) && !isActive(v, now())) { v.status = 'expired'; changed = true; }
    if (changed) writeVisits(list);
    return list;
  }

  // Another tab (e.g. #staff next to a café page) changed something: refresh the views.
  win?.addEventListener?.('storage', event => { if (!event.key || event.key.startsWith('ls_mock_') || event.key === 'ls_customer') emit(); });

  const later = value => Promise.resolve().then(value);
  const adapter = {
    mode: 'mock',
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    menu: {
      list: cafeId => later(() => menuOf(cafeId).map(item => ({ ...item }))),
      save: (cafeId, input) => later(() => {
        const errors = validateMenuItem({ ...input, price: String(input.price ?? '') });
        if (input.photo != null && !/^data:image\/(jpeg|png|webp);base64,/.test(input.photo)) errors.photo = 'Зургийн формат буруу байна';
        if (Object.keys(errors).length) throw new CustomerError('validation', 'Талбаруудыг шалгана уу', errors);
        const items = menuOf(cafeId);
        const item = { id: input.id || nextId('m-'), name: String(input.name).trim(), price: Number(input.price), category: input.category, photo: input.photo ?? null, available: input.available !== false };
        const index = items.findIndex(m => m.id === item.id);
        if (input.id && index < 0) throw new CustomerError('not_found', 'Бүтээгдэхүүн олдсонгүй');
        if (index < 0) items.push(item); else items[index] = item;
        if (!writeMenu(cafeId, items)) throw new CustomerError('storage', 'Төхөөрөмж дээр хадгалах зай хүрэлцсэнгүй. Жижиг зураг сонгоно уу.');
        return { item: { ...item } };
      }),
      remove: (cafeId, id) => later(() => { findItem(cafeId, id); writeMenu(cafeId, menuOf(cafeId).filter(m => m.id !== id)); }),
      setAvailable: (cafeId, id, available) => later(() => { findItem(cafeId, id); writeMenu(cafeId, menuOf(cafeId).map(m => m.id === id ? { ...m, available: !!available } : m)); })
    },

    auth: {
      current: () => later(() => user()),
      requestCode: phoneInput => later(() => {
        const problem = phoneError(phoneInput); if (problem) throw new CustomerError('invalid_phone', problem);
        const phone = normalizePhone(phoneInput), at = now(), last = storage.get('mock_otp', null);
        if (last && last.phone === phone && at < last.resendAt) throw new CustomerError('too_soon', 'Кодыг дахин илгээхийн өмнө түр хүлээнэ үү', { resendAt: last.resendAt });
        const otp = { phone, sentAt: at, resendAt: at + OTP_RESEND_SEC * 1000, expiresAt: at + OTP_TTL_SEC * 1000, attempts: 0 };
        storage.set('mock_otp', otp);
        return { phone, resendAt: otp.resendAt, expiresAt: otp.expiresAt, attemptsLeft: OTP_MAX_ATTEMPTS, demoCode: DEMO_CODE };
      }),
      verifyCode: (phoneInput, code) => later(() => {
        const phone = normalizePhone(phoneInput), otp = storage.get('mock_otp', null);
        if (!phone || !otp || otp.phone !== phone) throw new CustomerError('no_code', 'Эхлээд код авна уу');
        if (now() >= otp.expiresAt) throw new CustomerError('expired', 'Кодын хугацаа дууссан. Шинэ код авна уу.');
        if (otp.attempts >= OTP_MAX_ATTEMPTS) throw new CustomerError('locked', 'Оролдлогын тоо дууссан. Шинэ код авна уу.', { attemptsLeft: 0 });
        const format = otpCodeError(code); if (format) throw new CustomerError('invalid_code', format, { attemptsLeft: OTP_MAX_ATTEMPTS - otp.attempts });
        if (code !== DEMO_CODE) {
          otp.attempts += 1; storage.set('mock_otp', otp);
          const left = OTP_MAX_ATTEMPTS - otp.attempts;
          throw left ? new CustomerError('wrong_code', `Код буруу байна. ${left} оролдлого үлдлээ.`, { attemptsLeft: left })
            : new CustomerError('locked', 'Оролдлогын тоо дууссан. Шинэ код авна уу.', { attemptsLeft: 0 });
        }
        storage.set('mock_otp', null);
        const signedIn = { id: 'phone:' + phone, phone };
        storage.set('customer', signedIn); emit();
        return { ...signedIn };
      }),
      signOut: () => later(() => { storage.set('customer', null); emit(); })
    },

    going: {
      active: () => later(() => { const u = user(); if (!u) return null; const own = expireOwn().find(v => v.userId === u.id && isActive(v, now())); return own ? { ...own } : null; }),
      create: ({ cafeId, cafeName = '', minutes, cart = {}, note = '' }) => later(() => {
        const u = requireUser();
        if (expireOwn().some(v => v.userId === u.id && isActive(v, now()))) throw new CustomerError('already_going', 'Танд идэвхтэй «Очих» байна. Нэг удаад нэг л газар очихоор бүртгүүлнэ.');
        const menu = menuOf(cafeId), problem = validateGoing({ minutes, cart, note }, menu);
        if (problem) throw new CustomerError('validation', problem);
        const lines = cartLines(cart, menu);
        const visit = { id: nextId('g-'), code: `LS-${String(counter % 900 + 100)}`, cafeId, cafeName, userId: u.id, phone: u.phone, minutes, createdAt: now(), lines, total: linesTotal(lines), note: String(note).trim().slice(0, NOTE_MAX), status: 'pending', simulated: false };
        writeVisits([...ownVisits(), visit]);
        return { ...visit };
      }),
      cancel: id => later(() => {
        const u = requireUser(), list = ownVisits(), visit = list.find(v => v.id === id && v.userId === u.id);
        if (!visit || !isActive(visit, now())) throw new CustomerError('not_found', 'Идэвхтэй «Очих» олдсонгүй');
        visit.status = 'cancelled'; writeVisits(list);
      }),
      publicSummary: cafeId => later(() => { expireOwn(); return { count: visitsFor(cafeId).filter(v => isActive(v, now())).length }; }),
      incoming: cafeId => later(() => { expireOwn(); return visitsFor(cafeId).filter(v => isActive(v, now())).sort((a, b) => (a.createdAt + a.minutes * 6e4) - (b.createdAt + b.minutes * 6e4))
        .map(({ phone, userId, ...visit }) => ({ ...visit, lines: visit.lines.map(l => ({ ...l })), phone: maskPhone(phone) })); }),
      setStatus: (id, status) => later(() => {
        const own = ownVisits(), mine = own.find(v => v.id === id);
        const visit = mine || [...simulated.values()].flat().find(v => v.id === id);
        if (!visit || !isActive(visit, now())) throw new CustomerError('not_found', 'Захиалга олдсонгүй эсвэл хугацаа нь дууссан');
        if (!canTransition(visit.status, status)) throw new CustomerError('invalid_status', 'Энэ төлөв рүү шилжих боломжгүй');
        visit.status = status;
        if (mine) writeVisits(own); else emit();
      })
    }
  };
  return adapter;
}

// The site uses the mock until the customer API exists on the server.
export const customer = createMockAdapter();
