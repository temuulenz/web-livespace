// Admin layout editor: pick a look and arrange the café — the room as well as the furniture.
// Every object can be dragged on the plan: tables with their chairs, single chairs, sofas,
// the window bar, shelves, plants, the rug and the order counter (anywhere on the floor);
// the entrance and the windows slide along any wall; corners can be cut away for an L- or
// U-shaped room; an optional VIP room is booked separately. A new look is a template
// recoloured. The result is saved as { preset, overrides, look } (js/simulation/layouts.js)
// and drawn by the same FloorPlan engine visitors see, so the preview is what gets published.
//
// Free-form objects come from the catalogue (js/simulation/catalog.js): tables of any size,
// benches, bars, glass partitions and inner walls, wall murals, children's corners, lamps…
// The selected object shows handles: corners and edges change its width and length
// separately, the round knob turns it (Shift: 15° steps). A side panel takes exact numbers.
// Classic objects that cannot turn by themselves become free-form objects when turned.
// The server keeps only { preset, overrides }; free-form objects, counter size and angle,
// the room (entrance, windows, corners, VIP) and new looks travel as a design file:
// «Дизайн файл (JSON)» exports what js/simulation/designs/*.js expects.
import { FloorPlan, THEMES, lookTheme, doorOf, windowsOf } from '../../simulation/floor-plan.js';
import { LAYOUTS, LAYOUT_IDS, DESIGNS, designFor, resolveLayout, arrangementOf } from '../../simulation/layouts.js';
import { CATALOG, GROUPS, DEG, toLocal, toWorld, corners, aabb, contains, counterBox, counterPoint, counterFrame, counterFromFrame, makeItem, sanitizeItems } from '../../simulation/catalog.js';
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
const LIST = { round: 'round', long: 'long', sofa: 'sofas', chair: 'chairs', plant: 'plants', shelf: 'shelves', window: 'windows', cut: 'cuts', item: 'items' };
const LOOK_FIELDS = [['floor', 'Шал'], ['wall', 'Хана'], ['wood', 'Ширээ, мод'], ['sofa', 'Буйдан'], ['plant', 'Ургамал'], ['accent', 'Онцлох өнгө']];
const FLOORS = [['tiles', 'Хавтан'], ['terrazzo', 'Терраццо'], ['wood', 'Модон шал']];
// Classic objects that turn into a free-form object when turned to any angle.
const CONVERTIBLE = ['round', 'long', 'sofa', 'chair', 'shelf', 'plant', 'rug', 'bar'];
const SIDES = ['top', 'bottom', 'left', 'right'];
const HISTORY = 60, KNOB = 24;
const copy = value => JSON.parse(JSON.stringify(value));
const horizontal = side => side === 'top' || side === 'bottom';
const norm = a => Math.round(((a % 360) + 540) % 360 - 180);
// The wall nearest to a point, and the position along it.
function snapWall(x, y) {
  const d = [['top', y - 24], ['bottom', 500 - y], ['left', x - 24], ['right', 776 - x]].sort((a, b) => a[1] - b[1])[0][0];
  return { side: d, along: horizontal(d) ? x : y };
}
const wallPoint = (side, at) => ({ top: [at, 24], bottom: [at, 500], left: [24, at], right: [776, at] }[side]);
const label = (L, kind, i) => kind === 'item' ? (L.items[i]?.name || CATALOG[L.items[i]?.type]?.name || 'Объект') : NAMES[kind];

// The editor's styles live in their own file; the admin page loads it with the editor.
function loadStyles() {
  if (typeof document === 'undefined' || document.querySelector('link[data-le-css]')) return;
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = new URL('../../../styles/floor-editor.css', import.meta.url).href; link.dataset.leCss = '';
  document.head.append(link);
}

// Object bounds in world units: [x0, y0, x1, y1] (chairs, stools and coffee tables included).
function bounds(L, kind, i) {
  if (kind === 'item') return aabb(L.items[i]);
  if (kind === 'round') { const t = L.round[i]; return [t.x - 50, t.y - 50, t.x + 50, t.y + 50]; }
  if (kind === 'long') { const t = L.long[i]; return [t.x, t.y - 30, t.x + t.w, t.y + 66]; }
  if (kind === 'sofa') { const f = L.sofas[i]; return [f.x, Math.min(f.y - 4, f.table ? f.table[1] - 15 : f.y), f.x + f.w, f.y + 32]; }
  if (kind === 'chair') { const c = L.chairs[i]; return [c.x - 13, c.y - 13, c.x + 13, c.y + 13]; }
  if (kind === 'plant') { const [x, y, r] = L.plants[i]; return [x - r, y - r, x + r, y + r]; }
  if (kind === 'shelf') { const b = L.shelves[i]; return [b.x, b.y, b.x + b.w, b.y + b.h]; }
  if (kind === 'bar') { const b = L.windowBar; return [b.x, 30, b.x + b.w, 90]; }
  if (kind === 'counter') return aabb(counterFrame(L.counter));
  if (kind === 'rug') { const [x, y, w, h] = L.rug; return [x, y, x + w, y + h]; }
  if (kind === 'door') { const { side, at } = doorOf(L); return { top: [at - 30, 16, at + 30, 56], bottom: [at - 30, 468, at + 30, 508], left: [16, at - 30, 56, at + 30], right: [744, at - 30, 784, at + 30] }[side]; }
  if (kind === 'window') { const { side, a, b } = L.windows[i]; return { top: [a, 14, b, 40], bottom: [a, 484, b, 510], left: [14, a, 40, b], right: [760, a, 786, b] }[side]; }
  if (kind === 'cut') { const [x, y, w, h] = L.cuts[i]; return [x, y, x + w, y + h]; }
  if (kind === 'vip') { const v = L.vip; return [v.x, v.y, v.x + v.w, v.y + v.h]; }
}
// Everything that can be picked, most specific first (a chair before the rug or room under it).
function objects(L) {
  const items = layer => (L.items || []).map((o, i) => [o, i]).filter(([o]) => CATALOG[o.type]?.layer === layer).reverse().map(([, i]) => ['item', i]);
  const out = [['door', 0]];
  L.windows.forEach((_, i) => out.push(['window', i]));
  out.push(...items('overhead').filter(([, i]) => L.items[i].type === 'label'));
  L.chairs.forEach((_, i) => out.push(['chair', i]));
  out.push(...items('object'));
  L.plants.forEach((_, i) => out.push(['plant', i]));
  L.round.forEach((_, i) => out.push(['round', i]));
  L.long.forEach((_, i) => out.push(['long', i]));
  L.sofas.forEach((_, i) => out.push(['sofa', i]));
  L.shelves.forEach((_, i) => out.push(['shelf', i]));
  if (L.windowBar) out.push(['bar', 0]);
  out.push(['counter', 0]);
  out.push(...items('wall'), ...items('overhead').filter(([, i]) => L.items[i].type !== 'label'), ...items('floor'));
  if (L.rug) out.push(['rug', 0]);
  if (L.vip) out.push(['vip', 0]);
  (L.cuts || []).forEach((_, i) => out.push(['cut', i]));
  out.push(...items('floor0'));
  return out;
}
const hits = (L, kind, i, [px, py]) => {
  if (kind === 'item') return contains(L.items[i], px, py, 3);
  if (kind === 'counter') return contains(counterFrame(L.counter), px, py);
  const [x0, y0, x1, y1] = bounds(L, kind, i); return px >= x0 && px <= x1 && py >= y0 && py <= y1;
};
// Move an object by (dx, dy) from its state `from`, keeping it inside the walls.
function place(L, kind, i, from, dx, dy) {
  if (kind === 'door' || kind === 'window') {
    const len = kind === 'door' ? 60 : from.b - from.a, mid = kind === 'door' ? from.at : (from.a + from.b) / 2;
    const [px, py] = wallPoint(from.side, mid), { side, along } = snapWall(px + dx, py + dy), max = horizontal(side) ? 776 : 500;
    const c = Math.round(clamp(along, 24 + len / 2 + (kind === 'door' ? 6 : 0), max - len / 2 - (kind === 'door' ? 6 : 0)));
    return kind === 'door' ? { side, at: c } : { side, a: c - len / 2, b: c + len / 2 };
  }
  if (kind === 'item') { const o = copy(from); o.x = Math.round(clamp(o.x + dx, 24, 776)); o.y = Math.round(clamp(o.y + dy, 24, 500)); return o; }
  const tmp = { ...L }; if (LIST[kind]) tmp[LIST[kind]] = [...L[LIST[kind]]]; setObj(tmp, kind, i, from);
  const [x0, y0, x1, y1] = bounds(tmp, kind, i);
  // The order counter may stand anywhere; its queue spot (left of it) stays on the floor.
  if (kind === 'counter' && !counterBox(from).custom) { dx = clamp(dx, 28 - x0, 600 - x0); dy = clamp(dy, 24 - y0, 246 - y0); }
  else if (kind === 'counter') { const [ox, oy] = counterPoint(counterBox(from), 580, 112); dx = clamp(dx, Math.max(24 - x0, 28 - ox), Math.min(776 - x1, 772 - ox)); dy = clamp(dy, Math.max(24 - y0, 28 - oy), Math.min(500 - y1, 496 - oy)); }
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

/* ---------- frames: one centre-based { x, y, w, h, rot } view of every object ---------- */
// cw / ch: width / length can change; cr: turns by itself; sym: resized around its centre.
function frameOf(L, kind, i) {
  const o = getObj(L, kind, i); if (!o) return null;
  const F = (x, y, w, h, rot, cw, ch, cr, sym = false) => ({ x, y, w, h, rot: rot || 0, cw, ch, cr, sym });
  if (kind === 'item') return F(o.x, o.y, o.w, o.h, o.rot, true, true, CATALOG[o.type].rotate !== false);
  if (kind === 'counter') { const f = counterFrame(o); return F(f.x, f.y, f.w, f.h, f.rot, true, true, true); }
  if (kind === 'long') return F(o.x + o.w / 2, o.y + 18, o.w, 36, 0, true, false, false);
  if (kind === 'sofa') return F(o.x + o.w / 2, o.y + 16, o.w, 32, 0, true, false, false);
  if (kind === 'shelf') return F(o.x + o.w / 2, o.y + o.h / 2, o.w, o.h, 0, true, true, false);
  if (kind === 'rug' || kind === 'cut') { const [x, y, w, h] = o; return F(x + w / 2, y + h / 2, w, h, 0, true, true, false); }
  if (kind === 'vip') return F(o.x + o.w / 2, o.y + o.h / 2, o.w, o.h, 0, true, true, false);
  if (kind === 'plant') return F(o[0], o[1], o[2] * 2, o[2] * 2, 0, true, true, false, true);
  if (kind === 'bar') return F(o.x + o.w / 2, 42, o.w, 24, 0, true, false, false);
  if (kind === 'window') { const along = horizontal(o.side), [x, y] = wallPoint(o.side, (o.a + o.b) / 2); return F(x, y, along ? o.b - o.a : 14, along ? 14 : o.b - o.a, 0, along, !along, false, true); }
  if (kind === 'round') return F(o.x, o.y, 48, 48, 0, false, false, false, true);
  if (kind === 'chair') return F(o.x, o.y, 24, 24, 0, false, false, false, true);
  if (kind === 'door') { const [x, y] = wallPoint(o.side, o.at); return F(x, y, 60, 60, 0, false, false, false, true); }
  return null;
}
const spread = (x0, w, n, inset = 0) => Array.from({ length: n }, (_, k) => Math.round(x0 + inset + (k + .5) * (w - inset * 2) / n));
// Change the size, keeping the centre where it is.
function setSize(L, kind, i, w, h) {
  const o = getObj(L, kind, i), r = Math.round;
  if (kind === 'item') { const s = CATALOG[o.type]; o.w = r(clamp(w, s.min[0], s.max[0])); o.h = r(clamp(h, s.min[1], s.max[1])); }
  else if (kind === 'counter') { const f = counterFrame(o); L.counter = counterFromFrame({ ...f, w: clamp(w, 100, 360), h: clamp(h, 100, 360) }); }
  else if (kind === 'long' || kind === 'sofa') { const cx = o.x + o.w / 2, nw = r(clamp(w, kind === 'long' ? 60 : 80, 600)); o.x = r(cx - nw / 2); o.w = nw; o.seats = spread(o.x, nw, o.seats.length, kind === 'sofa' ? 14 : 0); }
  else if (kind === 'bar') { const cx = o.x + o.w / 2, nw = r(clamp(w, 80, 700)); o.x = r(cx - nw / 2); o.w = nw; o.stools = spread(o.x, nw, o.stools.length); o.label = [r(cx), o.label[1]]; }
  else if (kind === 'shelf') { const cx = o.x + o.w / 2, cy = o.y + o.h / 2; o.w = r(clamp(w, 12, 400)); o.h = r(clamp(h, 12, 400)); o.x = r(cx - o.w / 2); o.y = r(cy - o.h / 2); }
  else if (kind === 'rug' || kind === 'cut') { const [x, y, ow, oh] = o, nw = r(clamp(w, 40, 752)), nh = r(clamp(h, 40, 476)); o.splice(0, 4, r(x + ow / 2 - nw / 2), r(y + oh / 2 - nh / 2), nw, nh); }
  else if (kind === 'vip') { const cx = o.x + o.w / 2, cy = o.y + o.h / 2; o.w = r(clamp(w, 120, 600)); o.h = r(clamp(h, 100, 440)); o.x = r(cx - o.w / 2); o.y = r(cy - o.h / 2); }
  else if (kind === 'plant') o[2] = r(clamp(Math.min(w, h) / 2, 5, 39));
  else if (kind === 'window') { const max = horizontal(o.side) ? 776 : 500, mid = (o.a + o.b) / 2, len = clamp(r((horizontal(o.side) ? w : h) / 10) * 10, 40, 300); o.a = r(clamp(mid - len / 2, 24, max - len)); o.b = o.a + len; }
}
// A classic object as an equivalent free-form object (so it can turn to any angle).
function toItem(kind, o) {
  const name = o.name ? { name: o.name } : {};
  if (kind === 'round') return makeItem('table', o.x, o.y, { ...name, shape: 'round', w: 48, h: 48, n: +o.dirs.includes('N'), s: +o.dirs.includes('S'), wl: +o.dirs.includes('W'), e: +o.dirs.includes('E') });
  if (kind === 'long') return makeItem('table', o.x + o.w / 2, o.y + 18, { ...name, w: o.w, h: 36, n: o.seats.length, s: o.seats.length, wl: 0, e: 0 });
  if (kind === 'sofa') return makeItem('sofa', o.x + o.w / 2, o.y + 16, { ...name, w: o.w, seats: o.seats.length });
  if (kind === 'chair') return makeItem('chair', o.x, o.y, { rot: { N: 0, E: 90, S: 180, W: -90 }[o.dir] ?? 0 });
  if (kind === 'shelf') return makeItem('shelf', o.x + o.w / 2, o.y + o.h / 2, { w: o.w, h: o.h });
  if (kind === 'plant') return makeItem('plant', o[0], o[1], { w: o[2] * 2, h: o[2] * 2 });
  if (kind === 'rug') return makeItem('rug', o[0] + o[2] / 2, o[1] + o[3] / 2, { w: o[2], h: o[3] });
  if (kind === 'bar') return makeItem('bar', o.x + o.w / 2, 42, { w: o.w, h: 24, stools: o.stools.length, name: 'Цонхны баар' });
  return null;
}
const fin = (...v) => v.every(Number.isFinite), nums = (v, n) => Array.isArray(v) && v.length === n && v.every(Number.isFinite);
// Check a pasted JSON (a layout config or a whole design file) before it reaches the engine.
function cleanConfig(raw) {
  const src = raw?.layout && typeof raw.layout === 'object' ? raw.layout : raw;
  if (!src || typeof src !== 'object' || Array.isArray(src)) throw new Error('JSON объект байх ёстой.');
  const ov = src.overrides && typeof src.overrides === 'object' ? src.overrides : {}, out = {};
  const list = (key, ok, max) => { if (Array.isArray(ov[key])) out[key] = ov[key].filter(v => { try { return !!ok(v); } catch { return false; } }).slice(0, max); };
  const lab = t => !t.label || nums(t.label, 2);
  list('round', t => fin(t.x, t.y) && /^[NESW]{1,4}$/.test(t.dirs || ''), 30);
  list('long', t => fin(t.x, t.y, t.w) && Array.isArray(t.seats) && t.seats.every(Number.isFinite) && lab(t), 20);
  list('sofas', f => fin(f.x, f.y, f.w) && Array.isArray(f.seats) && f.seats.every(Number.isFinite) && lab(f) && (!f.table || nums(f.table, 2)), 12);
  list('chairs', c => fin(c.x, c.y) && /^[NESW]$/.test(c.dir || ''), 60);
  list('plants', p => nums(p, 3), 40);
  list('shelves', b => fin(b.x, b.y, b.w, b.h), 20);
  list('windows', w => nums(w, 2) || (SIDES.includes(w.side) && fin(w.a, w.b)), 12);
  if (ov.cuts === null) out.cuts = null; else list('cuts', c => nums(c, 4), 4);
  if (ov.rug === null || nums(ov.rug, 4)) out.rug = ov.rug;
  if (ov.windowBar === null || (ov.windowBar && fin(ov.windowBar.x, ov.windowBar.w) && Array.isArray(ov.windowBar.stools) && ov.windowBar.stools.every(Number.isFinite) && nums(ov.windowBar.label, 2))) out.windowBar = ov.windowBar;
  if (ov.counter && fin(ov.counter.x, ov.counter.y)) out.counter = counterFromFrame(counterFrame(ov.counter));
  if (ov.door === null || (ov.door && SIDES.includes(ov.door.side) && fin(ov.door.at))) out.door = ov.door;
  if (ov.vip === null || (ov.vip && fin(ov.vip.x, ov.vip.y, ov.vip.w, ov.vip.h))) out.vip = ov.vip;
  const look = src.look && typeof src.look === 'object' && typeof src.look.name === 'string' ? Object.fromEntries(['name', 'base', 'floorStyle', ...LOOK_FIELDS.map(([k]) => k)].filter(k => typeof src.look[k] === 'string').map(k => [k, src.look[k].slice(0, 30)])) : null;
  return { preset: LAYOUT_IDS.includes(src.preset) ? src.preset : 'minimal', overrides: out, ...(look ? { look } : {}), items: sanitizeItems(src.items) };
}

export class LayoutEditor {
  constructor(root, { layout, cafe, onChange = () => { } }) {
    loadStyles();
    this.root = root; this.cafe = cafe; this.onChange = onChange; this.sel = null; this.hover = null; this.drag = null; this.frame = 0;
    this.past = []; this.future = []; this.snap = store.get('le-snap', true) !== false;
    this.bound = designFor(cafe); this.designId = this.bound?.id || null; this.init(layout || null);
    this.draftKey = `layout-draft:${cafe.id}`; const draft = store.get(this.draftKey, null);
    this.draft = draft && JSON.stringify(draft) !== JSON.stringify(this.getLayout()) ? draft : null;
    this.events = new AbortController();
    const group = ([g, title]) => { const types = Object.entries(CATALOG).filter(([, s]) => s.group === g); return types.length ? `<div class="le-tools le-cat"><span class="le-lab">${title}</span>${types.map(([k, s]) => `<button type="button" class="chip" data-le-item="${k}">+ ${s.name}</button>`).join('')}</div>` : ''; };
    root.innerHTML = `<div class="le">
      <div class="le-templates" role="radiogroup" aria-label="Загвар" data-le-looks></div>
      <div class="le-look" data-le-lookform hidden></div>
      <div class="le-tools le-designs"><span class="le-lab">Кафены дизайн</span>${Object.values(DESIGNS).map(d => `<button type="button" class="chip" data-le-design="${escapeHTML(d.id)}">${escapeHTML(d.name)}</button>`).join('')}<small class="muted le-note" data-le-designnote></small></div>
      <div class="le-tools"><span class="le-lab">Нэмэх</span>${ADD.map(([k, l]) => `<button type="button" class="chip" data-le-add="${k}">+ ${l}</button>`).join('')}</div>
      <div class="le-tools"><span class="le-lab">Өрөө</span>${ADD_ROOM.map(([k, l]) => `<button type="button" class="chip" data-le-add="${k}">+ ${l}</button>`).join('')}<small class="muted le-note">Орц, цонхыг чирж дурын хананд шилжүүлнэ. <b>Урьдчилан харах:</b> өрөөний тохиргоо (орц, цонх, булан, VIP өрөө), чөлөөт объект, лангууны хэмжээ, эргэлт болон шинэ загварыг сервер одоогоор хадгалахгүй — «Дизайн файл (JSON)»-оор хадгална.</small></div>
      <details class="le-more"><summary>Бусад объект: ширээ, вандан, шилэн хуулт, хүүхдийн булан…</summary>${GROUPS.map(group).join('')}</details>
      <div class="le-tools le-sel"><span class="le-lab" data-le-name>Объект сонгоогүй</span>
        <button type="button" class="chip" data-le-act="rotate">Эргүүлэх</button><button type="button" class="chip" data-le-act="grow">Томсгох</button><button type="button" class="chip" data-le-act="shrink">Жижигрүүлэх</button><button type="button" class="chip" data-le-act="duplicate">Хуулбарлах</button><button type="button" class="chip" data-le-act="sensor">Мэдрэгчтэй эсэх</button><button type="button" class="chip le-del" data-le-act="delete">Устгах</button>
        <button type="button" class="btn btn-g le-reset" data-le-act="reset">Загварын анхны байрлал</button></div>
      <div class="le-tools le-view"><span class="le-lab">Харах</span>
        <button type="button" class="chip" data-le-act="undo" aria-label="Буцаах (Ctrl+Z)">↶ Буцаах</button><button type="button" class="chip" data-le-act="redo" aria-label="Дахин хийх (Ctrl+Y)">↷ Дахих</button>
        <button type="button" class="chip" data-le-act="zoomout" aria-label="Зураглалыг жижигрүүлэх">−</button><button type="button" class="chip" data-le-act="zoomfit">Бүтнээр</button><button type="button" class="chip" data-le-act="zoomin" aria-label="Зураглалыг томруулах">+</button>
        <button type="button" class="chip" data-le-act="scaledown">Бүгдийг жижигрүүлэх</button><button type="button" class="chip" data-le-act="scaleup">Бүгдийг томсгох</button>
        <label class="le-check"><input type="checkbox" data-le-snap ${this.snap ? 'checked' : ''}> Сүлжээнд наалдах</label></div>
      <div class="le-body"><div class="plan-wrap le-plan" tabindex="0" aria-label="Кафены зураглал засах: объектыг чирж байрлуулна, сумаар хөдөлгөнө, Delete товчоор устгана, R товчоор эргүүлнэ, Ctrl+Z буцаана"></div>
        <aside class="le-props" data-le-props aria-label="Сонгосон объектын тохиргоо"></aside></div>
      <p class="le-hint" data-le-hint aria-live="polite"></p>
      <details class="le-json"><summary>Дизайн файл (JSON)</summary>
        <p class="muted">Энэ JSON-ийг <code>js/simulation/designs/&lt;нэр&gt;.js</code> файлын <code>layout</code> хэсэгт тавьж, кафены id-г <code>cafes.ids</code>-д нэмнэ. Энэ кафены id: <code>${escapeHTML(String(cafe.id))}</code></p>
        <textarea data-le-json rows="8" spellcheck="false" aria-label="Зураглалын JSON"></textarea>
        <div class="le-tools"><button type="button" class="chip" data-le-act="export">JSON гаргах</button><button type="button" class="chip" data-le-act="copy">Хуулах</button><button type="button" class="chip" data-le-act="import">JSON-оос ачаалах</button><button type="button" class="chip" data-le-act="draft" ${this.draft ? '' : 'hidden'}>Хадгалаагүй ноорог сэргээх</button></div>
      </details></div>`;
    this.wrap = root.querySelector('.le-plan');
    this.fp = new FloorPlan(this.wrap, { id: cafe.id, name: cafe.name, occ: 0 }, { layout: this.L, editor: true, overlay: ctx => this.overlay(ctx) });
    const on = (el, type, fn) => el.addEventListener(type, fn, { signal: this.events.signal });
    on(root, 'click', e => this.click(e));
    on(root, 'input', e => this.lookInput(e));
    on(root, 'change', e => this.propInput(e));
    on(this.fp.cv, 'pointerdown', e => this.down(e));
    on(this.fp.cv, 'pointermove', e => this.move(e));
    on(this.fp.cv, 'pointerup', e => this.up(e));
    on(this.fp.cv, 'pointercancel', e => this.up(e));
    on(this.wrap, 'keydown', e => this.key(e));
    this.renderLooks(); this.sync();
  }
  // Windows are edited as { side, a, b }; the engine reads both forms.
  load(layout) { const L = copy(resolveLayout(layout, this.cafe)); L.windows = windowsOf(L); L.items = L.items || []; return L; }
  init(layout) {
    this.L = this.load(layout);
    this.preset = LAYOUT_IDS.includes(this.L.id) ? this.L.id : this.L.theme === 'artistic' ? 'artistic' : 'minimal';
    this.look = this.L.look || null; if (!this.look) delete this.L.look;
    if (this.L.design) this.designId = this.L.design;
  }

  getLayout() {
    const items = (this.L.items || []).length ? { items: copy(this.L.items) } : {};
    return { preset: this.preset, overrides: arrangementOf(this.L), ...(this.look ? { look: copy(this.look) } : {}), ...items };
  }
  setLayout(layout) { this.init(layout); this.sel = null; this.renderLooks(); this.redraw(); this.sync(); }
  destroy() { this.events.abort(); cancelAnimationFrame(this.frame); this.fp.destroy(); }

  redraw() { cancelAnimationFrame(this.frame); this.frame = 0; this.fp.setLayout(this.L); }
  schedule() { if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.fp.setLayout(this.L); }); }
  changed(fromPanel = false) { this.redraw(); this.sync(!fromPanel); const layout = this.getLayout(); store.set(this.draftKey, layout); this.onChange(layout); }

  /* ---------- undo / redo ---------- */
  state() { return JSON.stringify({ L: this.L, preset: this.preset, look: this.look }); }
  snapshot() { this.past.push(this.state()); if (this.past.length > HISTORY) this.past.shift(); this.future = []; }
  restore(from, to) {
    if (!from.length) return; to.push(this.state()); const s = JSON.parse(from.pop());
    this.L = s.L; this.preset = s.preset; this.look = s.look; this.sel = null; Snd.ui('tick'); this.renderLooks(); this.changed();
  }

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
  sync(panel = true) {
    this.root.querySelectorAll('[data-le-template]').forEach(b => { const on = !this.look && b.dataset.leTemplate === this.preset; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    this.root.querySelectorAll('[data-le-look]').forEach(b => { const on = !!this.look && this.customLooks[+b.dataset.leLook]?.name === this.look.name; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    this.root.querySelectorAll('[data-le-design]').forEach(b => b.setAttribute('aria-pressed', b.dataset.leDesign === this.designId));
    const note = this.root.querySelector('[data-le-designnote]');
    note.textContent = this.bound ? `Энэ кафе «${this.bound.name}» дизайн файлаас зураглалаа авдаг. Сервер дээр хадгалахад зөвхөн энгийн объектууд хадгалагдана; бүх өөрчлөлтөө «Дизайн файл (JSON)»-оор гаргаж файлдаа хуулна уу.` : 'Дизайн сонговол түүнийг энэ кафед ашиглах эхлэл болгоно.';
    const [kind, i] = this.sel || [], f = kind ? frameOf(this.L, kind, i) : null, o = kind ? getObj(this.L, kind, i) : null;
    this.root.querySelector('[data-le-name]').textContent = kind ? label(this.L, kind, i) : 'Объект сонгоогүй';
    this.root.querySelector('[data-le-act="rotate"]').disabled = !kind || !(f?.cr || CONVERTIBLE.includes(kind));
    for (const act of ['grow', 'shrink']) this.root.querySelector(`[data-le-act="${act}"]`).disabled = !(f?.cw || f?.ch);
    this.root.querySelector('[data-le-act="duplicate"]').disabled = !kind || !(LIST[kind] && kind !== 'cut') || (kind === 'item' && this.L.items.length >= 300);
    this.root.querySelector('[data-le-act="sensor"]').disabled = kind !== 'sofa';
    this.root.querySelector('[data-le-act="delete"]').disabled = !kind || kind === 'counter' || kind === 'door' || !o;
    this.root.querySelector('[data-le-act="undo"]').disabled = !this.past.length;
    this.root.querySelector('[data-le-act="redo"]').disabled = !this.future.length;
    this.root.querySelector('[data-le-add="rug"]').disabled = !!this.L.rug;
    this.root.querySelector('[data-le-add="vip"]').disabled = !!this.L.vip;
    this.root.querySelector('[data-le-add="cut"]').disabled = (this.L.cuts || []).length >= 4;
    this.root.querySelectorAll('[data-le-item]').forEach(b => { b.disabled = this.L.items.length >= 300; });
    if (panel) this.renderProps();
    const blocked = this.blockedSeats();
    const hint = this.root.querySelector('[data-le-hint]');
    hint.classList.toggle('warn', blocked > 0);
    // A one-off message (conversion, JSON) is shown together with a walkway warning, never hidden by it.
    hint.textContent = blocked > 0 ? `${this.message ? this.message + ' ' : ''}${blocked} суудал руу хүрэх зам алга — объектуудын хооронд зай гаргана уу.` : this.message || 'Объект дээр дарж чирээд байрлуулна. Булан, ирмэгийн бариулаар өргөн, уртыг өөрчилж, дугуй бариулаар эргүүлнэ (Shift: 15°). Сумаар хөдөлгөж, Delete товчоор устгана.';
    this.message = '';
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

  /* ---------- the side panel: exact position, size, angle and the object's own settings ---------- */
  renderProps() {
    const box = this.root.querySelector('[data-le-props]'), [kind, i] = this.sel || [];
    const f = kind ? frameOf(this.L, kind, i) : null;
    if (!f) { box.innerHTML = `<p class="muted">Объект сонгоход байрлал, хэмжээ, эргэлтийг энд тоогоор өөрчилнө.</p>`; return; }
    const num = (key, text, value, extra = '') => `<label>${text}<input type="number" data-le-prop="${key}" value="${Math.round(value)}" ${extra}></label>`;
    const fields = [num('x', 'X', f.x, 'min="24" max="776"'), num('y', 'Y', f.y, 'min="24" max="500"')];
    if (f.cw) fields.push(num('w', 'Өргөн', f.w, 'min="4"'));
    if (f.ch && !(f.sym && f.cw)) fields.push(num('h', 'Урт', f.h, 'min="4"'));
    if (f.cr || CONVERTIBLE.includes(kind)) fields.push(num('rot', 'Эргэлт, °', f.rot, 'min="-180" max="180" step="1"'));
    if (kind === 'item') {
      const o = this.L.items[i], spec = CATALOG[o.type];
      if (spec.seats || spec.solid !== 'none') fields.push(`<label>Нэр<input data-le-prop="name" maxlength="30" value="${escapeHTML(o.name || '')}" placeholder="${escapeHTML(spec.name)}"></label>`);
      for (const p of spec.props || []) {
        const v = o[p.key] ?? spec.defaults?.[p.key] ?? '';
        if (p.type === 'int') fields.push(`<label>${p.label}<input type="number" data-le-prop="${p.key}" value="${v}" min="${p.min}" max="${p.max}" step="1"></label>`);
        else if (p.type === 'select') fields.push(`<label>${p.label}<select data-le-prop="${p.key}">${p.options.map(([k, n]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`);
        else if (p.type === 'text') fields.push(`<label>${p.label}<input data-le-prop="${p.key}" maxlength="${p.max || 30}" value="${escapeHTML(String(v))}"></label>`);
        else if (p.type === 'color') fields.push(`<label class="le-color"><input type="color" data-le-prop="${p.key}" value="${/^#[0-9a-f]{6}$/i.test(v) ? v : '#888888'}">${p.label}</label>`);
      }
    }
    box.innerHTML = `<b>${escapeHTML(label(this.L, kind, i))}</b><div class="le-prop-grid">${fields.join('')}</div>${!f.cr && CONVERTIBLE.includes(kind) ? '<small class="muted">Эргүүлэхэд чөлөөт объект болж, дизайн файлаар хадгалагдана.</small>' : ''}`;
  }
  propInput(e) {
    const snap = e.target.closest('[data-le-snap]'); if (snap) { this.snap = snap.checked; store.set('le-snap', this.snap); return; }
    const t = e.target.closest('[data-le-prop]'); if (!t || !this.sel) return;
    const key = t.dataset.leProp, raw = t.value, value = Number(raw);
    let [kind, i] = this.sel; const f = frameOf(this.L, kind, i); if (!f) return;
    this.snapshot();
    if (key === 'x' || key === 'y') { if (!Number.isFinite(value)) return; this.moveBy(kind, i, key === 'x' ? value - f.x : 0, key === 'y' ? value - f.y : 0); }
    else if (key === 'w' || key === 'h') { if (!Number.isFinite(value)) return; setSize(this.L, kind, i, key === 'w' ? value : f.w, key === 'h' || (f.sym && f.cw) ? value : f.h); this.keepInside(kind, i); }
    else if (key === 'rot') { if (!Number.isFinite(value)) return; this.turn(value - f.rot, true); }
    else if (kind === 'item') {
      const o = this.L.items[i], p = CATALOG[o.type].props?.find(q => q.key === key);
      if (key === 'name') { if (raw.trim()) o.name = raw.trim().slice(0, 30); else delete o.name; }
      else if (p?.type === 'int' && Number.isFinite(value)) o[key] = Math.round(clamp(value, p.min, p.max));
      else if (p?.type === 'select' && p.options.some(([k]) => k === raw)) o[key] = raw;
      else if (p?.type === 'text') o[key] = raw.slice(0, p.max || 30);
      else if (p?.type === 'color' && /^#[0-9a-f]{6}$/i.test(raw)) o[key] = raw;
      else return;
    }
    this.changed(key !== 'rot');
    if (key === 'rot') this.renderProps();
  }

  /* ---------- moving, sizing and turning ---------- */
  moveBy(kind, i, dx, dy) { const from = copy(getObj(this.L, kind, i)), inside = kind === 'vip' ? this.inside() : []; setObj(this.L, kind, i, place(this.L, kind, i, from, dx, dy)); this.carry({ from, inside }); }
  keepInside(kind, i) { if (kind !== 'door') setObj(this.L, kind, i, place(this.L, kind, i, copy(getObj(this.L, kind, i)), 0, 0)); }
  // Turn the selection by `by` degrees (or to an angle); classic objects become free-form first.
  turn(by, exact = false) {
    let [kind, i] = this.sel; const f = frameOf(this.L, kind, i);
    if (!f.cr) { if (!this.convert()) return false; [kind, i] = this.sel; }
    const rot = norm((exact ? f.rot : frameOf(this.L, kind, i).rot) + by);
    if (kind === 'item') this.L.items[i].rot = rot;
    else if (kind === 'counter') { this.L.counter = counterFromFrame({ ...counterFrame(this.L.counter), rot }); this.keepInside(kind, i); }
    return true;
  }
  convert() {
    const [kind, i] = this.sel; if (!CONVERTIBLE.includes(kind)) return false;
    const o = getObj(this.L, kind, i), item = toItem(kind, o); if (!item) return false;
    if (LIST[kind]) this.L[LIST[kind]].splice(i, 1); else setObj(this.L, kind, i, null);
    // A sofa's coffee table stays where it was, as its own small table.
    if (kind === 'sofa' && o.table) this.L.items.push(makeItem('table', o.table[0], o.table[1], { shape: 'round', w: 52, h: 30, n: 0, s: 0, wl: 0, e: 0 }));
    this.L.items.push(item); this.sel = ['item', this.L.items.length - 1];
    this.message = `«${NAMES[kind]}» чөлөөт объект боллоо: дурын өнцгөөр эргэж, дизайн файлаар хадгалагдана.`;
    return true;
  }
  handles() {
    if (!this.sel) return [];
    const f = frameOf(this.L, ...this.sel); if (!f) return [];
    const out = [];
    if (f.cw && f.ch && !f.sym) for (const sx of [-1, 1]) for (const sy of [-1, 1]) out.push({ sx, sy });
    if (f.cw) for (const sx of [-1, 1]) out.push({ sx, sy: 0 });
    if (f.ch && !(f.sym && f.cw)) for (const sy of [-1, 1]) out.push({ sx: 0, sy });
    for (const h of out) h.p = toWorld(f, h.sx * f.w / 2, h.sy * f.h / 2);
    if (f.cr || CONVERTIBLE.includes(this.sel[0])) out.push({ rot: true, p: toWorld(f, 0, -f.h / 2 - KNOB) });
    return out;
  }
  // About 14 screen pixels around a handle, whatever the zoom or screen width (fingers too).
  handleAt(p) { const tol = Math.max(8, 14 * this.fp.W / (this.fp.cssW || this.fp.W)); return this.handles().find(h => Math.hypot(h.p[0] - p[0], h.p[1] - p[1]) <= tol) || null; }

  pick(p) { return objects(this.L).find(([kind, i]) => hits(this.L, kind, i, p)) || null; }
  down(e) {
    const p = this.fp.pt(e); this.wrap.focus({ preventScroll: true });
    const handle = this.handleAt(p), capture = () => { try { this.fp.cv.setPointerCapture(e.pointerId); } catch (_) { } };
    if (handle) { this.drag = { mode: handle.rot ? 'rotate' : 'resize', handle, id: e.pointerId, moved: false, shift: e.shiftKey }; capture(); return; }
    const hit = this.pick(p); this.sel = hit;
    if (hit) { this.drag = { mode: 'move', p, from: copy(getObj(this.L, ...hit)), f0: frameOf(this.L, ...hit), inside: hit[0] === 'vip' ? this.inside() : [], id: e.pointerId, moved: false }; capture(); Snd.ui('click'); }
    else if (this.wrap.scrollWidth > this.wrap.clientWidth + 2 || this.wrap.scrollHeight > this.wrap.clientHeight + 2) { this.drag = { mode: 'pan', id: e.pointerId, cx: e.clientX, cy: e.clientY, sl: this.wrap.scrollLeft, st: this.wrap.scrollTop }; capture(); }
    this.sync(); this.fp.draw();
  }
  move(e) {
    const p = this.fp.pt(e), d = this.drag;
    if (!d || d.id !== e.pointerId) {
      const h = this.handleAt(p), o = h ? null : this.pick(p);
      this.fp.cv.style.cursor = h ? (h.rot ? 'grab' : 'nwse-resize') : o ? 'move' : 'default';
      if (String(o) !== String(this.hover)) { this.hover = o; this.fp.draw(); } return;
    }
    if (d.mode === 'pan') { this.wrap.scrollLeft = d.sl - (e.clientX - d.cx); this.wrap.scrollTop = d.st - (e.clientY - d.cy); return; }
    let [kind, i] = this.sel;
    if (d.mode === 'move') {
      let dx = p[0] - d.p[0], dy = p[1] - d.p[1];
      if (!d.moved && Math.hypot(dx, dy) < 2) return;
      if (!d.moved) this.snapshot();
      if (this.snap && d.f0) { dx = Math.round((d.f0.x + dx) / 10) * 10 - d.f0.x; dy = Math.round((d.f0.y + dy) / 10) * 10 - d.f0.y; }
      d.moved = true; setObj(this.L, kind, i, place(this.L, kind, i, d.from, dx, dy)); this.carry(d); this.schedule(); return;
    }
    if (!d.moved) {
      this.snapshot(); d.moved = true;
      if (d.mode === 'rotate' && !frameOf(this.L, kind, i).cr && this.convert()) [kind, i] = this.sel;
      d.from = copy(getObj(this.L, kind, i)); d.f0 = frameOf(this.L, kind, i);
    }
    const f0 = d.f0; setObj(this.L, kind, i, copy(d.from));
    if (d.mode === 'rotate') {
      let ang = Math.atan2(p[1] - f0.y, p[0] - f0.x) / DEG + 90; ang = e.shiftKey ? Math.round(ang / 15) * 15 : Math.round(ang);
      this.turn(norm(ang) - f0.rot, true);
    } else {
      const { sx, sy } = d.handle, [lx, ly] = toLocal(f0, ...p), step = v => this.snap ? Math.round(v / 5) * 5 : Math.round(v);
      let w = f0.w, h = f0.h;
      if (sx) w = f0.sym ? step(Math.abs(lx) * 2) : step(sx * lx + f0.w / 2);
      if (sy) h = f0.sym ? step(Math.abs(ly) * 2) : step(sy * ly + f0.h / 2);
      if (f0.sym && kind === 'plant') w = h = sx ? w : h;
      setSize(this.L, kind, i, Math.max(4, w), Math.max(4, h));
      if (!f0.sym) {
        const f1 = frameOf(this.L, kind, i), cx = sx ? sx * (f1.w - f0.w) / 2 : 0, cy = sy ? sy * (f1.h - f0.h) / 2 : 0, [wx, wy] = toWorld(f0, cx, cy);
        if (kind === 'counter') { const c = counterFrame(this.L.counter); this.L.counter = counterFromFrame({ ...c, x: wx, y: wy }); }
        else this.moveBy(kind, i, wx - f1.x, wy - f1.y);
      }
      this.keepInside(kind, i);
    }
    this.schedule();
  }
  // The furniture standing in the VIP room moves with the room.
  inside() { const v = this.L.vip; return objects(this.L).filter(([k]) => !['vip', 'door', 'window', 'cut', 'counter', 'bar', 'rug'].includes(k)).filter(([k, i]) => { if (k === 'item' && CATALOG[this.L.items[i].type].layer === 'floor0') return false; const [x0, y0, x1, y1] = bounds(this.L, k, i), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; return cx > v.x && cx < v.x + v.w && cy > v.y && cy < v.y + v.h; }).map(([k, i]) => [k, i, copy(getObj(this.L, k, i))]); }
  carry({ from, inside }) {
    if (!inside?.length) return; const dx = this.L.vip.x - from.x, dy = this.L.vip.y - from.y;
    for (const [k, i, start] of inside) { const o = copy(start); if (Array.isArray(o)) { o[0] += dx; o[1] += dy; } else { o.x += dx; o.y += dy; if (o.seats && k !== 'item') o.seats = o.seats.map(v => v + dx); if (o.table) o.table = [o.table[0] + dx, o.table[1] + dy]; if (o.label) o.label = [o.label[0] + dx, o.label[1] + dy]; } setObj(this.L, k, i, o); }
  }
  up(e) { if (!this.drag || this.drag.id !== e.pointerId) return; const { moved, mode } = this.drag; this.drag = null; if (moved && mode !== 'pan') this.changed(); }
  key(e) {
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? this.act('redo') : this.act('undo'); return; }
    if (mod && k === 'y') { e.preventDefault(); this.act('redo'); return; }
    if (!this.sel) return;
    if (mod && k === 'd') { e.preventDefault(); this.act('duplicate'); return; }
    const step = e.shiftKey ? 20 : 5;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (d) { e.preventDefault(); this.snapshot(); this.moveBy(...this.sel, ...d); this.changed(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.act('delete'); }
    else if (k === 'r') this.act(e.shiftKey ? 'rotateback' : 'rotate');
    else if (e.key === '+' || e.key === '=') this.act('grow');
    else if (e.key === '-') this.act('shrink');
  }

  click(e) {
    const t = e.target.closest('[data-le-template],[data-le-look],[data-le-newlook],[data-le-savelook],[data-le-add],[data-le-item],[data-le-design],[data-le-act]'); if (!t || t.disabled) return;
    const form = this.root.querySelector('[data-le-lookform]');
    if (t.dataset.leTemplate) { Snd.ui('click'); this.snapshot(); this.preset = t.dataset.leTemplate; this.look = null; delete this.L.look; form.hidden = true; Object.assign(this.L, { id: this.preset, name: LAYOUTS[this.preset].name, theme: LAYOUTS[this.preset].theme }); this.changed(); }
    else if (t.dataset.leLook) { Snd.ui('click'); this.snapshot(); this.useLook(copy(this.customLooks[+t.dataset.leLook])); form.hidden = true; }
    else if ('leNewlook' in t.dataset) { Snd.ui('pop'); this.snapshot(); const T = THEMES[LAYOUTS[this.preset].theme]; this.useLook({ name: `Шинэ загвар ${this.savedLooks().length + 1}`, base: this.preset, floorStyle: T.floorStyle, floor: T.floor, wall: T.wall, wood: T.table[1], sofa: T.sofa[0], plant: T.plant[0], accent: T.accents[0] }); this.renderLooks(); this.sync(); this.lookForm(); }
    else if ('leSavelook' in t.dataset) { const list = this.savedLooks().filter(l => l.name !== this.look.name); store.set('looks', [copy(this.look), ...list].slice(0, 12)); Snd.ui('chime'); form.hidden = true; this.renderLooks(); this.sync(); }
    else if (t.dataset.leDesign) { Snd.ui('whoosh'); this.snapshot(); this.designId = t.dataset.leDesign; this.init({ design: this.designId }); this.sel = null; form.hidden = true; this.renderLooks(); this.changed(); }
    else if (t.dataset.leAdd) { this.snapshot(); this.add(t.dataset.leAdd); }
    else if (t.dataset.leItem) { this.snapshot(); this.addItem(t.dataset.leItem); }
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
  addItem(type) {
    const n = this.L.items.length, item = makeItem(type, 360 + (n % 5) * 20, 240 + (n % 4) * 20); if (!item) return;
    this.L.items.push(item); this.sel = ['item', this.L.items.length - 1]; Snd.ui('pop'); this.changed();
  }
  act(action) {
    const L = this.L, [kind, i] = this.sel || [];
    if (action === 'undo') { this.restore(this.past, this.future); return; }
    if (action === 'redo') { this.restore(this.future, this.past); return; }
    if (action === 'zoomin' || action === 'zoomout') { this.fp.setZoom(action === 'zoomin' ? 1.25 : 1 / 1.25); this.fp.draw(); return; }
    if (action === 'zoomfit') { this.fp.zoom = 1; this.fp.resize(true); this.fp.draw(); return; }
    if (action === 'scaleup' || action === 'scaledown') { this.snapshot(); this.scaleAll(action === 'scaleup' ? 1.1 : 1 / 1.1); Snd.ui('tick'); this.changed(); return; }
    if (action === 'export' || action === 'copy') { const area = this.root.querySelector('[data-le-json]'); area.value = JSON.stringify(this.getLayout(), null, 2); if (action === 'copy') { area.select(); navigator.clipboard?.writeText(area.value).catch(() => { }); this.message = 'JSON хуулагдлаа.'; } this.sync(false); return; }
    if (action === 'import') {
      const area = this.root.querySelector('[data-le-json]');
      try { const config = cleanConfig(JSON.parse(area.value)); this.snapshot(); this.init(config); this.sel = null; this.renderLooks(); this.message = 'JSON-оос ачааллаа.'; Snd.ui('chime'); this.changed(); }
      catch (err) { this.message = `JSON уншиж чадсангүй: ${err.message}`; this.sync(false); }
      return;
    }
    if (action === 'draft') { if (!this.draft) return; try { const config = cleanConfig(this.draft); this.snapshot(); this.init(config); this.sel = null; this.renderLooks(); this.message = 'Ноорог сэргээгдлээ.'; this.changed(); } catch { this.message = 'Ноорог эвдэрсэн байна.'; this.sync(false); } return; }
    if (action === 'reset') { Snd.ui('whoosh'); this.snapshot(); this.init(this.designId ? { design: this.designId } : { preset: this.preset }); this.sel = null; this.renderLooks(); this.changed(); return; }
    if (!kind) return;
    if (action === 'delete' && kind !== 'counter' && kind !== 'door') { this.snapshot(); if (LIST[kind]) L[LIST[kind]].splice(i, 1); else setObj(L, kind, i, null); if (kind === 'vip') delete L.vip; this.sel = null; Snd.ui('leave'); }
    else if (action === 'duplicate') {
      if (!LIST[kind] || kind === 'cut') return; this.snapshot();
      const o = copy(getObj(L, kind, i)); if (kind === 'item') o.id = makeItem(o.type, 0, 0).id;
      L[LIST[kind]].push(o); const j = L[LIST[kind]].length - 1; setObj(L, kind, j, place(L, kind, j, o, 20, 20)); this.sel = [kind, j]; Snd.ui('pop');
    }
    else if (action === 'rotate' || action === 'rotateback') {
      const o = getObj(L, kind, i), by = action === 'rotate' ? 15 : -15;
      this.snapshot();
      if (kind === 'round') o.dirs = ROUND_DIRS[(ROUND_DIRS.indexOf(o.dirs) + 1) % ROUND_DIRS.length];
      else if (kind === 'chair') o.dir = CHAIR_DIRS[(CHAIR_DIRS.indexOf(o.dir) + 1) % 4];
      else if (kind === 'shelf') setObj(L, kind, i, place(L, kind, i, { ...o, w: o.h, h: o.w }, 0, 0));
      else if (!this.turn(by)) { this.past.pop(); return; }
      Snd.ui('tick');
    }
    else if (action === 'grow' || action === 'shrink') {
      const f = frameOf(L, kind, i); if (!f || !(f.cw || f.ch)) return; const k = action === 'grow' ? 1.15 : 1 / 1.15;
      this.snapshot(); setSize(L, kind, i, f.cw ? f.w * k : f.w, f.ch ? f.h * k : f.h); this.keepInside(kind, i); Snd.ui('tick');
    }
    else if (action === 'sensor' && kind === 'sofa') { this.snapshot(); const f = L.sofas[i]; f.sensor = !f.sensor; f.zone = f.sensor ? 'lounge' : 'sofa'; Snd.ui('tick'); }
    else return;
    this.changed();
  }
  // Bring everything closer together or spread it out, around the middle of the room.
  scaleAll(k) {
    const L = this.L, cx = 400, cy = 262;
    for (const [kind, i] of objects(L)) {
      if (['door', 'window', 'cut', 'vip'].includes(kind) || (kind === 'item' && CATALOG[L.items[i].type].layer === 'floor0')) continue;
      const f = frameOf(L, kind, i); if (!f) continue;
      if (f.cw || f.ch) setSize(L, kind, i, f.cw ? f.w * k : f.w, f.ch ? f.h * k : f.h);
      const f1 = frameOf(L, kind, i), tx = cx + (f.x - cx) * k, ty = cy + (f.y - cy) * k;
      if (kind === 'counter') { L.counter = counterFromFrame({ ...counterFrame(L.counter), x: tx, y: ty }); this.keepInside(kind, i); }
      else this.moveBy(kind, i, tx - f1.x, ty - f1.y);
    }
  }

  overlay(x) {
    const box = (sel, style, width) => { if (!sel) return; const b = bounds(this.L, ...sel); if (!b) return; const [x0, y0, x1, y1] = b; x.save(); x.strokeStyle = style; x.lineWidth = width; x.setLineDash([6, 4]); this.fp.rr(x, x0 - 3, y0 - 3, x1 - x0 + 6, y1 - y0 + 6, 8); x.stroke(); x.restore(); };
    if (this.hover && String(this.hover) !== String(this.sel)) box(this.hover, 'rgba(123,84,47,.35)', 1.5);
    if (!this.sel || !getObj(this.L, ...this.sel)) return;
    const f = frameOf(this.L, ...this.sel);
    if (!f || (!f.rot && this.sel[0] !== 'item' && this.sel[0] !== 'counter')) box(this.sel, '#FF9D00', 2.5);
    else { x.save(); x.strokeStyle = '#FF9D00'; x.lineWidth = 2.5; x.setLineDash([6, 4]); const c = corners({ ...f, w: f.w + 6, h: f.h + 6 }); x.beginPath(); c.forEach(([a, b], k) => k ? x.lineTo(a, b) : x.moveTo(a, b)); x.closePath(); x.stroke(); x.restore(); }
    const hs = this.handles(); if (!hs.length) return;
    x.save(); x.setLineDash([]); x.lineWidth = 1.5; x.strokeStyle = '#B6771D';
    const knob = hs.find(h => h.rot); if (knob && f) { const top = toWorld(f, 0, -f.h / 2); x.beginPath(); x.moveTo(...top); x.lineTo(...knob.p); x.stroke(); }
    for (const h of hs) { x.fillStyle = h.rot ? '#FF9D00' : '#FFFFFF'; x.beginPath(); h.rot ? x.arc(h.p[0], h.p[1], 6, 0, 7) : x.rect(h.p[0] - 4.5, h.p[1] - 4.5, 9, 9); x.fill(); x.stroke(); }
    x.restore();
  }
}
