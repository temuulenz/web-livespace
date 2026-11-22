// Home page on phones (≤820px): four hanging lamps, the title, search and, still on the
// first screen, a recommendation carousel of five cafés that each wear their own rooftop,
// plus a one-step-at-a-time tour for new users.
// Desktop keeps the original hero; this block is hidden there by styles/livespace.css.
import { escapeHTML } from '../../../framework/index.js';
import { $, $$, clamp, isMobile } from '../../dom.js';
import { I } from '../../icons.js';
import { Prefs, favs } from '../../state.js';
import { store } from '../../storage.js';
import { Snd } from '../../audio.js';
import { freePct } from '../../cafe-metrics.js';
import { pageTasks } from '../../lifecycle.js';
import { ssGlyph, wifiSVG } from '../../components/atmosphere.js';
import { openState, seatState, wifiState, walkText } from '../../live/status.js';
import { trustHTML } from '../../live/status-ui.js';
import { platform } from '../../services/platform.js';

/* ---------- hanging lamps (the same shades as the desktop hero) ---------- */
// [left, cord length, colour, shade, sway seconds]
const LAMPS = [['12%', 8, '#FF9D00', 0, 5.6], ['88%', 4, '#7B542F', 2, 7.2]];
const shadeSVG = (c, shape) => shape === 0
  ? `<svg viewBox="0 0 110 60" aria-hidden="true" focusable="false"><path d="M10 56C10 30 30 12 55 12s45 18 45 44z" fill="${c}"/><rect x="5" y="52" width="100" height="6" rx="3" fill="#7B542F"/><ellipse class="ml-bulb" cx="55" cy="58" rx="9" ry="4" fill="#FFF4DC"/></svg>`
  : shape === 1
    ? `<svg viewBox="0 0 110 60" aria-hidden="true" focusable="false"><path d="M45 4h20l40 52H5z" fill="${c}"/><rect x="45" y="0" width="20" height="8" rx="2" fill="#7B542F"/><ellipse class="ml-bulb" cx="55" cy="56" rx="9" ry="4" fill="#FFF4DC"/></svg>`
    : `<svg viewBox="0 0 110 60" aria-hidden="true" focusable="false"><path d="M30 56c0-22 10-40 25-40s25 18 25 40z" fill="${c}"/><rect x="51" y="8" width="8" height="10" fill="#7B542F"/><rect x="24" y="52" width="62" height="6" rx="3" fill="#3E2A17"/><ellipse class="ml-bulb" cx="55" cy="58" rx="8" ry="3.5" fill="#FFF4DC"/></svg>`;
const lampsHTML = () => `<div class="mh-lamps" aria-hidden="true">${LAMPS.map(([x, cord, c, shape, dur], i) =>
  `<div class="ml" style="left:${x};--cord:${cord}px;--dur:${dur}s;--del:-${(i * 1.7).toFixed(1)}s"><div class="ml-cord"></div>${shadeSVG(c, shape)}<div class="ml-cone"></div></div>`).join('')}</div>`;

/* ---------- recommendation cards ---------- */
// Every card wears a rooftop. The five cards on screen always have five different
// shapes (by position); the colours come from the café itself.
const ROOF_COLS = [['#B6771D', '#FFCF71', '#5E3F22'], ['#7B542F', '#D9B07A', '#3E2A17'], ['#E8890A', '#FFE0A6', '#7B542F'], ['#5E3F22', '#C99A62', '#2A1C0F'], ['#C9772A', '#FFE7B0', '#5E3F22'], ['#8A5A2B', '#F2C987', '#3E2A17']];
const ROOF_NAMES = ['gable', 'dome', 'ger', 'steep', 'pagoda'];
function roofSVG(k, n, uid) {
  const [a, b, d] = ROOF_COLS[k % ROOF_COLS.length], shape = ROOF_NAMES[n % ROOF_NAMES.length];
  const eave = `<rect x="-6" y="38" width="252" height="8" rx="4" fill="${d}"/>`;
  const chimney = x => `<rect x="${x}" y="2" width="14" height="24" fill="${d}"/><rect x="${x - 2}" y="0" width="18" height="5" rx="1.5" fill="${d}"/><g class="rf-smoke" fill="#FFF9EC"><circle cx="${x + 7}" cy="-4" r="4"/><circle cx="${x + 13}" cy="-10" r="3"/></g>`;
  let s = '';
  // a classic house roof: shingles and a smoking chimney
  if (shape === 'gable') s = `${chimney(176)}<path d="M-4 42 120 2l124 40z" fill="${a}"/><path d="M40 30h160M78 18h84" stroke="${b}" stroke-width="2" stroke-linecap="round" opacity=".6"/>${eave}`;
  // a rounded roof with curved ribs and a little ball on top
  if (shape === 'dome') s = `<path d="M-4 42C6 10 62-4 120-4s114 14 124 46z" fill="${a}"/>${[-60, -30, 0, 30, 60].map(o => `<path d="M${120 + o * 1.6} 42Q${120 + o * .9} 10 120 -4" fill="none" stroke="${b}" stroke-width="2" opacity=".55"/>`).join('')}<circle cx="120" cy="-6" r="4" fill="${d}"/>${eave}`;
  // a ger-like roof: a soft cone with roof poles running to the crown
  if (shape === 'ger') s = `<path d="M-4 42Q56 30 104 4h32q48 26 108 38z" fill="${a}"/>${[-90, -54, -18, 18, 54, 90].map(o => `<path d="M${120 + o * 1.2} 42Q${120 + o * .6} 26 ${120 + o * .14} 4" fill="none" stroke="${b}" stroke-width="2" opacity=".6"/>`).join('')}<rect x="102" y="0" width="36" height="7" rx="3.5" fill="${d}"/><path d="M-4 42Q56 30 104 4" fill="none" stroke="${d}" stroke-width="2"/><path d="M244 42Q184 30 136 4" fill="none" stroke="${d}" stroke-width="2"/>${eave}`;
  // a tall pointed roof with fish-scale tiles
  if (shape === 'steep') s = `<clipPath id="${uid}r"><path d="M14 42 120-10l106 52z"/></clipPath><path d="M14 42 120-10l106 52z" fill="${a}"/><g clip-path="url(#${uid}r)" fill="none" stroke="${b}" stroke-width="1.6" opacity=".6">${[0, 10, 20, 30].map((y, r) => Array.from({ length: 12 }, (_, i) => `<path d="M${i * 22 - (r % 2) * 11} ${y}a11 9 0 0 0 22 0"/>`).join('')).join('')}</g>${eave}`;
  // a roof whose edges sweep upward, with a hanging lantern
  if (shape === 'pagoda') s = `<path d="M-10 36C24 36 62 24 88 4h64c26 20 64 32 98 32l-6 6H-4z" fill="${a}"/><path d="M40 28c26-4 44-12 56-20M200 28c-26-4-44-12-56-20" fill="none" stroke="${b}" stroke-width="2" opacity=".6"/><rect x="84" y="-2" width="72" height="8" rx="4" fill="${d}"/><circle cx="120" cy="-6" r="4" fill="${d}"/>${eave}<g class="rf-lantern"><path d="M206 46v6" stroke="${d}" stroke-width="1.5"/><rect x="200" y="52" width="12" height="14" rx="5" fill="#FF9D00"/></g>`;
  return `<svg class="rf rf-${shape}" viewBox="0 -14 240 62" aria-hidden="true" focusable="false">${s}</svg>`;
}

// No café photos exist, so each card shows a small drawn interior in the café's palette,
// furnished after its first goal (books, laptop, a second cup, a sofa).
const PAL = [['#F6E3C7', '#E2B884', '#6B4526', '#FF9D00'], ['#EAD9C3', '#D9B07A', '#5E3F22', '#B6771D'], ['#FBE7C6', '#F5C97A', '#8A5A2B', '#E8890A'], ['#E8D3B8', '#C99A62', '#4A3220', '#FFCF71'], ['#F3D9B1', '#E9C08A', '#7B542F', '#FF9D00'], ['#EFD6B5', '#D7A86E', '#5A3B1E', '#FFB84D']];
// Window shapes [frame, mullions] and skies [top, bottom, sun/moon, night?] add variety.
const WINDOWS = [
  ['M56 128V70a64 64 0 0 1 128 0v58z', 'M120 6v122M56 92h128'],
  ['M44 128V30a10 10 0 0 1 10-10h132a10 10 0 0 1 10 10v98z', 'M120 20v108M44 74h152'],
  ['M40 128V64a36 36 0 0 1 72 0v64zM128 128V64a36 36 0 0 1 72 0v64z', 'M76 28v100M164 28v100M40 90h72M128 90h72']
];
const SKIES = [['#FFF1CF', '#F6B85C', '#FFF9EC'], ['#FFE6D6', '#F2A07C', '#FFF4E8'], ['#E4F0F2', '#B5D3DC', '#FFFFFF'], ['#46557A', '#22304D', '#FFF4DC', 1]];
function sceneSVG(c, k, uid) {
  const [w1, w2, fl, ac] = PAL[(k * 5 + Math.floor(k / 6) * 2 + 1) % PAL.length], tag = (c.tags || [])[0];
  const [win, bars] = WINDOWS[k % WINDOWS.length], [sk1, sk2, sun, night] = SKIES[(k + Math.floor(k / 3)) % SKIES.length];
  const prop = {
    'Сурах': `<rect x="84" y="160" width="30" height="6" rx="1.5" fill="#B6771D"/><rect x="87" y="154" width="26" height="6" rx="1.5" fill="#FFF4DC" stroke="#3E2A17" stroke-width="1"/><rect x="85" y="148" width="28" height="6" rx="1.5" fill="${ac}"/>`,
    'Ажиллах': `<path d="M84 140h34v24H84z" fill="#3E2A17"/><path d="M87 143h28v18H87z" fill="#FFE7B0" class="sc-screen"/><path d="M78 164h46l-3 4H81z" fill="#5E3F22"/>`,
    'Найзуудтай': `<path d="M94 154h14v8a7 7 0 0 1-14 0z" fill="#FFF9EC" stroke="#3E2A17" stroke-width="2"/><rect x="44" y="132" width="8" height="66" rx="3" fill="${fl}"/><rect x="188" y="132" width="8" height="66" rx="3" fill="${fl}"/><g class="sc-bub"><rect x="58" y="108" width="34" height="20" rx="9" fill="#FFF9EC" stroke="#3E2A17" stroke-width="1.6"/><circle cx="68" cy="118" r="2" fill="#3E2A17"/><circle cx="75" cy="118" r="2" fill="#3E2A17"/><circle cx="82" cy="118" r="2" fill="#3E2A17"/></g>`,
    'Тухтай': `<path d="M6 162a10 10 0 0 1 10-10h50a10 10 0 0 1 10 10v12H6z" fill="${ac}"/><rect x="2" y="170" width="78" height="22" rx="8" fill="${ac}"/><rect x="2" y="170" width="78" height="22" rx="8" fill="#000" opacity=".12"/><rect x="10" y="192" width="5" height="8" fill="#3E2A17"/><rect x="68" y="192" width="5" height="8" fill="#3E2A17"/>`
  }[tag] || '';
  return `<svg class="rc-scene" viewBox="0 0 240 340" preserveAspectRatio="xMidYMin slice" aria-hidden="true" focusable="false">
  <defs><linearGradient id="${uid}w" x2="0" y2="1"><stop offset="0" stop-color="${w1}"/><stop offset="1" stop-color="${w2}"/></linearGradient>
  <linearGradient id="${uid}s" x2="0" y2="1"><stop offset="0" stop-color="${sk1}"/><stop offset="1" stop-color="${sk2}"/></linearGradient>
  <radialGradient id="${uid}g"><stop offset="0" stop-color="#FFE7A6" stop-opacity=".95"/><stop offset="1" stop-color="#FFE7A6" stop-opacity="0"/></radialGradient></defs>
  <rect width="240" height="340" fill="url(#${uid}w)"/>
  <path d="${win}" fill="url(#${uid}s)"/>
  <circle class="sc-sun" cx="150" cy="70" r="13" fill="${sun}" opacity=".9"/>${night ? `<circle cx="156" cy="66" r="11" fill="${sk1}"/><g class="sc-stars" fill="#FFF4DC"><circle cx="80" cy="50" r="1.4"/><circle cx="104" cy="36" r="1"/><circle cx="96" cy="72" r="1.2"/><circle cx="170" cy="100" r="1"/></g>` : ''}
  <path d="M44 128v-20h28v-10h12v16h10v-26h16v30h12v-12h14v22h12v-36h18v36h22v0z" fill="${night ? '#FFCF71' : fl}" opacity="${night ? .35 : .3}"/>
  <path d="${win}" fill="none" stroke="${fl}" stroke-width="6"/>
  <path d="${bars}" stroke="${fl}" stroke-width="4"/>
  <rect x="34" y="126" width="172" height="8" rx="3" fill="${fl}"/>
  <g class="sc-lamp"><path d="M206 0v44" stroke="${fl}" stroke-width="2"/><circle class="sc-glow" cx="206" cy="60" r="30" fill="url(#${uid}g)"/><path d="M192 56a14 14 0 0 1 28 0z" fill="${ac}"/></g>
  <rect y="200" width="240" height="140" fill="${fl}"/><rect y="200" width="240" height="4" fill="#000" opacity=".14"/>
  <g transform="translate(200 150)"><path d="M10 30C4 16 8 4 12-6c6 12 6 24 0 36z" fill="#7A8A4E"/><path d="M10 30C2 22-6 18-12 18c6 4 14 9 22 14z" fill="#8A9A5B"/><path d="M12 30c6-10 14-14 22-14-6 4-13 9-20 15z" fill="#8A9A5B"/><path d="M-2 30h26l-4 20H2z" fill="#B6771D"/></g>
  ${tag === 'Тухтай' ? prop : ''}
  <ellipse cx="120" cy="170" rx="56" ry="8" fill="#3E2A17"/><rect x="116" y="170" width="8" height="30" fill="#3E2A17"/><ellipse cx="120" cy="200" rx="22" ry="4" fill="#3E2A17"/>
  ${tag === 'Тухтай' ? '' : prop}
  <path d="M128 152h16v8a8 8 0 0 1-16 0z" fill="#FFF9EC" stroke="#3E2A17" stroke-width="2"/><path d="M144 154h3a3 3 0 0 1 0 6h-3" fill="none" stroke="#3E2A17" stroke-width="2"/>
  <path class="sc-steam" d="M133 146c-3-4 3-6 0-10M139 146c-3-4 3-6 0-10" fill="none" stroke="#FFF9EC" stroke-width="2" stroke-linecap="round"/>
 </svg>`;
}

// Higher is better for every sort; closed cafés are never recommended.
const REC_SORTS = [
  ['best', 'Танд', I.star, c => (freePct(c) ?? 30) * .5 + (c.sound ? (5 - c.sound) * 7 : 0) + (c.wifi || 0) * 6 - (c.walk ?? 20) * .5],
  ['seats', 'Сул суудал', I.seat, c => freePct(c) ?? -1],
  ['quiet', 'Нам гүм', ssGlyph(1), c => c.sound ? 6 - c.sound : 0],
  ['wifi', 'Wi-Fi', wifiSVG(3, 16), c => (c.wifi || 0) * 100 + (c.mbps || 0)],
  ['near', 'Ойрхон', I.walk, c => -(c.walk ?? 99)]
];
// Drawing ids (gradients, clip paths) must be unique in the page: the phone and desktop
// carousels can show the same café at once.
let uidSeq = 0;
function recCard(c, k, n, plain = false) {
  const uid = 'rc' + (++uidSeq), name = escapeHTML(c.name), opts = { staleAfterSec: platform.config?.sensor_stale_after_sec ?? 30 };
  // Walk time comes from the sample «Та энд» point, so it says so.
  const meta = c.walk != null ? walkText(c) : c.dist || '';
  const op = openState(c), seat = seatState(c, opts), wifi = wifiState(c);
  return `<article class="rc" style="--n:${n}" data-href="#cafe-${encodeURIComponent(c.id)}" aria-roledescription="санал болгох кафе" aria-label="${name}">
  <div class="rc-card">
   ${plain ? '' : `<div class="rc-roof">${roofSVG(k, n, uid)}</div>`}
   <div class="rc-body">
    ${platform.online && c.live?.mode !== 'demo' ? `<div class="rc-no-photo" aria-hidden="true">${I.cup}<span>Зураг оруулаагүй</span></div>` : sceneSVG(c, k, uid)}
    <span class="rc-open${c.open ? '' : ' off'}"><span class="olamp ${c.open ? 'on' : 'off'}" aria-hidden="true">${I.lamp}</span>${op.open ? 'Нээлттэй' : 'Хаалттай'}</span>
    <button class="heart rc-heart" data-fav="${escapeHTML(c.id)}" aria-pressed="${favs.has(c.id)}" aria-label="${name} хадгалах">${I.heart}</button>
    <div class="rc-info">
     ${meta ? `<span class="rc-kick">${I.pin}${escapeHTML(meta)}</span>` : ''}
     <h3>${name}</h3>
     <span class="rc-line rc-openl">${escapeHTML(op.text)}</span>
     ${c.open ? `<span class="rc-line rc-facts" title="${escapeHTML(seat.text + ' · ' + wifi.source)}">${I.seat}${escapeHTML(seat.short)} · ${escapeHTML(wifi.short)}</span>` : ''}
     <div class="rc-foot">${trustHTML(c, opts)}<a class="rc-more" href="#cafe-${encodeURIComponent(c.id)}" aria-label="${name} дэлгэрэнгүй">Дэлгэрэнгүй<i>${I.arr}</i></a></div>
    </div>
   </div>
  </div>
 </article>`;
}

/* ---------- page markup ---------- */
export function mobileHomeHTML() {
  return `<section class="mhome" aria-label="LiveSpace нүүр">
  ${lampsHTML()}
  <h1 class="mh-title"><span>Та суух <em>кафе</em> хайж байна уу?</span></h1>
  <form class="mh-search" id="mhs" role="search">
   <span class="mh-s-ic">${I.search}</span>
   <input id="mhq" aria-label="Кафе хайх" autocomplete="off" enterkeyhint="search" placeholder="Кафе хайх…">
   <button class="mh-go" type="submit">Хайх</button>
  </form>
  <div class="mh-rec">
   <div class="mh-rec-h"><h2 class="mh-h">Танд санал болгох</h2><button class="mh-help" type="button" data-tour aria-label="Хэрхэн ашиглах заавар">?</button><a href="#cafes">Бүгд ${I.arr}</a></div>
   <div class="mh-chips" role="tablist" aria-label="Санал болгох эрэмбэ">${REC_SORTS.map(([k, l, ic], i) => `<button class="mh-chip" type="button" role="tab" data-rec-sort="${k}" aria-selected="${i === 0}">${ic}${l}</button>`).join('')}</div>
   <div class="mh-track" tabindex="0" aria-label="Санал болгох кафенууд"></div>
   <div class="mh-dots" aria-hidden="true"></div>
  </div>
 </section>`;
}

/* ---------- behaviour ---------- */
// Pause a section's animations while it is scrolled out of view (class .offscreen in livespace.css).
export function pauseOffscreen(els) {
  if (!('IntersectionObserver' in window)) return () => { };
  const io = new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle('offscreen', !e.isIntersecting)));
  els.filter(Boolean).forEach(el => io.observe(el));
  return () => io.disconnect();
}
export function bindMobileHome(root, { cafes, onSearch }) {
  if (!root) return () => { };
  const off = [];
  const on = (el, type, fn, opts) => { el.addEventListener(type, fn, opts); off.push(() => el.removeEventListener(type, fn, opts)) };
  const index = new Map(cafes.map((c, k) => [c.id, k]));
  const track = $('.mh-track', root), dots = $('.mh-dots', root);

  // 1. Tap a lamp and it swings, its light flaring for a moment, with a soft chime.
  $$('.ml', root).forEach(lamp => {
    on(lamp, 'pointerdown', () => { lamp.classList.remove('ring'); void lamp.offsetWidth; lamp.classList.add('ring'); Snd.ui('chime') });
    on(lamp, 'animationend', e => { if (e.animationName === 'chRing') lamp.classList.remove('ring') });
  });

  // 2. Search, with a placeholder that types out example names until the field is used.
  const q = $('#mhq', root);
  on($('#mhs', root), 'submit', e => { e.preventDefault(); onSearch(q.value.trim()) });
  const examples = cafes.slice(0, 4).map(c => `«${c.name}»`);
  if (!Prefs.reduced && examples.length) {
    let ex = 0, ch = 0, dir = 1;
    const type = () => {
      if (document.activeElement === q || q.value) { q.placeholder = 'Кафе хайх…'; pageTasks.timeout(type, 1200); return }
      const word = examples[ex]; ch += dir; q.placeholder = 'Хайх: ' + word.slice(0, ch);
      if (ch >= word.length) { dir = -1; pageTasks.timeout(type, 1600); return }
      if (ch <= 0) { dir = 1; ex = (ex + 1) % examples.length }
      pageTasks.timeout(type, dir > 0 ? 90 : 40);
    };
    pageTasks.timeout(type, 700);
  }

  // 3. Recommendations: a snap carousel where the centred card is full size and its
  //    neighbours shrink and sit behind it.
  let sort = 'best', carFrame;
  const cards = () => $$('.rc', track);
  const layout = () => {
    carFrame = undefined;
    const tr = track.getBoundingClientRect(), mid = tr.left + tr.width / 2; let act = 0, best = Infinity;
    cards().forEach((el, i) => {
      const r = el.getBoundingClientRect(), d = (r.left + r.width / 2 - mid) / r.width, a = Math.min(Math.abs(d), 1.4);
      el.style.setProperty('--s', (1 - a * .13).toFixed(3));
      el.style.setProperty('--y', (a * 14).toFixed(1) + 'px');
      el.style.setProperty('--dim', (a * .45).toFixed(3));
      el.style.zIndex = String(20 - Math.round(a * 10));
      if (Math.abs(d) < best) { best = Math.abs(d); act = i }
    });
    cards().forEach((el, i) => el.classList.toggle('on', i === act));
    $$('i', dots).forEach((d, i) => d.classList.toggle('on', i === act));
  };
  const queue = () => { if (carFrame === undefined) carFrame = pageTasks.frame(layout) };
  // Card height: as tall as possible while the whole carousel (dots included) still ends
  // above the tab bar on the first screen. Measured, because the title, chips and roofs
  // take different heights on different phones. Run twice: card width follows height.
  let fitW = 0;
  const fit = () => {
    const body = $('.rc-body', track); if (!body || !isMobile()) return;
    fitW = innerWidth;
    for (let i = 0; i < 2; i++) {
      const tab = $('#tabbar'), tabH = tab && getComputedStyle(tab).display !== 'none' ? tab.offsetHeight : 0;
      let bottom = dots.offsetHeight; for (let el = dots; el; el = el.offsetParent) bottom += el.offsetTop; // ignores the entrance animation's offset
      root.style.setProperty('--bh', clamp(body.offsetHeight + innerHeight - tabH - 14 - bottom, 200, 440) + 'px');
    }
  };
  // Side padding that lets the first and last card reach the middle.
  const size = () => {
    const c = cards()[0]; if (!c) return;
    const pad = Math.max(0, (track.clientWidth - c.offsetWidth) / 2 - parseFloat(getComputedStyle(c).marginLeft || 0));
    track.style.paddingLeft = track.style.paddingRight = pad + 'px';
  };
  const renderRecs = () => {
    const fn = REC_SORTS.find(s => s[0] === sort)[3];
    const list = cafes.filter(c => c.open).sort((a, b) => fn(b) - fn(a)).slice(0, 5);
    track.innerHTML = list.length ? list.map((c, n) => recCard(c, index.get(c.id) ?? 0, n)).join('') : `<p class="mh-empty">Одоо нээлттэй кафе алга.</p>`;
    dots.innerHTML = list.map(() => '<i></i>').join('');
    if (!fitW) fit();
    size(); track.scrollLeft = 0;
    layout();
  };
  on(track, 'scroll', queue, { passive: true });
  // Only a width change refits: the phone's address bar showing/hiding must not resize cards.
  on(window, 'resize', () => { if (innerWidth !== fitW) fit(); size(); queue() });
  // Tapping a card that is not in the middle brings it to the middle instead of opening it.
  on(track, 'click', e => {
    const card = e.target.closest('.rc'); if (!card || card.classList.contains('on') || e.target.closest('button')) return;
    e.preventDefault(); e.stopPropagation();
    card.scrollIntoView({ behavior: Prefs.reduced ? 'auto' : 'smooth', block: 'nearest', inline: 'center' }); Snd.ui('tick');
  });
  $$('[data-rec-sort]', root).forEach(b => on(b, 'click', () => {
    sort = b.dataset.recSort; $$('[data-rec-sort]', root).forEach(x => x.setAttribute('aria-selected', x === b)); Snd.ui('click'); renderRecs();
  }));
  renderRecs();

  // The cards are dealt in once the section scrolls into view.
  const rec = $('.mh-rec', root);
  let io;
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { rec.classList.add('seen'); io.disconnect() } }, { threshold: .25 });
    io.observe(rec);
  } else rec.classList.add('seen');

  // 4. The tour: opens only from the "?" button. (Opening it by itself on the first visit
  //    made it the page's largest late paint and slowed the first load: Lighthouse LCP.)
  let tour = null;
  const startTour = () => { if (tour) tour.end(false); tour = createTour(root, () => { tour = null }) };
  on($('[data-tour]', root), 'click', () => { Snd.ui('pop'); startTour() });

  off.push(pauseOffscreen([rec, $('.mh-lamps', root)]));
  return () => { off.forEach(f => f()); if (io) io.disconnect(); if (tour) tour.end(false) };
}

/* ---------- one-at-a-time tour ---------- */
const STEPS = [
  ['.mh-search', I.search, 'Кафе хайх', 'Кафены нэрийг бичээд «Хайх» дарна. Олдсон кафе газрын зураг дээр нээгдэнэ.'],
  ['.mh-rec', I.star, 'Санал болгох кафе', 'Хажуу тийш гүйлгэж үзээрэй. Дээрх товчоор сул суудал, нам гүм, Wi-Fi-гаар эрэмбэлнэ. ♡ дарж хадгална.'],
  ['#tabbar [data-nav="explore"]', I.map, 'Газрын зураг', 'Ойролцоох бүх кафег газрын зураг дээрээс харж, сул суудал, дуу чимээ, Wi-Fi-гаар шүүх бол энд дараарай.']
];
function createTour(root, onDone) {
  const el = document.createElement('div');
  el.className = 'tour';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'tourT');
  el.innerHTML = `<div class="tour-spot"></div><div class="tour-b" aria-live="polite"><span class="tour-arrow"></span><div class="tour-c"></div>
  <div class="tour-f"><span class="tour-dots">${STEPS.map(() => '<i></i>').join('')}</span><button class="tour-skip" type="button">Алгасах</button><button class="tour-next" type="button"></button></div></div>`;
  document.body.appendChild(el);
  const spot = $('.tour-spot', el), bub = $('.tour-b', el), next = $('.tour-next', el);
  let i = -1, frame, ended = false;

  const target = () => $(STEPS[i][0]);
  const place = () => {
    frame = undefined; const t = target(); if (!t) return;
    const r = t.getBoundingClientRect(), pad = 8, vw = innerWidth, vh = innerHeight;
    Object.assign(spot.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    const bh = bub.offsetHeight, bw = bub.offsetWidth, hd = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hd')) || 56;
    const below = r.bottom + pad + 14 + bh < vh - 12;
    const top = below ? r.bottom + pad + 14 : Math.max(hd + 8, r.top - pad - 14 - bh);
    const left = clamp(r.left + r.width / 2 - bw / 2, 12, vw - bw - 12);
    bub.style.top = top + 'px'; bub.style.left = left + 'px';
    bub.classList.toggle('up', !below);
    bub.style.setProperty('--ax', clamp(r.left + r.width / 2 - left, 26, bw - 26) + 'px');
  };
  const queue = () => { if (frame === undefined) frame = requestAnimationFrame(place) };
  const go = n => {
    i = n; const [, ic, title, text] = STEPS[i];
    const c = $('.tour-c', el);
    c.innerHTML = `<span class="tour-ic">${ic}</span><div><small>${i + 1} / ${STEPS.length}</small><b id="tourT">${title}</b><p>${text}</p></div>`;
    c.classList.remove('swap'); void c.offsetWidth; c.classList.add('swap');
    $$('.tour-dots i', el).forEach((d, k) => d.classList.toggle('on', k <= i));
    next.textContent = i === STEPS.length - 1 ? 'Эхэлье!' : 'Дараах';
    const t = target();
    if (t && !t.closest('#tabbar')) t.scrollIntoView({ behavior: Prefs.reduced ? 'auto' : 'smooth', block: 'center' });
    queue(); setTimeout(queue, 420); next.focus({ preventScroll: true }); Snd.ui('tick');
  };
  const end = (finished = true) => {
    if (ended) return; ended = true;
    store.set('mhTour', true);
    removeEventListener('scroll', queue); removeEventListener('resize', onResize); removeEventListener('keydown', onKey);
    if (frame !== undefined) cancelAnimationFrame(frame);
    if (finished && !Prefs.reduced) { burst(bub); Snd.ui('chime') }
    el.classList.add('out');
    setTimeout(() => el.remove(), Prefs.reduced ? 0 : 380);
    onDone();
  };
  const onResize = () => { if (!isMobile()) end(false); else queue() };
  const onKey = e => { if (e.key === 'Escape') end(false); if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next.click() } };
  next.onclick = () => i < STEPS.length - 1 ? go(i + 1) : end(true);
  $('.tour-skip', el).onclick = () => end(false);
  addEventListener('scroll', queue, { passive: true }); addEventListener('resize', onResize); addEventListener('keydown', onKey);
  requestAnimationFrame(() => el.classList.add('in'));
  go(0);
  return { end };
}
// A little shower of coffee beans when the tour is finished.
function burst(from) {
  const r = from.getBoundingClientRect(), box = document.createElement('div');
  box.className = 'tour-burst'; box.style.left = r.left + r.width / 2 + 'px'; box.style.top = r.top + r.height / 2 + 'px';
  box.innerHTML = Array.from({ length: 14 }, (_, k) => { const a = k / 14 * Math.PI * 2, d = 70 + (k % 3) * 26; return `<i style="--tx:${(Math.cos(a) * d).toFixed(0)}px;--ty:${(Math.sin(a) * d).toFixed(0)}px;--rz:${k * 47}deg"></i>` }).join('');
  document.body.appendChild(box); setTimeout(() => box.remove(), 900);
}

/* ---------- desktop: «Танд санал болгох» ----------
   A simple carousel of café cards, each under its own rooftop, ordered like the phone
   carousel: by free seats, quiet, Wi-Fi or distance (the home page no longer asks for a goal). */
export function deskRecHTML() {
  return `<section class="sec drec" aria-labelledby="drecH">
  <div class="sec-h"><h2 id="drecH">Танд санал болгох</h2><p>Сул суудал, нам гүм, Wi-Fi эсвэл зайгаар эрэмбэлээрэй</p></div>
  <div class="drec-bar">
   <div class="drec-chips" role="tablist" aria-label="Санал болгох эрэмбэ">${REC_SORTS.map(([k, l, ic], i) => `<button class="mh-chip" type="button" role="tab" data-drec-sort="${k}" aria-selected="${i === 0}">${ic}${l}</button>`).join('')}</div>
   <div class="drec-nav"><button type="button" data-drec="-1" aria-label="Өмнөх">${I.arr}</button><button type="button" data-drec="1" aria-label="Дараах">${I.arr}</button></div>
  </div>
  <div class="drec-track" tabindex="0" aria-label="Санал болгох кафенууд"></div>
 </section>`;
}
export function bindDeskRec(root, { cafes }) {
  if (!root) return () => { };
  const track = $('.drec-track', root), index = new Map(cafes.map((c, k) => [c.id, k]));
  let sort = REC_SORTS[0][0];
  const render = () => {
    const fn = REC_SORTS.find(s => s[0] === sort)[3];
    const list = cafes.filter(c => c.open).sort((a, b) => fn(b) - fn(a));
    track.innerHTML = list.length ? list.map((c, n) => recCard(c, index.get(c.id) ?? 0, n)).join('') : `<p class="mh-empty">Одоо нээлттэй кафе алга.</p>`;
    track.scrollLeft = 0;
  };
  const off = [];
  const on = (el, t, fn) => { el.addEventListener(t, fn); off.push(() => el.removeEventListener(t, fn)) };
  $$('[data-drec-sort]', root).forEach(b => on(b, 'click', () => {
    sort = b.dataset.drecSort; $$('[data-drec-sort]', root).forEach(x => x.setAttribute('aria-selected', x === b)); Snd.ui('click'); render();
  }));
  $$('[data-drec]', root).forEach(b => on(b, 'click', () => {
    const card = $('.rc', track); if (!card) return;
    track.scrollBy({ left: +b.dataset.drec * (card.offsetWidth + 30) * 2, behavior: Prefs.reduced ? 'auto' : 'smooth' }); Snd.ui('tick');
  }));
  render();
  off.push(pauseOffscreen([root]));
  return () => off.forEach(f => f());
}
