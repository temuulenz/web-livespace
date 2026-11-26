import { $, $$, clamp, isMobile } from './js/dom.js';
import { store } from './js/storage.js';
import { Prefs, F, favs } from './js/state.js';
import { bindPlanSheet } from './js/features/cafe/plan-sheet.js';
import { I, pinSVG, cardPin } from './js/icons.js';
import { Snd } from './js/audio.js';
import { SS, WIFI, WIFI_S, TOTAL_SEATS, getCafes, byId } from './js/cafes.js';
import { freePct, crowdCat, tone, mood, nowHour, profile } from './js/cafe-metrics.js';
import { ssGlyph, ssArt, wifiSVG, seatRow, mSeat, mSound, mWifi, tagPills } from './js/components/atmosphere.js';
import { buildMap } from './js/map.js';
import { directionsUrl } from './js/map-gl.js';
import { FloorPlan, ZONES } from './js/simulation/floor-plan.js';
import { pageTasks } from './js/lifecycle.js';
import { animNum } from './js/animations.js';
import { openModal, closeModal, toast } from './js/components/feedback.js';
import { createRouter, configureErrors, mount, escapeHTML } from './framework/index.js';
import { platform, initPlatform } from './js/services/platform.js';
import { dataMode, freshnessHTML, modeBadge, hasMeasurements, measuredSeats } from './js/live/freshness.js';
import { sensorPanelHTML, noiseText } from './js/live/sensor-ui.js';
import { LiveNoise } from './js/features/sensors/live-noise.js';
import { isRealMode } from './js/live/sensor-state.js';
import { openState, seatState, wifiState, noiseState, trustState, walkText } from './js/live/status.js';
import { statusLinesHTML, trustHTML } from './js/live/status-ui.js';
import { SensorHistory } from './js/features/sensors/sensor-history.js';
import { openAuth, watchAuthCancel } from './js/features/authentication/auth-modal.js';
import { renderAccountButton, bindAccountPopover, AccountPage } from './js/features/account/account.js';
// Pages and panels the home page never shows are loaded only when they open (smaller first load).
const lazy = {
  partner: () => import('./js/features/partner/partner-form.js'),
  owner: () => import('./js/features/owner-dashboard/owner-page.js').then(m => m.OwnerPage),
  admin: () => import('./js/features/admin-dashboard/admin-page.js').then(m => m.AdminPage),
  publicMenu: () => import('./js/features/menu/public-menu.js').then(m => m.PublicMenu),
  menuView: () => import('./js/features/menu/menu-view.js').then(m => m.MenuSection),
  menuEditor: () => import('./js/features/menu/menu-editor.js').then(m => m.MenuEditor),
  incoming: () => import('./js/features/going/incoming-orders.js').then(m => m.IncomingOrders)
};
let navToken = 0;   // a lazily loaded page only renders if the visitor is still on it
const loadFailed = () => `<div class="wrap page"><div class="card gate" role="alert"><h1>Уучлаарай</h1><p class="muted">Энэ хэсгийг ачаалж чадсангүй. Хуудсаа дахин ачаална уу.</p></div></div>`;
import { discoveryHTML, bindDiscovery } from './js/features/home/discovery.js';
import { matchesDiscovery, UB_DISTRICTS, districtKey } from './js/features/home/recommendations.js';
import { drinkPrice, loadMenuSummaries } from './js/features/menu/menu-summary.js';
import { formatMNT } from './js/services/customer-rules.js';

// Customer features (menu, «Очих», pre-orders) mounted into the original pages; released on navigation.
let custViews = [];
const mountCust = (load, el, props) => {
  if (!el) return;
  load().then(Component => { if (el.isConnected && !el.dataset.mounted) { el.dataset.mounted = '1'; custViews.push(mount(Component, el, props)) } }).catch(() => { if (el.isConnected) el.innerHTML = '<p class="muted">Энэ хэсгийг ачаалж чадсангүй.</p>' });
};
const dropCust = () => { custViews.forEach(v => v.destroy()); custViews = [] };

const CAFES = getCafes();
let cmpIds = [];
let sensorHistoryView = null, liveNoiseView = null, detailSheetOff = null;
let selId = null, mapCtl = null, fp = null, homeDiscovery = null, cdCafe = null, pageComp = null;
let navDepth = 0;
// Cafés without live data yet are shown like closed ones, with an honest reason.
const closedText = c => c.status_text || `${c.opens} нээгдэнэ`;
const openTag = c => c.open ? 'Нээлттэй' : c.status_text ? 'Мэдээлэлгүй' : 'Хаалттай';
// Open or closed is shown as a lamp: lit and glowing yellow when open, plain grey when closed.
const openLamp = c => { const label = openTag(c) + (!c.open && c.opens ? ` · ${c.opens} нээгдэнэ` : ''); return `<span class="olamp ${c.open ? 'on' : 'off'}" role="img" aria-label="${label}" title="${label}">${I.lamp}</span>` };

// One status block in the same order everywhere: open (lamp + words) · seats & Wi-Fi · how trustworthy.
const stale = () => platform.config.sensor_stale_after_sec ?? 30;
const statusBlock = c => statusLinesHTML(c, { staleAfterSec: stale() }).replace('<span class="cs-open', () => `<span class="cs-lamp">${openLamp(c)}</span><span class="cs-open`);
const moreLink = c => `<a class="cs-more" href="#cafe-${encodeURIComponent(c.id)}" aria-label="${escapeHTML(c.name)} дэлгэрэнгүй">Дэлгэрэнгүй →</a>`;
// Walk time comes from the sample «Та энд» point, never the visitor's real location: say so.
const walkMeta = c => c.walk != null ? `<span title="${walkText(c)}">~${c.walk} мин алхана · жишээ</span>` : '';
const emptyHTML = (style = '') => `<div class="empty"${style}>${emptyArt()}<b>Тохирох кафе олдсонгүй</b>Шүүлтүүрээ сулруулаад дахин үзээрэй.<div class="empty-acts">${F.openOnly ? '<button class="btn btn-o" data-open-off>Нээлттэй гэсэн шүүлтүүрийг арилгах</button>' : ''}<button class="btn btn-o" data-reset>Бүх шүүлтүүрийг цэвэрлэх</button></div></div>`;

/* ================= filters ================= */
const PURPOSES = [['Сурах', I.book], ['Ажиллах', I.laptop], ['Найзуудтай', I.people], ['Тухтай', I.sofa]];
function matches(c) { return matchesWithQuery(c, F.q) && (!F.only || F.only.ids.has(c.id)) }
function matchesWithQuery(c, query) {
  if (!matchesDiscovery(c, query, F.district) || (F.openOnly && !c.open)) return false;
  if (F.purpose.size && ![...F.purpose].every(p => c.tags.includes(p))) return false;
  if (F.sound && c.sound !== F.sound) return false;
  if (F.wifi !== 'any' && !(c.open && c.wifi >= (F.wifi === 'good' ? 3 : 4))) return false;
  if (F.seats !== 'any' && !(c.open && freePct(c) != null && freePct(c) >= +F.seats)) return false; return true
}
const activeCount = () => Number(Boolean(F.only)) + Number(Boolean(F.district)) + F.purpose.size + (F.sound ? 1 : 0) + (F.wifi !== 'any') + (F.seats !== 'any') + (F.openOnly ? 1 : 0);
const soundFilterLabel = () => F.sound ? `${F.sound}/5 · ${SS[F.sound].short}` : 'Бүх түвшин';
const soundFilterHint = () => F.sound ? `${SS[F.sound].t} — ${SS[F.sound].s.toLowerCase()}` : 'Бүх түвшний кафег харуулна. Гулсуулагчаар сонгоорой.';
function districtOptions() {
  // All nine UB districts, plus any other district a café is registered in.
  const known = new Set(UB_DISTRICTS.map(districtKey));
  const extra = [...new Set(CAFES.map(c => c.district).filter(d => d && !known.has(districtKey(d))))].sort((a, b) => a.localeCompare(b, 'mn'));
  const chosen = districtKey(F.district);
  return '<option value="">Бүх дүүрэг</option>' + [...UB_DISTRICTS, ...extra].map(d => `<option value="${escapeHTML(d)}"${F.district && districtKey(d) === chosen ? ' selected' : ''}>${escapeHTML(d)}</option>`).join('');
}
function filtersHTML(full, geographic = false) {
  const pc = PURPOSES.map(([p, ic]) => `<button class="chip" data-f="purpose" data-v="${p}" aria-pressed="${F.purpose.has(p)}">${ic}${p}</button>`).join('');
  const sc = `<div class="sound-filter" data-sound-filter>
   <output class="sound-value" data-sound-value>${soundFilterLabel()}</output>
   <small class="sound-hint" data-sound-hint>${soundFilterHint()}</small>
   <input class="sound-range" type="range" min="0" max="5" step="1" value="${F.sound}" style="--sound-progress:${F.sound * 20}%" data-sound-range aria-label="Дуу чимээний түвшин" aria-valuetext="${soundFilterLabel()}">
   <div class="sound-ticks" aria-hidden="true">${[0, 1, 2, 3, 4, 5].map(l => `<span class="${l === F.sound ? 'on' : ''}" title="${l ? SS[l].short : 'Бүгд'}">${l || 'Бүгд'}</span>`).join('')}</div>
  </div>`;
  const opt = (k, v, l) => `<button class="chip" data-f="${k}" data-v="${v}" aria-pressed="${F[k] === v}">${l}</button>`;
  const extra = `<div class="fgrp"><span>${wifiSVG(3, 14)} Wi-Fi</span><div class="chips">${opt('wifi', 'any', 'Бүгд')}${opt('wifi', 'good', 'Сайн ба түүнээс дээш')}${opt('wifi', 'great', 'Маш сайн')}</div></div>
 <div class="fgrp"><span>${I.seat} Сул суудал</span><div class="chips">${opt('seats', 'any', 'Бүгд')}${opt('seats', '30', '30%+ сул')}${opt('seats', '50', '50%+ сул')}</div></div>
 <div class="tgl-row" style="border:0;padding:0"><div><b>Зөвхөн нээлттэй</b><small>Хаалттай кафег нуух</small></div><button class="sw" role="switch" data-f="openOnly" aria-checked="${F.openOnly}" aria-label="Зөвхөн нээлттэй"></button></div>`;
  const districts = geographic && districtOptions();
  return `${districts ? `<label class="fgrp cf-district"><span>${I.pin} Дүүрэг</span><select data-search-district>${districts}</select></label>` : ''}
 <div class="fgrp"><span>${I.target} Зорилго</span><div class="chips">${pc}</div></div>
 <div class="fgrp"><span>${ssGlyph(2)} Дуу чимээ</span>${sc}</div>
 ${full ? extra : `<button class="more" data-more aria-expanded="${F.more}">Нарийвчлах (Wi-Fi, суудал) ${I.chev}</button><div class="morebox${F.more ? ' open' : ''}"><div>${extra}</div></div>`}`
}
function syncFilterUI() {
  $$('[data-search-district]').forEach(select => { select.value = F.district });
  $$('[data-f]').forEach(b => { const k = b.dataset.f, v = b.dataset.v; if (k === 'purpose') b.setAttribute('aria-pressed', F.purpose.has(v)); else if (k === 'openOnly') b.setAttribute('aria-checked', F.openOnly); else b.setAttribute('aria-pressed', F[k] === v) });
  $$('[data-sound-filter]').forEach(group => {
    const range = $('[data-sound-range]', group);
    range.value = F.sound;
    range.style.setProperty('--sound-progress', `${F.sound * 20}%`);
    range.setAttribute('aria-valuetext', soundFilterLabel());
    $('[data-sound-value]', group).textContent = soundFilterLabel();
    $('[data-sound-hint]', group).textContent = soundFilterHint();
    $$('.sound-ticks span', group).forEach((tick, l) => tick.classList.toggle('on', l === F.sound));
  })
}

document.addEventListener('change', e => {
  if (!e.target.matches('[data-search-district]')) return;
  F.district = e.target.value;
  syncFilterUI();
  refreshResults();
});
document.addEventListener('input', e => {
  if (!e.target.matches('[data-sound-range]')) return;
  F.sound = +e.target.value;
  syncFilterUI(); refreshResults()
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-f]'); if (b) {
    const k = b.dataset.f, v = b.dataset.v; Snd.ui('click');
    if (k === 'purpose') { F.purpose.has(v) ? F.purpose.delete(v) : F.purpose.add(v) } else if (k === 'openOnly') F.openOnly = !F.openOnly; else F[k] = v;
    syncFilterUI(); refreshResults(); return
  }
  const m = e.target.closest('[data-more]'); if (m) { F.more = !F.more; m.setAttribute('aria-expanded', F.more); m.nextElementSibling.classList.toggle('open', F.more); Snd.ui('whoosh') }
  const rm = e.target.closest('[data-rm]'); if (rm) { const [k, v] = rm.dataset.rm.split(':'); Snd.ui('click'); if (k === 'purpose') F.purpose.delete(v); else if (k === 'only') F.only = null; else if (k === 'sound') F.sound = 0; else if (k === 'openOnly') F.openOnly = false; else if (k === 'district') F.district = ''; else F[k] = 'any'; syncFilterUI(); refreshResults() }
  if (e.target.closest('[data-open-off]')) { F.openOnly = false; Snd.ui('click'); syncFilterUI(); refreshResults() }
  if (e.target.closest('[data-reset]')) { F.only = null; F.purpose.clear(); F.sound = 0; F.wifi = 'any'; F.seats = 'any'; F.openOnly = false; F.district = ''; F.q = ''; $$('#q,#q2,#hq').forEach(i => i.value = ''); Snd.ui('whoosh'); syncFilterUI(); refreshResults() }
});
function activeHTML(n) {
  const a = []; if (F.only) a.push(['only:', escapeHTML(F.only.label)]); if (F.district) a.push(['district:', escapeHTML(F.district)]); F.purpose.forEach(p => a.push([`purpose:${p}`, p])); if (F.sound) a.push(['sound:', SS[F.sound].short]); if (F.wifi !== 'any') a.push(['wifi:', F.wifi === 'good' ? 'Wi-Fi сайн+' : 'Wi-Fi маш сайн']); if (F.seats !== 'any') a.push(['seats:', F.seats + '%+ сул']); if (F.openOnly) a.push(['openOnly:', 'Нээлттэй']);
  return `<span><b class="num">${n}</b> кафе</span>` + a.map(([k, l]) => `<span class="ac">${l}<button data-rm="${k}" aria-label="${l} шүүлтүүрийг арилгах">${I.x}</button></span>`).join('') + (a.length ? '<button class="rst" data-reset>Цэвэрлэх</button>' : '')
}
function whyLine(c) { if (!c.open) return c.status_text || `Хаалттай · ${c.opens} нээгдэнэ`; const p = []; if (c.sound && (F.sound === c.sound || c.sound <= 2)) p.push(SS[c.sound].short.toLowerCase() + ' орчин'); if (F.wifi !== 'any' || c.wifi >= 4) p.push('Wi-Fi ' + WIFI[c.wifi].toLowerCase()); if (freePct(c) != null && (F.seats !== 'any' || freePct(c) >= 60)) p.push(freePct(c) + '% сул'); if (F.purpose.size) p.unshift([...F.purpose].join(', ').toLowerCase() + 'д тохирно'); return p.length ? `<strong>Яагаад:</strong> ${p.slice(0, 3).join(' · ')}` : c.note }
let refreshResults = () => { };

/* ================= shared bits ================= */
function favBtn(id) { return `<button class="heart" data-fav="${escapeHTML(id)}" aria-pressed="${favs.has(id)}" aria-label="Хадгалах">${I.heart}</button>` }
function cmpBtn(id) { return `<button class="cmpb" data-cmp="${id}" aria-pressed="${cmpIds.includes(id)}" aria-label="Харьцуулахад нэмэх" title="Харьцуулах (жинлэх)">${I.cmp}</button>` }
// With the LiveSpace server, saving needs an account: a guest gets the login window and
// the café is saved right after signing in. Without a server, the original local favourites.
function toggleFav(id, btn) {
  if (!platform.online) { applyFav(id, false); return }
  // Already signed in: the heart toggles. Signed in just now: the café may already be saved there.
  const signedIn = !!platform.session.user;
  platform.session.requireLogin(async () => { await (favSync || pullFavorites()); if (!signedIn && favs.has(id)) refreshFavUI(); else applyFav(id, true) }, 'favorite')
}
function applyFav(id, remote) {
  const c = byId(id); if (favs.has(id)) { favs.delete(id); Snd.ui('click'); toast(`${escapeHTML(c.name)} хадгалснаас хасагдлаа`) } else { favs.add(id); Snd.ui('chime'); toast(`${escapeHTML(c.name)} хадгалагдлаа`, true) } if (!remote) store.set('favs', [...favs]);
  if (!favs.has(id)) $$(`#favPop [data-fav-item="${id}"]`).forEach(row => row.remove());
  $$(`[data-fav="${id}"]`).forEach(b => { b.setAttribute('aria-pressed', favs.has(id)); if (favs.has(id)) { b.classList.remove('burst'); void b.offsetWidth; b.classList.add('burst') } }); renderFavCount(true);
  if (remote) {
    const on = favs.has(id);
    (on ? platform.api.put(`/me/favorites/${encodeURIComponent(id)}`) : platform.api.del(`/me/favorites/${encodeURIComponent(id)}`))
      .catch(error => { on ? favs.delete(id) : favs.add(id); refreshFavUI(); Snd.ui('err'); toast(error.isNetwork ? 'Сервертэй холбогдож чадсангүй' : error.message) });
  }
}
function refreshFavUI() { $$('[data-fav]').forEach(b => b.setAttribute('aria-pressed', favs.has(b.dataset.fav))); renderFavCount() }
// Load the signed-in user's favourites; cafés saved on this device before are merged in once.
let favSync = null;
function pullFavorites() {
  favSync = (async () => {
    const user = platform.session.user; favs.clear();
    if (user) {
      const local = store.get('favs', []);
      const { favorites } = local.length ? await platform.api.post('/me/favorites/merge', { cafe_ids: local }) : await platform.api.get('/me/favorites');
      if (local.length) store.set('favs', []);
      favorites.forEach(id => favs.add(id));
    }
    refreshFavUI();
  })().catch(() => refreshFavUI());
  return favSync;
}
function toggleCmp(id) { const c = byId(id); if (cmpIds.includes(id)) cmpIds = cmpIds.filter(x => x !== id); else { if (cmpIds.length >= 3) { Snd.ui('err'); toast('Нэг дор 3 хүртэл кафе харьцуулна'); return } cmpIds.push(id); Snd.ui('pop') } $$(`[data-cmp="${id}"]`).forEach(b => b.setAttribute('aria-pressed', cmpIds.includes(id))); renderTray() }
document.addEventListener('click', e => {
  const f = e.target.closest('[data-fav]'); if (f) { e.stopPropagation(); toggleFav(f.dataset.fav, f); return } const c = e.target.closest('[data-cmp]'); if (c) { e.stopPropagation(); toggleCmp(c.dataset.cmp); return }
  const p = e.target.closest('[data-play]'); if (p) { e.stopPropagation(); playAmb(+p.dataset.play, p) }
}, true);
function playAmb(l, btn) {
  const was = btn.classList.contains('on'); $$('[data-play].on').forEach(b => { b.classList.remove('on'); b.innerHTML = b.dataset.idle || b.innerHTML }); Snd.stopAmb(); if (was) return;
  if (!Snd.ensure()) { toast('Энэ хөтөч дуу тоглуулахыг дэмжихгүй байна'); return } btn.dataset.idle ||= btn.innerHTML; btn.classList.add('on'); btn.innerHTML = I.stop + ' Зогсоох'; Snd.ambience(l, () => { btn.classList.remove('on'); btn.innerHTML = btn.dataset.idle })
}
function renderTray() {
  const t = $('#cmpTray'); if (!cmpIds.length) { t.classList.remove('show'); return }
  t.innerHTML = `<b>Харьцуулах</b><div class="ct">${cmpIds.map(id => `<span class="ci">${byId(id).name}<button data-cmp="${id}" aria-label="Хасах">${I.x}</button></span>`).join('')}</div><button class="btn btn-y" id="cmpGo" ${cmpIds.length < 2 ? 'disabled style="opacity:.5"' : ''}>Харьцуулах (${cmpIds.length})</button>`; t.classList.add('show'); $('#cmpGo').onclick = () => { if (cmpIds.length >= 2) openCompare(); else toast('Дор хаяж 2 кафе сонгоно уу') }
}
function cmpScore(c) {
  if (!c.open) return -1e9; const social = F.purpose.has('Найзуудтай') && !F.purpose.has('Сурах') && !F.purpose.has('Ажиллах');
  return (freePct(c) ?? 0) * .45 + (c.sound ? (social ? c.sound * 6 : (5 - c.sound) * 9) : 0) + c.wifi * (F.purpose.has('Ажиллах') ? 11 : 7) - c.walk * .6
}
function openCompare() {
  Snd.ui('whoosh'); const cs = cmpIds.map(byId), open = cs.filter(c => c.open);
  const M = [
    ['seat', I.seat, 'Сул суудал', c => freePct(c) ?? -Infinity, 'max', c => `${seatRow(c.occ)}<b class="num">${freePct(c) == null ? '—' : freePct(c) + '%'}</b>`, 'хамгийн олон сул суудалтай'],
    ['snd', ssGlyph(2), 'Дуу чимээ', c => c.sound ? -c.sound : -Infinity, 'max', c => `<span class="sg">${ssGlyph(c.sound)}</span><b>${SS[c.sound].short}</b>`, 'хамгийн нам гүм'],
    ['wf', wifiSVG(3, 18), 'Wi-Fi', c => c.wifi, 'max', c => `${wifiSVG(c.wifi, 22)}<b>${WIFI[c.wifi]}</b>${c.mbps ? `<small class="num">${c.mbps} Mbps</small>` : ''}`, 'Wi-Fi хамгийн сайн'],
    ['walk', I.walk, 'Зай', c => -c.walk, 'max', c => `<span class="sg">${I.walk}</span><b class="num">${c.walk} мин</b><small>${c.dist}</small>`, 'хамгийн ойр']
  ];
  const bestOf = f => { const v = open.map(f); return v.length ? Math.max(...v) : null };
  const bests = Object.fromEntries(M.map(([k, , , f]) => [k, bestOf(f)]));
  const rec = open.length ? [...open].sort((a, b) => cmpScore(b) - cmpScore(a))[0] : null;
  const why = rec ? M.filter(([k, , , f]) => open.length > 1 && f(rec) === bests[k]).map(m => m[6]) : [];
  const cell = (c, [k, , , f, , html]) => c.open ? `<td class="${f(c) === bests[k] && open.length > 1 ? 'best' : ''}${rec && c.id === rec.id ? ' rec' : ''}"><div class="cv">${html(c)}</div></td>` : `<td class="muted${rec && c.id === rec.id ? ' rec' : ''}">—</td>`;
  openModal(`<div class="mdl-h"><div><span class="eyebrow">${I.cmp.replace('<svg', '<svg width="14" height="14"')} Харьцуулалт</span><h2>Аль нь яг одоо тохирох вэ?</h2></div><button class="pv-x" data-close aria-label="Хаах">${I.x}</button></div>
 ${rec ? `<a class="cmp-rec" href="#cafe-${rec.id}" data-close><span class="star">${I.star}</span><span><small>Санал болгож байна</small><b>${rec.name}</b><em>${why.length ? why.slice(0, 3).join(' · ') : mood(rec)}</em></span><span class="go">${I.arr}</span></a>` : ''}
 <div style="overflow-x:auto"><table class="cmp-t"><thead><tr><th></th>${cs.map(c => `<td class="${rec && c.id === rec.id ? 'rec' : ''}">${rec && c.id === rec.id ? `<span class="rec-tag">${I.star}Санал</span>` : ''}<b class="cn">${escapeHTML(c.name)}</b><span class="open-st${c.open ? '' : ' closed'}">${I.lamp}${c.open ? 'Нээлттэй' : 'Хаалттай'}</span></td>`).join('')}</tr></thead>
 <tbody>${M.map(m => `<tr><th><span class="mh">${m[1]}${m[2]}</span></th>${cs.map(c => cell(c, m)).join('')}</tr>`).join('')}
 <tr><th></th>${cs.map(c => `<td class="${rec && c.id === rec.id ? 'rec' : ''}"><a class="go-arr" href="#cafe-${encodeURIComponent(c.id)}" data-close aria-label="${c.name} үзэх">${I.arr}</a></td>`).join('')}</tr></tbody></table></div>
 <p class="muted cmp-key"><span class="best-k">${I.star}</span> тухайн үзүүлэлтээр шилдэг · <span class="badge b-demo">ДЕМО</span></p>`, true)
}

/* ================= modal / toast ================= */
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); $('#sndPop').hidden = true; $('#favPop').hidden = true; $('#accPop').hidden = true; if (selId && location.hash.startsWith('#explore')) selectCafe(null) } });

/* ================= header ================= */
function renderHeaderBits() {
  $('#locPill').innerHTML = I.pin + ' Сүхбаатар дүүрэг'; renderSndBtn(); renderFavCount(); renderAccountButton();
  $('#tabbar').innerHTML = [['home', I.home, 'Нүүр'], ['explore', I.map, 'Газрын зураг'], ['cafes', I.grid, 'Кафенууд'], ['about', I.info, 'Тухай'], ['partner', I.hand, 'Хамтрах']].map(([h, ic, l]) => `<a href="#${h}" data-nav="${h}">${ic}<span>${l}</span></a>`).join('')
}
function renderSndBtn() { $('#sndBtn').innerHTML = Prefs.sound ? I.sndOn : I.sndOff; $('#sndBtn').setAttribute('aria-pressed', Prefs.sound) }
function renderFavCount(b) { $('#favBtn').innerHTML = I.heart + (favs.size ? `<span class="cnt${b ? ' bump' : ''}">${favs.size}</span>` : '') }
$('#sndBtn').onclick = e => {
  e.stopPropagation(); const p = $('#sndPop'); $('#favPop').hidden = true; $('#accPop').hidden = true; p.hidden = !p.hidden; if (!p.hidden) {
    p.innerHTML = `<h3>Дуу ба хөдөлгөөн</h3>
 <div class="tgl-row"><div><b>Интерфэйсийн дуу</b><small>Дарах, хадгалах үеийн зөөлөн дуу</small></div><button class="sw" role="switch" id="swSnd" aria-checked="${Prefs.sound}" aria-label="Интерфэйсийн дуу"></button></div>
 <div class="tgl-row"><div><b>Хөдөлгөөн багасгах</b><small>Анимацыг зогсоож, статик дүрслэл харуулна</small></div><button class="sw" role="switch" id="swRm" aria-checked="${Prefs.reduced}" aria-label="Хөдөлгөөн багасгах"></button></div>
 <div class="tgl-row"><div><b>Орчны дуу сонсох</b><small>«Орчны дууны жишээ сонсох» товчоор зөвхөн өөрөө асаана. Автоматаар тоглохгүй.</small></div></div>`;
    $('#swSnd').onclick = () => { Prefs.sound = !Prefs.sound; store.set('sound', Prefs.sound); $('#swSnd').setAttribute('aria-checked', Prefs.sound); renderSndBtn(); if (Prefs.sound) { Snd.ensure(); Snd.ui('chime') } };
    $('#swRm').onclick = () => { Prefs.reduced = !Prefs.reduced; store.set('reduced', Prefs.reduced); $('#swRm').setAttribute('aria-checked', Prefs.reduced); document.documentElement.classList.toggle('rm', Prefs.reduced); if (fp) fp.reduced = Prefs.reduced; Snd.ui('click') }
  }
};
$('#favBtn').onclick = e => { e.stopPropagation(); const p = $('#favPop'); $('#sndPop').hidden = true; $('#accPop').hidden = true; p.hidden = !p.hidden; if (!p.hidden) { p.innerHTML = `<h3>Хадгалсан кафе</h3>` + (platform.online && !platform.session.user ? `<p class="muted" style="margin:0 0 12px">Дуртай кафегаа хадгалж, дараа нь эндээс харахын тулд нэвтэрнэ үү.</p><button class="btn btn-p" data-fav-login>Нэвтрэх</button>` : favs.size ? [...favs].map(id => { const c = byId(id); if (!c) return ''; return `<div class="fav-item" data-fav-item="${id}">${pinSVG(c.open ? '#FF9D00' : '#C9C2B4').replace('<svg', '<svg width="22" height="26"')}<a href="#cafe-${id}">${escapeHTML(c.name)}</a><span class="muted" style="font-size:13px">${c.open ? (freePct(c) == null ? 'Суудал хэмжээгүй' : freePct(c) + '% сул') : openTag(c)}</span><button class="fav-rm" data-fav="${id}" aria-pressed="true" aria-label="${escapeHTML(c.name)} хадгалснаас хасах" title="Хадгалснаас хасах">${I.x}</button></div>` }).join('') : `<p class="muted" style="margin:0">Одоогоор хадгалсан кафе алга. Картын ♡ товчийг дарж хадгална.</p>`) } };
$('#favPop').addEventListener('click', e => { if (e.target.closest('[data-fav-login]')) { $('#favPop').hidden = true; Snd.ui('whoosh'); openAuth({ reason: 'favorite' }) } });
document.addEventListener('click', e => { if (!e.target.closest('#sndPop,#sndBtn')) $('#sndPop').hidden = true; if (!e.target.closest('#favPop,#favBtn')) $('#favPop').hidden = true; if (e.target.closest('#favPop a')) $('#favPop').hidden = true });

/* ================= cafe card (V1 layout, upgraded) ================= */
// Options used by «Ойролцоох кафенууд»: `top` adds a photo (with a distance badge) above the card,
// `meta` replaces the line under the name (real walking time · hours), `lamp` shows the open/closed lamp before the tags.
function cafeCard(c, { top = '', meta = null, lamp = false, classic = false } = {}) {
  const fp_ = freePct(c);
  const tiles = c.open ? `<div class="tile" title="Сул суудал"><div class="ti">${seatRow(c.occ)}</div><b class="num">${fp_ == null ? '—' : fp_ + '%'}</b></div>
  <div class="tile" title="Дуу чимээ · ${SS[c.sound].t}"><div class="ti">${ssGlyph(c.sound)}</div><b>${SS[c.sound].short}</b></div>
  <div class="tile" title="Wi-Fi · ${WIFI_S[c.wifi]}"><div class="ti">${wifiSVG(c.wifi, 26)}</div><b>${WIFI[c.wifi]}</b></div>`
    : `<div class="unav"><b>${closedText(c)}</b></div>`;
  if (classic) return `<article class="ccard${c.open ? '' : ' is-closed'}" data-href="#cafe-${encodeURIComponent(c.id)}">
  <div class="cc-top">${cardPin(!c.open)}<div class="cc-t"><h3>${escapeHTML(c.name)}</h3><div class="meta num">${I.walk.replace('<svg', '<svg width="14" height="14"')}${c.walk != null ? `${c.walk} мин · ` : ''}${escapeHTML(c.hours || '')}</div></div><div class="cc-act">${favBtn(c.id)}${cmpBtn(c.id)}<a class="go-arr" href="#cafe-${encodeURIComponent(c.id)}" aria-label="${escapeHTML(c.name)} дэлгэрэнгүй">${I.arr}</a></div></div>
  <div class="tags">${openLamp(c)}${tagPills(c)}</div>${drinkPrice(c.id) != null ? `<p class="cc-price">${I.cup} Ундааны дундаж үнэ <b class="num">${formatMNT(drinkPrice(c.id))}</b></p>` : ''}
  <div class="tiles">${tiles}</div>${sensorPanelHTML(c, true)}
 </article>`;
  return `<article class="ccard${c.open ? '' : ' is-closed'}${top ? ' has-photo' : ''}" data-href="#cafe-${encodeURIComponent(c.id)}">${top}
  <div class="cc-top">${cardPin(!c.open)}<div class="cc-t"><h3>${escapeHTML(c.name)}</h3><div class="meta num">${I.walk.replace('<svg', '<svg width="14" height="14"')}${meta ?? walkMeta(c)}</div></div><div class="cc-act">${favBtn(c.id)}${cmpBtn(c.id)}<a class="go-arr" href="#cafe-${encodeURIComponent(c.id)}" aria-label="${escapeHTML(c.name)} дэлгэрэнгүй">${I.arr}</a></div></div>
  ${statusBlock(c)}
  <div class="tags">${lamp ? openLamp(c) : ''}${tagPills(c)}</div>${drinkPrice(c.id) != null ? `<p class="cc-price">${I.cup} Ундааны дундаж үнэ <b class="num">${formatMNT(drinkPrice(c.id))}</b></p>` : ''}
  <div class="tiles">${tiles}</div>${sensorPanelHTML(c, true)}
  ${moreLink(c)}
 </article>`}
document.addEventListener('click', e => { const card = e.target.closest('[data-href]'); if (card && !e.target.closest('a,button')) location.hash = card.dataset.href });

/* ================= pages ================= */
const app = $('#app');
function footer() {
  return `<footer><div class="wrap"><div class="ft"><div><a class="logo" href="#home" style="color:#fff"><b>Live</b><img class="logo-cup" src="logo.webp" alt=""><span>Space</span></a><p style="max-width:380px;margin-top:14px">Улаанбаатарын кафенуудын сул суудал, дуу чимээ, Wi-Fi-г очихоосоо өмнө харж, өөрт тохирох газраа сонгоорой.</p></div>
 <div><h4>ЦЭС</h4><a href="#explore">Газрын зураг</a><a href="#cafes">Кафенууд</a><a href="#about">Бидний тухай</a><a href="#partner">Хамтын ажиллагаа</a></div>
 <div><h4>КАФЕ ЭЗЭМШИГЧ</h4><a href="#staff">Ажилтны шууд хяналт</a><a href="#partner">Кафегаа нэмэх</a><span style="display:block;padding:4px 0">Улаанбаатар, Монгол</span></div></div>
 <div class="ft-b"><span>© 2026 LiveSpace</span><span>${CAFES.some(hasMeasurements) ? 'Демо болон бодит хэмжилтийг тус тусад нь тэмдэглэсэн' : 'Прототип · бүх утга демо өгөгдөл'}</span></div></div></footer>`}
const SSBG = ['', '#FBF4E8', '#F8EEDD', '#F4E5CC', '#EFDABA', '#E9CEA6'];
function showAdvancedFilters(trigger, apply) {
  Snd.ui('whoosh');
  openModal(`<div class="mdl-h"><h2 id="advanced-filters-title">Шүүлтүүр</h2><button class="pv-x" data-close aria-label="Хаах" style="margin-left:auto">${I.x}</button></div><div class="dis-filter-fields">${filtersHTML(true, true)}</div><div class="dis-filter-actions"><button class="btn btn-g" data-reset>Цэвэрлэх</button><button class="btn btn-p" ${apply ? '' : 'data-close'} id="mfApply">Үр дүн харах</button></div>`, false, { trigger, label: 'advanced-filters-title' });
  if (apply) $('#mfApply').onclick = apply;
}

function renderHome() {
  app.innerHTML = `<div class="dis-page">
 ${discoveryHTML({ query: F.q, filterCount: activeCount() })}
 <div class="wrap dis-sounds">
  <section class="sec"><div class="sec-h"><h2>Чимээг тоогоор биш, мэдрэмжээр</h2><p>Жишээ дуу — бодит бичлэг биш. Товчоор сонсоорой.</p></div>
   <div class="ss-row">${[1, 2, 3, 4, 5].map(l => `<div class="ss-card"><div class="art" style="background:${SSBG[l]}">${ssArt(l, 120)}</div><div class="lvl" aria-label="${l}/5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= l ? 'on' : ''}"></i>`).join('')}</div><b>${SS[l].t}</b><span>${SS[l].s}</span><button class="play" data-play="${l}">${I.play} Сонсох</button></div>`).join('')}</div>
   <div class="ss-dots" aria-hidden="true">${[1, 2, 3, 4, 5].map((l, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div></section>
 </div>${footer()}</div>`;
  const search = query => {
    F.q = query;
    F.only = null;
    const results = CAFES.filter(matches);
    if (query && results.length === 1) selId = results[0].id;
    else if (selId && !results.some(c => c.id === selId)) selId = null;
    Snd.ui('whoosh');
    location.hash = 'explore';
  };
  homeDiscovery = bindDiscovery($('.discovery'), {
    cafes: CAFES,
    matches: cafe => matchesWithQuery(cafe, ''),
    onSearch: search,
    onMap: () => search($('#hq').value.trim()),
    cardHTML: cafeCard,
    onFilters: button => showAdvancedFilters(button, () => { closeModal(); search($('#hq').value.trim()) }),
    // Category chips open the map: «Ажиллах» uses the map's own purpose filter; the other
    // categories show exactly the cafés recommended for them, as a removable filter chip.
    onCategory(category, ids) {
      F.purpose.clear(); F.sound = 0; F.wifi = 'any'; F.seats = 'any'; F.openOnly = false; F.district = ''; F.q = ''; F.only = null;
      if (category.key === 'work') F.purpose.add('Ажиллах');
      else if (ids) F.only = { label: category.label, ids: new Set(ids) };
      selId = null;
      Snd.ui('whoosh');
      location.hash = 'explore';
    },
    updateFilterUI(root) {
      $$('.dis-filter-count', root).forEach(count => { count.textContent = activeCount() || '' });
      const apply = $('#mfApply');
      if (apply) apply.textContent = `${CAFES.filter(c => matchesWithQuery(c, $('#hq').value.trim())).length} кафе харах`;
    }
  });
  refreshResults = homeDiscovery.refresh;
  // Phones scroll the five noise cards sideways; the dots under them show which one is in view.
  const ssRow = $('.ss-row'); let ssFrame;
  ssRow.addEventListener('scroll', () => { if (ssFrame === undefined) ssFrame = pageTasks.frame(() => { ssFrame = undefined; const cards = $$('.ss-card', ssRow), x = ssRow.scrollLeft + 16; let k = 0; cards.forEach((c, i) => { if (Math.abs(c.offsetLeft - x) < Math.abs(cards[k].offsetLeft - x)) k = i }); if (ssRow.scrollLeft + ssRow.clientWidth >= ssRow.scrollWidth - 4) k = cards.length - 1; $$('.ss-dots i').forEach((d, i) => d.classList.toggle('on', i === k)) }) }, { passive: true });
}

/* ---------- explore ---------- */
function listCard(c, i) {
  const fp_ = freePct(c); return `<button class="lcard${c.id === selId ? ' sel' : ''}" data-card="${escapeHTML(c.id)}" style="animation-delay:${Math.min(i, 8) * 35}ms" aria-label="${escapeHTML(c.name)}">
 <div class="lc-h">${pinSVG(c.open ? '#FF9D00' : '#C9C2B4').replace('<svg', '<svg width="22" height="27"')}<b>${escapeHTML(c.name)}</b><span class="muted num" title="Жишээ байршлаас">${c.dist}</span></div>
 ${statusBlock(c)}
 ${c.open ? `<div class="mrow3">${mSeat(c)}${mSound(c.sound)}${mWifi(c.wifi)}</div>` : ''}
 ${sensorPanelHTML(c, true)}<div class="lc-why">${whyLine(c)}</div><span class="cs-more" aria-hidden="true">Дэлгэрэнгүй →</span></button>`
}
function renderExplore() {
  app.innerHTML = `<section class="ex page" id="ex">
  <aside class="ex-side" id="exSide" aria-label="Кафены жагсаалт">
   <div class="sh-handle" id="shHandle" role="button" tabindex="0" aria-label="Жагсаалтыг томруулах"><span></span></div>
   <div class="ex-top"><h1 class="ex-h">Яг одоо ямар газар хэрэгтэй вэ?</h1>
    <div class="mrow"><label class="srch">${I.search}<input id="q2" placeholder="Кафе хайх" aria-label="Кафе хайх" value=""></label><button class="btn btn-o" id="mFilter" style="padding:10px 14px">${I.filter}<span id="mfCount"></span></button></div>
    <div class="ex-view" role="group" aria-label="Харагдац сонгох"><button type="button" data-exview="map" aria-pressed="true">${I.map}Газрын зураг</button><button type="button" data-exview="list" aria-pressed="false">${I.grid}Жагсаалт</button></div>
    <label class="srch fdesk">${I.search}<input id="q" placeholder="Кафе хайх" aria-label="Кафе хайх"></label></div>
   <div class="fdesk fbox ex-filters">${filtersHTML(false, true)}</div>
   <div class="ex-active" id="exActive"></div>
   <div class="ex-list" id="exList"></div>
  </aside>
  <div class="ex-map" id="exMap"><div class="map-note"><span class="badge b-demo">ДЕМО</span>Тэмдэг дээр дарж уур амьсгалыг нь хар</div>
   <div class="compass" aria-hidden="true"><svg width="52" height="52" viewBox="0 0 52 52"><path d="M26 6l5 20-5 20-5-20z" fill="#B6771D"/><path d="M26 6l5 20h-10z" fill="#FF9D00"/><text x="26" y="5" text-anchor="middle" font-size="7" font-weight="800" fill="#7B542F" font-family="Manrope">Хойд</text></svg></div>
   <div class="map-legend"><div>${seatRow(40)} Суудал</div><div><span class="sg">${ssGlyph(2)}</span> Дуу чимээ</div><div>${wifiSVG(3, 18)} Wi-Fi</div></div></div>
 </section>`;
  $$('#q,#q2').forEach(i => { i.value = F.q; i.oninput = () => { F.q = i.value; $$('#q,#q2').forEach(o => { if (o !== i) o.value = i.value }); refreshResults(); if (F.q.trim()) { revealResults(); searchOnMap() } } });
  mapCtl = buildMap($('#exMap'), { onSelect: (id, from) => selectCafe(id, from) });
  refreshResults = updateExplore; updateExplore(); if (F.q.trim() && !selId) pageTasks.timeout(searchOnMap, 60);
  const list = $('#exList');
  list.addEventListener('click', e => { const c = e.target.closest('[data-card]'); if (c) selectCafe(c.dataset.card, 'list') });
  list.addEventListener('mouseover', e => { const c = e.target.closest('[data-card]'); if (c) mapCtl.hover(c.dataset.card, true) });
  list.addEventListener('mouseout', e => { const c = e.target.closest('[data-card]'); if (c) mapCtl.hover(c.dataset.card, false) });
  $('#exMap').addEventListener('mouseover', e => { const m = e.target.closest('.mk'); if (m) { const c = $(`[data-card="${m.dataset.mk}"]`); c && c.classList.add('hov') } });
  $('#exMap').addEventListener('mouseout', e => { const m = e.target.closest('.mk'); if (m) { const c = $(`[data-card="${m.dataset.mk}"]`); c && c.classList.remove('hov') } });
  // mobile sheet
  const side = $('#exSide'), h = $('#shHandle'); let sd = null;
  // Map ⇄ list on phones only moves the sheet: search, filters and the selected café stay as they are.
  const setFull = v => {
    side.classList.toggle('full', v); h.setAttribute('aria-label', v ? 'Жагсаалтыг багасгах' : 'Жагсаалтыг томруулах'); Snd.ui('whoosh');
    $$('[data-exview]', side).forEach(b => b.setAttribute('aria-pressed', (b.dataset.exview === 'list') === v));
    if (v && selId) pageTasks.timeout(() => $(`[data-card="${selId}"]`)?.scrollIntoView({ block: 'nearest', behavior: Prefs.reduced ? 'auto' : 'smooth' }), 80);
  };
  $('.ex-view', side).addEventListener('click', e => { const b = e.target.closest('[data-exview]'); if (b) setFull(b.dataset.exview === 'list') });
  h.addEventListener('click', () => { if (!sd || !sd.moved) setFull(!side.classList.contains('full')) });
  h.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFull(!side.classList.contains('full')) } });
  h.addEventListener('pointerdown', e => { sd = { y: e.clientY, full: side.classList.contains('full'), moved: false, h: side.offsetHeight }; h.setPointerCapture(e.pointerId) });
  h.addEventListener('pointermove', e => { if (!sd) return; const dy = e.clientY - sd.y; if (Math.abs(dy) > 6) sd.moved = true; if (!sd.moved) return; side.classList.add('drag'); const base = sd.full ? 0 : sd.h - (parseFloat(getComputedStyle(side).getPropertyValue('--peek')) || 236); side.style.transform = `translateY(${clamp(base + dy, 0, sd.h - 120)}px)` });
  h.addEventListener('pointerup', e => { if (!sd) return; side.classList.remove('drag'); side.style.transform = ''; if (sd.moved) { const dy = e.clientY - sd.y; setFull(sd.full ? dy < 80 : dy < -60) } pageTasks.timeout(() => sd = null, 0) });
  // The list scrolls vertically; while the sheet is low, an upward swipe on it first opens it.
  let ty = null;
  side.addEventListener('touchstart', e => { ty = side.classList.contains('full') ? null : e.touches[0].clientY }, { passive: true });
  side.addEventListener('touchmove', e => { if (ty != null && ty - e.touches[0].clientY > 14 && !e.target.closest('#shHandle')) { ty = null; setFull(true) } }, { passive: true });
  list.addEventListener('wheel', e => { if (e.deltaY > 0 && !side.classList.contains('full') && isMobile()) setFull(true) }, { passive: true });
  $('#mFilter').onclick = e => showAdvancedFilters(e.currentTarget);
  if (selId) pageTasks.timeout(() => selectCafe(selId, 'list', true), 60);
}
// desktop: scroll the sidebar past the filters so search results sit right under the sticky search box
function revealResults() {
  if (isMobile()) return; const side = $('#exSide'), act = $('#exActive'), top = $('.ex-top', side); if (!side || !act) return;
  const y = side.scrollTop + act.getBoundingClientRect().top - side.getBoundingClientRect().top - top.offsetHeight;
  if (y > side.scrollTop) side.scrollTo({ top: y, behavior: Prefs.reduced ? 'auto' : 'smooth' })
}
// search shows up on the map itself: matching pins get their name tags, the view pans to them, a single hit opens straight away
function searchOnMap() {
  if (!mapCtl) return; const res = CAFES.filter(matches); if (!res.length) return;
  if (res.length === 1) { if (selId !== res[0].id) selectCafe(res[0].id, 'list'); return }
  if (selId && !res.some(c => c.id === selId)) selectCafe(null);
  mapCtl.centerOn(res.reduce((a, c) => a + c.x, 0) / res.length, res.reduce((a, c) => a + c.y, 0) / res.length)
}
function updateExplore() {
  const res = CAFES.filter(matches); const set = new Set(res.map(c => c.id));
  const list = $('#exList'); if (!list) return;
  const sorted = [...res].sort((a, b) => (b.open - a.open) || (freePct(b) - freePct(a)));
  list.innerHTML = sorted.length ? sorted.map(listCard).join('') : emptyHTML();
  $('#exActive').innerHTML = activeHTML(res.length); const mf = $('#mfCount'); if (mf) mf.textContent = activeCount() ? ' ' + activeCount() : '';
  const ap = $('#mfApply'); if (ap) ap.textContent = `${res.length} кафе харах`;
  mapCtl && (mapCtl.dim(set), mapCtl.hits(F.q.trim() ? set : null))
}
function emptyArt() { return `<svg viewBox="0 0 90 90"><ellipse cx="45" cy="76" rx="30" ry="5" fill="#EFE3D1"/><path d="M22 34h40v18a20 20 0 0 1-20 20h0a20 20 0 0 1-20-20z" fill="#FFF9EC" stroke="#7B542F" stroke-width="3"/><path d="M62 38h5a7 7 0 0 1 0 14h-5" fill="none" stroke="#7B542F" stroke-width="3"/><circle cx="35" cy="48" r="2.5" fill="#7B542F"/><circle cx="49" cy="48" r="2.5" fill="#7B542F"/><path d="M36 60c3-3 9-3 12 0" stroke="#7B542F" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>` }
function previewHTML(c) {
  const t = tone(c);
  return `<div class="pv-h"><div><h3>${escapeHTML(c.name)}</h3><div class="meta num">${I.walk.replace('<svg', '<svg width="14" height="14"')}${walkMeta(c)}</div></div><div class="pv-btns">${favBtn(c.id)}${cmpBtn(c.id)}<button class="pv-x" data-pvclose aria-label="Хаах">${I.x}</button></div></div>
 ${statusBlock(c)}
 <div class="tags">${tagPills(c)}</div>
 ${c.open ? `<div class="pv-mood ${t}">${mood(c)}</div>
 <div class="pv-ms"><div title="Сул суудал · ${crowdCat(c.occ)[0]}">${seatRow(c.occ)}<b class="num">${freePct(c) == null ? '—' : freePct(c) + '%'}</b><small>сул</small></div><div title="${SS[c.sound].t}"><span class="sg">${ssGlyph(c.sound)}</span><b>${SS[c.sound].short}</b><small>дуу</small></div><div title="${WIFI_S[c.wifi]}">${wifiSVG(c.wifi, 24)}<b>${WIFI[c.wifi]}</b><small>Wi-Fi</small></div></div>` : `<div class="pv-closed"><b style="display:block;color:var(--ink)">${c.status_text || `Хаалттай · ${c.opens} нээгдэнэ`}</b></div>`}
 ${sensorPanelHTML(c, true)}${dataMode(c) === 'demo' ? `<button class="pv-dir" disabled title="Демо кафе: байршил нь зохиомол">${I.walk} Чиглэл авах · ДЕМО байршил</button>` : `<a class="pv-dir" href="${directionsUrl(c)}" target="_blank" rel="noopener">${I.walk} Чиглэл авах</a>`}<div class="pv-go"><span>Кафе дотор харах</span>${I.arr}</div>`
}
function selectCafe(id, from, silent) {
  const ex = $('#exMap'); if (!ex) return;
  selId = id; $$('.pv').forEach(p => p.remove()); mapCtl.select(id);
  $$('[data-card]').forEach(c => c.classList.toggle('sel', c.dataset.card === id));
  if (!id) return;
  const c = byId(id); if (!silent) Snd.ui('pop');
  const pv = document.createElement('div'); pv.className = 'pv'; pv.dataset.id = id; pv.innerHTML = previewHTML(c);
  (isMobile() ? document.body : ex).appendChild(pv); mapCtl.setPv(pv);
  $('[data-pvclose]', pv).onclick = e => { e.stopPropagation(); Snd.ui('click'); selectCafe(null) };
  pv.setAttribute('role', 'link'); pv.tabIndex = 0; pv.setAttribute('aria-label', `${c.name} — дэлгэрэнгүй харах`);
  pv.addEventListener('click', e => { if (!e.target.closest('button,a')) location.hash = 'cafe-' + id });
  pv.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === pv) location.hash = 'cafe-' + id });
  const card = $(`[data-card="${CSS.escape(id)}"]`); if (card && from === 'map') card.scrollIntoView({ block: 'nearest', inline: 'center', behavior: Prefs.reduced ? 'auto' : 'smooth' });
  if (from === 'list' || isMobile()) mapCtl.centerOn(c.x, c.y, isMobile() ? 1.5 : 1.2);
}

/* ---------- cafes page ---------- */
const SORT_LABEL = { seats: 'сул суудлаар', name: 'нэрээр', 'price-asc': 'үнээр (хямдаас нь)', 'price-desc': 'үнээр (үнэтэйгээс нь)' };
// Hanging lamps of the previous «Бүх кафе» banner.
const lampSVG = (c, shape) => shape === 0 ? `<svg viewBox="0 0 110 60"><path d="M10 56C10 30 30 12 55 12s45 18 45 44z" fill="${c}"/><rect x="5" y="52" width="100" height="6" rx="3" fill="#7B542F"/><ellipse cx="55" cy="58" rx="9" ry="4" fill="#FFF4DC"/></svg>` : shape === 1 ? `<svg viewBox="0 0 110 60"><path d="M45 4h20l40 52H5z" fill="${c}"/><rect x="45" y="0" width="20" height="8" rx="2" fill="#7B542F"/><ellipse cx="55" cy="56" rx="9" ry="4" fill="#FFF4DC"/></svg>` : `<svg viewBox="0 0 110 60"><path d="M30 56c0-22 10-40 25-40s25 18 25 40z" fill="${c}"/><rect x="51" y="8" width="8" height="10" fill="#7B542F"/><rect x="24" y="52" width="62" height="6" rx="3" fill="#3E2A17"/><ellipse cx="55" cy="58" rx="8" ry="3.5" fill="#FFF4DC"/></svg>`;
const lamp = (x, cord, c, shape, cls) => `<div class="lamp ${cls}" style="left:${x}" aria-hidden="true"><div class="cord" style="height:${cord}px"></div>${lampSVG(c, shape)}<div class="cone"></div></div>`;
function renderCafes() {
  // Same banner, layout and cards as the previous version; the sort select sits on the count row.
  app.innerHTML = `<div class="page cf-classic"><div class="lamps-hd">${lamp('3%', 0, '#FF9D00', 0, 'l1')}${lamp('13%', 60, '#B6771D', 1, 'l2')}${lamp('23%', 30, '#FFCF71', 0, 'l3')}${lamp('72%', 40, '#FFCF71', 1, 'l4')}${lamp('82%', 10, '#7B542F', 2, 'l5')}${lamp('91%', 50, '#FF9D00', 1, 'l6')}
  <div><h1>Бүх кафе</h1><p id="cfCount" role="status"></p></div></div>
 <div class="wrap"><div class="mrow cf-mrow"><label class="srch">${I.search}<input id="q2" placeholder="Кафе хайх" aria-label="Кафе хайх" enterkeyhint="search"></label><button class="btn btn-o mf-open" id="mfo">${I.filter} Шүүлтүүр <span id="mfc"></span></button></div>
 <div class="cafes"><aside class="fpanel" id="fpanel"><h2>Шүүлтүүр <button data-reset>Цэвэрлэх</button></h2><label class="srch fdesk">${I.search}<input id="q" placeholder="Кафе хайх" aria-label="Кафе хайх"></label>${filtersHTML(true, true)}</aside>
 <div class="cf-results"><div class="cf-bar"><div class="ex-active" id="exActive"></div>
 <label class="cf-sort">Эрэмбэ <select id="cfSort"><option value="seats">Сул суудлаар</option><option value="name">Нэрээр</option><option value="price-asc">Үнээр: хямдаас нь</option><option value="price-desc">Үнээр: үнэтэйгээс нь</option></select></label></div>
 <div class="cgrid2" id="cgrid"></div>
 <nav class="cf-pages" aria-label="Кафены жагсаалтын хуудас" hidden><button class="btn btn-o" type="button" data-cf-page="-1">Өмнөх</button><span></span><button class="btn btn-o" type="button" data-cf-page="1">Дараах</button></nav>
 </div></div></div>${footer()}</div>`;
  let pageIndex = 0;
  function updateCafes() {
    const sort = $('#cfSort').value;
    // Price: average drink price from each café's published menu; cafés without one go last.
    const byPrice = dir => (a, b) => { const pa = drinkPrice(a.id), pb = drinkPrice(b.id); return (pa == null) - (pb == null) || (pa - pb) * dir || a.name.localeCompare(b.name, 'mn'); };
    const results = CAFES.filter(matches).sort(sort === 'name' ? (a, b) => a.name.localeCompare(b.name, 'mn') :
      sort === 'price-asc' ? byPrice(1) : sort === 'price-desc' ? byPrice(-1) :
      (a, b) => (b.open - a.open) || ((freePct(b) ?? -1) - (freePct(a) ?? -1)));
    const pageSize = 12, pages = Math.max(1, Math.ceil(results.length / pageSize));
    pageIndex = clamp(pageIndex, 0, pages - 1);
    const items = results.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
    $('#cgrid').innerHTML = items.length ? items.map(c => cafeCard(c, { classic: true })).join('') : emptyHTML(' style="grid-column:1/-1"');
    $('#cfCount').textContent = `${results.length} кафе олдлоо · ${SORT_LABEL[sort]} эрэмбэлсэн`;
    $('#exActive').innerHTML = activeHTML(results.length);
    $('#mfc').textContent = activeCount() ? '· ' + activeCount() : '';
    $('.cf-pages').hidden = pages <= 1;
    $('.cf-pages span').textContent = `${pageIndex + 1} / ${pages}`;
    $('[data-cf-page="-1"]').disabled = pageIndex === 0;
    $('[data-cf-page="1"]').disabled = pageIndex === pages - 1;
  }
  const resetPage = () => { pageIndex = 0; updateCafes() };
  $('#cfSort').onchange = resetPage;
  // Drink prices load in the background; the list re-sorts and the cards show them when they arrive.
  const grid = $('#cgrid');
  loadMenuSummaries(CAFES).then(() => { if (grid.isConnected) updateCafes(); });
  $$('[data-cf-page]').forEach(button => button.onclick = () => {
    pageIndex += Number(button.dataset.cfPage);
    updateCafes();
    $('#cgrid').scrollIntoView({ block: 'start' });
  });
  $$('#q,#q2').forEach(i => {
    i.value = F.q;
    i.oninput = () => { F.q = i.value; $$('#q,#q2').forEach(o => { if (o !== i) o.value = i.value }); $('#fpanel').classList.remove('mopen'); resetPage() };
    i.onkeydown = e => { if (e.key === 'Enter') { i.blur(); $('#cgrid').scrollIntoView({ block: 'start', behavior: Prefs.reduced ? 'auto' : 'smooth' }) } }
  });
  $('#mfo').onclick = () => { $('#fpanel').classList.toggle('mopen'); Snd.ui('whoosh') };
  refreshResults = resetPage; updateCafes()
}

/* ---------- cafe detail ---------- */
// Phones: a small hand-drawn arrow curves down onto each goal tag (alternating sides).
function renderCafe(id) {
  const c = byId(id); if (!c) { app.innerHTML = `<div class="wrap empty">${emptyArt()}<b>Кафе олдсонгүй</b><a class="btn btn-o" href="#explore">Газрын зураг руу буцах</a></div>`; return }
  selId = id; cdCafe = c;
  app.innerHTML = `<div class="wrap page"><div class="skel" style="height:150px;margin-top:24px"></div><div class="skel" style="height:420px;margin-top:20px"></div></div>`;
  pageTasks.timeout(() => { if (location.hash === '#cafe-' + encodeURIComponent(id) || location.hash === '#cafe-' + id) buildCafe(c) }, Prefs.reduced ? 0 : 380)
}
function detailOccupancy(c) {
  const seat = seatState(c, { staleAfterSec: stale() });
  if (seat.known) {
    return `${seat.demo ? '~' : ''}${Math.round(seat.demo ? c.occ : 100 - c.live.free_pct)}%`;
  }
  return seat.short.includes(' · ') ? seat.short.split(' · ')[0] : '—';
}
function summaryHTML(c) {
  const o = { staleAfterSec: stale() }, op = openState(c), seat = seatState(c, o), noise = noiseState(c, o), wifi = wifiState(c);
  const speed = wifi.known && !wifi.demo ? c.live?.wifi_mbps : null;
  const metric = (icon, value, label) => `<div class="cd-metric">${icon}<strong>${escapeHTML(value)}</strong><span>${label}</span></div>`;
  return `<div class="cd-status${op.open ? ' is-open' : ''}">${openLamp(c)}<strong>${escapeHTML(op.text)}</strong></div>
    <div class="cd-metrics">
     ${metric(I.people, detailOccupancy(c), seat.known ? 'Дүүргэлт' : 'Суудал')}
     ${metric(I.sndOn, noise.known ? noise.short.replace('Дуу: ', '') : '—', 'Дуу чимээ')}
     ${metric(wifiSVG(wifi.known ? (c.live?.wifi_level || c.wifi) : 0, 24), Number.isFinite(speed) ? `${Math.round(speed)} Mbps` : wifi.known ? wifi.short.replace('Wi-Fi: ', '') : '—', 'Wi-Fi')}
    </div>${trustHTML(c, o)}`;
}
function buildCafe(c) {
  sensorHistoryView?.destroy(); sensorHistoryView = null;
  liveNoiseView?.destroy(); liveNoiseView = null; dropCust();
  detailSheetOff?.(); detailSheetOff = null;
  const fp_ = freePct(c), demo = dataMode(c) === 'demo';
  const location = [c.district, c.address].filter(Boolean).map(escapeHTML).join(' · ');
  const introduction = `${c.description || c.note ? `<p>${escapeHTML(c.description || c.note)}</p>` : ''}${tagPills({tags: c.tags || []})}`;
  const dir = !demo && ((Number.isFinite(c.lat) && Number.isFinite(c.lng)) || (Number.isFinite(c.x) && Number.isFinite(c.y)))
    ? `<a class="btn btn-p cds-dir" href="${directionsUrl(c)}" target="_blank" rel="noopener">${I.walk} Очих заавар</a>`
    : `<p class="cd-direction-note">${I.pin} ${demo ? 'ДЕМО · Байршил нь жишээ' : 'Чиглэл авах байршил алга'}</p>`;
  const legend = `<div class="plan-legend"><span><i class="lg-seat"></i>Сул</span><span><i class="lg-seat o"></i>Хүнтэй</span><span><i class="lg-seat u">?</i>Мэдээлэлгүй</span></div>`;
  app.innerHTML = `<div class="page"><div class="wrap cd cd-final">
 <div class="cd-story">
  <div class="cd-cover">
   <picture><source media="(max-width:430px) and (max-resolution:1.5dppx)" srcset="js/features/home/cafe-cartoon-small.webp"><img src="js/features/home/cafe-cartoon.webp" alt="" fetchpriority="high"></picture>
   <a class="ibtn cd-back" href="#explore" data-back aria-label="Буцах">${I.arr}</a>
   <span class="cd-art-label">Жишээ зураглал</span>
  </div>
  <div class="cd-intro">
   <div class="cd-titlebar"><h1>${escapeHTML(c.name)}</h1><div class="cd-act cd-actions">${favBtn(c.id)}${cmpBtn(c.id)}</div></div>
   ${location ? `<p class="cd-location">${I.pin}${location}</p>` : ''}
   <div class="cd-pills">${c.hours ? `<span class="tagp2 num">${I.clock}${escapeHTML(c.hours)}</span>` : ''}<span id="cdMode">${modeBadge(c, { staleAfterSec: stale() })}</span></div>
   <div class="cd-intro-description">${introduction}</div>
  </div>
  <section class="cd-summary" id="cdSummary" aria-label="Товч мэдээлэл">${summaryHTML(c)}</section>
 </div>
 <div class="cd-experience">
 ${c.open ? `<section class="card plan-card" aria-label="Кафены зураглал">
   <div class="card-h">
    <h2>${I.map} Кафе дотор</h2>
    <div class="cd-plan-tabs seg" role="tablist" aria-label="Суудлын харагдац" id="viewSeg"><span class="ind-s"></span><button role="tab" aria-selected="true" aria-controls="viewPlan" data-view="plan">Зураглал</button><button role="tab" aria-selected="false" aria-controls="viewTable" data-view="table">Хүснэгт</button></div>
    <button class="btn btn-o cd-plan-open" data-cd-plan-open aria-haspopup="dialog" aria-controls="cdPlanSheet"><span class="cd-expand-wide">Томруулах</span><span class="cd-expand-narrow">Зураглал</span> ${I.arr}</button>
   </div>
   <p class="muted" data-plan-reliability></p><p class="vip-note" id="vipNote" hidden></p>
   <div id="viewPlan"><div class="plan-outer"><div class="plan-wrap" id="planWrap"></div>
    <div class="plan-tools"><button data-pz="in" aria-label="Томруулах" title="Томруулах">${I.plus}</button><button data-pz="out" aria-label="Жижигрүүлэх" title="Жижигрүүлэх">${I.minus}</button><span class="pt-sep"></span><button id="addG" aria-label="Зочин орж ирэх" title="Зочин орж ирэх">${I.guestIn}</button><button id="remG" aria-label="Зочин гарах" title="Зочин гарах">${I.guestOut}</button></div>
    <div id="seatInfo"></div></div><button type="button" class="cd-plan-tap" tabindex="-1" aria-hidden="true"></button></div>
   <div id="viewTable" hidden>${tableHTML(c)}</div>
   ${legend}
  </section>` : `<section class="card cd-plan-empty"><h2>${c.status_text ? 'Мэдээлэл хүлээгдэж байна' : 'Одоо хаалттай'}</h2><p>${escapeHTML(closedText(c))}</p></section>`}
  <section class="card menu-card" id="cafeMenu" aria-label="Цэс"></section>
  ${demo && c.open ? `  <section class="card pred" aria-label="Өдрийн жишээ · ДЕМО">
   <div class="pr-h"><h3>${I.clock} Өдрийн жишээ · ДЕМО</h3><div class="pr-out" id="prOut"></div></div>
   <div class="pr-bars" id="prBars"></div>
   <input type="range" id="teSl" min="8" max="22" step="1" value="${nowHour()}" aria-label="Цаг сонгох">
  </section>
` : !demo ? '<section class="card" id="publicSensorHistory"></section>' : ''}
 </div>
 <section class="cd-directions" aria-label="Очих заавар">${dir}</section>
 <div class="cd-secondary">
  <section id="publicSensor" ${c.live?.sensor ? 'class="card"' : ''}>${sensorPanelHTML(c, false, { staleAfterSec: stale() })}</section>
  ${c.open ? `  <div class="side-stack">
   <div class="cd-fresh" id="cdFresh" aria-live="polite">${freshnessHTML(c, { staleAfterSec: platform.config.sensor_stale_after_sec ?? 30 })}</div>
   <section class="card mcard seatcard"><h3>${I.seat} Сул суудал</h3><div class="sc-row"><div class="big-pct"><b class="num" id="freePct">${fp_ == null ? '—' : fp_ + '%'}</b><span id="crowdLab">${fp_ == null ? 'Суудал хэмжээгүй' : crowdCat(c.occ)[0]}</span></div><small class="muted num" id="freeSub"></small></div><div class="chairs" id="chairs" aria-hidden="true"></div></section>
   <section class="card mcard"><h3>${ssGlyph(2)} Дуу чимээ</h3><div id="ssBox"></div>
    <div class="ss-scale" role="group" aria-label="Дууны түвшнийг жишээгээр солих">${[1, 2, 3, 4, 5].map(l => `<button data-ssl="${l}" aria-label="${SS[l].t}" title="${SS[l].t}" class="${l === c.sound ? 'on' : ''}">${ssGlyph(l)}</button>`).join('')}</div></section>
   <section class="card mcard"><h3>${wifiSVG(3, 16)} Wi-Fi</h3><div id="wfBox"></div></section>
  </div>
` : ''}
  <div class="cd-mobile-description">${introduction}</div>
 </div>
 ${c.open ? `<dialog class="cd-plan-sheet" id="cdPlanSheet" aria-labelledby="cdSheetTitle">
   <div class="cd-sheet-head"><h2 id="cdSheetTitle">Суудлын зураглал</h2><button class="ibtn" data-cd-plan-close aria-label="Хаах" autofocus>${I.x}</button></div>
   <div data-cd-plan-host></div>
   <div class="cd-sheet-summary" data-cd-sheet-summary>${escapeHTML(seatState(c, { staleAfterSec: stale() }).text)}</div>
   ${legend}
   <button class="btn btn-o cd-sheet-view" data-cd-sheet-view aria-pressed="false">Хүснэгт</button>
 </dialog>` : ''}
 </div>${footer()}</div>`;
  if ($('#publicSensorHistory')) sensorHistoryView = mount(SensorHistory, $('#publicSensorHistory'), { cafeId: c.id, source: c.live?.sensor?.dataSource || 'real', role: 'public', chart: true });
  mountCust(demo ? lazy.menuView : lazy.publicMenu, $('#cafeMenu'), { cafeId: c.id, detail: true, demo });
  if (!c.open) { tickFreshness(); return; }
  syncDetailNoise(c); renderWF(c.wifi, c);
  // floor plan
  fp = new FloorPlan($('#planWrap'), { ...c, occ: c.occ ?? 40 }, { onStats: updSeats, onEvent: logEvent, onSeat: seatInfo, sound: c.sound, fit: true });
  syncDetailPlan(c);
  // Optional VIP room (layout editor): booked separately, never filled by walk-in guests.
  if (fp.L.vip) { const n = fp.seats.filter(s => s.zone === 'vip').length, el = $('#vipNote'); el.hidden = false; el.innerHTML = `<b>★ ${escapeHTML(fp.L.vip.name || 'VIP өрөө')}</b> · ${n} суудал · тусдаа өрөө.` }
  $$('[data-pz]').forEach(b => b.onclick = () => { Snd.ui('click'); fp.setZoom(b.dataset.pz === 'in' ? 1.4 : 1 / 1.4) });
  $('#addG').onclick = () => { if (!fp.arrive(true)) { Snd.ui('err'); toast('Сул сандал үлдсэнгүй') } else Snd.ui('click') };
  $('#remG').onclick = () => { if (!fp.depart(true)) { Snd.ui('err'); toast('Суусан зочин алга') } };
  // tabs
  const seg = $('#viewSeg'); const moveInd = () => { const b = $('[aria-selected="true"]', seg); const ind = $('.ind-s', seg); ind.style.width = b.offsetWidth + 'px'; ind.style.transform = `translateX(${b.offsetLeft - 4}px)` }; moveInd();
  seg.addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (!b) return; Snd.ui('click'); $$('[data-view]', seg).forEach(x => x.setAttribute('aria-selected', x === b)); moveInd(); $('#viewPlan').hidden = b.dataset.view !== 'plan'; $('#viewTable').hidden = b.dataset.view !== 'table'; $('.plan-card .plan-legend').classList.toggle('off', b.dataset.view !== 'plan'); if (b.dataset.view === 'table') $('#viewTable').innerHTML = tableHTML(c, fp.stats()) });
  $$('[data-ssl]').forEach(b => b.onclick = () => { Snd.ui('tick'); $$('[data-ssl]').forEach(x => x.classList.toggle('on', x === b)); renderSS(+b.dataset.ssl); fp.sound = +b.dataset.ssl });
  syncDetailNoise(c);
  if (demo) initTE(c);
  detailSheetOff = bindPlanSheet($('.cd'), fp, () => tableHTML(c, fp.stats()));
  tickFreshness();
}
function syncDetailPlan(c) {
  if (!fp) return;
  const wasControlled = fp.telemetryControlled;
  fp.syncTelemetry(c, platform.config.sensor_stale_after_sec ?? 30);
  if (wasControlled !== fp.telemetryControlled) seatInfo(null);
  const table = $('#viewTable'); if (table && !table.hidden) table.innerHTML = tableHTML(c, fp.stats());
  for (const id of ['addG', 'remG']) { const button = $('#' + id); if (button) button.disabled = fp.telemetryControlled; }
  const note = $('[data-plan-reliability]');
  if (note) note.textContent = fp.telemetryControlled
    ? `${fp.observedPeople == null ? 'Хүний тоо тодорхойгүй · unknown occupancy.' : `Ажиглагдсан хүмүүс: ${fp.observedPeople}.`} Байрлал нь зөвхөн дүрслэл · illustrative positions, бодит байршил хянаагүй. Суудлын төлөв тодорхойгүй. Суух болон гарах хөдөлгөөн нь жишээ анимац; бодит сул суудал тогтоохгүй.`
    : dataMode(c) === 'demo' ? 'Дүрслэл: хүмүүс болон суудлын байрлал нь жишээ анимац — бодит хүмүүсийн байрлал биш.' : 'Дүрслэл / simulation · SIMULATED: хүмүүс болон суудлын байрлал нь жишээ.';
}
function syncDetailNoise(c) {
  const root = $('#ssBox'); if (!root) return;
  const telemetry = isRealMode(c) || !!c.live?.sensor;
  if (telemetry) {
    const props = { cafe: c, staleAfterSec: platform.config.sensor_stale_after_sec ?? 30, thresholds: platform.config.noise_dbfs_thresholds };
    if (liveNoiseView?.el === root) liveNoiseView.setProps(props);
    else { liveNoiseView?.destroy(); root.innerHTML = ''; liveNoiseView = mount(LiveNoise, root, props); }
    if (fp && isRealMode(c)) fp.sound = 0;
  } else { liveNoiseView?.destroy(); liveNoiseView = null; renderSS(c.sound); }
  const scale = $('.ss-scale'); if (scale) scale.hidden = telemetry;
  $$('[data-ssl]').forEach(button => { button.disabled = telemetry; });
}
// Keep "N min ago" honest while the page is open.
function tickFreshness() {
  pageTasks.timeout(() => {
    if (cdCafe) {
      syncDetailPlan(cdCafe); if (dataMode(cdCafe) !== 'demo') syncDetailNoise(cdCafe);
      const sensor = $('#publicSensor'); if (sensor) sensor.innerHTML = sensorPanelHTML(cdCafe, false, { staleAfterSec: platform.config.sensor_stale_after_sec ?? 30 });
      refreshSummary(cdCafe);
      const badge = $('#cdMode'); if (badge) badge.innerHTML = modeBadge(cdCafe, { staleAfterSec: platform.config.sensor_stale_after_sec ?? 30 });
      const sheet = $('[data-cd-sheet-summary]');
      if (sheet && dataMode(cdCafe) !== 'demo') sheet.textContent = seatState(cdCafe, { staleAfterSec: stale() }).text;
      const fresh = $('#cdFresh'); if (fresh && hasMeasurements(cdCafe)) fresh.innerHTML = freshnessHTML(cdCafe, { staleAfterSec: platform.config.sensor_stale_after_sec ?? 30 });
    }
    tickFreshness();
  }, 1000);
}
function refreshSummary(c) { const el = $('#cdSummary'); if (!el) return; const html = summaryHTML(c); if (el.dataset.html !== html) { el.dataset.html = html; el.innerHTML = html } }
// A new measurement for the open café: update indicators in place, never rebuild the simulation.
function applyLiveToDetail(c) {
  // Initial polling may finish before the scheduled detail render. That render
  // reads the updated cafe; building here would create a second Canvas shortly after.
  if ($('#app .skel')) return;
  sensorHistoryView?.setProps({ source: c.live?.sensor?.dataSource || 'real' });
  const sensor = $('#publicSensor'); if (sensor) { sensor.innerHTML = sensorPanelHTML(c, false, { staleAfterSec: platform.config.sensor_stale_after_sec ?? 30 }); sensor.className = c.live?.sensor ? 'card' : ''; }
  if (!$('#planWrap') && c.open && hasMeasurements(c)) { buildCafe(c); return; }
  refreshSummary(c);
  if (!$('#cdFresh')) return;
  $('#cdFresh').innerHTML = freshnessHTML(c, { staleAfterSec: platform.config.sensor_stale_after_sec ?? 30 }); $('#cdMode').innerHTML = modeBadge(c, { staleAfterSec: platform.config.sensor_stale_after_sec ?? 30 });
  syncDetailPlan(c); syncDetailNoise(c);
  if (!c.open || !hasMeasurements(c)) return;
  if (fp) updSeats(measuredSeats(c) || fp.stats());
  if (!c.live?.sensor && !isRealMode(c) && fp) fp.sound = c.sound;
  if (c.wifi) renderWF(c.wifi, c);
  if (fp && c.occ != null) fp.setTarget(c.occ, false);
}
function renderSS(l) { if (!l) { $('#ssBox').innerHTML = '<p class="muted">SPL хэмжилтгүй. dBFS утгыг мэдрэгчийн хэсгээс харна уу.</p>'; return; } $('#ssBox').innerHTML = `<div class="ssbig"><div class="art" style="background:${SSBG[l]}">${ssArt(l, 84)}</div><div><b>${SS[l].t}</b><small>${SS[l].s}</small></div></div><button class="play ss-try" data-play="${l}">${I.play} Орчны дууны жишээ сонсох</button>` }
function renderWF(l, c) { $('#wfBox').innerHTML = `<div class="wfbig">${wifiSVG(l, 52)}<div><b>${WIFI[l]}${c.mbps ? ` <span class="num mb">${c.mbps} Mbps</span>` : ''}</b><small>${WIFI_S[l]}</small></div></div><p class="wf-src">${escapeHTML(wifiState(c).source)}</p>` }
function updSeats(s) {
  const measured = cdCafe && measuredSeats(cdCafe); if (measured) s = measured;
  if (cdCafe && dataMode(cdCafe) !== 'demo' && !measured) { const summary = $('[data-cd-sheet-summary]'); if (summary) summary.textContent = seatState(cdCafe, { staleAfterSec: stale() }).text; const el = $('#freePct'); if (el) { el.textContent = '—'; $('#crowdLab').textContent = 'Суудал хэмжээгүй'; $('#freeSub').textContent = 'Хүний тооноос сул суудал тооцохгүй'; $('#chairs').innerHTML = ''; } return; }
  const sheet = $('[data-cd-sheet-summary]');
  if (sheet) sheet.textContent = `${s.free}/${s.total} сул суудал${dataMode(cdCafe) === 'demo' ? ' · ДЕМО' : ''}`;
  const pct = Math.round(s.free / s.total * 100); const el = $('#freePct'); if (!el) return;
  animNum(el, pct, '%'); $('#crowdLab').textContent = crowdCat(100 - pct)[0];
  $('#freeSub').textContent = `${s.total}-оос ${s.free} сул${s.unknown ? ` · ${s.unknown} мэдээлэлгүй` : ''}${measured ? ' · мэдрэгч' : ''}`;
  $('#chairs').innerHTML = s.list.map(st => `<i class="${st === 'occ' ? 'o' : ''}"></i>`).join('');
}
function logEvent(msg, kind) { const l = $('#elog'); if (!l) return; const d = document.createElement('div'); d.className = kind; d.textContent = msg; l.prepend(d); while (l.children.length > 4) l.lastChild.remove() }
function seatInfo(s) {
  const box = $('#seatInfo'); if (!box) return; if (!s) { box.innerHTML = ''; return }
  const st = { free: 'Сул', occ: 'Хүнтэй', unknown: 'Мэдээлэлгүй', vip: 'Захиалгаар' }[s.state];
  box.innerHTML = `<div class="seatinfo ${s.state}"><div class="si-ic">${s.kind === 'sofa' ? I.sofa : I.seat}</div><div><b>${s.label} · ${st}</b><small>${ZONES[s.zone].d} ${ZONES[s.zone].q}</small></div><button class="pv-x" data-sixclose aria-label="Хаах">${I.x}</button></div>`;
  $('[data-sixclose]', box).onclick = () => { box.innerHTML = '' }
}
function tableHTML(c, s) {
  if (dataMode(c) !== 'demo' && !measuredSeats(c)) return `<p class="muted">Суудлын хэмжилтгүй. Сандлын байрлал бол дүрслэл.</p>${sensorPanelHTML(c)}`;
  if (hasMeasurements(c)) s = measuredSeats(c);
  const pct = s ? Math.round(s.free / s.total * 100) : freePct(c); return `<table class="tbl"><tr><th>Үзүүлэлт</th><th>Одоо</th><th></th></tr>
 <tr><td>Сул суудал</td><td class="num"><b>${pct}%</b> · ${crowdCat(100 - pct)[0]} (${s ? s.total : TOTAL_SEATS}-оос ${s ? s.free : Math.round(pct * TOTAL_SEATS / 100)})</td><td>${seatRow(100 - pct)}</td></tr>
 <tr><td>Дуу чимээ</td><td>${SS[c.sound].t}</td><td><span class="sg">${ssGlyph(c.sound).replace('<svg', '<svg width="20" height="20"')}</span></td></tr>
 <tr><td>Wi-Fi</td><td>${WIFI[c.wifi]}${c.mbps ? ` · ${c.mbps} Mbps` : ''}</td><td>${wifiSVG(c.wifi, 26)}</td></tr>
 <tr><td>Ажлын цаг</td><td class="num">${c.hours}</td><td>${openLamp(c)}</td></tr></table>`
}
// compact day forecast: one bar per hour (darker = busier); tap a bar or drag the slider
function initTE(c) {
  const prof = profile(c), nh = nowHour(); const hh = h => String(h).padStart(2, '0') + ':00';
  $('#prBars').innerHTML = prof.map((v, i) => `<button class="pb${8 + i === nh ? ' now' : ''}" data-h="${8 + i}" style="--v:${v}%" aria-label="${hh(8 + i)} · ~${100 - v}% сул" title="${hh(8 + i)} · ~${100 - v}% сул"><i></i><span>${(8 + i) % 2 === 0 ? 8 + i : ''}</span></button>`).join('');
  const sl = $('#teSl'); let lastH = nh;
  const upd = (user) => {
    const h = +sl.value, v = prof[h - 8]; const snd = clamp(c.sound + Math.round((v - c.occ) / 25), 1, 5);
    $$('.pb', $('#prBars')).forEach(b => b.classList.toggle('sel', +b.dataset.h === h));
    const bd = h === nh ? '<span class="badge b-demo">ОДОО</span>' : h < nh ? '<span class="badge b-typ">ДУНДАЖ</span>' : '<span class="badge b-fc">ТААМАГ</span>';
    $('#prOut').innerHTML = `<b class="num">${hh(h)}</b>${bd}<span class="m">${seatRow(v)}<b class="num">~${100 - v}%</b></span><span class="m" title="${SS[snd].t}"><span class="sg">${ssGlyph(snd)}</span><b>${SS[snd].short}</b></span>${h !== nh ? `<button class="btn btn-g" id="teNow">Одоо</button>` : ''}`;
    const tn = $('#teNow'); if (tn) tn.onclick = () => { sl.value = nh; upd(true) };
    if (user && h !== lastH) { Snd.ui('tick'); lastH = h; fp && fp.setTarget(100 - v, h !== nh) }
  };
  $('#prBars').addEventListener('click', e => { const b = e.target.closest('.pb'); if (!b) return; sl.value = b.dataset.h; upd(true) });
  sl.oninput = () => upd(true); upd(false)
}
function openReport(c) {
  Snd.ui('whoosh'); const sel = {}; const grp = (k, lab, opts) => `<div class="rgrp"><b>${lab}</b><div class="ropt" data-g="${k}">${opts.map(([v, l, ic]) => `<button data-v="${v}" aria-pressed="false">${ic || ''}${l}</button>`).join('')}</div></div>`;
  openModal(`<div class="mdl-h"><div><span class="eyebrow">${c.name} · ${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}</span><h2>Энд одоо ямар байна?</h2><small class="muted">Нэг ч сонголт хангалттай · ~10 секунд</small></div><button class="pv-x" data-close aria-label="Хаах" style="margin-left:auto">${I.x}</button></div>
 ${grp('crowd', 'Хүмүүс', [['20', 'Цөөн', seatRow(20)], ['50', 'Дунд', seatRow(50)], ['85', 'Олон', seatRow(90)]])}
 ${grp('sound', 'Дуу чимээ', [[1, SS[1].short, `<span class="sg">${ssGlyph(1)}</span>`], [3, SS[3].short, `<span class="sg">${ssGlyph(3)}</span>`], [5, SS[5].short, `<span class="sg">${ssGlyph(5)}</span>`]])}
 ${grp('wifi', 'Wi-Fi', [[4, 'Сайн', wifiSVG(4, 22)], [2, 'Дунд', wifiSVG(2, 22)], [1, 'Муу', wifiSVG(1, 22)]])}
 <button class="btn btn-p" id="repGo" style="width:100%;margin-top:6px;padding:15px">Мэдээлэл илгээх</button>
 <p class="muted" style="font-size:12px;display:flex;gap:8px;align-items:center;margin:12px 0 0"><span style="display:inline-flex;gap:2px">${[1, .65, .4, .18].map(o => `<i style="width:12px;height:8px;border-radius:2px;background:var(--brown);opacity:${o}"></i>`).join('')}</span>Мэдээлэл хуучрах тусам нөлөө нь буурна (0 → 60 мин).</p>`);
  $$('.ropt').forEach(g => g.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; Snd.ui('tick'); const on = b.getAttribute('aria-pressed') !== 'true'; $$('button', g).forEach(x => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', on); if (on) sel[g.dataset.g] = +b.dataset.v; else delete sel[g.dataset.g] }));
  $('#repGo').onclick = () => {
    if (!Object.keys(sel).length) { Snd.ui('err'); toast('Нэг зүйл сонгоно уу'); return } closeModal(); Snd.ui('chime'); toast('Баярлалаа — LiveSpace шинэчлэгдлээ.', true);
    if (sel.sound) { c.sound = sel.sound; renderSS(c.sound); $$('[data-ssl]').forEach(x => x.classList.toggle('on', +x.dataset.ssl === c.sound)); fp.sound = c.sound }
    if (sel.wifi) { c.wifi = sel.wifi; renderWF(c.wifi, c); $$('[data-wfl]').forEach(x => x.classList.toggle('on', +x.dataset.wfl === c.wifi)) }
    if (sel.crowd) { c.occ = Math.round((c.occ + sel.crowd) / 2); fp.setTarget(100 - c.occ, false) }
    logEvent('Таны мэдээлэл нэмэгдлээ · жин 1.0 → 30 мин дараа 0.5', 'in')
  }
}

/* ---------- about ---------- */
function renderAbout() {
  app.innerHTML = `<div class="page"><div class="wrap">
 <section class="ab-hero"><div><span class="tagp">Бидний тухай</span><h1>Кафегаа очихоосоо өмнө мэдээрэй</h1><p>LiveSpace нь Улаанбаатарын кафенуудын сул суудал, дуу чимээ, Wi-Fi-н мэдээллийг нэг дор харуулдаг платформ юм. Сурах, ажиллах, найзуудтайгаа уулзах тохиромжтой газар хайхад зарцуулах цагийг тань хэмнэхийг зорьдог.</p><a class="btn btn-p" href="#explore">Газрын зураг үзэх →</a></div>
  <div class="orbit" aria-hidden="true"><div class="core">${I.house}</div><span class="fl" style="left:8%;top:6%">${seatRow(40)} 60%</span><span class="fl" style="right:4%;top:14%"><span class="sg">${ssGlyph(2).replace('<svg', '<svg width="14" height="14"')}</span>${SS[2].short}</span><span class="fl" style="left:4%;bottom:12%">${wifiSVG(4, 16)} Маш сайн</span></div></section>
 <div class="g2"><div class="icard"><span class="ic">${I.target}</span><b>Эрхэм зорилго</b><span>Хүн бүр өөрт тохирох орчныг хялбар, хурдан олох боломжийг бүрдүүлэх.</span></div><div class="icard"><span class="ic">${I.eye}</span><b>Алсын хараа</b><span>Улаанбаатарын кафе, хамтын ажлын орон зайн мэдээллийг нэг дороос, ил тод, бодит цагаар харуулдаг найдвартай эх сурвалж болох.</span></div></div>
 <section class="sec"><div class="sec-h"><h2>Хэрхэн ажилладаг вэ?</h2></div><div class="g4">${[['Газраа сонго', 'Газрын зураг эсвэл кафены жагсаалтаас ойролцоох кафегаа олоорой.'], ['Тэмдгийг хар', 'Хүмүүс, дуу чимээ, Wi-Fi-г тэмдэг дээрээс нь шууд харна.'], ['Дотор талыг хар', 'Дээрээс харсан зураглалаас сул сандал, тайван булангаа олоорой.'], ['Кафе руу', 'Очихоосоо өмнө бүгдийг мэдсэн тул цаг, зам хоёроо хэмнэнэ.']].map(([b, s], i) => `<div class="icard"><span class="stepn">${i + 1}</span><b>${b}</b><span>${s}</span></div>`).join('')}</div></section>
 <section class="sec"><div class="sec-h"><h2>Бидний харуулдаг мэдээлэл</h2><p>Тоог тайлбарлах шаардлагагүйгээр шууд ойлгогдохуйц.</p></div><div class="g4 g3">
  <div class="icard"><div class="demo-art"><span class="m big">${seatRow(40)}<b class="num">60%</b></span></div><b>Сул суудал — сандлаар</b><span>Хүнтэй сандал тод, сул сандал бүдэг. Хувь нь хэр сул байгааг шууд хэлнэ.</span></div>
  <div class="icard"><div class="demo-art">${ssArt(2, 110)}</div><b>Дуу чимээ — зүйрлэлээр</b><span>Номын сангаас сургуулийн завсарлага хүртэл 5 таних түвшин. dB-ээр биш, мэдрэмжээр.</span></div>
  <div class="icard"><div class="demo-art">${wifiSVG(4, 64)}</div><b>Wi-Fi — хөдөлдөг зураасаар</b><span>Зураасны тоо, хөдөлгөөний хурд чанарыг илэрхийлнэ. Хурдыг зөвхөн хэмжсэн үед бичнэ.</span></div></div></section>
 <section class="sec"><div class="sec-h"><h2>Мэдээлэл хэр шинэ вэ?</h2><p>Бодит хэмжилт, түүхэн дундаж, жишээ өгөгдлийг хэзээ ч хольж харуулахгүй.</p></div><div class="g4">${[['b-live', 'ШУУД', 'Сүүлийн 15 минутын хэрэглэгч эсвэл мэдрэгчийн өгөгдөл.'], ['b-typ', 'ДУНДАЖ', 'Тухайн өдөр, цагийн түүхэн хэв маяг.'], ['b-fc', 'ТААМАГ', 'Дараагийн цагуудын урьдчилсан тооцоо.'], ['b-demo', 'ДЕМО', 'Прототипийн жишээ утга. Энэ хувилбарт бүх утга ДЕМО.']].map(([c, l, d]) => `<div class="icard"><span class="badge ${c}" style="align-self:flex-start">${l}</span><span>${d}</span></div>`).join('')}</div></section>
 <section class="sec"><div class="sec-h"><h2>Түгээмэл асуулт</h2></div><div class="faq">${[['Дуу чимээний түвшинг хэрхэн уншдаг вэ?', `5 түвшин бий: ${SS.slice(1).map(x => x.t.toLowerCase()).join(', ')}. «Сонсох» товчоор жишээ дууг нь сонсож болно.`], ['Зураглал дээрх хүмүүс жинхэнэ үйлчлүүлэгч үү?', 'Үгүй. Дүрүүд нь суудлын төлөв өөрчлөгдөхийг ойлгомжтой харуулах дүрслэл юм. Хэнийг ч дагаж мөрддөггүй.'], ['Хаалттай кафены мэдээлэл яагаад харагдахгүй байна вэ?', 'Хаалттай үед бодит цагийн өгөгдөл ирдэггүй. Хуучирсан утгыг харуулбал төөрөгдүүлэх тул «—» гэж харуулна.'], ['Кафегаа LiveSpace-д хэрхэн нэмүүлэх вэ?', '«Хамтын ажиллагаа» хуудсаар хүсэлт илгээгээрэй. Бид тантай холбогдож мэдрэгч, зураглалыг тохируулна.']].map(([q, a]) => `<details><summary>${q}<i>+</i></summary><p>${a}</p></details>`).join('')}</div></section>
 <div class="band"><div><h2>Кафе эзэмшигч үү?</h2><p>Кафегаа LiveSpace-д нэмж, илүү олон зочинд хүрээрэй.</p></div><a class="btn btn-y" href="#partner">Хамтран ажиллах →</a></div></div>${footer()}</div>`;
  $$('.faq details').forEach(d => d.addEventListener('toggle', () => Snd.ui('click')))
}

/* ---------- partner ---------- */
let partnerCleanup = null;
function renderPartner() {
  app.innerHTML = `<div class="page"><div class="wrap">
 <section class="ab-hero" style="grid-template-columns:1fr"><div><span class="tagp">Хамтын ажиллагаа</span><h1>Кафегаа LiveSpace-д нэгтгээрэй</h1><p>Бид Улаанбаатарын кафе, коворкинг, номын сангуудтай хамтран ажиллаж, зочдод тохирох орчноо олоход нь тусалдаг. Таны кафе газрын зураг дээр гарч, бодит цагийн мэдээллээрээ илүү олон хүнд хүрнэ.</p><a class="btn btn-p" href="#pform">Хүсэлт илгээх →</a></div></section>
 <section class="sec"><div class="sec-h"><h2>Хамтран ажилласнаар</h2></div><div class="g4">${[[I.people, 'Илүү олон хэрэглэгч', 'Сурах, ажиллах газар хайж буй хэрэглэгчдэд таны кафе газрын зураг дээр харагдана.'], [I.clock, 'Бодит цагийн мэдээлэл', 'Сул суудал, дуу чимээ, Wi-Fi-гаа хэрэглэгчиддээ шууд харуулна.'], [I.chart, 'Ачааллын тойм', 'Өдрийн аль цагт ачаалал ихтэй, тайван байдгийг харж, үйлчилгээгээ төлөвлөнө.'], [I.star, 'Брэндээ таниулах', 'Кафены онцлог, тав тухтай орчноо олон хүнд таниулна.']].map(([ic, b, s]) => `<div class="icard"><span class="ic">${ic}</span><b>${b}</b><span>${s}</span></div>`).join('')}</div>
  <p style="text-align:center;margin-top:18px"><a class="btn btn-o" href="#staff">Ажилтны шууд хяналтыг үзэх →</a></p></section>
 <section class="sec" id="pform"><div class="sec-h"><h2>Хамтран ажиллах хүсэлт</h2></div>
 <div id="pformBody"><div class="skel" style="height:420px"></div></div></section></div>${footer()}</div>`;
  // The application form (photos, validation, owner sign-up) loads with this page only.
  const token = navToken;
  lazy.partner().then(({ pendingClaimHTML, partnerFormHTML, bindPartnerForm }) => {
    if (token !== navToken) return;
    $('#pformBody').outerHTML = pendingClaimHTML() + partnerFormHTML();
    partnerCleanup = bindPartnerForm($('#pf'));
  }).catch(() => { if (token === navToken) $('#pformBody').innerHTML = '<p class="muted">Маягтыг ачаалж чадсангүй. Хуудсаа дахин ачаална уу.</p>' });
}

/* ---------- staff ---------- */
function renderStaff() {
  const c = getCafes().find(cafe => cafe.id === 'A' && dataMode(cafe) === 'demo') || getCafes().find(cafe => dataMode(cafe) === 'demo');
  if (!c) {
    app.innerHTML = `<div class="wrap"><section class="card gate"><h1>Ажилтны самбар</h1><p>Жишээ самбарт зориулсан демо кафе байхгүй байна.</p><a class="btn btn-o" href="#owner">Эзэмшигчийн самбар</a></section></div>`;
    return;
  }
  app.innerHTML = `<div class="page"><div class="wrap" style="padding-block:28px 0">
 <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span class="badge" style="background:var(--brown);color:#fff;font-size:11px">АЖИЛТАН</span><h1 style="font-size:34px">Шууд хяналт</h1><span class="muted">${c.name} · ${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}</span><span class="badge b-demo" style="margin-left:auto">ДЕМО</span></div>
 <div class="st-top">
  <section class="card st-plan" aria-label="Кафены зураглал"><div class="card-h"><h2>Танхим</h2></div><div class="plan-outer"><div class="plan-wrap" id="planWrap"></div></div></section>
  <div class="st-side">
  <section class="card st-advice" aria-label="Зөвлөгөө"><div class="card-h"><h2>Юу анхаарах вэ</h2></div>
   <div class="ins"><span>${I.chart.replace('<svg', '<svg width="22" height="22"')}</span><div><b>Хүмүүс ердийнхөөс хурдан нэмэгдэж байна</b><small>Сүүлийн 30 минутад +18% (ердийн +8%) · <span class="badge b-typ">ДУНДАЖ</span></small></div></div>
   <div class="ins a"><span>${I.clock.replace('<svg', '<svg width="22" height="22"')}</span><div><b>Оргил ачаалал ~35 минутын дараа</b><small>Баристагийн нэмэлт ээлж хэрэгтэй байж магадгүй · <span class="badge b-fc">ТААМАГ</span></small></div></div>
   <div class="ins"><span style="color:var(--brown)">${ssGlyph(4).replace('<svg', '<svg width="22" height="22"')}</span><div><b>Дуу чимээ энэ цагийн хэвийн хэмжээнээс өндөр</b><small>«${SS[4].t}» — ердийн «${SS[2].t}»</small></div></div></section>
  <section class="card st-now"><div class="card-h"><h2>Танхимын төлөв</h2></div><div class="occ-ring"><svg viewBox="0 0 150 150"><circle cx="75" cy="75" r="60" fill="none" stroke="#F1E8DA" stroke-width="16"/><circle class="v" id="occC" cx="75" cy="75" r="60" fill="none" stroke="#7B542F" stroke-width="16" stroke-linecap="round" stroke-dasharray="377" stroke-dashoffset="377" transform="rotate(-90 75 75)"/><text x="75" y="80" text-anchor="middle" font-size="30" font-weight="800" font-family="Manrope" fill="#3E2A17" id="occT">0%</text><text x="75" y="100" text-anchor="middle" font-size="11" fill="#6B5038" font-family="Manrope">дүүрсэн</text></svg>
   <div style="display:grid;grid-template-columns:repeat(3,auto);gap:22px"><div><small class="muted">Сул суудал</small><b class="num" style="display:block;font-size:28px" id="stFree">—</b></div><div><small class="muted">Дуу чимээ</small><b style="display:block;font-size:16px;margin-top:6px">${SS[4].short}</b></div><div><small class="muted">Хүлээлт</small><b class="num" style="display:block;font-size:28px">~8 мин</b></div></div></div></section>
  </div>
 </div>
 <div class="st-grid st-more"><div style="display:flex;flex-direction:column;gap:20px">
  <section class="card"><div class="card-h"><h2>Түр төлөв</h2></div><div id="tsList" style="display:flex;flex-direction:column;gap:8px"></div>
   <div class="chips" style="margin-top:12px">${['Wi-Fi ажиллахгүй', 'Суудал хязгаартай', 'Арга хэмжээ болж байна', 'Чимээгүй хэсэг түр хаалттай'].map(t => `<button class="chip" data-ts="${t}">+ ${t}</button>`).join('')}</div>
   <div style="display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap"><small class="muted">Дуусах:</small><div class="seg" id="expSeg"><span class="ind-s"></span>${['30 мин', '1 цаг', '2 цаг', 'Өдрийн эцэс'].map((t, i) => `<button data-exp="${t}" aria-selected="${i === 2}">${t}</button>`).join('')}</div></div></section>
  <section class="amb"><div style="display:flex;gap:10px;align-items:center"><h3>ДАСАН ЗОХИЦОХ ОРЧИН</h3><span class="badge" style="border:1px solid var(--amberL);color:var(--amberL)">ЗӨВХӨН ЗӨВЛӨМЖ</span></div>
   <span>Одоо: ачаалал өндөр · «${SS[4].t.toLowerCase()}»</span>
   <div class="seg" id="musSeg"><span class="ind-s"></span><button data-mus="calm" aria-selected="true">Тайван</button><button data-mus="mid" aria-selected="false">Дунд</button><button data-mus="up" aria-selected="false">Эрч хүчтэй</button></div>
   <div style="display:flex;gap:16px;align-items:center"><div class="eq" id="eq">${'<i></i>'.repeat(6)}</div><div><b style="color:#fff" id="musV">Хөгжмийн дуу 32%</b><br><small id="musR">Санал болгосон: орчны чимээ аль хэдийн өндөр байна.</small></div></div>
   <small style="color:#BFAE95">Тоног төхөөрөмжийг удирдахгүй — зөвхөн ажилтанд санал болгоно.</small></section>
 </div></div>
 <div class="st-cust"><section class="card" id="stIncoming" aria-label="Ирэх зочид"></section><section class="card" id="stMenu" aria-label="Цэс засах"></section></div></div>${footer()}</div>`;
  mountCust(lazy.incoming, $('#stIncoming'), { cafeId: c.id }); mountCust(lazy.menuEditor, $('#stMenu'), { cafeId: c.id, editor: 'staff' });
  fp = new FloorPlan($('#planWrap'), { ...c, occ: 78 }, { sound: 4, onStats: s => { const pct = Math.round((s.total - s.free) / s.total * 100); $('#occC').style.strokeDashoffset = 377 - 377 * pct / 100; animNum($('#occT'), pct, '%'); $('#stFree').textContent = Math.round(s.free / s.total * 100) + '%' } });
  const ts = [{ t: 'Wi-Fi ажиллахгүй', e: '2 цаг' }]; let exp = '2 цаг';
  const rts = () => { $('#tsList').innerHTML = ts.length ? ts.map((x, i) => `<div class="tstat"><div><b>${x.t}</b><small>${x.e}-ийн дараа автоматаар дуусна</small></div><button class="btn btn-g" data-tsx="${i}" style="color:var(--terraT)">Цуцлах</button></div>`).join('') : '<small class="muted">Идэвхтэй түр төлөв алга.</small>'; $$('[data-tsx]').forEach(b => b.onclick = () => { ts.splice(+b.dataset.tsx, 1); Snd.ui('click'); rts() }) }; rts();
  $$('[data-ts]').forEach(b => b.onclick = () => { ts.push({ t: b.dataset.ts, e: exp }); Snd.ui('chime'); toast(`«${b.dataset.ts}» · ${exp}`, true); rts() });
  const segInit = (id, cb) => { const s = $('#' + id); const mv = () => { const b = $('[aria-selected="true"]', s); const ind = $('.ind-s', s); ind.style.width = b.offsetWidth + 'px'; ind.style.transform = `translateX(${b.offsetLeft - 4}px)` }; mv(); s.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; $$('button', s).forEach(x => x.setAttribute('aria-selected', x === b)); mv(); Snd.ui('click'); cb(b) }) };
  segInit('expSeg', b => exp = b.dataset.exp);
  const mus = { calm: ['.9s', '45%', 'Хөгжмийн дуу 32%', 'Санал болгосон: орчны чимээ аль хэдийн өндөр байна.'], mid: ['.6s', '70%', 'Хөгжмийн дуу 45%', 'Одоогийн чимээтэй зэрэгцээд хөгжим сонсогдохгүй болж магадгүй.'], up: ['.35s', '100%', 'Хөгжмийн дуу 60%', 'Санал болгохгүй: шуугиан улам нэмэгдэнэ.'] };
  const setM = k => { const m = mus[k]; $('#eq').style.setProperty('--es', m[0]); $('#eq').style.setProperty('--eh', m[1]); $('#musV').textContent = m[2]; $('#musR').textContent = m[3] }; setM('calm'); segInit('musSeg', b => setM(b.dataset.mus));
}

/* ================= router ================= */
// Pages built on the LiveSpace framework (dashboards) are mounted as components;
// the original pages keep their render functions. Every navigation first releases
// the previous page's timers, frames, simulation, map, audio and listeners.
const page = (Component, props) => () => { app.innerHTML = ''; pageComp = mount(Component, app, props) };
const lazyPage = (load, props) => () => {
  const token = navToken; app.innerHTML = '<div class="wrap page"><div class="skel" style="height:150px;margin-top:24px"></div></div>';
  load().then(Component => { if (token === navToken) { app.innerHTML = ''; pageComp = mount(Component, app, props) } }).catch(() => { if (token === navToken) app.innerHTML = loadFailed() });
};
function teardown() {
  navToken++;
  pageTasks.clear(); detailSheetOff?.(); detailSheetOff = null; liveNoiseView?.destroy(); liveNoiseView = null; dropCust(); Snd.stopAmb(); if (fp) { fp.destroy(); fp = null } if (mapCtl) { mapCtl.destroy(); mapCtl = null } if (homeDiscovery) { homeDiscovery.destroy(); homeDiscovery = null } refreshResults = () => { }; closeModal();
  if (pageComp) { pageComp.destroy(); pageComp = null } if (partnerCleanup) { partnerCleanup(); partnerCleanup = null } cdCafe = null;
}
const router = createRouter({
  fallback: 'home',
  beforeEach(to) {
    teardown();
    // An unknown hash renders home but, as before, highlights nothing.
    const key = to.fallback ? to.path : to.name; $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === key || (key === 'cafe' && a.dataset.nav === 'explore') || (key === 'staff' && a.dataset.nav === 'partner')));
    document.body.classList.toggle('on-explore', key === 'explore');
    document.body.classList.toggle('on-discovery', to.name === 'home');
    if (key !== 'explore') $$('.pv').forEach(p => p.remove());
  },
  afterEach(to) { navDepth++; if (to.name !== 'explore') window.scrollTo(0, 0); renderTray() },
  routes: [
    { path: '', name: 'home', enter: renderHome },
    { path: 'home', name: 'home', enter: renderHome },
    { path: 'explore', name: 'explore', enter: renderExplore },
    { path: 'cafes', name: 'cafes', enter: renderCafes },
    { path: 'cafe-:id', name: 'cafe', enter: to => renderCafe(to.params.id) },
    { path: 'about', name: 'about', enter: renderAbout },
    { path: 'partner', name: 'partner', enter: renderPartner },
    { path: 'staff', name: 'staff', enter: renderStaff },
    { path: 'account', name: 'account', enter: page(AccountPage, { favorites: () => [...favs].map(byId).filter(Boolean), cafeCard }) },
    { path: 'owner', name: 'owner', enter: lazyPage(lazy.owner) },
    { path: 'admin', name: 'admin', enter: lazyPage(lazy.admin) }
  ]
});
const route = () => router.resolve();
// The café page's back arrow returns to wherever the visitor came from (map, list, home);
// opened directly from a link, it goes to the map.
document.addEventListener('click', e => { if (e.target.closest('[data-back]') && navDepth > 1) { e.preventDefault(); Snd.ui('click'); history.back() } });
document.addEventListener('click', e => { const a = e.target.closest('a[href^="#"]'); if (a && a.getAttribute('href') === '#pform') { e.preventDefault(); $('#pform').scrollIntoView({ behavior: Prefs.reduced ? 'auto' : 'smooth' }); return } if (a && !e.defaultPrevented) { Snd.ui('click') } });
document.addEventListener('click', e => { if (e.target.closest('[data-owner-signup]')) { Snd.ui('whoosh'); lazy.partner().then(m => m.openOwnerSignup()) } });
let lastMobile = isMobile(); window.addEventListener('resize', () => { const m = isMobile(); if (m !== lastMobile) { lastMobile = m; const h = location.hash || ''; if (h.startsWith('#explore')) route() } });
document.documentElement.classList.toggle('rm', Prefs.reduced);
configureErrors({ message: 'Энэ хэсгийг харуулахад алдаа гарлаа. Хуудсаа дахин ачаална уу.', render: message => `<div class="wrap page"><div class="card gate" role="alert"><h1>Уучлаарай</h1><p class="muted">${escapeHTML(message)}</p></div></div>` });

/* ================= platform: accounts, favourites, live data ================= */
// A live update touches only the views that show that café.
function refreshCafeViews(id) {
  const c = byId(id); if (!c) return;
  if (mapCtl) mapCtl.refresh(id);
  const card = $(`[data-card="${CSS.escape(id)}"]`); if (card) { const t = document.createElement('div'); t.innerHTML = listCard(c, 0); const next = t.firstElementChild; next.style.animation = 'none'; next.classList.toggle('hov', card.classList.contains('hov')); card.replaceWith(next) }
  const article = $(`#cgrid [data-href="#cafe-${CSS.escape(encodeURIComponent(id))}"]`); if (article) article.outerHTML = cafeCard(c);
  if (cdCafe && cdCafe.id === id) applyLiveToDetail(c);
}
renderHeaderBits();
await initPlatform();
if (platform.online) {
  bindAccountPopover(); watchAuthCancel(); renderAccountButton();
  platform.bus.on('login:required', reason => openAuth({ reason }));
  platform.bus.on('cafe:updated', refreshCafeViews);
  window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#cafe-')) { sensorHistoryView?.destroy(); sensorHistoryView = null; } });
  platform.session.store.subscribe(s => s.user, () => { renderAccountButton(); pullFavorites() });
  pullFavorites();
}
router.start();

