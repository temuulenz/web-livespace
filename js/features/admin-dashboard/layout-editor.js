// Admin layout editor: pick one of the two templates (look) and arrange the café inside it.
// Every object can be dragged on the plan: tables with their chairs, single chairs, sofas,
// the window bar, shelves, plants, the rug and the order counter. The result is saved as
// { preset, overrides } (js/simulation/layouts.js) and drawn by the same FloorPlan engine
// visitors see, so the preview is exactly what will be published.
import { FloorPlan, THEMES } from '../../simulation/floor-plan.js';
import { LAYOUTS, LAYOUT_IDS, resolveLayout, arrangementOf } from '../../simulation/layouts.js';
import { clamp } from '../../dom.js';
import { Snd } from '../../audio.js';

const TEMPLATE_TEXT = { minimal: 'Цэвэр, цайвар өнгө, нимгэн шугам', artistic: 'Өнгөлөг, чимэглэл, гэрэлтүүлэгтэй' };
const ROUND_DIRS = ['NESW', 'NS', 'EW', 'NES', 'N'];
const CHAIR_DIRS = ['N', 'E', 'S', 'W'];
const ADD = [['round', 'Дугуй ширээ'], ['long', 'Урт ширээ'], ['sofa', 'Буйдан'], ['chair', 'Сандал'], ['plant', 'Ургамал'], ['shelf', 'Тавиур'], ['rug', 'Хивс']];
const NAMES = { round: 'Дугуй ширээ', long: 'Урт ширээ', sofa: 'Буйдан', chair: 'Сандал', plant: 'Ургамал', shelf: 'Тавиур', bar: 'Цонхны баар', counter: 'Захиалгын лангуу', rug: 'Хивс' };
const LIST = { round: 'round', long: 'long', sofa: 'sofas', chair: 'chairs', plant: 'plants', shelf: 'shelves' };
const copy = value => JSON.parse(JSON.stringify(value));
const presetId = layout => LAYOUTS[layout?.preset] && layout.preset !== 'legacy' ? layout.preset : resolveLayout(layout).theme === 'artistic' ? 'artistic' : 'minimal';

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
}
// Everything that can be picked, most specific first (a chair before the rug under it).
function objects(L) {
  const out = [];
  L.chairs.forEach((_, i) => out.push(['chair', i]));
  L.plants.forEach((_, i) => out.push(['plant', i]));
  L.round.forEach((_, i) => out.push(['round', i]));
  L.long.forEach((_, i) => out.push(['long', i]));
  L.sofas.forEach((_, i) => out.push(['sofa', i]));
  L.shelves.forEach((_, i) => out.push(['shelf', i]));
  if (L.windowBar) out.push(['bar', 0]);
  out.push(['counter', 0]);
  if (L.rug) out.push(['rug', 0]);
  return out;
}
// Move an object by (dx, dy) from its state `from`, keeping it inside the walls.
function place(L, kind, i, from, dx, dy) {
  const tmp = { ...L }; if (LIST[kind]) tmp[LIST[kind]] = [...L[LIST[kind]]]; setObj(tmp, kind, i, from);
  const [x0, y0, x1, y1] = bounds(tmp, kind, i);
  if (kind === 'counter') { dx = clamp(dx, 28 - x0, 600 - x0); dy = clamp(dy, 24 - y0, 246 - y0); }
  else { dx = clamp(dx, 28 - x0, 772 - x1); dy = kind === 'bar' ? 0 : clamp(dy, 28 - y0, 500 - y1); }
  dx = Math.round(dx); dy = Math.round(dy);
  const o = copy(from);
  if (kind === 'round' || kind === 'chair' || kind === 'shelf' || kind === 'counter') { o.x += dx; o.y += dy; }
  else if (kind === 'long') { o.x += dx; o.y += dy; o.seats = o.seats.map(v => v + dx); if (o.label) o.label = [o.label[0] + dx, o.label[1] + dy]; }
  else if (kind === 'sofa') { o.x += dx; o.y += dy; o.seats = o.seats.map(v => v + dx); if (o.table) o.table = [o.table[0] + dx, o.table[1] + dy]; if (o.label) o.label = [o.label[0] + dx, o.label[1] + dy]; }
  else if (kind === 'bar') { o.x += dx; o.stools = o.stools.map(v => v + dx); o.label = [o.label[0] + dx, o.label[1]]; }
  else if (kind === 'plant' || kind === 'rug') { o[0] += dx; o[1] += dy; }
  return o;
}
function getObj(L, kind, i) { return kind === 'bar' ? L.windowBar : kind === 'counter' ? L.counter : kind === 'rug' ? L.rug : L[LIST[kind]][i]; }
function setObj(L, kind, i, value) { if (kind === 'bar') L.windowBar = value; else if (kind === 'counter') L.counter = value; else if (kind === 'rug') L.rug = value; else L[LIST[kind]][i] = value; }

export class LayoutEditor {
  constructor(root, { layout, cafe, onChange = () => { } }) {
    this.root = root; this.cafe = cafe; this.onChange = onChange; this.sel = null; this.hover = null; this.drag = null; this.frame = 0;
    this.preset = presetId(layout); this.L = copy(resolveLayout(layout || { preset: this.preset }, cafe));
    this.events = new AbortController();
    const swatch = id => { const T = THEMES[LAYOUTS[id].theme]; return [T.floor, T.wall, T.table[1], T.sofa[0], T.plant[0]].map(c => `<i style="background:${c}"></i>`).join(''); };
    root.innerHTML = `<div class="le">
      <div class="le-templates" role="radiogroup" aria-label="Загвар">${LAYOUT_IDS.map(id => `<button type="button" class="le-tpl" role="radio" data-le-template="${id}"><span class="le-sw">${swatch(id)}</span><b>${LAYOUTS[id].name}</b><small>${TEMPLATE_TEXT[id] || ''}</small></button>`).join('')}</div>
      <div class="le-tools"><span class="le-lab">Нэмэх</span>${ADD.map(([k, l]) => `<button type="button" class="chip" data-le-add="${k}">+ ${l}</button>`).join('')}</div>
      <div class="le-tools le-sel"><span class="le-lab" data-le-name>Объект сонгоогүй</span>
        <button type="button" class="chip" data-le-act="rotate">Эргүүлэх</button><button type="button" class="chip" data-le-act="sensor">Мэдрэгчтэй эсэх</button><button type="button" class="chip le-del" data-le-act="delete">Устгах</button>
        <button type="button" class="btn btn-g le-reset" data-le-act="reset">Загварын анхны байрлал</button></div>
      <div class="plan-wrap le-plan" tabindex="0" aria-label="Кафены зураглал засах: объектыг чирж байрлуулна, сумаар хөдөлгөнө, Delete товчоор устгана"></div>
      <p class="le-hint" data-le-hint aria-live="polite"></p></div>`;
    this.wrap = root.querySelector('.le-plan');
    this.fp = new FloorPlan(this.wrap, { id: cafe.id, name: cafe.name, occ: 0 }, { layout: this.L, editor: true, overlay: ctx => this.overlay(ctx) });
    const on = (el, type, fn) => el.addEventListener(type, fn, { signal: this.events.signal });
    on(root, 'click', e => this.click(e));
    on(this.fp.cv, 'pointerdown', e => this.down(e));
    on(this.fp.cv, 'pointermove', e => this.move(e));
    on(this.fp.cv, 'pointerup', e => this.up(e));
    on(this.fp.cv, 'pointercancel', e => this.up(e));
    on(this.wrap, 'keydown', e => this.key(e));
    this.sync();
  }

  getLayout() { return { preset: this.preset, overrides: arrangementOf(this.L) }; }
  setLayout(layout) { this.preset = presetId(layout); this.L = copy(resolveLayout(layout, this.cafe)); this.sel = null; this.redraw(); this.sync(); }
  destroy() { this.events.abort(); cancelAnimationFrame(this.frame); this.fp.destroy(); }

  redraw() { cancelAnimationFrame(this.frame); this.frame = 0; this.fp.setLayout(this.L); }
  schedule() { if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.fp.setLayout(this.L); }); }
  changed() { this.redraw(); this.sync(); this.onChange(this.getLayout()); }

  // Toolbar state and a warning when furniture blocks a walkway.
  sync() {
    this.root.querySelectorAll('[data-le-template]').forEach(b => { const on = b.dataset.leTemplate === this.preset; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    const kind = this.sel?.[0];
    this.root.querySelector('[data-le-name]').textContent = kind ? NAMES[kind] : 'Объект сонгоогүй';
    this.root.querySelector('[data-le-act="rotate"]').disabled = !['round', 'chair', 'shelf'].includes(kind);
    this.root.querySelector('[data-le-act="sensor"]').disabled = kind !== 'sofa';
    this.root.querySelector('[data-le-act="delete"]').disabled = !kind || kind === 'counter';
    this.root.querySelector('[data-le-add="rug"]').disabled = !!this.L.rug;
    const blocked = this.blockedSeats();
    const hint = this.root.querySelector('[data-le-hint]');
    hint.classList.toggle('warn', blocked > 0);
    hint.textContent = blocked > 0 ? `${blocked} суудал руу хүрэх зам алга — объектуудын хооронд зай гаргана уу.` : 'Объект дээр дарж чирээд байрлуулна. Сонгосон объектыг сумаар хөдөлгөж, Delete товчоор устгана.';
  }
  blockedSeats() {
    const { g, cols, rows } = this.fp, cell = (x, y) => clamp(Math.floor(y / 10), 0, rows - 1) * cols + clamp(Math.floor(x / 10), 0, cols - 1);
    const seen = new Uint8Array(cols * rows), queue = [cell(...this.fp.order)]; seen[queue[0]] = 1;
    while (queue.length) { const i = queue.pop(), cx = i % cols, cy = i / cols | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy, n = ny * cols + nx; if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && !seen[n] && !g[n]) { seen[n] = 1; queue.push(n); } } }
    const door = cell(this.fp.door[0], this.fp.door[1] - 20);
    let blocked = seen[door] ? 0 : this.fp.seats.length;
    if (!blocked) for (const s of this.fp.seats) { const reach = s.kind === 'sofa' ? 52 : 34; let ok = false; for (let y = Math.max(0, Math.floor((s.y - reach) / 10)); y <= Math.min(rows - 1, Math.floor((s.y + reach) / 10)) && !ok; y++) for (let x = Math.max(0, Math.floor((s.x - reach) / 10)); x <= Math.min(cols - 1, Math.floor((s.x + reach) / 10)) && !ok; x++) if (seen[y * cols + x] && Math.hypot(x * 10 + 5 - s.x, y * 10 + 5 - s.y) <= reach) ok = true; if (!ok) blocked++; }
    return blocked;
  }

  pick([px, py]) { return objects(this.L).find(([kind, i]) => { const [x0, y0, x1, y1] = bounds(this.L, kind, i); return px >= x0 && px <= x1 && py >= y0 && py <= y1; }) || null; }
  down(e) {
    const p = this.fp.pt(e), hit = this.pick(p); this.sel = hit; this.wrap.focus({ preventScroll: true });
    if (hit) { this.drag = { p, from: copy(getObj(this.L, ...hit)), id: e.pointerId, moved: false }; try { this.fp.cv.setPointerCapture(e.pointerId); } catch (_) { } Snd.ui('click'); }
    this.sync(); this.fp.draw();
  }
  move(e) {
    const p = this.fp.pt(e);
    if (!this.drag || this.drag.id !== e.pointerId) { const h = this.pick(p); this.fp.cv.style.cursor = h ? 'move' : 'default'; if (String(h) !== String(this.hover)) { this.hover = h; this.fp.draw(); } return; }
    const [kind, i] = this.sel, dx = p[0] - this.drag.p[0], dy = p[1] - this.drag.p[1];
    if (!this.drag.moved && Math.hypot(dx, dy) < 2) return;
    this.drag.moved = true; setObj(this.L, kind, i, place(this.L, kind, i, this.drag.from, dx, dy)); this.schedule();
  }
  up(e) { if (!this.drag || this.drag.id !== e.pointerId) return; const moved = this.drag.moved; this.drag = null; if (moved) this.changed(); }
  key(e) {
    if (!this.sel) return; const step = e.shiftKey ? 20 : 5;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (d) { e.preventDefault(); const [kind, i] = this.sel; setObj(this.L, kind, i, place(this.L, kind, i, getObj(this.L, kind, i), ...d)); this.changed(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.act('delete'); }
    else if (e.key === 'r' || e.key === 'R') this.act('rotate');
  }

  click(e) {
    const t = e.target.closest('[data-le-template],[data-le-add],[data-le-act]'); if (!t || t.disabled) return;
    if (t.dataset.leTemplate) { Snd.ui('click'); this.preset = t.dataset.leTemplate; Object.assign(this.L, { id: this.preset, name: LAYOUTS[this.preset].name, theme: LAYOUTS[this.preset].theme }); this.changed(); }
    else if (t.dataset.leAdd) this.add(t.dataset.leAdd);
    else this.act(t.dataset.leAct);
  }
  add(kind) {
    const L = this.L, n = (L[LIST[kind]] || []).length + 1, x = 300 + (n % 4) * 30, y = 260 + (n % 3) * 30;
    if (kind === 'round') L.round.push({ x, y, dirs: 'NESW', zone: 'round', name: `${L.round.length + 1}-р ширээ` });
    else if (kind === 'long') L.long.push({ x, y, w: 240, seats: [x + 40, x + 120, x + 200], zone: 'long', name: n > 1 ? `Урт ширээ ${n}` : 'Урт ширээ', label: [x + 120, y + 76] });
    else if (kind === 'sofa') L.sofas.push({ x, y: 400, w: 168, seats: [x + 40, x + 85, x + 130], sensor: true, table: [x + 85, 360], label: [x + 85, 392], zone: 'lounge', name: n > 1 ? `Буйдан ${n}` : 'Буйдан' });
    else if (kind === 'chair') L.chairs.push({ x, y, dir: 'N' });
    else if (kind === 'plant') L.plants.push([x, y, 18]);
    else if (kind === 'shelf') L.shelves.push({ x, y, w: 24, h: 120 });
    else if (kind === 'rug') L.rug = [x - 60, y - 40, 220, 110];
    this.sel = kind === 'rug' ? ['rug', 0] : [kind, L[LIST[kind]].length - 1]; Snd.ui('pop'); this.changed();
  }
  act(action) {
    const L = this.L, [kind, i] = this.sel || [];
    if (action === 'reset') { Snd.ui('whoosh'); this.L = copy(resolveLayout({ preset: this.preset }, this.cafe)); this.sel = null; this.changed(); return; }
    if (!kind) return;
    if (action === 'delete' && kind !== 'counter') { if (LIST[kind]) L[LIST[kind]].splice(i, 1); else setObj(L, kind, i, null); this.sel = null; Snd.ui('leave'); }
    else if (action === 'rotate') {
      const o = getObj(L, kind, i);
      if (kind === 'round') o.dirs = ROUND_DIRS[(ROUND_DIRS.indexOf(o.dirs) + 1) % ROUND_DIRS.length];
      else if (kind === 'chair') o.dir = CHAIR_DIRS[(CHAIR_DIRS.indexOf(o.dir) + 1) % 4];
      else if (kind === 'shelf') setObj(L, kind, i, place(L, kind, i, { ...o, w: o.h, h: o.w }, 0, 0));
      else return;
      Snd.ui('tick');
    }
    else if (action === 'sensor' && kind === 'sofa') { const f = L.sofas[i]; f.sensor = !f.sensor; f.zone = f.sensor ? 'lounge' : 'sofa'; Snd.ui('tick'); }
    else return;
    this.changed();
  }

  overlay(x) {
    const box = (sel, style, width) => { if (!sel) return; const [x0, y0, x1, y1] = bounds(this.L, ...sel); x.save(); x.strokeStyle = style; x.lineWidth = width; x.setLineDash([6, 4]); this.fp.rr(x, x0 - 3, y0 - 3, x1 - x0 + 6, y1 - y0 + 6, 8); x.stroke(); x.restore(); };
    if (this.hover && String(this.hover) !== String(this.sel)) box(this.hover, 'rgba(123,84,47,.35)', 1.5);
    box(this.sel, '#FF9D00', 2.5);
  }
}
