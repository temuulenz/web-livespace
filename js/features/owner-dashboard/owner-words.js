// Кафе эзэмшигчид зориулсан энгийн үгс ба тайлангийн тооцоо (DOM-гүй, Node-д тестлэгдэнэ:
// tests/owner-words.test.mjs). Техникийн нэр томъёо (dBFS, SIMULATED, inference…) энд орохгүй;
// тэдгээр нь «Техникийн дэлгэрэнгүй» хэсэгт хэвээр харагдана.
import { noiseLevel } from '../../live/levels.js';
import { SS } from '../../cafes.js';

const UB = 'Asia/Ulaanbaatar';
const pad = n => String(n).padStart(2, '0');

// Эх үүсвэр: SIMULATED / REAL биш.
export const sourceWord = source => source === 'simulated' || source === true ? 'Туршилтын өгөгдөл' : 'Бодит хэмжилт';

// Дуу чимээ: зөвхөн тохируулсан (калибровктой) үед түвшний үгээр; бусад үед түүхий тоо харуулахгүй.
export function noiseWord(noise) {
  if (noise?.calibrated && Number.isFinite(noise.estimatedDbSpl)) return `Дуу чимээ: ${SS[noiseLevel(noise.estimatedDbSpl)].short}`;
  return 'Дуу чимээ: тохируулаагүй байна';
}

// «14:20» — Улаанбаатарын цагаар.
export const clockUB = at => { const t = Date.parse(at); return Number.isFinite(t) ? new Intl.DateTimeFormat('en-GB', { timeZone: UB, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t) : ''; };

// Төхөөрөмжийн нэг мөр: «Утас холбогдсон ✓ · Батарей 85% · Цэнэглэж байна» / «Утас салсан · сүүлд 14:20».
export function deviceWords(device) {
  const s = device.last_status || {}, battery = s.batteryPercent ?? s.battery_pct;
  if (device.online) return ['Утас холбогдсон ✓', Number.isFinite(battery) ? `Батарей ${Math.round(battery)}%` : '', s.charging ? 'Цэнэглэж байна' : ''].filter(Boolean).join(' · ');
  const last = clockUB(device.last_seen_at);
  return last ? `Утас салсан · сүүлд ${last}` : 'Утас холбогдоогүй';
}

// Хуанлийн өдөр (Улаанбаатар): «2026-11-19».
export const ubDate = at => new Intl.DateTimeFormat('en-CA', { timeZone: UB, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);

// Тайлангийн хугацаа: өнөөдөр, өчигдөр эсвэл сүүлийн 7 хоног (Улаанбаатарын шөнө дундаас).
export function reportRange(range, now = Date.now()) {
  const midnight = Date.parse(`${ubDate(now)}T00:00:00+08:00`), DAY = 86400000;
  if (range === 'yesterday') return { since: new Date(midnight - DAY).toISOString(), until: new Date(midnight).toISOString(), days: 1 };
  if (range === 'week') return { since: new Date(midnight - 6 * DAY).toISOString(), until: new Date(now + 60000).toISOString(), days: 7 };
  return { since: new Date(midnight).toISOString(), until: new Date(now + 60000).toISOString(), days: 1 };
}

// Цаг бүрийн дундаж хүний тоо (24 багана). Хэмжилтгүй цагт утга байхгүй (null), 0 гэж зохиохгүй.
export function hourlyPeople(aggregates = []) {
  const sum = Array(24).fill(0), count = Array(24).fill(0);
  for (const a of aggregates) {
    if (!Number.isFinite(a.averageObservedPeople) || !a.sampleCount) continue;
    const hour = Number.isInteger(a.localHour) ? a.localHour : Number(new Intl.DateTimeFormat('en-GB', { timeZone: UB, hour: '2-digit', hourCycle: 'h23' }).format(Date.parse(a.timestamp)));
    sum[hour] += a.averageObservedPeople; count[hour]++;
  }
  return sum.map((s, hour) => ({ hour, value: count[hour] ? Math.round(s / count[hour] * 10) / 10 : null }));
}

// «Хамгийн ачаалалтай: 13:00–14:00» — хэмжилт байхгүй бол хоосон.
export function busiestText(bars) {
  const best = bars.filter(b => b.value != null).sort((a, b) => b.value - a.value || a.hour - b.hour)[0];
  return best && best.value > 0 ? `Хамгийн ачаалалтай: ${pad(best.hour)}:00–${pad((best.hour + 1) % 24)}:00` : '';
}
