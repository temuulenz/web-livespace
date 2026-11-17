// Нэг ижил дарааллын төлөвийн мөрүүд (бүх карт, урьдчилсан харагдац, кафены эхний дэлгэц):
//   Нээлттэй · 22:00 хүртэл
//   Суудал: мэдээлэлгүй · Wi-Fi: Сайн
//   Бодит мэдээлэл · 20 сек өмнө
import { escapeHTML } from '../../framework/index.js';
import { trustState, openState, seatState, wifiState } from './status.js';

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
