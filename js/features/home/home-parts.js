// Нүүр хуудасны жижиг дүрслэлүүд: дүрс, шошго, дүүргэлтийн баар, шууд тэмдэг.
// home-page.js ба home-featured.js хоёулаа ашиглана.
import { escapeHTML as esc } from '../../../framework/index.js';

const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`;
export const ICON = {
  all: svg('<path d="M4 9h13l-1 8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z"/><path d="M17 11h2a2 2 0 0 1 0 4h-2"/>'),
  seats: svg('<path d="M6 20v-6h12v6M6 14V6h12v8M4 14h16"/>'),
  study: svg('<path d="M4 6a2 2 0 0 1 2-2h5v16H6a2 2 0 0 1-2-2zM13 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5z"/>'),
  quiet: svg('<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M16 9l5 6M21 9l-5 6"/>'),
  wifi: svg('<path d="M2 9a15 15 0 0 1 20 0M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0"/><circle cx="12" cy="20" r="1"/>'),
  plug: svg('<path d="M9 3v5M15 3v5M6 8h12v4a6 6 0 0 1-12 0zM12 18v3"/>'),
  kids: svg('<circle cx="12" cy="7" r="3"/><path d="M7 21l2-8h6l2 8M5 12l4-2M19 12l-4-2"/>'),
  meet: svg('<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M3 20c.5-3 2.5-5 5-5s4.5 2 5 5M11 20c.5-3 2.5-5 5-5s4.5 2 5 5"/>'),
  near: svg('<path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
  noise: svg('<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>'),
  locate: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>'),
  sliders: svg('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>')
};

export const cafeLink = c => '#cafe-' + encodeURIComponent(c.id);

export function tagsHTML(tags, cls = 'hm-tags') {
  return tags.length ? `<div class="${cls}">${tags.map(t => `<span>${ICON[t.key] || ''}${esc(t.text)}</span>`).join('')}</div>` : '';
}
export function occHTML(x, cls = 'hm-occ') {
  if (!x.has) return `<div class="${cls} is-none">${esc(x.open ? 'Шууд хэмжилтгүй · цэс, сэтгэгдэлтэй' : x.note)}</div>`;
  return `<div class="${cls}" data-level="${x.level}"><span>Одоо <b class="num">${x.occupied}%</b> дүүрсэн${x.demo ? ' <small>(жишээ)</small>' : ''}</span>
    <div class="hm-bar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${x.occupied}" aria-label="Дүүргэлт ${x.occupied}%"><i style="width:${x.occupied}%"></i></div></div>`;
}
export function badgeHTML(x, cls = 'hm-badge') {
  if (x.has) return `<span class="${cls}" data-level="${x.level}"><i class="hm-dot"></i>${esc(x.badge)}${x.age ? ` · ${esc(x.age)}` : ''}</span>`;
  if (!x.open) return `<span class="${cls} is-closed">${esc(x.note.split(' · ')[0])}</span>`;
  return '';
}
