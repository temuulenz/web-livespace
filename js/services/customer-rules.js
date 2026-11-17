// Pure rules for the customer features: menu, «Очих» (going) + pre-order and phone sign-in.
// No DOM and no storage here, so every rule is unit-tested in Node (tests/customer.test.mjs).
// Times are epoch milliseconds (UTC); only the display helpers turn them into local clock text.

/* ---------------- money ---------------- */
export const CURRENCY = '₮';
// 12500 → "12,500₮" (whole tögrög; Mongolian menus group thousands with commas).
export function formatMNT(value) {
  const n = Math.round(Number(value) || 0);
  return `${n < 0 ? '−' : ''}${String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${CURRENCY}`;
}
// "4 500", "4,500", "4500₮" → 4500; anything else → NaN.
export function parsePrice(input) {
  const text = String(input ?? '').replace(/[\s,₮]/g, '');
  return /^\d+$/.test(text) ? Number(text) : NaN;
}

/* ---------------- phone ---------------- */
// Mongolian mobile numbers: 8 digits. +976 / 976 / 00976, spaces, dashes, dots and brackets are accepted.
const PHONE_CHARS = /^[+\d\s\-().]*$/;
function phoneDigits(input) {
  let digits = String(input ?? '').trim();
  if (!PHONE_CHARS.test(digits)) return null;
  digits = digits.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+976')) digits = digits.slice(4);
  else if (digits.startsWith('00976')) digits = digits.slice(5);
  else if (digits.length === 11 && digits.startsWith('976')) digits = digits.slice(3);
  return digits.includes('+') ? null : digits;
}
export function normalizePhone(input) {
  const digits = phoneDigits(input);
  return digits && /^[5-9]\d{7}$/.test(digits) ? digits : null;
}
export function phoneError(input) {
  if (!String(input ?? '').trim()) return 'Утасны дугаараа оруулна уу';
  const digits = phoneDigits(input);
  if (digits == null || !/^\d*$/.test(digits)) return 'Утасны дугаарт зөвхөн тоо оруулна уу';
  if (digits.length !== 8) return 'Утасны дугаар 8 оронтой байна';
  if (!/^[5-9]/.test(digits)) return 'Гар утасны дугаар 5–9 тоогоор эхэлнэ';
  return null;
}
export const formatPhone = phone => `+976 ${phone.slice(0, 4)} ${phone.slice(4)}`;
// Staff only ever see the last four digits; the public never sees any.
export const maskPhone = phone => `•••• ${String(phone).slice(-4)}`;

/* ---------------- one-time code ---------------- */
export const OTP_LENGTH = 6;
export const OTP_RESEND_SEC = 60;
export const OTP_TTL_SEC = 300;
export const OTP_MAX_ATTEMPTS = 5;
export const otpCodeError = code => new RegExp(`^\\d{${OTP_LENGTH}}$`).test(String(code ?? '')) ? null : `${OTP_LENGTH} оронтой кодоо оруулна уу`;
export const secondsUntil = (at, now) => Math.max(0, Math.ceil((at - now) / 1000));
export const mmss = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/* ---------------- menu ---------------- */
export const MENU_CATEGORIES = ['Кофе', 'Цай', 'Ундаа', 'Амттан', 'Хоол'];
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const NAME_MAX = 60;
export const PRICE_MAX = 1000000;

// values: { name, price, category }; file: an optional File/Blob-like { type, size }.
export function validateMenuItem(values, file) {
  const errors = {};
  const name = String(values.name ?? '').trim();
  if (!name) errors.name = 'Бүтээгдэхүүний нэрийг оруулна уу';
  else if (name.length > NAME_MAX) errors.name = `Нэр ${NAME_MAX} тэмдэгтээс ихгүй байна`;
  const rawPrice = String(values.price ?? '').trim();
  const price = parsePrice(rawPrice);
  if (!rawPrice) errors.price = 'Үнээ оруулна уу';
  else if (Number.isNaN(price)) errors.price = 'Үнийг зөвхөн тоогоор оруулна уу';
  else if (price <= 0) errors.price = 'Үнэ 0-ээс их байх ёстой';
  else if (price > PRICE_MAX) errors.price = 'Үнэ хэт өндөр байна';
  if (!MENU_CATEGORIES.includes(values.category)) errors.category = 'Ангиллаа сонгоно уу';
  const photo = imageError(file);
  if (photo) errors.photo = photo;
  return errors;
}
export function imageError(file) {
  if (!file) return null;
  if (!IMAGE_TYPES.includes(file.type)) return 'Зөвхөн JPG, PNG эсвэл WEBP зураг оруулна уу';
  if (file.size > IMAGE_MAX_BYTES) return 'Зургийн хэмжээ 2 МБ-аас ихгүй байна';
  return null;
}

// Category order is fixed; inside a category available items first, then by name.
export function groupMenu(items, { hideUnavailable = false } = {}) {
  const visible = hideUnavailable ? items.filter(item => item.available) : items;
  return MENU_CATEGORIES
    .map(category => [category, visible.filter(item => item.category === category)
      .sort((a, b) => (b.available - a.available) || a.name.localeCompare(b.name, 'mn'))])
    .filter(([, list]) => list.length);
}

/* ---------------- «Очих» + pre-order ---------------- */
export const ARRIVAL_OPTIONS = [15, 30, 60];
export const GRACE_MIN = 15;          // the café keeps waiting this long after the chosen arrival time
export const NOTE_MAX = 200;
export const MAX_QTY = 20;
export const ACTIVE_STATUSES = ['pending', 'accepted', 'ready'];
export const STATUS_LABEL = { pending: 'Хүлээгдэж байна', accepted: 'Хүлээн авсан', ready: 'Бэлэн боллоо', cancelled: 'Цуцалсан', expired: 'Хугацаа дууссан' };
const TRANSITIONS = { pending: ['accepted', 'cancelled'], accepted: ['ready', 'cancelled'], ready: [], cancelled: [], expired: [] };
export const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to);

export const arrivalAt = going => going.createdAt + going.minutes * 60000;
export const expiresAt = going => arrivalAt(going) + GRACE_MIN * 60000;
export const isActive = (going, now) => !!going && ACTIVE_STATUSES.includes(going.status) && now < expiresAt(going);

// 'travel' until the arrival time, then 'grace' until it expires.
export function goingPhase(going, now) {
  if (!ACTIVE_STATUSES.includes(going.status)) return going.status;
  if (now >= expiresAt(going)) return 'expired';
  return now < arrivalAt(going) ? 'travel' : 'grace';
}
export function countdown(going, now) {
  const phase = goingPhase(going, now);
  const seconds = phase === 'travel' ? secondsUntil(arrivalAt(going), now) : phase === 'grace' ? secondsUntil(expiresAt(going), now) : 0;
  return { phase, seconds, text: mmss(seconds) };
}

// cart: { [itemId]: qty }. Lines use only items that exist and are available today.
export function setQty(cart, id, qty) {
  const next = { ...cart };
  const n = Math.max(0, Math.min(MAX_QTY, Math.floor(Number(qty) || 0)));
  if (n) next[id] = n; else delete next[id];
  return next;
}
export function cartLines(cart, menu) {
  return Object.entries(cart)
    .map(([id, qty]) => ({ item: menu.find(item => item.id === id), qty }))
    .filter(line => line.item && line.item.available && line.qty > 0)
    .map(({ item, qty }) => ({ itemId: item.id, name: item.name, price: item.price, qty, subtotal: item.price * qty }));
}
export const linesTotal = lines => lines.reduce((sum, line) => sum + line.price * line.qty, 0);

export function validateGoing({ minutes, cart = {}, note = '' }, menu) {
  if (!ARRIVAL_OPTIONS.includes(minutes)) return 'Ирэх хугацаагаа сонгоно уу';
  if (String(note).length > NOTE_MAX) return `Тэмдэглэл ${NOTE_MAX} тэмдэгтээс ихгүй байна`;
  for (const [id, qty] of Object.entries(cart)) {
    const item = menu.find(m => m.id === id);
    if (!item) return 'Цэснээс хасагдсан бүтээгдэхүүн байна';
    if (!item.available) return `«${item.name}» өнөөдөр дууссан байна`;
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return 'Тоо ширхэг буруу байна';
  }
  return null;
}

// Staff summary: active visits whose arrival time falls within the next window (late ones included).
export const arrivingWithin = (goings, now, windowMin = 60) =>
  goings.filter(going => isActive(going, now) && arrivalAt(going) <= now + windowMin * 60000).length;

// Clock text in the visitor's local time zone (Asia/Ulaanbaatar for the intended audience).
export const clockText = at => { const d = new Date(at); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
