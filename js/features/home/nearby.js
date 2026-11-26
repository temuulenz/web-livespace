// «Ойролцоох кафенууд»: the real map (same as the main map, showing only the nearest
// cafés) on the left and the cafés as cards with a photo on the right, four at a time with
// dots for the rest. Buttons under the heading:
//  • Ажиллах / Найзуудтай / Тухтай keep only cafés with that purpose;
//  • Сул суудал / Wi-Fi / Чимээ make the map pins show just that value, large and clear.
// The visitor's location is requested when the home page opens and is used only in the
// browser. If the browser or the site does not allow location, distances are measured from
// Сүхбаатарын талбай, and the section says so.
import { $, $$ } from '../../dom.js';
import { escapeHTML } from '../../../framework/index.js';
import { I } from '../../icons.js';
import { wifiSVG } from '../../components/atmosphere.js';
import { buildMap } from '../../map.js';
import { cafeLngLat } from '../../map-gl.js';
import { MAP_CONFIG } from '../../map-config.js';
import { loadMenuSummaries, menuPhoto } from '../menu/menu-summary.js';

const CITY_CENTRE = [106.9176, 47.9188];          // Сүхбаатарын талбай
const SHOWN = 6, PER_PAGE = 4;
const EXAMPLE_ART = ['cafe-interior-desktop.webp', 'cafe-work-desktop.webp', 'cafe-bakery-desktop.webp', 'cafe-dessert.webp'];
const PURPOSES = [['Ажиллах', I.laptop], ['Найзуудтай', I.people], ['Тухтай', I.sofa]];
const SHOWS = [['seats', 'Сул суудал', I.seat], ['wifi', 'Wi-Fi', wifiSVG(4, 16)], ['sound', 'Чимээ', I.sndOn]];
let remembered = null;                              // this visit only; never stored or sent

export function distanceMetres([lng1, lat1], [lng2, lat2]) {
  const rad = d => d * Math.PI / 180, dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}
const distanceText = m => m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} м` : `${(m / 1000).toFixed(1)} км`;
const walkText = m => `${Math.max(1, Math.round(m / 80))} мин`;
const insideCity = ([lng, lat]) => { const [[w, s], [e, n]] = MAP_CONFIG.cityBounds; return lng >= w && lng <= e && lat >= s && lat <= n; };
const hash = id => [...String(id)].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);

export function nearbyHTML() {
  return `<section class="dis-near" aria-labelledby="dis-near-title">
      <div class="dis-near-head">
        <h2 id="dis-near-title">Ойролцоох кафенууд</h2>
        <p class="dis-near-status" role="status"></p>
        <div class="dis-near-chips" role="group" aria-label="Ойролцоох кафег шүүх, газрын зураг дээр харуулах">
          ${PURPOSES.map(([p, icon]) => `<button type="button" data-near-purpose="${p}" aria-pressed="false">${icon}<span>${p}</span></button>`).join('')}
          <span class="dis-near-sep" aria-hidden="true"></span>
          ${SHOWS.map(([key, label, icon]) => `<button type="button" data-near-show="${key}" aria-pressed="false">${icon}<span>${label}</span></button>`).join('')}
        </div>
      </div>
      <div class="dis-near-body">
        <div class="dis-near-map" aria-label="Ойролцоох кафенуудын газрын зураг"></div>
        <div class="dis-near-right">
          <div class="dis-near-cards"></div>
          <div class="dis-near-dots" role="group" aria-label="Кафены жагсаалтын хуудас"></div>
        </div>
      </div>
      <a class="dis-near-all" href="#cafes">Бүх кафе харах →</a>
    </section>`;
}

// The photo above each card: a real menu photo from the café when it has one, otherwise
// example art that is clearly labelled as an example.
function photoHTML(cafe, metres) {
  const real = menuPhoto(cafe.id);
  const art = 'js/features/home/' + EXAMPLE_ART[hash(cafe.id) % EXAMPLE_ART.length];
  return `<figure class="cc-photo">
      <img src="${real || art}" alt="" loading="lazy" decoding="async"${real ? ` data-fallback="${art}"` : ''}>
      <span class="cc-photo-label"${real ? ' hidden' : ''}>Жишээ зураг</span>
      <span class="cc-photo-dist">${distanceText(metres)} · ${walkText(metres)}</span>
    </figure>`;
}

export function mountNearby(section, { cafes, cardHTML }) {
  const mapHost = $('.dis-near-map', section), cards = $('.dis-near-cards', section), dots = $('.dis-near-dots', section), status = $('.dis-near-status', section);
  const controller = new AbortController(), { signal } = controller;
  const on = (el, type, fn, opts = {}) => el.addEventListener(type, fn, { ...opts, signal });
  let map = null, origin = remembered, own = Boolean(remembered), nearest = [], purpose = null, show = null, page = 0, pageHeight = 0;

  function render() {
    const from = origin || CITY_CENTRE;
    nearest = cafes.filter(cafe => !purpose || cafe.tags?.includes(purpose))
      .map(cafe => ({ cafe, metres: distanceMetres(from, cafeLngLat(cafe)) }))
      .sort((a, b) => a.metres - b.metres).slice(0, SHOWN);
    const pages = Math.max(1, Math.ceil(nearest.length / PER_PAGE));
    page = Math.min(page, pages - 1);
    cards.innerHTML = nearest.slice(page * PER_PAGE, (page + 1) * PER_PAGE)
      .map(({ cafe, metres }) => cardHTML(cafe, {
        top: photoHTML(cafe, metres),
        meta: escapeHTML(cafe.hours || ''),                                              // opening hours (the walking time is on the photo badge)
        lamp: true                                                                       // open/closed lamp before the tags
      })).join('')
      || '<p class="dis-near-empty">Ойролцоо тохирох кафе олдсонгүй.</p>';
    // The second page keeps the height of the first, so the map and the layout do not jump.
    if (page === 0) { cards.style.minHeight = ''; pageHeight = cards.offsetHeight; } else cards.style.minHeight = pageHeight + 'px';
    dots.innerHTML = pages > 1 ? Array.from({ length: pages }, (_, i) =>
      `<button type="button" data-near-page="${i}" aria-label="${i + 1}-р хуудас"${i === page ? ' aria-current="true"' : ''}></button>`).join('') : '';
    const where = own ? 'Танд' : 'Сүхбаатарын талбайд';
    status.textContent = `${purpose ? `«${purpose}» · ` : ''}${where} хамгийн ойр ${nearest.length} кафе${own ? '' : ' (таны байршлыг ашиглах боломжгүй)'}`;
    $$('[data-near-purpose]', section).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.nearPurpose === purpose)));
    $$('[data-near-show]', section).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.nearShow === show)));
    mapHost.dataset.show = show || '';
    if (map) {
      map.dim(new Set(nearest.map(({ cafe }) => cafe.id)));          // the map shows only these cafés
      map.showNearby(from, nearest.map(({ cafe }) => cafeLngLat(cafe)), { you: own });
    }
  }

  // Real photos come from the cafés' menus; the cards update when they arrive.
  const loadPhotos = () => loadMenuSummaries(nearest.map(({ cafe }) => cafe), { signal }).then(() => { if (!signal.aborted) render(); });

  // The real map is loaded only when the section comes close to the screen.
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(e => e.isIntersecting) || map) return;
    observer.disconnect();
    map = buildMap(mapHost, { interactive: true, cooperative: true, onSelect: id => { if (id) location.hash = 'cafe-' + encodeURIComponent(id); } });
    render();
  }, { rootMargin: '300px 0px' });
  observer.observe(section);

  on(section, 'click', e => {
    const p = e.target.closest('[data-near-purpose]'), s = e.target.closest('[data-near-show]'), d = e.target.closest('[data-near-page]');
    if (p) { purpose = purpose === p.dataset.nearPurpose ? null : p.dataset.nearPurpose; page = 0; render(); loadPhotos(); }
    if (s) { show = show === s.dataset.nearShow ? null : s.dataset.nearShow; render(); }
    if (d) { page = Number(d.dataset.nearPage); render(); }
  });
  // A menu photo that fails to load is replaced by the labelled example art.
  on(cards, 'error', e => {
    const img = e.target; if (!img.matches?.('.cc-photo img[data-fallback]')) return;
    img.src = img.dataset.fallback; img.removeAttribute('data-fallback'); img.nextElementSibling.hidden = false;
  }, { capture: true });
  const cardId = card => decodeURIComponent(card.dataset.href.slice(6));
  on(cards, 'pointerover', e => { const card = e.target.closest('[data-href]'); if (card) map?.hover(cardId(card), true); });
  on(cards, 'pointerout', e => { const card = e.target.closest('[data-href]'); if (card) map?.hover(cardId(card), false); });

  render();
  loadPhotos();
  if (!remembered && navigator.geolocation && window.isSecureContext) {
    status.textContent = 'Таны байршлыг тодорхойлж байна…';
    navigator.geolocation.getCurrentPosition(pos => {
      if (signal.aborted) return;
      const here = [pos.coords.longitude, pos.coords.latitude];
      if (insideCity(here)) { remembered = origin = here; own = true; }
      render(); loadPhotos();
    }, () => { if (!signal.aborted) render(); }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  }

  return {
    refresh() { render(); loadPhotos(); },
    destroy() { controller.abort(); observer.disconnect(); map?.destroy(); map = null; }
  };
}
