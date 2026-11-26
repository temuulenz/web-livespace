import { $, $$, clamp, isMobile } from '../../dom.js';
import { I } from '../../icons.js';
import { Prefs } from '../../state.js';
import { store } from '../../storage.js';
import { Snd } from '../../audio.js';

/* ---------- one-at-a-time tour ---------- */
const STEPS = [
  ['.dis-search', I.search, 'Кафе хайх', 'Кафены нэрийг бичээд «Хайх» дарна. Олдсон кафе газрын зураг дээр нээгдэнэ.'],
  ['.dis-near', I.pin, 'Танд ойрхон кафе', 'Хамгийн ойр кафенууд газрын зураг дээр болон жагсаалтаар харагдана. Кафе дээр дарж дэлгэрэнгүйг үзнэ.'],
  ['#tabbar [data-nav="explore"]', I.map, 'Газрын зураг', 'Ойролцоох бүх кафег газрын зураг дээрээс харж, сул суудал, дуу чимээ, Wi-Fi-гаар шүүх бол энд дараарай.']
];
export function createTour(onDone) {
  const trigger = $('[data-dis-tour]');
  const el = document.createElement('div');
  el.className = 'tour';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'tourT');
  el.innerHTML = `<div class="tour-spot"></div><div class="tour-b" aria-live="polite"><span class="tour-arrow"></span><div class="tour-c"></div>
  <div class="tour-f"><span class="tour-dots">${STEPS.map(() => '<i></i>').join('')}</span><button class="tour-skip" type="button">Алгасах</button><button class="tour-next" type="button"></button></div></div>`;
  document.body.appendChild(el);
  const spot = $('.tour-spot', el), bub = $('.tour-b', el), next = $('.tour-next', el);
  let i = -1, frame, settle, ended = false;

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
    queue(); clearTimeout(settle); settle = setTimeout(queue, 420); next.focus({ preventScroll: true }); Snd.ui('tick');
  };
  const end = (finished = true) => {
    if (ended) return; ended = true;
    store.set('mhTour', true);
    removeEventListener('scroll', queue); removeEventListener('resize', onResize); removeEventListener('keydown', onKey);
    clearTimeout(settle);
    if (frame !== undefined) cancelAnimationFrame(frame);
    if (finished && !Prefs.reduced) { burst(bub); Snd.ui('chime') }
    el.classList.add('out');
    setTimeout(() => el.remove(), Prefs.reduced ? 0 : 380);
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    onDone();
  };
  const onResize = () => { if (!isMobile()) end(false); else queue() };
  const onKey = e => {
    if (e.key === 'Escape') end(false);
    if (e.key === 'ArrowRight') { e.preventDefault(); next.click() }
    if (e.key === 'Tab') {
      e.preventDefault();
      (document.activeElement === next ? $('.tour-skip', el) : next).focus();
    }
  };
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
