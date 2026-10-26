import { $, $$, clamp, rng, isMobile } from './dom.js';
import { I, pinSVG } from './icons.js';
import { SS, WIFI, getCafes, byId } from './cafes.js';
import { freePct, tone, toneVar } from './cafe-metrics.js';
import { Snd } from './audio.js';
import { seatRow, ssGlyph, wifiSVG } from './components/atmosphere.js';

const CAFES = getCafes();
const ROADS = [[[0, 150], [1000, 138], 22], [[0, 372], [1000, 308], 34], [[0, 525], [1000, 512], 22], [[120, 0], [110, 680], 20], [[300, 0], [318, 680], 22], [[560, 0], [548, 680], 30], [[760, 0], [770, 680], 20], [[935, 0], [925, 680], 24]];
let MAP_SVG = null;
function mapSVG() {
  if (MAP_SVG) return MAP_SVG; const r = rng(7); let s = '';
  const dseg = (px, py, [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay, t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1); return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) };
  const river = t => [685 + Math.sin(t * 5) * 26, t * 680];
  const zones = [[400, 170, 120, 90], [440, 560, 170, 110], [200, 560, 90, 90], [610, 520, 80, 70]];
  const inZone = (x, y, w, h) => zones.some(([zx, zy, zw, zh]) => x + w > zx - 8 && x < zx + zw + 8 && y + h > zy - 8 && y < zy + zh + 8);
  s += `<rect width="1000" height="680" fill="#EFE4CF"/>`;
  // park
  s += `<rect x="440" y="560" width="170" height="110" rx="18" fill="#E2D3B2"/><circle cx="525" cy="615" r="30" fill="none" stroke="#F6EBDA" stroke-width="7"/><path d="M440 615h55M555 615h55" stroke="#F6EBDA" stroke-width="7"/>`;
  // river
  let rp = 'M' + river(0).join(' '); for (let t = .02; t <= 1.001; t += .02)rp += ' L' + river(t).map(v => v.toFixed(1)).join(' ');
  s += `<path d="${rp}" stroke="#D3DCD8" stroke-width="20" fill="none" stroke-linecap="round"/><path d="${rp}" stroke="#E6ECE8" stroke-width="6" fill="none" stroke-dasharray="14 22"/>`;
  // roads
  ROADS.forEach(([a, b, w]) => { s += `<path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}" stroke="#B49E80" stroke-width="${w}" stroke-linecap="square"/>` });
  ROADS.forEach(([a, b, w]) => { if (w >= 26) s += `<path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}" stroke="#F4EFE4" stroke-width="2.5" stroke-dasharray="16 14"/>` });
  // plaza & landmarks
  s += `<rect x="400" y="170" width="120" height="90" rx="6" fill="#F6EBDA" stroke="#D9C3A0" stroke-width="2"/><rect x="420" y="186" width="80" height="36" rx="4" fill="#FBF7F0" stroke="#D9C3A0"/><circle cx="460" cy="242" r="7" fill="#9C6B36"/>`;
  s += `<circle cx="245" cy="605" r="36" fill="#C08A4A"/><g stroke="#F6EBDA" stroke-width="2.5">${[0, 1, 2, 3, 4, 5].map(i => `<path d="M245 605L${245 + Math.cos(i * Math.PI / 3) * 34} ${605 + Math.sin(i * Math.PI / 3) * 34}"/>`).join('')}</g><circle cx="245" cy="605" r="9" fill="#F6EBDA"/>`;
  s += `<rect x="615" y="525" width="70" height="60" rx="5" fill="#D9B07A" stroke="#B6771D" stroke-width="2"/><rect x="633" y="540" width="34" height="26" fill="#7B542F"/><circle cx="650" cy="547" r="5" fill="#FFCF71"/>`;
  // buildings
  const cols = ['#F6EBDA', '#EBD5B3', '#E2C497', '#D9B07A', '#F3E1C0', '#CFA36B', '#FBEEDC', '#E6CFA8']; const B = [];
  for (let i = 0; i < 900 && B.length < 150; i++) {
    const w = 20 + r() * 30, h = 16 + r() * 22, x = r() * (1000 - w), y = r() * (680 - h), cx = x + w / 2, cy = y + h / 2; const half = Math.hypot(w, h) / 2;
    if (ROADS.some(([a, b, rw]) => dseg(cx, cy, a, b) < half + rw / 2 + 4)) continue; if (Math.abs(river(cy / 680)[0] - cx) < half + 16) continue; if (inZone(x, y, w, h)) continue;
    if (CAFES.some(c => Math.abs(c.x - cx) < w / 2 + 22 && c.y - cy < h / 2 + 52 && cy - c.y < h / 2 + 30)) continue;
    if (B.some(o => x < o[0] + o[2] + 6 && x + w > o[0] - 6 && y < o[1] + o[3] + 6 && y + h > o[1] - 6)) continue; B.push([x, y, w, h, cols[Math.floor(r() * cols.length)]])
  }
  B.forEach(([x, y, w, h, c]) => { s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${c}"/><rect x="${x.toFixed(1)}" y="${(y + h * .62).toFixed(1)}" width="${w.toFixed(1)}" height="${(h * .38).toFixed(1)}" fill="#000" opacity=".08"/>`; if (w > 28) { for (let k = x + 5; k < x + w - 5; k += 7)s += `<rect x="${k.toFixed(1)}" y="${(y + h * .7).toFixed(1)}" width="3.5" height="3.5" fill="#fff" opacity=".7"/>` } });
  // trees
  for (let i = 0, n = 0; i < 500 && n < 90; i++) { const x = r() * 1000, y = r() * 680; if (ROADS.some(([a, b, rw]) => dseg(x, y, a, b) < rw / 2 + 8)) continue; if (Math.abs(river(y / 680)[0] - x) < 18) continue; if (B.some(o => x > o[0] - 6 && x < o[0] + o[2] + 6 && y > o[1] - 6 && y < o[1] + o[3] + 6)) continue; if (CAFES.some(c => Math.abs(c.x - x) < 26 && c.y - y < 54 && y - c.y < 30)) continue; const rr = 5 + r() * 4; s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rr.toFixed(1)}" fill="#CDB487"/><circle cx="${(x - 1.5).toFixed(1)}" cy="${(y - 1.5).toFixed(1)}" r="${(rr * .5).toFixed(1)}" fill="#DCC7A0"/>`; n++ }
  // labels
  const lab = (x, y, t, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="${-t.length * 3.3 - 8}" y="-10" width="${t.length * 6.6 + 16}" height="20" rx="10" fill="#fff" opacity=".92"/><text text-anchor="middle" y="4" font-family="Manrope,sans-serif" font-size="11" font-weight="700" fill="#5E3F22">${t}</text></g>`;
  s += lab(460, 160, 'Сүхбаатарын талбай') + lab(180, 148, 'Жамъян гүний гудамж', -1) + lab(160, 358, 'Энхтайваны өргөн чөлөө', -3.7) + lab(553, 40, 'Чингисийн өргөн чөлөө', 90) + lab(245, 655, 'Улсын цирк') + lab(525, 575, 'Үндэсний парк') + lab(650, 505, 'Чойжин ламын сүм') + lab(930, 90, 'Их тойруу', 90);
  // you are here
  s += `<g transform="translate(575 292)"><circle class="you" r="18" fill="#1A73E8" opacity=".18"/><circle r="9" fill="#1A73E8" stroke="#fff" stroke-width="3"/></g><text x="594" y="296" font-family="Manrope" font-size="12" font-weight="800" fill="#1A73E8">Та энд</text>`;
  MAP_SVG = `<svg class="base" viewBox="0 0 1000 680" aria-hidden="true"><style>.you{animation:you 2.2s ease-out infinite;transform-origin:center;transform-box:fill-box}@keyframes you{0%{transform:scale(.5);opacity:.5}100%{transform:scale(1.8);opacity:0}}</style>${s}</svg>`; return MAP_SVG
}
function markerHTML(c) {
  const t = tone(c); const pd = { q: '3.4s', b: '2.4s', y: '1.5s' }[t] || '0s';
  return `<button class="mk${c.open ? '' : ' closed'}" data-mk="${c.id}" style="left:${c.x}px;top:${c.y}px;--pc:${toneVar(t)};--pd:${pd}" aria-label="${c.name}: ${c.open ? freePct(c) + '% суудал сул, ' + SS[c.sound].short + ' дуу, Wi-Fi ' + WIFI[c.wifi] : 'хаалттай'}">
  <span class="mk-name">${c.name}</span>
  <span class="mk-pinw">${c.open ? '<span class="mk-ring"></span>' : ''}${pinSVG(c.open ? '#FF9D00' : '#C9C2B4')}</span>
  <span class="mk-pill">${seatRow(c.occ)}<span class="sep"></span><span class="sg">${ssGlyph(c.sound)}</span><span class="sep"></span>${wifiSVG(c.wifi, 15)}</span>
 </button>`}
function buildMap(vp, { interactive = true, onSelect = null, focus = null } = {}) {
  vp.insertAdjacentHTML('beforeend', `<div class="map-inner">${mapSVG()}<div class="mk-layer">${CAFES.map(markerHTML).join('')}</div></div>`);
  const markers = $$('.mk', vp), markerById = new Map(markers.map(marker => [marker.dataset.mk, marker]));
  const events = new AbortController();
  const listen = (element, type, callback, options = {}) => element.addEventListener(type, callback, { ...options, signal: events.signal });
  const inner = $('.map-inner', vp); const st = { s: 1, x: 0, y: 0, base: 1 }; let pvEl = null;
  const sc = () => st.base * st.s;
  function clampXY() { const w = vp.clientWidth, h = vp.clientHeight, W = 1000 * sc(), H = 680 * sc(); st.x = W <= w ? (w - W) / 2 : clamp(st.x, w - W, 0); st.y = H <= h ? (h - H) / 2 : clamp(st.y, h - H, 0) }
  function apply(ease) { inner.classList.toggle('ease', !!ease); clampXY(); inner.style.transform = `translate(${st.x}px,${st.y}px) scale(${sc()})`; inner.style.setProperty('--inv', (1 / sc()).toFixed(3)); placePv() }
  function fit() { const w = vp.clientWidth, h = vp.clientHeight; if (!w) return; const prev = sc(); st.base = Math.max(w / 1000, h / 680); if (!fit.done) { st.x = (w - 1000 * sc()) / 2; st.y = (h - 680 * sc()) / 2; fit.done = true } apply() }
  function centerOn(x, y, zoom) { if (zoom) st.s = Math.max(st.s, zoom); const w = vp.clientWidth, h = vp.clientHeight; const offY = isMobile() ? -h * .18 : 0; st.x = w / 2 - x * sc() + (isMobile() ? 0 : 60); st.y = h / 2 - y * sc() + offY; apply(true) }
  function zoomBy(f, cx, cy) { const w = vp.clientWidth, h = vp.clientHeight; cx = cx ?? w / 2; cy = cy ?? h / 2; const old = sc(); st.s = clamp(st.s * f, 1, 3); const k = sc() / old; st.x = cx - (cx - st.x) * k; st.y = cy - (cy - st.y) * k; apply(true) }
  function placePv() { if (!pvEl || !pvEl.isConnected || isMobile()) return; const c = byId(pvEl.dataset.id); if (!c) return; const px = st.x + c.x * sc(), py = st.y + c.y * sc(); const w = vp.clientWidth, h = vp.clientHeight, pw = pvEl.offsetWidth, ph = pvEl.offsetHeight; let left = px + 34, ox = '0px'; if (left + pw > w - 12) { left = px - 34 - pw; ox = '100%' } left = clamp(left, 12, w - pw - 12); const top = clamp(py - ph / 2 - 20, 12, h - ph - 12); pvEl.style.left = left + 'px'; pvEl.style.top = top + 'px'; pvEl.style.setProperty('--ox', ox) }
  let drag = null, moved = false;
  if (interactive) {
    listen(vp, 'pointerdown', e => { if (e.target.closest('.map-ctrl,.pv,.map-legend,.map-note')) return; drag = { x: e.clientX, y: e.clientY, sx: st.x, sy: st.y, id: e.pointerId }; moved = false });
    listen(vp, 'pointermove', e => { if (!drag || drag.id !== e.pointerId) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (!moved && Math.hypot(dx, dy) > 5) { moved = true; vp.classList.add('drag'); try { vp.setPointerCapture(e.pointerId) } catch (_) { } } if (moved) { st.x = drag.sx + dx; st.y = drag.sy + dy; apply() } });
    const end = () => { drag = null; vp.classList.remove('drag') }; listen(vp, 'pointerup', end); listen(vp, 'pointercancel', end);
    listen(vp, 'wheel', e => { e.preventDefault(); const r = vp.getBoundingClientRect(); zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top) }, { passive: false });
    vp.insertAdjacentHTML('beforeend', `<div class="map-ctrl"><button data-z="in" aria-label="Томруулах">${I.plus}</button><button data-z="out" aria-label="Жижигрүүлэх">${I.minus}</button><button data-z="me" aria-label="Миний байршил">${I.locate}</button></div>`);
    listen($('.map-ctrl', vp), 'click', e => { const b = e.target.closest('button'); if (!b) return; Snd.ui('click'); if (b.dataset.z === 'in') zoomBy(1.3); else if (b.dataset.z === 'out') zoomBy(1 / 1.3); else { st.s = 1.4; centerOn(575, 292) } });
  }
  listen($('.mk-layer', vp), 'click', e => { const m = e.target.closest('.mk'); if (!m || moved) return; e.stopPropagation(); onSelect && onSelect(m.dataset.mk, 'map') });
  if (interactive) listen(vp, 'click', e => { if (moved || e.target.closest('.mk,.pv,.map-ctrl,.map-legend,.map-note')) return; onSelect && onSelect(null, 'map') });
  const ro = new ResizeObserver(fit); ro.observe(vp); fit();
  return { fit, centerOn, setPv(el) { pvEl = el; placePv() }, select(id) { markers.forEach(m => m.classList.toggle('sel', m.dataset.mk === id)) }, hover(id, on) { const m = markerById.get(id); m && m.classList.toggle('hov', on) }, dim(set) { markers.forEach(m => m.classList.toggle('dim', !set.has(m.dataset.mk))) }, hits(set) { markers.forEach(m => m.classList.toggle('hit', !!set && set.has(m.dataset.mk))) }, destroy() { ro.disconnect(); events.abort(); pvEl = null; drag = null } }
}

export { buildMap };
