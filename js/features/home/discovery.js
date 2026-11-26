import { escapeHTML } from '../../../framework/index.js';
import { $, $$ } from '../../dom.js';
import { I } from '../../icons.js';
import { Prefs, favs } from '../../state.js';
import { createTour } from './tour.js';
import { nearbyHTML, mountNearby } from './nearby.js';
import { platform, loadCatalogue } from '../../services/platform.js';
import { categories, recommendationEntries, publishedMenuGroups, activePromotion, ratingText, isDemoCafe } from './recommendations.js';

const exampleArt = {
  near: ['cafe-dessert.webp', 'cafe-cartoon.webp', 'cafe-dessert-card.webp'],
  dessert: ['cafe-bakery-desktop.webp', 'cafe-pastry-cartoon.webp'],
  work: ['cafe-work-desktop.webp', 'cafe-cartoon.webp'],
  promo: ['cafe-dessert.webp', 'cafe-pastry-cartoon.webp', 'cafe-dessert-card.webp'],
  coffee: ['cafe-interior-desktop.webp', 'cafe-cartoon.webp'],
  seats: ['cafe-work-desktop.webp', 'cafe-pastry-cartoon.webp']
};
const cardArt = [exampleArt.coffee, exampleArt.dessert, exampleArt.work, exampleArt.near];
const asset = filename => new URL(filename, import.meta.url).href;
const cafeLink = c => '#cafe-' + encodeURIComponent(c.id);
const expand = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 5h5v5m0-5-5 5M5 14v5h5m-5 0 5-5"/></svg>';
function art(category, featured = false, index = 0) {
  const offset = categories.indexOf(category);
  const [desktop, mobile, desktopSmall = desktop] = featured
    ? exampleArt[category.key] : cardArt[(offset + index) % cardArt.length];
  const mobileSource = !featured && mobile === 'cafe-cartoon.webp' ? 'cafe-cartoon-small.webp' : mobile;
  return `<picture>
    <source media="(min-width: 821px)" srcset="${asset(featured ? desktop : desktopSmall)}">
    <img src="${asset(mobileSource)}" alt="" width="1200" height="800"
      ${featured ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">
  </picture>`;
}
const artworkLabel = `<span class="dis-art-label"><span class="dis-label-mobile">Кафены зураглал</span><span class="dis-label-desktop">Жишээ зураг</span></span>`;
const settings = filterCount => `
  <button class="dis-setting" type="button" data-dis-map aria-label="Газрын зураг руу очих">${I.map}</button>
  <button class="dis-setting dis-filter" type="button" data-dis-filter aria-label="Нарийвчилсан шүүлтүүр" aria-haspopup="dialog">${I.filter}<span class="dis-filter-count">${filterCount || ''}</span></button>`;
const demoDescriptions = {
  promo: 'Хямдрал, багцын жишээг үзээрэй.',
  seats: 'Сул суудлын жишээ мэдээллийг үзээрэй.'
};
const heart = c => `<button type="button" class="heart dis-heart" data-fav="${escapeHTML(c.id)}" aria-pressed="${favs.has(c.id)}" aria-label="${escapeHTML(c.name)} хадгалах">${I.heart}</button>`;

export function discoveryHTML({ query, filterCount }) {
  return `<div class="discovery">
    <section class="dis-hero" aria-label="Кафе санал болгох">
      <div class="dis-intro">
        <div class="dis-desktop-copy">
          ${categories.map(category => `<div class="dis-copy-panel" data-dis-copy="${category.key}">
            <span class="dis-kicker">${category.icon}${category.label}</span>
            <h1>${category.title}</h1><p>${category.text}</p>
          </div>`).join('')}
        </div>
        <h1 class="dis-mobile-heading">Кафе хайх</h1>
        <form class="dis-search" id="hs" role="search">
          <div class="dis-query"><span aria-hidden="true">${I.search}</span><input id="hq" type="search" name="q" aria-label="Кафе хайх" maxlength="120" value="${escapeHTML(query)}" placeholder="Кафе хайх…"><button type="submit" aria-label="Хайх"><span aria-hidden="true">${I.search}</span></button></div>
          ${settings(filterCount)}
        </form>
        <div class="dis-chips" role="group" aria-label="Саналын ангилал">
          ${categories.map(category => `<button type="button" data-dis-category="${category.key}" aria-pressed="false">${category.icon}<span>${category.key === 'near' ? 'Танд' : category.label}</span></button>`).join('')}
        </div>
      </div>
      <div class="dis-showcase" aria-label="Онцлох кафе" aria-roledescription="карусель">
        <div class="dis-window">
          <div class="dis-art"></div>
          <div class="dis-feature" aria-live="off"></div>
          <button class="dis-arrow dis-prev" type="button" data-dis-step="-1" aria-label="Өмнөх санал">${I.chev}</button>
          <button class="dis-arrow dis-next" type="button" data-dis-step="1" aria-label="Дараах санал">${I.chev}</button>
        </div>
        <div class="dis-pagination" role="group" aria-label="Каруселийн удирдлага">
          ${categories.map(c => `<button type="button" data-dis-dot="${c.key}" aria-label="${c.label}" aria-current="false"></button>`).join('')}
          <button type="button" data-dis-pause aria-label="Автомат солилтыг зогсоох">Ⅱ</button>
        </div>
      </div>
    </section>
    <p class="dis-status" role="status"></p>
    <a class="dis-map" href="#explore">${I.map}<span><b><em>Газрын зураг</em> дээрээс кафе хайх</b><small>Байршлаар нь үзэж, очих газраа олоорой.</small></span>${expand}</a>
    <!-- «Танд ойрхон кафенууд» replaces the recommendation cards; they stay hidden so the carousel code keeps working. -->
    ${nearbyHTML()}
    <section class="dis-more" aria-labelledby="dis-more-title" hidden>
      <div class="dis-more-head"><h2 id="dis-more-title"><span aria-hidden="true">${I.star}</span><span class="dis-label-desktop">Танд санал болгох</span><span class="dis-label-mobile">Танд санал болгох</span></h2><button class="dis-tour" type="button" data-dis-tour aria-label="Хэрэглэх заавар">${I.info}</button><a href="#cafes">Бүгдийг харах ${I.arr}</a></div>
      <div class="dis-track" tabindex="0" aria-label="Ижил ангиллын кафенууд"></div>
    </section>
  </div>`;
}

function featureHTML(entry, category) {
  if (!entry) return '';
  const { cafe, reason } = entry;
  return `<article class="dis-feature-card" data-href="${cafeLink(cafe)}">
    <span class="dis-feature-tag"><span class="dis-label-mobile">${category.icon}${category.label}</span><span class="dis-label-desktop">${I.star}Онцлох кафе</span></span>
    <h2><a href="${cafeLink(cafe)}">${escapeHTML(cafe.name)}</a></h2>
    <div class="dis-meta"><span data-dis-rating="${escapeHTML(cafe.id)}"></span>${isDemoCafe(cafe) ? '<span>Демо</span>' : ''}${cafe.district ? `<span>${escapeHTML(cafe.district)}</span>` : ''}</div>
    <p title="${escapeHTML(reason)}">${escapeHTML(reason)}</p>${heart(cafe)}
    <a class="dis-details" href="${cafeLink(cafe)}" aria-label="${escapeHTML(cafe.name)} дэлгэрэнгүй">Дэлгэрэнгүй ${I.arr}</a>
  </article>`;
}

function compactCard({ cafe, reason }, index, category) {
  return `<article class="dis-card dis-crop-${index}">
    <a href="${cafeLink(cafe)}">${art(category, false, index)}${artworkLabel}<strong>${escapeHTML(cafe.name)}</strong><small><span data-dis-rating="${escapeHTML(cafe.id)}"></span>${[cafe.district, isDemoCafe(cafe) ? 'Демо' : ''].filter(Boolean).map(escapeHTML).join(' · ')}</small>
      <span class="dis-card-detail">${reason ? `<span title="${escapeHTML(reason)}">${category.icon}<span>${escapeHTML(reason)}</span></span>` : ''}<i aria-hidden="true">${I.chev}</i></span>
    </a>
    ${heart(cafe)}
  </article>`;
}

export function bindDiscovery(root, { cafes, matches, onSearch, onMap, onFilters, onCategory, cardHTML, updateFilterUI }) {
  const controller = new AbortController(), { signal } = controller;
  const on = (element, event, action) => element.addEventListener(event, action, { signal });
  const el = selector => $(selector, root);
  const feature = el('.dis-feature'), track = el('.dis-track'), showcase = el('.dis-showcase');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const evidence = { menu: new Map(), promotions: new Map() };
  const ratings = new Map(), requests = new Map();
  const find = key => categories.find(c => c.key === key);
  let current = categories[0], requestVersion = 0, paused = false, hover = false;
  let tour = null, touching = null, visible = true, busy = false, afterInteraction = 0, renderedKey = '';
  const demoMode = () => cafes.length > 0 && cafes.every(isDemoCafe);
  const entryList = category => recommendationEntries(cafes.filter(matches), category, evidence, {
    staleAfterSec: platform.config.stale_after_sec ?? 900, demo: demoMode()
  });
  const cycle = () => categories.filter(c => c.key === 'near' || entryList(c).length);
  const dataOptions = { signal, timeout: 4500, retry: 0 };

  function loadRating(cafe) {
    if (!platform.online || isDemoCafe(cafe)) return;
    if (!ratings.has(cafe.id)) ratings.set(cafe.id,
      platform.api.get(`/cafes/${encodeURIComponent(cafe.id)}/ratings`, dataOptions)
        .then(data => ratingText(data, cafe.id)).catch(() => ''));
    ratings.get(cafe.id).then(value => {
      if (signal.aborted || !value) return;
      for (const target of $$('[data-dis-rating]', root)) {
        if (target.dataset.disRating !== cafe.id) continue;
        target.textContent = `★ ${value}`;
        target.setAttribute('aria-label', `Үнэлгээ 5-аас ${value}`);
      }
    });
  }

  function render({ manual = false, notice = '' } = {}) {
    updateFilterUI(root);
    const rows = entryList(current);
    const available = cycle();
    const artwork = el('.dis-art');
    if (artwork.dataset.category !== current.key) {
      artwork.innerHTML = art(current, true) + artworkLabel;
      artwork.dataset.category = current.key;
    }
    const error = platform.catalogueStatus === 'error' && !cafes.length;
    const [first, ...additional] = rows;
    const displayed = additional.slice(0, 4);
    const key = JSON.stringify([current.key, first?.cafe.id, first?.reason, first?.cafe.name, first?.cafe.district,
      displayed.map(({ cafe, reason }) => [cafe.id, cafe.name, cafe.district, reason]), error]);
    const demo = demoMode();
    $$('[data-dis-copy]', root).forEach(panel => {
      const category = find(panel.dataset.disCopy);
      panel.toggleAttribute('data-active', category === current);
      if (demoDescriptions[category.key]) {
        const text = demo ? demoDescriptions[category.key] : category.text;
        const paragraph = $('p', panel);
        if (paragraph.textContent !== text) paragraph.textContent = text;
      }
    });
    feature.setAttribute('aria-live', manual || notice ? 'polite' : 'off');
    if (key !== renderedKey) {
      const focus = document.activeElement;
      const restore = track.contains(focus) || feature.contains(focus) ? focus.getAttribute('data-fav') || focus.getAttribute('href') : '';
      feature.innerHTML = featureHTML(first, current) || `<div class="dis-empty"><h2>${error ? 'Кафены мэдээллийг ачаалж чадсангүй' : 'Тохирох кафе олдсонгүй'}</h2>${error ? '<button type="button" data-dis-retry>Дахин оролдох</button>' : ''}</div>`;
      track.innerHTML = displayed.length ? displayed.map((entry, index) => compactCard(entry, index, current)).join('') : '<p>Одоогоор өөр санал алга.</p>';
      track.scrollLeft = 0;
      if (restore) {
        const replacement = $$('a,[data-fav]', root).find(node => (node.getAttribute('data-fav') || node.getAttribute('href')) === restore);
        (replacement || el('#hq')).focus({ preventScroll: true });
      }
      renderedKey = key;
      if (first) loadRating(first.cafe);
      if (matchMedia('(min-width: 821px)').matches) displayed.forEach(({ cafe }) => loadRating(cafe));
    }
    el('.dis-status').textContent = notice;
    $$('[data-dis-category]', root).forEach(button => {
      const category = find(button.dataset.disCategory);
      button.setAttribute('aria-pressed', category === current);
      button.disabled = Boolean(category.source && !platform.online && !demoMode());
    });
    $$('[data-dis-dot]', root).forEach(button => {
      const category = find(button.dataset.disDot);
      button.hidden = !available.includes(category);
      button.setAttribute('aria-current', category === current);
    });
    $$('[data-dis-step],[data-dis-pause]', root).forEach(button => { button.hidden = available.length < 2 });
    root.classList.toggle('dis-no-motion', Prefs.reduced || motion.matches);
  }

  async function enrich(source, limit = 12) {
    const candidates = cafes.filter(c => matches(c) && !isDemoCafe(c));
    // The automatic preview samples four cafes. Explicit category requests can check up to twelve.
    const selected = candidates.slice(0, limit);
    const key = source + ':' + JSON.stringify(selected.map(c => c.id));
    const cached = requests.get(key);
    if (cached && cached.until > Date.now()) return cached.promise;
    const request = { until: Infinity };
    request.promise = (async () => {
      let failures = 0;
      for (let i = 0; i < selected.length && !signal.aborted; i += 3) {
        await Promise.all(selected.slice(i, i + 3).map(async cafe => {
          try {
            const params = source === 'menu' ? '?limit=100' : '?state=active&limit=1';
            const data = await platform.api.get(`/cafes/${encodeURIComponent(cafe.id)}/${source}${params}`, dataOptions);
            if (source === 'menu') evidence.menu.set(cafe.id, publishedMenuGroups(data));
            else {
              evidence.promotions.delete(cafe.id);
              const item = activePromotion(data);
              // A scheduled promotion can change at the next local minute boundary.
              if (item) evidence.promotions.set(cafe.id, { item, until: Math.floor(Date.now() / 60000) * 60000 + 60000 });
            }
          } catch { failures++; }
        }));
      }
      request.until = failures ? 0 : source === 'menu' ? Date.now() + 60000 : Math.floor(Date.now() / 60000) * 60000 + 60000;
      return { failures, limited: candidates.length > selected.length };
    })();
    if (requests.size >= 16) requests.delete(requests.keys().next().value);
    requests.set(key, request);
    return request.promise;
  }

  async function select(category) {
    const version = ++requestVersion;
    afterInteraction = Date.now();
    busy = Boolean(category.source && !demoMode());
    let result = {};
    if (busy) {
      render({ manual: true, notice: 'Саналын мэдээлэл ачаалж байна…' });
      result = await enrich(category.source);
      if (signal.aborted || version !== requestVersion) return;
    }
    busy = false;
    const hasEntries = category.key === 'near' || entryList(category).length > 0;
    current = hasEntries ? category : categories[0];
    const notice = [
      result.failures ? 'Зарим кафены мэдээлэл ачаалагдсангүй.' : '',
      !hasEntries ? `«${category.label}» ангилалд баталгаатай санал олдсонгүй.` : '',
      result.limited ? 'Эхний 12 кафены мэдээллийг шалгалаа.' : ''
    ].filter(Boolean).join(' ');
    render({ manual: true, notice });
  }

  // A category chip opens the map with that category's cafés.
  async function openCategoryMap(category) {
    if (category.source && !demoMode()) await enrich(category.source);
    if (signal.aborted) return;
    const ids = category.key === 'near' ? null : entryList(category).map(entry => entry.cafe.id);
    onCategory(category, ids);
  }

  function step(direction, manual = false) {
    const available = cycle(), index = Math.max(0, available.indexOf(current));
    if (available.length < 2) return;
    const category = available[(index + direction + available.length) % available.length];
    if (manual) { requestVersion++; busy = false; afterInteraction = Date.now() }
    current = category;
    render({ manual });
  }

  on(root, 'click', async event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-dis-tour')) { tour?.end(false); tour = createTour(() => { tour = null }) }
    if (button.hasAttribute('data-dis-map')) onMap();
    if (button.hasAttribute('data-dis-filter')) onFilters(button);
    if (button.hasAttribute('data-dis-step')) step(Number(button.dataset.disStep), true);
    if (button.hasAttribute('data-dis-pause')) {
      paused = !paused;
      afterInteraction = Date.now();
      button.textContent = paused ? '▶' : 'Ⅱ';
      button.setAttribute('aria-label', paused ? 'Автомат солилтыг үргэлжлүүлэх' : 'Автомат солилтыг зогсоох');
    }
    if (button.dataset.disCategory) { openCategoryMap(find(button.dataset.disCategory)); return }
    const category = button.dataset.disDot;
    if (category) select(find(category));
    if (button.hasAttribute('data-dis-retry')) {
      if (!platform.online) { location.reload(); return }
      button.disabled = true;
      render({ manual: true, notice: 'Кафены мэдээлэл ачаалж байна…' });
      try { await loadCatalogue({ signal }) } catch { /* The catalogue state supplies the error view. */ }
      if (!signal.aborted) render({ manual: true });
    }
  });
  on(el('#hs'), 'submit', event => { event.preventDefault(); onSearch(el('#hq').value.trim()) });
  // Pause only while the pointer is on the featured café itself, not anywhere on the page.
  on(showcase, 'pointerenter', e => { if (e.pointerType === 'mouse') hover = true });
  on(showcase, 'pointerleave', e => { if (e.pointerType === 'mouse') { hover = false; afterInteraction = Date.now() } });
  on(root, 'pointerdown', () => { afterInteraction = Date.now() });
  on(root, 'focusout', () => { afterInteraction = Date.now() });
  on(track, 'scroll', () => { if (!track.scrollLeft) return; afterInteraction = Date.now() });
  on(showcase, 'touchstart', e => {
    if (e.touches.length !== 1 || e.target.closest('button,input')) return;
    const t = e.touches[0];
    touching = { x: t.clientX, y: t.clientY, id: t.identifier };
  });
  on(showcase, 'touchcancel', () => { touching = null });
  on(showcase, 'touchend', e => {
    const start = touching;
    touching = null;
    const touch = start && [...e.changedTouches].find(t => t.identifier === start.id);
    if (!touch) return;
    const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
    if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1, true);
  });
  const observer = new IntersectionObserver(entries => { visible = entries.some(e => e.isIntersecting) });
  observer.observe(showcase);
  on(motion, 'change', () => render());
  let next = Date.now() + 7000;
  const timer = setInterval(() => {
    if (['promo', 'seats'].includes(current.key) && !entryList(current).length) { current = categories[0]; render() }
    if (paused || busy || hover || touching || !visible || document.hidden || Prefs.reduced || motion.matches ||
      showcase.contains(document.activeElement) || $('#modal .mdl') || tour) {
      next = Date.now() + 7000;
      return;
    }
    if (Date.now() >= Math.max(next, afterInteraction + 7000)) { step(1); next = Date.now() + 7000 }
  }, 500);
  const nearby = mountNearby(el('.dis-near'), { cafes, cardHTML });
  function refresh() {
    if (current.key !== 'near' && !entryList(current).length) current = categories[0];
    render();
    nearby.refresh();
  }
  const prime = setTimeout(() => {
    if (!platform.online || !cafes.some(c => !isDemoCafe(c))) return;
    Promise.all(['menu', 'promotions'].map(source => enrich(source, 4))).then(() => {
      if (!signal.aborted && !busy) refresh();
    });
  }, 650);
  const unsub = ['cafe:updated', 'catalog:changed'].map(type => platform.bus.on(type, refresh));
  render();
  return { refresh, destroy() { controller.abort(); nearby.destroy(); tour?.end(false); observer.disconnect(); clearInterval(timer); clearTimeout(prime); unsub.forEach(fn => fn()) } };
}
