// Кафены төлөвийг бүх хуудсанд нэг ижил үгээр, нэг ижил дарааллаар харуулах цэвэр функцууд
// (DOM-гүй тул Node-д тестлэгдэнэ: tests/status.test.mjs).
//
// Зарчим: мэдээлэлд итгэх итгэл. Бодит, туршилт, хуучирсан, демо, мэдээлэлгүй гэдгийг үргэлж
// хэлнэ; хэмжээгүй утгыг 0 гэж харуулахгүй; хүний тооноос сул суудал таамаглахгүй.
// Нийтийн хуудас болон эзэмшигчийн самбар энэ нэг файлын үгсийг ашиглана: англи үг, SIMULATED/REAL,
// dBFS, итгэлцлийн хувь, төхөөрөмжийн төлөвийн үг энд гарахгүй (техникийн утга нь зөвхөн админд).
import { sensorState } from './sensor-state.js';
import { noiseLevel } from './levels.js';

const SECOND = 1000;
const WIFI_WORD = ['мэдээлэлгүй', 'Сул', 'Дундаж', 'Сайн', 'Маш сайн'];
const NOISE_WORD = ['', 'Нам гүм', 'Намуухан', 'Яриатай', 'Шуугиантай', 'Чанга'];

export const dataModeOf = c => c.live?.mode || 'demo';
const measured = c => ['live', 'test'].includes(dataModeOf(c));

// Эх үүсвэр: «Туршилтын өгөгдөл» / «Бодит хэмжилт» (SIMULATED / REAL биш).
export const sourceWord = source => source === 'simulated' || source === true ? 'Туршилтын өгөгдөл' : 'Бодит хэмжилт';

// «14:20» — Улаанбаатарын цагаар.
export const clockUB = at => { const t = Date.parse(at); return Number.isFinite(t) ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ulaanbaatar', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t) : ''; };

// Дуу чимээ: зөвхөн тохируулсан (калибровктой) хэмжилтийг түвшний үгээр; бусад үед түүхий тоо харуулахгүй.
export const NOISE_UNCALIBRATED = 'хэмжилт тохируулагдаагүй';
export function noiseWord(noise) {
  if (noise?.calibrated && Number.isFinite(noise.estimatedDbSpl)) return `Дуу чимээ: ${NOISE_WORD[noiseLevel(noise.estimatedDbSpl)]}`;
  return `Дуу чимээ: ${NOISE_UNCALIBRATED}`;
}

// «Одоо: 8 хүн ажиглагдсан». Тоо ирээгүй бол үүнийгээ хэлнэ (0 гэж зохиохгүй).
export function peopleState(c, { now = Date.now(), staleAfterSec = 30 } = {}) {
  const sensor = sensorState(c, { now, staleAfterSec });
  if (!sensor) return null;
  return Number.isInteger(sensor.observedPeople)
    ? { known: true, count: sensor.observedPeople, text: `Одоо: ${sensor.observedPeople} хүн ажиглагдсан` }
    : { known: false, count: null, text: 'Одоо: хүний тоо мэдээлэлгүй' };
}
export const PEOPLE_NOTE = 'Хүний тоо нь сул суудлын тоо биш';

// «20 сек өмнө», «12 мин өмнө», «3 цагийн өмнө».
export function ageShort(at, now = Date.now()) {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((now - t) / SECOND));
  if (s < 10) return 'дөнгөж сая';
  if (s < 60) return `${s} сек өмнө`;
  if (s < 3600) return `${Math.round(s / 60)} мин өмнө`;
  if (s < 86400) return `${Math.round(s / 3600)} цагийн өмнө`;
  return `${Math.round(s / 86400)} өдрийн өмнө`;
}

// Мэдээллийн итгэлийн нэг мөр. kind: live | test | stale | demo | none
export function trustState(c, { now = Date.now(), staleAfterSec = 30 } = {}) {
  const mode = dataModeOf(c);
  if (mode === 'demo') return { kind: 'demo', text: 'Демо · Жишээ өгөгдөл' };
  if (mode === 'none') return { kind: 'none', text: 'Мэдээлэлгүй · Хэмжилт хараахан ирээгүй' };
  const sensor = sensorState(c, { now, staleAfterSec });
  const at = sensor?.timestamp || c.live?.updated_at;
  const age = ageShort(at, now);
  if (c.live?.stale || (sensor && sensor.status !== 'online')) { const clock = clockUB(at); return { kind: 'stale', text: `Мэдээлэл хуучирсан${clock ? ' · ' + clock : ''}` }; }
  const simulated = mode === 'test' || sensor?.dataSource === 'simulated';
  return simulated
    ? { kind: 'test', text: `Туршилтын өгөгдөл${age ? ' · ' + age : ''}` }
    : { kind: 'live', text: `Бодит хэмжилт${age ? ' · ' + age : ''}` };
}

// «08:00–22:00» → «22:00»
export const closingTime = hours => String(hours || '').split(/[–-]/)[1]?.trim() || '';

// Нээлттэй эсэх — үргэлж текстээр (гэрлийн дүрс зөвхөн нэмэлт).
export function openState(c) {
  if (c.open) { const until = closingTime(c.hours); return { open: true, text: until ? `Нээлттэй · ${until} хүртэл` : 'Нээлттэй' }; }
  if (c.status_text) return { open: false, text: c.status_text };
  return { open: false, text: c.opens ? `Хаалттай · ${c.opens} нээгдэнэ` : 'Хаалттай' };
}

// Суудал. Хэмжээгүй бол «мэдээлэлгүй»; хүний тоо л байвал «N хүн ажиглагдсан · Сул суудал тодорхойгүй».
export function seatState(c, { now = Date.now(), staleAfterSec = 30 } = {}) {
  if (!c.open) return { known: false, short: 'Суудал: —', text: 'Хаалттай үед суудлын мэдээлэл байхгүй' };
  const mode = dataModeOf(c);
  if (measured(c) && c.live?.free_pct != null) {
    const pct = Math.round(c.live.free_pct), free = c.live.available_seats, total = c.live.total_seats;
    return { known: true, short: `Суудал: ${pct}% сул`, text: free != null && total ? `${free}/${total} сул суудал · ${pct}%` : `${pct}% сул` };
  }
  const people = sensorState(c, { now, staleAfterSec })?.observedPeople;
  if (Number.isInteger(people)) return { known: false, short: `${people} хүн ажиглагдсан · суудал тодорхойгүй`, text: `${people} хүн ажиглагдсан · Сул суудал тодорхойгүй` };
  if (mode === 'demo' && c.occ != null) { const pct = 100 - c.occ; return { known: true, demo: true, short: `Суудал: ~${pct}% сул`, text: `~${pct}% сул (жишээ)` }; }
  return { known: false, short: 'Суудал: мэдээлэлгүй', text: 'Суудлын мэдээлэл алга' };
}

// Wi-Fi ба түүний эх сурвалж: мэдрэгчийн хэмжилт эсвэл жишээ утга.
export function wifiState(c) {
  const level = measured(c) ? (c.live?.wifi_level || 0) : (c.wifi || 0);
  if (!c.open || !level) return { known: false, short: 'Wi-Fi: мэдээлэлгүй', source: measured(c) ? 'Wi-Fi хэмжигдээгүй' : 'Мэдээлэл ороогүй' };
  if (measured(c)) { const mbps = c.live?.wifi_mbps; return { known: true, short: `Wi-Fi: ${WIFI_WORD[level]}`, source: `Мэдрэгчийн хэмжилт${mbps != null ? ` · ${Math.round(mbps)} Mbps` : ''}` }; }
  return { known: true, demo: true, short: `Wi-Fi: ${WIFI_WORD[level]}`, source: 'Жишээ утга · бодит хэмжилт биш' };
}

// Дуу чимээний товч үг (демо түвшин эсвэл мэдрэгчийн харьцангуй түвшин).
export function noiseState(c, { now = Date.now(), staleAfterSec = 30 } = {}) {
  if (!c.open) return { known: false, short: 'Дуу: —' };
  const sensor = sensorState(c, { now, staleAfterSec });
  if (sensor) { const calibrated = sensor.noise?.calibrated && Number.isFinite(sensor.noise.estimatedDbSpl); return { known: !!calibrated, short: noiseWord(sensor.noise).replace('Дуу чимээ: ', 'Дуу: ') }; }
  if (c.sound) return { known: true, demo: dataModeOf(c) === 'demo', short: `Дуу: ${NOISE_WORD[c.sound]}` };
  return { known: false, short: 'Дуу: хэмжилтгүй' };
}

// Алхах хугацаа: «Та энд» цэг одоогоор жишээ байршил тул үүнийг тэмдэглэнэ.
export const walkText = c => c.walk != null ? `~${c.walk} мин алхана · жишээ байршлаас` : '';
