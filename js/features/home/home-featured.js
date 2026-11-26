// Онцлох кафены слайд (нүүр хуудас). Зөвхөн зурагтай, идэвхтэй кафе (home-data.js · featuredCafes).
// ~6 сек тутам автоматаар солигдоно; хулгана/фокус дээр, таб нуугдсан, цонх/модал нээлттэй,
// «Хөдөлгөөн багасгах» эсвэл prefers-reduced-motion үед зогсоно. Утсан дээр шудрахад солигдоно.
import { escapeHTML as esc, patch } from '../../../framework/index.js';
import { $ } from '../../dom.js';
import { Prefs } from '../../state.js';
import { Snd } from '../../audio.js';
import { toast } from '../../components/feedback.js';
import { photosOf } from './cafe-photos.js';
import { featuredCafes, featureTags, distanceText } from './home-data.js';
import { badgeHTML, occHTML, tagsHTML, cafeLink } from './home-parts.js';

const STEP_MS = 6000, TICK_MS = 500;

// «Очих»: кафены хуудасны урсгалтай ижил (утсаар нэвтрэх → ирэх хугацаа → урьдчилсан захиалга).
async function startGoing(cafe) {
  Snd.ui('click');
  const [{ openGoingFlow }, { customer }, { openPhoneAuth }] = await Promise.all([
    import('../going/going.js'), import('../../services/customer-adapter.js'), import('../authentication/phone-auth.js')]);
  const open = async () => openGoingFlow(cafe, await customer.menu.list(cafe.id), () => { });
  const active = async () => (await customer.going.active()) != null;
  if (!(await customer.auth.current())) { openPhoneAuth({ reason: 'going', onSuccess: async () => { if (!(await active())) open(); } }); return; }
  if (await active()) { toast('Танд идэвхтэй «Очих» байна. Нэг удаад нэг л газар очихоор бүртгүүлнэ.'); return; }
  open();
}

export function bindFeatured(box, { cafes, ctxOf, ratingOf, motion }) {
  const ac = new AbortController(), { signal } = ac;
  const on = (el, type, fn, opts = {}) => el.addEventListener(type, fn, { ...opts, signal });
  let list = [], index = 0, photo = 0, paused = false, hover = false, visible = true, elapsed = 0, announce = false, touch = null;
  const reduced = () => Prefs.reduced || motion.matches;
  const current = () => list[index];

  function step(dir, manual = false) {
    const c = current(); if (!c) return;
    const photos = photosOf(c);
    if (list.length > 1) { index = (index + dir + list.length) % list.length; photo = 0; }
    else if (photos.length > 1) photo = (photo + dir + photos.length) % photos.length;
    else return;
    elapsed = 0; announce = manual; draw();
  }

  function draw() {
    const c = current();
    box.hidden = !c;
    if (!c) { box.innerHTML = ''; return; }
    const photos = photosOf(c), { live: x, km } = ctxOf(c), rating = ratingOf(c);
    photo = Math.min(photo, photos.length - 1);
    const p = photos[photo];
    const loc = [c.district, distanceText(km), rating != null ? `★ ${rating.toFixed(1)}` : ''].filter(Boolean).map(esc).join(' · ');
    const desc = c.description || c.note || '';
    const next = list.length > 1 ? list[(index + 1) % list.length] : null;
    const canStep = list.length > 1 || photos.length > 1;
    const auto = !reduced() && canStep;
    patch(box, `<section class="hm-feat" data-key="feat" aria-roledescription="карусель" aria-label="Онцлох кафе">
      <div class="hm-fimg">
        <img class="hm-fmain" src="${esc(p.src)}" alt="${esc(p.alt)}" fetchpriority="high" decoding="async" width="1400" height="1050">
        <span class="hm-flabel">★ Онцлох кафе</span>
        ${photos.length > 1 ? `<div class="hm-fthumbs" role="group" aria-label="${esc(c.name)} зургууд">${photos.slice(0, 4).map((ph, i) => `<button type="button" data-hm-photo="${i}" aria-pressed="${i === photo}" aria-label="${i + 1}-р зураг"><img src="${esc(ph.small)}" alt="" decoding="async"></button>`).join('')}</div>` : ''}
        ${canStep ? `<button type="button" class="hm-arr l" data-hm-step="-1" aria-label="Өмнөх">‹</button><button type="button" class="hm-arr r" data-hm-step="1" aria-label="Дараах">›</button>` : ''}
      </div>
      <div class="hm-finfo" aria-live="${announce ? 'polite' : 'off'}">
        ${badgeHTML(x, 'hm-badge2')}
        <h2><a href="${cafeLink(c)}">${esc(c.name)}</a></h2>
        ${loc ? `<p class="hm-loc">${loc}</p>` : ''}
        ${desc ? `<p class="hm-desc">${esc(desc)}</p>` : ''}
        ${occHTML(x, 'hm-occ2')}
        ${tagsHTML(featureTags(c), 'hm-ftags')}
        <div class="hm-fbtns"><button type="button" class="hm-b1" data-hm-go>☕ Очих</button><a class="hm-b2" href="${cafeLink(c)}">Дэлгэрэнгүй</a></div>
        <div class="hm-fdots">${list.length > 1 ? list.map((f, i) => `<button type="button" data-hm-dot="${i}" aria-label="${esc(f.name)}" aria-current="${i === index}"></button>`).join('') : ''}
          ${auto ? `<button type="button" class="hm-pause" data-hm-pause aria-label="${paused ? 'Автомат солилтыг үргэлжлүүлэх' : 'Автомат солилтыг зогсоох'}">${paused ? '▶' : 'Ⅱ'}</button>` : ''}
          ${next ? `<button type="button" class="hm-next" data-hm-step="1">Дараагийнх: ${esc(next.name)} →</button>` : ''}</div>
      </div></section>`);
    announce = false;
  }

  function refresh() {
    const id = current()?.id;
    list = featuredCafes(cafes, photosOf, ctxOf);
    const at = list.findIndex(c => c.id === id);
    if (at >= 0) index = at; else { index = 0; photo = 0; }
    draw();
  }

  on(box, 'click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.hmStep) step(+b.dataset.hmStep, true);
    else if (b.dataset.hmDot) { index = +b.dataset.hmDot; photo = 0; elapsed = 0; announce = true; draw(); }
    else if (b.dataset.hmPhoto) { photo = +b.dataset.hmPhoto; elapsed = 0; draw(); }
    else if (b.hasAttribute('data-hm-pause')) { paused = !paused; draw(); box.querySelector('[data-hm-pause]')?.focus(); }
    else if (b.hasAttribute('data-hm-go') && current()) startGoing(current()).catch(() => toast('«Очих»-ыг нээж чадсангүй. Дахин оролдоно уу.'));
  });
  on(box, 'keydown', e => { if (e.target.closest('input,select,textarea')) return; if (e.key === 'ArrowLeft') step(-1, true); if (e.key === 'ArrowRight') step(1, true); });
  on(box, 'pointerenter', e => { if (e.pointerType === 'mouse') hover = true; });
  on(box, 'pointerleave', e => { if (e.pointerType === 'mouse') hover = false; });
  on(box, 'touchstart', e => { if (e.touches.length !== 1 || e.target.closest('button')) return; const t = e.touches[0]; touch = { x: t.clientX, y: t.clientY, id: t.identifier }; }, { passive: true });
  on(box, 'touchcancel', () => { touch = null; });
  on(box, 'touchend', e => {
    const start = touch; touch = null;
    const t = start && [...e.changedTouches].find(x => x.identifier === start.id); if (!t) return;
    const dx = t.clientX - start.x, dy = t.clientY - start.y;
    if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1, true);
  });
  on(motion, 'change', draw);
  const io = new IntersectionObserver(entries => { visible = entries.some(e => e.isIntersecting); });
  io.observe(box);
  const timer = setInterval(() => {
    const blocked = paused || hover || touch || !visible || document.hidden || reduced() || box.contains(document.activeElement) || $('#modal .mdl');
    if (blocked) { elapsed = 0; return; }
    elapsed += TICK_MS;
    if (elapsed >= STEP_MS) step(1);
  }, TICK_MS);

  refresh();
  return { refresh, destroy() { ac.abort(); clearInterval(timer); io.disconnect(); } };
}
