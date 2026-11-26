// Нүүр хуудас (Design C): толгойн хайлт, онцлох кафе, шууд хураангуй, ангилал,
// жагсаалт + газрын зураг, эзэмшигчийн зурвас, утасны доод цэс.
//
// Өгөгдөл: зөвхөн каталог (js/cafes.js) ба одоо байгаа шууд суваг (platform.bus). Шинэ realtime
// холболт нээхгүй. Таймер, сонсогч бүгд destroy()-д цэвэрлэгдэнэ.
import { escapeHTML as esc, patch } from '../../../framework/index.js';
import { $, $$ } from '../../dom.js';
import { I } from '../../icons.js';
import { Prefs, F, favs } from '../../state.js';
import { platform, loadCatalogue } from '../../services/platform.js';
import { buildMap } from '../../map.js';
import { cafeLngLat } from '../../map-gl.js';
import { MAP_CONFIG } from '../../map-config.js';
import { toast } from '../../components/feedback.js';
import { ratingText, isDemoCafe } from './recommendations.js';
import { photosOf } from './cafe-photos.js';
import { liveInfo, featureTags, CATEGORIES, categoryByKey, categoryCounts, liveSummary, sortCafes, distanceKm, distanceText } from './home-data.js';
import { bindFeatured } from './home-featured.js';
import { ICON, cafeLink, tagsHTML, occHTML, badgeHTML } from './home-parts.js';

// Зураггүй кафены картанд одоо байгаа жишээ зураглал (discovery-ийн зургууд) «Жишээ зураг» шошготой.
// Зураггүй кафены картанд дулаан lofi зураглал (нуман цонх, унжлагатай гэрэл, ширээ, аяга, ургамал).
// Энэ нь зурсан дүрслэл тул бодит кафены зураг мэт харагдахгүй.
const ART_BG = ['#F5D9A8', '#E9C9A0', '#F0D4B4', '#E7C29A', '#F3DDBE', '#EFD5B0', '#EAD0AC'];
const ART_WALL = ['#7B542F', '#5E3F22', '#8A5A35', '#6B4426'];
function artSVG(c) {
  const h = [...String(c.id)].reduce((n, ch) => n * 31 + ch.codePointAt(0) >>> 0, 7);
  const bg = ART_BG[h % ART_BG.length], wall = ART_WALL[(h >>> 3) % ART_WALL.length], two = h % 2;
  return `<svg class="hm-art" viewBox="0 0 200 190" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="200" height="190" fill="${bg}"/><rect y="128" width="200" height="62" fill="${wall}" opacity=".22"/>
    <path d="M40 128V70a30 30 0 0 1 60 0v58z" fill="#FFF6E6" stroke="${wall}" stroke-width="4"/><path d="M70 40v88M40 92h60" stroke="${wall}" stroke-width="3"/>
    ${two ? `<path d="M118 128V70a30 30 0 0 1 60 0v58z" fill="#FFF6E6" stroke="${wall}" stroke-width="4"/><path d="M148 40v88M118 92h60" stroke="${wall}" stroke-width="3"/>` : ''}
    <line x1="150" y1="0" x2="150" y2="34" stroke="${wall}" stroke-width="2"/><path d="M136 46a14 12 0 0 1 28 0z" fill="#FF9D00"/><path d="M150 46l-22 82h44z" fill="#FFD58A" opacity=".35"/>
    <ellipse cx="60" cy="150" rx="34" ry="6" fill="${wall}"/><rect x="57" y="150" width="6" height="26" fill="${wall}"/><path d="M48 140h16l-1 10H49z" fill="#fff" stroke="#3E2A17" stroke-width="2"/>
    <path d="M160 176v-24" stroke="#5E8A4A" stroke-width="3"/><path d="M160 158q-14-10-16-24q12 6 16 20q4-16 16-22q-4 16-16 26" fill="#7FA25A"/><path d="M148 162h24l-4 16h-16z" fill="#B6771D"/></svg>`;
}
const PURPOSE_LABEL = { 'Сурах': 'Хичээл хийх', 'Ажиллах': 'Ажил хийх', 'Найзуудтай': 'Найзуудтайгаа уулзах', 'Найзууд': 'Найзуудтайгаа уулзах', 'Тухтай': 'Тухтай суух' };

export function homeHTML({ footer }) {
  return `<div class="hm">
  <div class="hm-wrap">
    <div class="hm-featured" data-hm-featured hidden></div>
    <div class="hm-pills" data-hm-pills aria-live="polite"></div>
    <div class="hm-catbar">
      <div class="hm-cats" role="group" aria-label="Ангилал" data-hm-cats></div>
      <div class="hm-filters">
        <button type="button" class="hm-fbtn" role="switch" data-hm-open aria-checked="false">Одоо нээлттэй <i class="hm-toggle" aria-hidden="true"></i></button>
        <button type="button" class="hm-fbtn" data-hm-filter aria-haspopup="dialog">${ICON.sliders}Шүүлтүүр<span class="hm-fcount" data-hm-fcount></span></button>
      </div>
    </div>
    <section class="hm-split" aria-label="Кафены жагсаалт ба газрын зураг">
      <div class="hm-sheet" id="hmResults" tabindex="-1">
        <div class="hm-grab" aria-hidden="true"></div>
        <div class="hm-listhead"><h2 data-hm-count></h2>
          <label class="hm-sort"><span class="sr-only">Эрэмбэлэх</span><select data-hm-sort aria-label="Эрэмбэлэх"></select></label></div>
        <div class="hm-grid" data-hm-list></div>
      </div>
      <div class="hm-mapbox">
        <div class="hm-map" data-hm-map></div>
        <span class="hm-mtag" data-hm-mtag></span>
        <div class="hm-legend" aria-label="Тэмдгийн тайлбар"><span><i data-level="free"></i>Сул</span><span><i data-level="mid"></i>Дунд</span><span><i data-level="full"></i>Дүүрэн</span><span><i data-level="none"></i>Хэмжилтгүй</span></div>
      </div>
    </section>
    <section class="hm-owner"><div><h2>Кафе эзэмшигч үү?</h2><p>Кафегаа газрын зураг дээр нэмж, шинэ үйлчлүүлэгч татаарай.</p></div><a class="hm-cta" href="#partner">Хамтран ажиллах →</a></section>
  </div>${footer()}</div>`;
}

function searchHTML(cafes) {
  const districts = [...new Set(cafes.map(c => c.district).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'mn'));
  const purposes = [...new Set(cafes.flatMap(c => c.tags || []))].sort((a, b) => a.localeCompare(b, 'mn'));
  const chosen = [...F.purpose][0] || '';
  return `<form class="hm-search" id="hs" role="search" aria-label="Кафе хайх">
    <div class="hm-seg hm-where"><label for="hq"><b>Хаана</b></label>
      <input id="hq" name="q" type="search" list="hmDistricts" maxlength="120" autocomplete="off" placeholder="Ойролцоо · дүүрэг, кафе" value="${esc(F.q)}">
      <datalist id="hmDistricts">${districts.map(d => `<option value="${esc(d)}"></option>`).join('')}</datalist>
      <button type="button" class="hm-locate" data-hm-locate aria-label="Миний байршлаар ойролцоох кафе" title="Ойролцоо">${ICON.locate}</button></div>
    <div class="hm-seg hm-why"><label for="hmWhy"><b>Юунд</b></label>
      <select id="hmWhy"><option value="">Хичээл, ажил, уулзалт…</option>${purposes.map(p => `<option value="${esc(p)}"${p === chosen ? ' selected' : ''}>${esc(PURPOSE_LABEL[p] || p)}</option>`).join('')}</select></div>
    <div class="hm-seg hm-when"><b>Хэзээ</b><span>Яг одоо</span></div>
    <button type="submit" class="hm-sbtn" aria-label="Хайх">${I.search}</button>
  </form>`;
}

const TABS = [['search', I.search, 'Хайх', '#home'], ['saved', I.heart, 'Хадгалсан', '#home'], ['map', I.map, 'Газрын зураг', '#explore'], ['profile', I.user, 'Профайл', '#account']];

export function bindHome(root, { cafes, matches, onFilters, activeCount }) {
  const ac = new AbortController(), { signal } = ac;
  const on = (el, type, fn, opts = {}) => el?.addEventListener(type, fn, { ...opts, signal });
  const el = sel => $(sel, root);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const state = { cat: 'all', sort: 'seats', here: null, hover: null, sel: null };
  const ratings = new Map(), ratingReq = new Map();
  const timers = [];
  let ctxCache = new Map(), mapCtl = null, featured = null, destroyed = false;

  /* ---------- context ---------- */
  const staleAfterSec = () => platform.config.sensor_stale_after_sec ?? 30;
  function ctxOf(c) {
    let x = ctxCache.get(c.id);
    if (!x) {
      const km = state.here && !isDemoCafe(c) ? distanceKm(state.here, cafeLngLat(c)) : null;
      x = { live: liveInfo(c, { staleAfterSec: staleAfterSec() }), km };
      ctxCache.set(c.id, x);
    }
    return x;
  }
  const ratingOf = c => ratings.get(c.id) ?? null;
  const fresh = () => { ctxCache = new Map(); };

  /* ---------- header + tab bar (only while home is shown) ---------- */
  document.body.classList.add('ls-home');
  const logo = $('.hd-in .logo'), hdR = $('.hd-r');
  logo?.insertAdjacentHTML('afterend', searchHTML(cafes));
  hdR?.insertAdjacentHTML('afterbegin', '<a class="hm-add" href="#partner" data-hm-add>Кафегаа нэмэх</a>');
  const tabbar = $('#tabbar'), savedTabs = tabbar?.innerHTML;
  if (tabbar) tabbar.innerHTML = TABS.map(([k, ic, l, href]) => `<a href="${href}" data-hm-tab="${k}"${k === 'search' ? ' class="on" aria-current="page"' : ''}>${ic}<span>${l}</span></a>`).join('');
  const form = $('#hs'), q = $('#hq'), why = $('#hmWhy');

  on(form, 'submit', e => {
    e.preventDefault();
    F.q = q.value.trim();
    F.purpose = new Set(why.value ? [why.value] : []);
    render();
    const target = $('#hmResults');
    target?.scrollIntoView({ behavior: Prefs.reduced || motion.matches ? 'auto' : 'smooth', block: 'start' });
    target?.focus({ preventScroll: true });
  });
  on(q, 'search', () => { if (!q.value) { F.q = ''; render(); } });
  on($('[data-hm-locate]'), 'click', locate);
  on(tabbar, 'click', e => {
    const tab = e.target.closest('[data-hm-tab]'); if (!tab) return;
    const key = tab.dataset.hmTab;
    if (key === 'search') { e.preventDefault(); window.scrollTo({ top: 0, behavior: Prefs.reduced ? 'auto' : 'smooth' }); q?.focus({ preventScroll: true }); }
    if (key === 'saved') { e.preventDefault(); e.stopPropagation(); $('#favBtn')?.click(); }
    if (key === 'profile' && platform.online && !$('#accBtn')?.hidden) { e.preventDefault(); e.stopPropagation(); $('#accBtn').click(); }
  });

  /* ---------- location (only after the visitor asks; never sent anywhere) ---------- */
  function locate() {
    if (!navigator.geolocation || !window.isSecureContext) { toast('Байршил тодорхойлоход HTTPS холболт ба хөтчийн зөвшөөрөл хэрэгтэй.'); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      if (destroyed) return;
      const ll = [pos.coords.longitude, pos.coords.latitude], [[w, s], [e, n]] = MAP_CONFIG.cityBounds;
      if (ll[0] < w || ll[0] > e || ll[1] < s || ll[1] > n) { toast('Та Улаанбаатар хотоос гадна байна.'); return; }
      state.here = ll; state.sort = 'near'; fresh(); render();
    }, err => toast(err.code === 1 ? 'Байршил ашиглах зөвшөөрөл олгогдоогүй байна.' : 'Байршлыг тодорхойлж чадсангүй.'), { timeout: 10000, maximumAge: 60000 });
  }

  /* ---------- ratings (real reviews only; demo cafés have none) ---------- */
  function loadRatings(list) {
    if (!platform.online) return;
    list.filter(c => !isDemoCafe(c) && !ratingReq.has(c.id)).slice(0, 12).forEach(c => {
      ratingReq.set(c.id, platform.api.get(`/cafes/${encodeURIComponent(c.id)}/ratings`, { signal, timeout: 4500, retry: 0 })
        .then(data => { const v = ratingText(data, c.id); if (v && !destroyed) { ratings.set(c.id, +v); scheduleRender(); } })
        .catch(() => { }));
    });
  }

  /* ---------- rendering ---------- */
  const base = () => cafes.filter(matches);
  const visible = list => { const cat = categoryByKey(state.cat); return list.filter(c => cat.test(c, ctxOf(c))); };

  function cardHTML(c) {
    const { live: x, km } = ctxOf(c), photo = photosOf(c)[0], rating = ratingOf(c);
    const meta = [c.district, distanceText(km)].filter(Boolean).map(esc).join(' · ');
    const cls = ['hm-card', state.sel === c.id ? 'sel' : '', state.hover === c.id ? 'hov' : ''].filter(Boolean).join(' ');
    return `<article class="${cls}" data-key="${esc(c.id)}" data-hm-card="${esc(c.id)}" data-href="${cafeLink(c)}">
      <div class="hm-ph">${photo ? `<img src="${esc(photo.small)}" alt="${esc(photo.alt)}" loading="lazy" decoding="async" width="640" height="480">`
        : artSVG(c)}
        ${badgeHTML(x)}
        <button type="button" class="heart hm-heart" data-fav="${esc(c.id)}" aria-pressed="${favs.has(c.id)}" aria-label="${esc(c.name)} хадгалах">${I.heart}</button>
        ${occHTML(x)}</div>
      <h3><a href="${cafeLink(c)}">${esc(c.name)}</a>${rating != null ? `<span class="hm-rate" aria-label="Үнэлгээ 5-аас ${rating.toFixed(1)}">★ ${rating.toFixed(1)}</span>` : ''}</h3>
      ${meta ? `<div class="hm-meta">${meta}</div>` : ''}
      ${tagsHTML(featureTags(c))}
    </article>`;
  }

  function pinHTML(c) {
    const x = ctxOf(c).live, level = x.has ? x.level : 'none';
    const label = `${c.name}: ${x.has ? `${x.occupied}% дүүрсэн${x.demo ? ' (жишээ)' : ''}` : x.note}`;
    return `<button class="mk hm-pin${c.open ? '' : ' closed'}" data-level="${level}" data-mk="${esc(c.id)}" style="left:${c.x}px;top:${c.y}px" aria-label="${esc(label)}">
      <span class="hm-pin-b">${x.has ? `${x.occupied}%` : ICON.all}</span><span class="hm-pin-n">${esc(c.name)}</span></button>`;
  }

  function renderPills(list) {
    const s = liveSummary(list, ctxOf), pills = [];
    if (s.open != null) pills.push(`<span class="hm-pill"><i class="hm-dot" data-level="free"></i>Яг одоо <b class="num">${s.open}</b> кафе нээлттэй</span>`);
    if (s.free != null) pills.push(`<span class="hm-pill">${ICON.seats}<b class="num">${s.free}</b> кафед сул суудал</span>`);
    if (s.quiet != null) pills.push(`<span class="hm-pill">${ICON.quiet}<b class="num">${s.quiet}</b> нь нам гүм</span>`);
    if (pills.length && s.demo) pills.push('<span class="badge b-demo" title="Демо кафены жишээ өгөгдөл орсон">ДЕМО</span>');
    const box = el('[data-hm-pills]'), markup = pills.join('');
    if (box.dataset.html !== markup) { box.dataset.html = markup; box.innerHTML = markup; }
    box.hidden = !pills.length;
  }

  function renderCats(list) {
    const counts = categoryCounts(list, ctxOf);
    if (state.cat !== 'all' && !counts[state.cat]) state.cat = 'all';
    patch(el('[data-hm-cats]'), CATEGORIES.filter(c => c.key === 'all' || counts[c.key])
      .map(c => `<button type="button" class="hm-cat" data-key="${c.key}" data-hm-cat="${c.key}" aria-pressed="${state.cat === c.key}">${ICON[c.key]}<span>${c.label}</span><small class="num">${counts[c.key]}</small></button>`).join(''));
  }

  function renderSort() {
    const options = [['seats', 'Сул суудал'], ...(state.here ? [['near', 'Ойрхон']] : []), ...(ratings.size ? [['rating', 'Үнэлгээ']] : [])];
    if (!options.some(([k]) => k === state.sort)) state.sort = 'seats';
    patch(el('[data-hm-sort]'), options.map(([k, l]) => `<option value="${k}"${k === state.sort ? ' selected' : ''}>Эрэмбэ: ${l}</option>`).join(''));
    el('[data-hm-sort]').value = state.sort;
  }

  function render() {
    if (destroyed) return;
    fresh();
    const all = base(), list = sortCafes(visible(all), state.sort, ctxOf, ratingOf);
    renderPills(cafes);
    renderCats(all);
    renderSort();
    const n = list.length;
    el('[data-hm-count]').textContent = `${state.here ? 'Ойролцоох ' : ''}${n} кафе`;
    const failed = platform.catalogueStatus === 'error' && !cafes.length;
    patch(el('[data-hm-list]'), n ? list.map(cardHTML).join('') : failed
      ? `<div class="hm-empty" data-key="error" role="alert"><b>Кафены мэдээллийг ачаалж чадсангүй</b><p>Холболтоо шалгаад дахин оролдоно уу.</p><button type="button" class="btn btn-o" data-hm-retry>Дахин оролдох</button></div>`
      : `<div class="hm-empty" data-key="empty"><b>Тохирох кафе олдсонгүй</b><p>Шүүлтүүрээ сулруулаад дахин үзээрэй.</p><button type="button" class="btn btn-o" data-hm-reset>Шүүлтүүр цэвэрлэх</button></div>`);
    const openBtn = el('[data-hm-open]'); openBtn.setAttribute('aria-checked', String(!!F.openOnly));
    el('[data-hm-fcount]').textContent = activeCount() || '';
    const demoShown = list.some(isDemoCafe);
    el('[data-hm-mtag]').innerHTML = `${I.map}<span>${esc(F.district || 'Улаанбаатар')}</span>${demoShown ? '<span class="badge b-demo">ДЕМО</span>' : ''}`;
    if (mapCtl) { mapCtl.dim(new Set(list.map(c => c.id))); }
    featured?.refresh();
    loadRatings(list);
  }
  let pending = 0;
  const scheduleRender = () => { if (!pending) pending = setTimeout(() => { pending = 0; render(); }, 50); };

  /* ---------- list ⇄ map ---------- */
  function setHover(id) {
    if (state.hover === id) return;
    if (state.hover) { mapCtl?.hover(state.hover, false); $(`[data-hm-card="${CSS.escape(state.hover)}"]`, root)?.classList.remove('hov'); }
    state.hover = id;
    if (id) { mapCtl?.hover(id, true); $(`[data-hm-card="${CSS.escape(id)}"]`, root)?.classList.add('hov'); }
  }
  function select(id) {
    state.sel = id; mapCtl?.select(id);
    $$('[data-hm-card]', root).forEach(card => card.classList.toggle('sel', card.dataset.hmCard === id));
    if (id) {
      const card = $(`[data-hm-card="${CSS.escape(id)}"]`, root);
      card?.scrollIntoView({ behavior: Prefs.reduced || motion.matches ? 'auto' : 'smooth', block: 'nearest' });
    }
  }
  const list = el('[data-hm-list]');
  on(list, 'pointerover', e => setHover(e.target.closest('[data-hm-card]')?.dataset.hmCard || null));
  on(list, 'pointerleave', () => setHover(null));
  on(list, 'focusin', e => setHover(e.target.closest('[data-hm-card]')?.dataset.hmCard || null));
  on(list, 'focusout', e => { if (!list.contains(e.relatedTarget)) setHover(null); });
  const mapEl = el('[data-hm-map]');
  on(mapEl, 'pointerover', e => { const m = e.target.closest('.mk'); $$('[data-hm-card].hov', root).forEach(c => c.classList.toggle('hov', c.dataset.hmCard === m?.dataset.mk)); });
  on(mapEl, 'pointerleave', () => $$('[data-hm-card].hov', root).forEach(c => { if (c.dataset.hmCard !== state.hover) c.classList.remove('hov'); }));

  /* ---------- controls ---------- */
  on(root, 'click', e => {
    const cat = e.target.closest('[data-hm-cat]');
    if (cat) { state.cat = cat.dataset.hmCat; render(); return; }
    if (e.target.closest('[data-hm-open]')) { F.openOnly = !F.openOnly; render(); return; }
    const filter = e.target.closest('[data-hm-filter]');
    if (filter) { onFilters(filter); return; }
    const retry = e.target.closest('[data-hm-retry]');
    if (retry) {
      if (!platform.online) { location.reload(); return; }
      retry.disabled = true;
      loadCatalogue({ signal }).catch(() => { }).finally(() => { if (!destroyed) rebuild(); });
      return;
    }
    if (e.target.closest('[data-hm-reset]')) {
      F.q = ''; F.district = ''; F.purpose = new Set(); F.sound = 0; F.wifi = 'any'; F.seats = 'any'; F.openOnly = false; state.cat = 'all';
      if (q) q.value = ''; if (why) why.value = '';
      render();
    }
  });
  on(el('[data-hm-sort]'), 'change', e => { state.sort = e.target.value; render(); });

  /* ---------- featured slideshow ---------- */
  featured = bindFeatured(el('[data-hm-featured]'), { cafes, ctxOf, ratingOf, motion });

  /* ---------- map (the existing real map, with this page's own pins) ---------- */
  mapCtl = buildMap(mapEl, { interactive: true, markerHTML: pinHTML, onSelect: id => select(id) });

  /* ---------- live data: the existing channel only ---------- */
  const unsub = [
    platform.bus.on('cafe:updated', id => { fresh(); render(); mapCtl?.refresh(id); }),
    platform.bus.on('catalog:changed', () => { destroyed || rebuild(); })
  ];
  // A full catalogue change can add or remove cafés: rebuild the pins too.
  function rebuild() {
    mapCtl?.destroy(); mapEl.innerHTML = '';
    mapCtl = buildMap(mapEl, { interactive: true, markerHTML: pinHTML, onSelect: id => select(id) });
    render(); if (state.sel) mapCtl.select(state.sel);
  }
  // «N мин өмнө» шинэчлэгдэнэ (хуудас нуугдсан үед алгасна).
  timers.push(setInterval(() => { if (!document.hidden) render(); }, 30000));

  render();

  return {
    refresh: render,
    destroy() {
      destroyed = true; ac.abort(); timers.forEach(clearInterval); clearTimeout(pending);
      unsub.forEach(off => off()); featured?.destroy(); mapCtl?.destroy(); mapCtl = null;
      form?.remove(); $('[data-hm-add]')?.remove();
      if (tabbar && savedTabs != null) tabbar.innerHTML = savedTabs;
      document.body.classList.remove('ls-home');
    }
  };
}
