// Admin layout editor: pick a look and arrange the café — the room as well as the furniture.
// Every object can be dragged on the plan: tables with their chairs, single chairs, sofas,
// the window bar, shelves, plants, the rug and the order counter (anywhere on the floor);
// the entrance and the windows slide along any wall; corners can be cut away for an L- or
// U-shaped room; an optional VIP room is booked separately. A new look is a template
// recoloured. The result is saved as { preset, overrides, look } (js/simulation/layouts.js)
// and drawn by the same FloorPlan engine visitors see, so the preview is what gets published.
import { FloorPlan, THEMES, lookTheme, doorOf, windowsOf } from '../../simulation/floor-plan.js';
import { LAYOUTS, LAYOUT_IDS, resolveLayout, arrangementOf } from '../../simulation/layouts.js';
import { clamp } from '../../dom.js';
import { Snd } from '../../audio.js';
import { store } from '../../storage.js';
import { escapeHTML } from '../../../framework/index.js';

const TEMPLATE_TEXT = { minimal: 'Цэвэр, цайвар өнгө, нимгэн шугам', artistic: 'Өнгөлөг, чимэглэл, гэрэлтүүлэгтэй' };
const ROUND_DIRS = ['NESW', 'NS', 'EW', 'NES', 'N'];
const CHAIR_DIRS = ['N', 'E', 'S', 'W'];
const ADD = [['round', 'Дугуй ширээ'], ['long', 'Урт ширээ'], ['sofa', 'Буйдан'], ['chair', 'Сандал'], ['plant', 'Ургамал'], ['shelf', 'Тавиур'], ['rug', 'Хивс']];
const ADD_ROOM = [['window', 'Цонх'], ['cut', 'Булан тайрах'], ['vip', 'VIP өрөө']];
const NAMES = { round: 'Дугуй ширээ', long: 'Урт ширээ', sofa: 'Буйдан', chair: 'Сандал', plant: 'Ургамал', shelf: 'Тавиур', bar: 'Цонхны баар', counter: 'Захиалгын лангуу', rug: 'Хивс', door: 'Орц (хаалга)', window: 'Цонх', cut: 'Тайрсан булан', vip: 'VIP өрөө' };
const LIST = { round: 'round', long: 'long', sofa: 'sofas', chair: 'chairs', plant: 'plants', shelf: 'shelves', window: 'windows', cut: 'cuts' };
const LOOK_FIELDS = [['floor', 'Шал'], ['wall', 'Хана'], ['wood', 'Ширээ, мод'], ['sofa', 'Буйдан'], ['plant', 'Ургамал'], ['accent', 'Онцлох өнгө']];
const FLOORS = [['tiles', 'Хавтан'], ['terrazzo', 'Терраццо'], ['wood', 'Модон шал']];
const copy = value => JSON.parse(JSON.stringify(value));
const presetId = layout => LAYOUTS[layout?.preset] && layout.preset !== 'legacy' ? layout.preset : resolveLayout(layout).theme === 'artistic' ? 'artistic' : 'minimal';
const horizontal = side => side === 'top' || side === 'bottom';
// The wall nearest to a point, and the position along it.
function snapWall(x, y) {
  const d = [['top', y - 24], ['bottom', 500 - y], ['left', x - 24], ['right', 776 - x]].sort((a, b) => a[1] - b[1])[0][0];
  return { side: d, along: horizontal(d) ? x : y };
}
const wallPoint = (side, at) => ({ top: [at, 24], bottom: [at, 500], left: [24, at], right: [776, at] }[side]);

// Object bounds in world units: [x0, y0, x1, y1] (chairs, stools and coffee tables included).
function bounds(L, kind, i) {
  if (kind === 'round') { const t = L.round[i]; return [t.x - 50, t.y - 50, t.x + 50, t.y + 50]; }
  if (kind === 'long') { const t = L.long[i]; return [t.x, t.y - 30, t.x + t.w, t.y + 66]; }
  if (kind === 'sofa') { const f = L.sofas[i]; return [f.x, Math.min(f.y - 4, f.table ? f.table[1] - 15 : f.y), f.x + f.w, f.y + 32]; }
  if (kind === 'chair') { const c = L.chairs[i]; return [c.x - 13, c.y - 13, c.x + 13, c.y + 13]; }
  if (kind === 'plant') { const [x, y, r] = L.plants[i]; return [x - r, y - r, x + r, y + r]; }
  if (kind === 'shelf') { const b = L.shelves[i]; return [b.x, b.y, b.x + b.w, b.y + b.h]; }
  if (kind === 'bar') { const b = L.windowBar; return [b.x, 30, b.x + b.w, 90]; }
  if (kind === 'counter') { const c = L.counter; return [c.x, c.y, c.x + 176, c.y + 226]; }
  if (kind === 'rug') { const [x, y, w, h] = L.rug; return [x, y, x + w, y + h]; }
  if (kind === 'door') { const { side, at } = doorOf(L); return { top: [at - 30, 16, at + 30, 56], bottom: [at - 30, 468, at + 30, 508], left: [16, at - 30, 56, at + 30], right: [744, at - 30, 784, at + 30] }[side]; }
  if (kind === 'window') { const { side, a, b } = L.windows[i]; return { top: [a, 14, b, 40], bottom: [a, 484, b, 510], left: [14, a, 40, b], right: [760, a, 786, b] }[side]; }
  if (kind === 'cut') { const [x, y, w, h] = L.cuts[i]; return [x, y, x + w, y + h]; }
  if (kind === 'vip') { const v = L.vip; return [v.x, v.y, v.x + v.w, v.y + v.h]; }
}
// Everything that can be picked, most specific first (a chair before the rug or room under it).
function objects(L) {
  const out = [['door', 0]];
  L.windows.forEach((_, i) => out.push(['window', i]));
  L.chairs.forEach((_, i) => out.push(['chair', i]));
  L.plants.forEach((_, i) => out.push(['plant', i]));
  L.round.forEach((_, i) => out.push(['round', i]));
  L.long.forEach((_, i) => out.push(['long', i]));
  L.sofas.forEach((_, i) => out.push(['sofa', i]));
  L.shelves.forEach((_, i) => out.push(['shelf', i]));
  if (L.windowBar) out.push(['bar', 0]);
  out.push(['counter', 0]);
  if (L.rug) out.push(['rug', 0]);
  if (L.vip) out.push(['vip', 0]);
  (L.cuts || []).forEach((_, i) => out.push(['cut', i]));
  return out;
}
// Move an object by (dx, dy) from its state `from`, keeping it inside the walls.
function place(L, kind, i, from, dx, dy) {
  if (kind === 'door' || kind === 'window') {
    const len = kind === 'door' ? 60 : from.b - from.a, mid = kind === 'door' ? from.at : (from.a + from.b) / 2;
    const [px, py] = wallPoint(from.side, mid), { side, along } = snapWall(px + dx, py + dy), max = horizontal(side) ? 776 : 500;
    const c = Math.round(clamp(along, 24 + len / 2 + (kind === 'door' ? 6 : 0), max - len / 2 - (kind === 'door' ? 6 : 0)));
    return kind === 'door' ? { side, at: c } : { side, a: c - len / 2, b: c + len / 2 };
  }
  const tmp = { ...L }; if (LIST[kind]) tmp[LIST[kind]] = [...L[LIST[kind]]]; setObj(tmp, kind, i, from);
  const [x0, y0, x1, y1] = bounds(tmp, kind, i);
  // The order counter may stand anywhere; its queue spot (left of it) stays on the floor.
  if (kind === 'counter') { dx = clamp(dx, 28 - x0, 600 - x0); dy = clamp(dy, 24 - y0, 246 - y0); }
  else if (kind === 'cut' || kind === 'vip') { dx = clamp(dx, 24 - x0, 776 - x1); dy = clamp(dy, 24 - y0, 500 - y1); }
  else { dx = clamp(dx, 28 - x0, 772 - x1); dy = kind === 'bar' ? 0 : clamp(dy, 28 - y0, 500 - y1); }
  dx = Math.round(dx); dy = Math.round(dy);
  const o = copy(from);
  if (kind === 'round' || kind === 'chair' || kind === 'shelf' || kind === 'counter' || kind === 'vip') { o.x += dx; o.y += dy; }
  else if (kind === 'long') { o.x += dx; o.y += dy; o.seats = o.seats.map(v => v + dx); if (o.label) o.label = [o.label[0] + dx, o.label[1] + dy]; }
  else if (kind === 'sofa') { o.x += dx; o.y += dy; o.seats = o.seats.map(v => v + dx); if (o.table) o.table = [o.table[0] + dx, o.table[1] + dy]; if (o.label) o.label = [o.label[0] + dx, o.label[1] + dy]; }
  else if (kind === 'bar') { o.x += dx; o.stools = o.stools.map(v => v + dx); o.label = [o.label[0] + dx, o.label[1]]; }
  else if (kind === 'plant' || kind === 'rug' || kind === 'cut') { o[0] += dx; o[1] += dy; }
  return o;
}
function getObj(L, kind, i) { return kind === 'bar' ? L.windowBar : kind === 'counter' ? L.counter : kind === 'rug' ? L.rug : kind === 'door' ? doorOf(L) : kind === 'vip' ? L.vip : L[LIST[kind]][i]; }
function setObj(L, kind, i, value) { if (kind === 'bar') L.windowBar = value; else if (kind === 'counter') L.counter = value; else if (kind === 'rug') L.rug = value; else if (kind === 'door') L.door = value; else if (kind === 'vip') L.vip = value; else L[LIST[kind]][i] = value; }
// Grow or shrink a sized object, keeping it on the floor.
function resize(L, kind, i, f) {
  if (kind === 'window') { const w = L.windows[i], max = horizontal(w.side) ? 776 : 500, mid = (w.a + w.b) / 2, len = clamp(Math.round((w.b - w.a) * f / 10) * 10, 40, 300); L.windows[i] = { side: w.side, a: Math.round(clamp(mid - len / 2, 24, max - len)), b: 0 }; L.windows[i].b = L.windows[i].a + len; return true; }
  const box = kind === 'cut' ? L.cuts[i] : kind === 'vip' ? [L.vip.x, L.vip.y, L.vip.w, L.vip.h] : kind === 'rug' ? L.rug : null; if (!box) return false;
  const [x, y, w, h] = box, min = kind === 'vip' ? [120, 100] : [40, 40];
  const nw = Math.round(clamp(w * f, min[0], 776 - x)), nh = Math.round(clamp(h * f, min[1], 500 - y));
  if (kind === 'vip') Object.assign(L.vip, { w: nw, h: nh }); else box.splice(2, 2, nw, nh);
  return true;
}

export class LayoutEditor {
  constructor(root, { layout, cafe, onChange = () => { } }) {
    this.root = root; this.cafe = cafe; this.onChange = onChange; this.sel = null; this.hover = null; this.drag = null; this.frame = 0;
    this.preset = presetId(layout); this.look = layout?.look || null; this.L = this.load(layout || { preset: this.preset });
    this.events = new AbortController();
    root.innerHTML = `<div class="le">
      <div class="le-templates" role="radiogroup" aria-label="Загвар" data-le-looks></div>
      <div class="le-look" data-le-lookform hidden></div>
      <div class="le-tools"><span class="le-lab">Нэмэх</span>${ADD.map(([k, l]) => `<button type="button" class="chip" data-le-add="${k}">+ ${l}</button>`).join('')}</div>
      <div class="le-tools"><span class="le-lab">Өрөө</span>${ADD_ROOM.map(([k, l]) => `<button type="button" class="chip" data-le-add="${k}">+ ${l}</button>`).join('')}<small class="muted le-note">Орц, цонхыг чирж дурын хананд шилжүүлнэ. <b>Урьдчилан харах:</b> өрөөний тохиргоо (орц, цонх, булан, VIP өрөө) болон шинэ загварыг сервер одоогоор хадгалахгүй.</small></div>
      <div class="le-tools le-sel"><span class="le-lab" data-le-name>Объект сонгоогүй</span>
        <button type="button" class="chip" data-le-act="rotate">Эргүүлэх</button><button type="button" class="chip" data-le-act="grow">Томсгох</button><button type="button" class="chip" data-le-act="shrink">Жижигрүүлэх</button><button type="button" class="chip" data-le-act="sensor">Мэдрэгчтэй эсэх</button><button type="button" class="chip le-del" data-le-act="delete">Устгах</button>
        <button type="button" class="btn btn-g le-reset" data-le-act="reset">Загварын анхны байрлал</button></div>
      <div class="plan-wrap le-plan" tabindex="0" aria-label="Кафены зураглал засах: объектыг чирж байрлуулна, сумаар хөдөлгөнө, Delete товчоор устгана"></div>
      <p class="le-hint" data-le-hint aria-live="polite"></p></div>`;
    this.wrap = root.querySelector('.le-plan');
    this.fp = new FloorPlan(this.wrap, { id: cafe.id, name: cafe.name, occ: 0 }, { layout: this.L, editor: true, overlay: ctx => this.overlay(ctx) });
    const on = (el, type, fn) => el.addEventListener(type, fn, { signal: this.events.signal });
    on(root, 'click', e => this.click(e));
    on(root, 'input', e => this.lookInput(e));
    on(this.fp.cv, 'pointerdown', e => this.down(e));
    on(this.fp.cv, 'pointermove', e => this.move(e));
    on(this.fp.cv, 'pointerup', e => this.up(e));
    on(this.fp.cv, 'pointercancel', e => this.up(e));
    on(this.wrap, 'keydown', e => this.key(e));
    this.renderLooks(); this.sync();
  }
  // Windows are edited as { side, a, b }; the engine reads both forms.
  load(layout) { const L = copy(resolveLayout(layout, this.cafe)); L.windows = windowsOf(L); if (this.look) L.look = this.look; else delete L.look; return L; }

  getLayout() { return { preset: this.preset, overrides: arrangementOf(this.L), ...(this.look ? { look: copy(this.look) } : {}) }; }
  setLayout(layout) { this.preset = presetId(layout); this.look = layout?.look || null; this.L = this.load(layout); this.sel = null; this.renderLooks(); this.redraw(); this.sync(); }
  destroy() { this.events.abort(); cancelAnimationFrame(this.frame); this.fp.destroy(); }

  redraw() { cancelAnimationFrame(this.frame); this.frame = 0; this.fp.setLayout(this.L); }
  schedule() { if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.fp.setLayout(this.L); }); }
  changed() { this.redraw(); this.sync(); this.onChange(this.getLayout()); }

  /* ---------- looks: the two templates, saved new looks and «+ Шинэ загвар» ---------- */
  savedLooks() { const list = store.get('looks', []); return Array.isArray(list) ? list.filter(l => l && typeof l.name === 'string') : []; }
  renderLooks() {
    const swatch = T => [T.floor, T.wall, T.table[1], T.sofa[0], T.plant[0]].map(c => `<i style="background:${c}"></i>`).join('');
    const custom = this.savedLooks();
    if (this.look && !custom.some(l => l.name === this.look.name)) custom.unshift(this.look);
    this.root.querySelector('[data-le-looks]').innerHTML =
      LAYOUT_IDS.map(id => `<button type="button" class="le-tpl" role="radio" data-le-template="${id}"><span class="le-sw">${swatch(THEMES[LAYOUTS[id].theme])}</span><b>${LAYOUTS[id].name}</b><small>${TEMPLATE_TEXT[id] || ''}</small></button>`).join('') +
      custom.map((l, i) => `<button type="button" class="le-tpl" role="radio" data-le-look="${i}"><span class="le-sw">${swatch(lookTheme(l))}</span><b>${escapeHTML(l.name)}</b><small>${LAYOUTS[l.base]?.name || 'Минимал'} дээр суурилсан</small></button>`).join('') +
      `<button type="button" class="le-tpl le-new" data-le-newlook><span class="le-plus">+</span><b>Шинэ загвар</b><small>Өөрийн өнгө, шалаар</small></button>`;
    this.customLooks = custom;
  }
  lookForm() {
    const l = this.look, T = lookTheme(l);
    const value = { floor: T.floor, wall: T.wall, wood: T.table[1], sofa: T.sofa[0], plant: T.plant[0], accent: T.accents[0] };
    const box = this.root.querySelector('[data-le-lookform]');
    box.hidden = false;
    box.innerHTML = `<div class="le-look-row"><label>Нэр<input data-look="name" value="${escapeHTML(l.name)}" maxlength="30"></label>
      <label>Суурь<select data-look="base">${LAYOUT_IDS.map(id => `<option value="${id}" ${l.base === id ? 'selected' : ''}>${LAYOUTS[id].name}</option>`).join('')}</select></label>
      <label>Шал<select data-look="floorStyle">${FLOORS.map(([k, n]) => `<option value="${k}" ${T.floorStyle === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
      <div class="le-look-row">${LOOK_FIELDS.map(([k, n]) => `<label class="le-color"><input type="color" data-look="${k}" value="${value[k]}">${n}</label>`).join('')}</div>
      <div class="le-look-row"><button type="button" class="btn btn-o" data-le-savelook>Загварын жагсаалтад хадгалах</button><small class="muted">Хадгалсан загварыг бусад кафед ч сонгоно.</small></div>`;
  }
  lookInput(e) {
    const t = e.target.closest('[data-look]'); if (!t || !this.look) return;
    this.look = { ...this.look, [t.dataset.look]: t.value };
    if (t.dataset.look === 'base') this.preset = t.value;
    this.L.look = this.look; Object.assign(this.L, { theme: LAYOUTS[this.preset].theme });
    this.schedule(); this.onChange(this.getLayout());
  }

  // Toolbar state and a warning when furniture blocks a walkway.
  sync() {
    this.root.querySelectorAll('[data-le-template]').forEach(b => { const on = !this.look && b.dataset.leTemplate === this.preset; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    this.root.querySelectorAll('[data-le-look]').forEach(b => { const on = !!this.look && this.customLooks[+b.dataset.leLook]?.name === this.look.name; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    const kind = this.sel?.[0];
    this.root.querySelector('[data-le-name]').textContent = kind ? NAMES[kind] : 'Объект сонгоогүй';
    this.root.querySelector('[data-le-act="rotate"]').disabled = !['round', 'chair', 'shelf'].includes(kind);
    for (const act of ['grow', 'shrink']) this.root.querySelector(`[data-le-act="${act}"]`).disabled = !['cut', 'vip', 'window', 'rug'].includes(kind);
    this.root.querySelector('[data-le-act="sensor"]').disabled = kind !== 'sofa';
    this.root.querySelector('[data-le-act="delete"]').disabled = !kind || kind === 'counter' || kind === 'door';
    this.root.querySelector('[data-le-add="rug"]').disabled = !!this.L.rug;
    this.root.querySelector('[data-le-add="vip"]').disabled = !!this.L.vip;
    this.root.querySelector('[data-le-add="cut"]').disabled = (this.L.cuts || []).length >= 4;
    const blocked = this.blockedSeats();
    const hint = this.root.querySelector('[data-le-hint]');
    hint.classList.toggle('warn', blocked > 0);
    hint.textContent = blocked > 0 ? `${blocked} суудал руу хүрэх зам алга — объектуудын хооронд зай гаргана уу.` : 'Объект дээр дарж чирээд байрлуулна. Сонгосон объектыг сумаар хөдөлгөж, Delete товчоор устгана.';
  }
  blockedSeats() {
    const { g, cols, rows } = this.fp, cell = (x, y) => clamp(Math.floor(y / 10), 0, rows - 1) * cols + clamp(Math.floor(x / 10), 0, cols - 1);
    const seen = new Uint8Array(cols * rows), queue = [cell(...this.fp.order)]; seen[queue[0]] = 1;
    while (queue.length) { const i = queue.pop(), cx = i % cols, cy = i / cols | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy, n = ny * cols + nx; if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && !seen[n] && !g[n]) { seen[n] = 1; queue.push(n); } } }
    const door = cell(...this.fp.doorIn);
    let blocked = seen[door] ? 0 : this.fp.seats.length;
    if (!blocked) for (const s of this.fp.seats) { const reach = s.kind === 'sofa' ? 52 : 34; let ok = false; for (let y = Math.max(0, Math.floor((s.y - reach) / 10)); y <= Math.min(rows - 1, Math.floor((s.y + reach) / 10)) && !ok; y++) for (let x = Math.max(0, Math.floor((s.x - reach) / 10)); x <= Math.min(cols - 1, Math.floor((s.x + reach) / 10)) && !ok; x++) if (seen[y * cols + x] && Math.hypot(x * 10 + 5 - s.x, y * 10 + 5 - s.y) <= reach) ok = true; if (!ok) blocked++; }
    return blocked;
  }

  pick([px, py]) { return objects(this.L).find(([kind, i]) => { const [x0, y0, x1, y1] = bounds(this.L, kind, i); return px >= x0 && px <= x1 && py >= y0 && py <= y1; }) || null; }
  down(e) {
    const p = this.fp.pt(e), hit = this.pick(p); this.sel = hit; this.wrap.focus({ preventScroll: true });
    if (hit) { this.drag = { p, from: copy(getObj(this.L, ...hit)), inside: hit[0] === 'vip' ? this.inside() : [], id: e.pointerId, moved: false }; try { this.fp.cv.setPointerCapture(e.pointerId); } catch (_) { } Snd.ui('click'); }
    this.sync(); this.fp.draw();
  }
  move(e) {
    const p = this.fp.pt(e);
    if (!this.drag || this.drag.id !== e.pointerId) { const h = this.pick(p); this.fp.cv.style.cursor = h ? 'move' : 'default'; if (String(h) !== String(this.hover)) { this.hover = h; this.fp.draw(); } return; }
    const [kind, i] = this.sel, dx = p[0] - this.drag.p[0], dy = p[1] - this.drag.p[1];
    if (!this.drag.moved && Math.hypot(dx, dy) < 2) return;
    this.drag.moved = true; setObj(this.L, kind, i, place(this.L, kind, i, this.drag.from, dx, dy)); this.carry(this.drag); this.schedule();
  }
  // The furniture standing in the VIP room moves with the room.
  inside() { const v = this.L.vip; return objects(this.L).filter(([k]) => !['vip', 'door', 'window', 'cut', 'counter', 'bar', 'rug'].includes(k)).filter(([k, i]) => { const [x0, y0, x1, y1] = bounds(this.L, k, i), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; return cx > v.x && cx < v.x + v.w && cy > v.y && cy < v.y + v.h; }).map(([k, i]) => [k, i, copy(getObj(this.L, k, i))]); }
  carry({ from, inside }) {
    if (!inside?.length) return; const dx = this.L.vip.x - from.x, dy = this.L.vip.y - from.y;
    for (const [k, i, start] of inside) { const o = copy(start); if (Array.isArray(o)) { o[0] += dx; o[1] += dy; } else { o.x += dx; o.y += dy; if (o.seats) o.seats = o.seats.map(v => v + dx); if (o.table) o.table = [o.table[0] + dx, o.table[1] + dy]; if (o.label) o.label = [o.label[0] + dx, o.label[1] + dy]; } setObj(this.L, k, i, o); }
  }
  up(e) { if (!this.drag || this.drag.id !== e.pointerId) return; const moved = this.drag.moved; this.drag = null; if (moved) this.changed(); }
  key(e) {
    if (!this.sel) return; const step = e.shiftKey ? 20 : 5;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (d) { e.preventDefault(); const [kind, i] = this.sel, from = copy(getObj(this.L, kind, i)), inside = kind === 'vip' ? this.inside() : []; setObj(this.L, kind, i, place(this.L, kind, i, from, ...d)); this.carry({ from, inside }); this.changed(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.act('delete'); }
    else if (e.key === 'r' || e.key === 'R') this.act('rotate');
    else if (e.key === '+' || e.key === '=') this.act('grow');
    else if (e.key === '-') this.act('shrink');
  }

  click(e) {
    const t = e.target.closest('[data-le-template],[data-le-look],[data-le-newlook],[data-le-savelook],[data-le-add],[data-le-act]'); if (!t || t.disabled) return;
    const form = this.root.querySelector('[data-le-lookform]');
    if (t.dataset.leTemplate) { Snd.ui('click'); this.preset = t.dataset.leTemplate; this.look = null; delete this.L.look; form.hidden = true; Object.assign(this.L, { id: this.preset, name: LAYOUTS[this.preset].name, theme: LAYOUTS[this.preset].theme }); this.changed(); }
    else if (t.dataset.leLook) { Snd.ui('click'); this.useLook(copy(this.customLooks[+t.dataset.leLook])); form.hidden = true; }
    else if ('leNewlook' in t.dataset) { Snd.ui('pop'); const T = THEMES[LAYOUTS[this.preset].theme]; this.useLook({ name: `Шинэ загвар ${this.savedLooks().length + 1}`, base: this.preset, floorStyle: T.floorStyle, floor: T.floor, wall: T.wall, wood: T.table[1], sofa: T.sofa[0], plant: T.plant[0], accent: T.accents[0] }); this.renderLooks(); this.sync(); this.lookForm(); }
    else if ('leSavelook' in t.dataset) { const list = this.savedLooks().filter(l => l.name !== this.look.name); store.set('looks', [copy(this.look), ...list].slice(0, 12)); Snd.ui('chime'); form.hidden = true; this.renderLooks(); this.sync(); }
    else if (t.dataset.leAdd) this.add(t.dataset.leAdd);
    else this.act(t.dataset.leAct);
  }
  useLook(look) { this.look = look; this.preset = LAYOUTS[look.base] ? look.base : 'minimal'; Object.assign(this.L, { id: this.preset, theme: LAYOUTS[this.preset].theme, look }); this.changed(); }
  add(kind) {
    const L = this.L, n = (L[LIST[kind]] || []).length + 1, x = 300 + (n % 4) * 30, y = 260 + (n % 3) * 30;
    if (kind === 'round') L.round.push({ x, y, dirs: 'NESW', zone: 'round', name: `${L.round.length + 1}-р ширээ` });
    else if (kind === 'long') L.long.push({ x, y, w: 240, seats: [x + 40, x + 120, x + 200], zone: 'long', name: n > 1 ? `Урт ширээ ${n}` : 'Урт ширээ', label: [x + 120, y + 76] });
    else if (kind === 'sofa') L.sofas.push({ x, y: 400, w: 168, seats: [x + 40, x + 85, x + 130], sensor: true, table: [x + 85, 360], label: [x + 85, 392], zone: 'lounge', name: n > 1 ? `Буйдан ${n}` : 'Буйдан' });
    else if (kind === 'chair') L.chairs.push({ x, y, dir: 'N' });
    else if (kind === 'plant') L.plants.push([x, y, 18]);
    else if (kind === 'shelf') L.shelves.push({ x, y, w: 24, h: 120 });
    else if (kind === 'rug') L.rug = [x - 60, y - 40, 220, 110];
    else if (kind === 'window') { const side = ['left', 'right', 'bottom', 'top'][(n - 1) % 4], at = horizontal(side) ? 300 + (n % 3) * 80 : 160 + (n % 3) * 60; L.windows.push({ side, a: at - 45, b: at + 45 }); }
    else if (kind === 'cut') { L.cuts = [...(L.cuts || []), [[616, 380, 160, 120], [24, 380, 160, 120], [616, 24, 160, 120], [24, 24, 160, 120]][(n - 1) % 4]]; }
    else if (kind === 'vip') { L.vip = { x: 300, y: 290, w: 230, h: 200, name: 'VIP өрөө' }; L.long.push({ x: 335, y: 370, w: 160, seats: [365, 415, 465], zone: 'long', name: 'VIP ширээ', label: [415, 446] }); }
    this.sel = kind === 'rug' || kind === 'vip' ? [kind, 0] : [kind, L[LIST[kind]].length - 1]; Snd.ui('pop'); this.changed();
  }
  act(action) {
    const L = this.L, [kind, i] = this.sel || [];
    if (action === 'reset') { Snd.ui('whoosh'); this.L = this.load({ preset: this.preset }); this.sel = null; this.changed(); return; }
    if (!kind) return;
    if (action === 'delete' && kind !== 'counter' && kind !== 'door') { if (LIST[kind]) L[LIST[kind]].splice(i, 1); else setObj(L, kind, i, null); if (kind === 'vip') delete L.vip; this.sel = null; Snd.ui('leave'); }
    else if (action === 'rotate') {
      const o = getObj(L, kind, i);
      if (kind === 'round') o.dirs = ROUND_DIRS[(ROUND_DIRS.indexOf(o.dirs) + 1) % ROUND_DIRS.length];
      else if (kind === 'chair') o.dir = CHAIR_DIRS[(CHAIR_DIRS.indexOf(o.dir) + 1) % 4];
      else if (kind === 'shelf') setObj(L, kind, i, place(L, kind, i, { ...o, w: o.h, h: o.w }, 0, 0));
      else return;
      Snd.ui('tick');
    }
    else if (action === 'grow' || action === 'shrink') { if (!resize(L, kind, i, action === 'grow' ? 1.15 : 1 / 1.15)) return; Snd.ui('tick'); }
    else if (action === 'sensor' && kind === 'sofa') { const f = L.sofas[i]; f.sensor = !f.sensor; f.zone = f.sensor ? 'lounge' : 'sofa'; Snd.ui('tick'); }
    else return;
    this.changed();
  }

  overlay(x) {
    const box = (sel, style, width) => { if (!sel) return; const b = bounds(this.L, ...sel); if (!b) return; const [x0, y0, x1, y1] = b; x.save(); x.strokeStyle = style; x.lineWidth = width; x.setLineDash([6, 4]); this.fp.rr(x, x0 - 3, y0 - 3, x1 - x0 + 6, y1 - y0 + 6, 8); x.stroke(); x.restore(); };
    if (this.hover && String(this.hover) !== String(this.sel)) box(this.hover, 'rgba(123,84,47,.35)', 1.5);
    box(this.sel, '#FF9D00', 2.5);
  }
}
