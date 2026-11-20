// Нэг ижил дарааллын төлөвийн мөрүүд (бүх карт, урьдчилсан харагдац, кафены эхний дэлгэц):
//   Нээлттэй · 22:00 хүртэл
//   Суудал: мэдээлэлгүй · Wi-Fi: Сайн
//   Бодит мэдээлэл · 20 сек өмнө
import { escapeHTML } from '../../framework/index.js';
import { trustState, openState, seatState, wifiState, peopleState, noiseWord, PEOPLE_NOTE } from './status.js';
import { sensorState } from './sensor-state.js';

export function trustHTML(c, opts = {}) {
  const t = trustState(c, opts);
  return `<span class="cs-trust t-${t.kind}"><i aria-hidden="true"></i>${escapeHTML(t.text)}</span>`;
}

export function statusLinesHTML(c, opts = {}) {
  const o = openState(c), seat = seatState(c, opts), wifi = wifiState(c);
  const facts = c.open ? `${seat.short} · ${wifi.short}` : '';
  return `<div class="cs-lines">
  <span class="cs-open${o.open ? ' on' : ''}">${escapeHTML(o.text)}</span>
  ${facts ? `<span class="cs-facts" title="${escapeHTML(seat.text + ' · ' + wifi.source)}">${escapeHTML(facts)}</span>` : ''}
  ${trustHTML(c, opts)}
 </div>`;
}

// Шошго: ДЕМО / ШУУД / ТУРШИЛТ / ХУУЧИРСАН / МЭДЭЭЛЭЛГҮЙ — англи үггүй (нийтийн хуудас).
const BADGE = { demo: ['b-demo', 'ДЕМО'], live: ['b-live', 'ШУУД'], test: ['b-typ', 'ТУРШИЛТ'], stale: ['b-stale', 'ХУУЧИРСАН'], none: ['b-stale', 'МЭДЭЭЛЭЛГҮЙ'] };
export function publicBadge(c, opts = {}) {
  const [cls, word] = BADGE[trustState(c, opts).kind];
  return `<span class="badge ${cls}">${word}</span>`;
}

// Камертай кафе: «Одоо: N хүн ажиглагдсан», дуу чимээ энгийн үгээр, хэр шинэ вэ, мөн
// «Хүний тоо нь сул суудлын тоо биш». Төхөөрөмжийн төлөв, dBFS, итгэлцлийн хувь энд гарахгүй.
export function publicSensorHTML(c, opts = {}) {
  const people = peopleState(c, opts), sensor = sensorState(c, opts);
  if (!people) return '';
  const t = trustState(c, opts);
  return `<div class="pub-sensor" data-sensor-panel>
  <span class="pub-people">${people.known ? `Одоо: <b class="num" data-observed-people>${people.count}</b> хүн ажиглагдсан` : `<span data-observed-people>${escapeHTML(people.text)}</span>`}</span>
  <span class="pub-noise" data-sensor-noise>${escapeHTML(noiseWord(sensor.noise))}</span>
  <span class="cs-trust t-${t.kind}" data-sensor-status="${escapeHTML(sensor.status)}"><i aria-hidden="true"></i>${escapeHTML(t.text)}</span>
  <small class="muted">${PEOPLE_NOTE}</small>
 </div>`;
}
