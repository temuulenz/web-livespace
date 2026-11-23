/* ================= floor-plan object catalogue =================
 * Free-form objects for café interiors (`layout.items`). Each type is described once,
 * here: its default size and limits, whether it turns, what blocks the walkway, which
 * seats it adds and how it is drawn. FloorPlan and the admin layout editor read this
 * table, so a new kind of object is one new entry, never a new `if` in the engine.
 *
 * An item is plain data: { id, type, x, y, w, h, rot, ...props }.
 * (x, y) is the centre in the 800×520 FloorPlan world, w × h the size before turning,
 * rot the angle in degrees (clockwise). Seats and drawings are given in the item's own
 * frame (centre at 0,0; "front" is −y) and turned with it.
 *
 * The order counter is not an item: the engine keeps one counter, which may now also
 * be resized and turned (counterBox below). Layouts without items or counter sizes are
 * drawn and simulated exactly as before.
 */

const DEG = Math.PI / 180;
const fin = (v, d) => Number.isFinite(v) ? v : d;
const clampN = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const hex = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c : null;
const mix = (a, b, t) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');

/* ---------- geometry shared by the engine and the editor ---------- */
function toWorld(o, lx, ly) { const a = (o.rot || 0) * DEG, c = Math.cos(a), s = Math.sin(a); return [o.x + lx * c - ly * s, o.y + lx * s + ly * c]; }
function toLocal(o, px, py) { const a = (o.rot || 0) * DEG, c = Math.cos(a), s = Math.sin(a), dx = px - o.x, dy = py - o.y; return [dx * c + dy * s, -dx * s + dy * c]; }
function corners(o) { const w = o.w / 2, h = o.h / 2; return [[-w, -h], [w, -h], [w, h], [-w, h]].map(([a, b]) => toWorld(o, a, b)); }
function aabb(o) { const c = corners(o), xs = c.map(p => p[0]), ys = c.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }
function contains(o, px, py, pad = 0) { const [lx, ly] = toLocal(o, px, py); return Math.abs(lx) <= o.w / 2 + pad && Math.abs(ly) <= o.h / 2 + pad; }

/* ---------- the order counter: the original 176×226 barista area, resized and turned ---------- */
const COUNTER_W = 176, COUNTER_H = 226;
function counterBox(c) {
  const w = clampN(fin(c?.w, COUNTER_W), 100, 360), h = clampN(fin(c?.h, COUNTER_H), 100, 360), rot = fin(c?.rot, 0);
  return { x: fin(c?.x, 600), y: fin(c?.y, 24), w, h, rot, custom: w !== COUNTER_W || h !== COUNTER_H || rot % 360 !== 0 };
}
// A point of the original drawing (x 600–776, y 24–250) in the world.
function counterPoint(box, px, py) {
  if (!box.custom) return [px + box.x - 600, py + box.y - 24];
  return toWorld({ x: box.x + box.w / 2, y: box.y + box.h / 2, rot: box.rot }, (px - 688) * box.w / COUNTER_W, (py - 137) * box.h / COUNTER_H);
}
// Centre-based frame for the editor, and back.
function counterFrame(c) { const b = counterBox(c); return { x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w, h: b.h, rot: b.rot }; }
function counterFromFrame(f) {
  const out = { x: Math.round(f.x - f.w / 2), y: Math.round(f.y - f.h / 2) };
  if (f.w !== COUNTER_W || f.h !== COUNTER_H || (f.rot || 0) % 360 !== 0) Object.assign(out, { w: Math.round(f.w), h: Math.round(f.h), rot: Math.round(f.rot || 0) });
  return out;
}

/* ---------- seats ---------- */
const sideSeats = (o, off = 16) => {
  const out = [], put = (n, fn) => { for (let i = 0; i < n; i++) out.push(fn((i + .5) / n)); };
  put(o.n ?? 0, t => [-o.w / 2 + t * o.w, -o.h / 2 - off, Math.PI / 2]);
  put(o.s ?? 0, t => [-o.w / 2 + t * o.w, o.h / 2 + off, -Math.PI / 2]);
  put(o.wl ?? 0, t => [-o.w / 2 - off, -o.h / 2 + t * o.h, 0]);
  put(o.e ?? 0, t => [o.w / 2 + off, -o.h / 2 + t * o.h, Math.PI]);
  return out.map(([x, y, ang]) => ({ x, y, ang }));
};
const rowSeats = (o, n, y, kind, inset = 14) => Array.from({ length: n }, (_, i) => ({ x: -o.w / 2 + inset + (i + .5) * (o.w - inset * 2) / n, y, ang: -Math.PI / 2, kind }));

/* ---------- drawing helpers (local frame, item centre at 0,0) ---------- */
const box = (x, o, h, fill, r = 4) => { x.fillStyle = fill; h.rr(-o.w / 2, -o.h / 2, o.w, o.h, Math.min(r, o.w / 2, o.h / 2)); x.fill(); };
const shadow = (x, o, h, r = 4) => { x.fillStyle = 'rgba(0,0,0,.1)'; h.rr(-o.w / 2 + 2, -o.h / 2 + 3, o.w, o.h, Math.min(r, o.w / 2, o.h / 2)); x.fill(); };
const spines = (x, o, colors, inset = 4, step = 7) => { const vert = o.h > o.w, len = vert ? o.h : o.w; for (let p = 6, i = 0; p < len - 6; p += step, i++) { x.fillStyle = colors[i % colors.length]; vert ? x.fillRect(-o.w / 2 + inset, -o.h / 2 + p, o.w - inset * 2, step - 2) : x.fillRect(-o.w / 2 + p, -o.h / 2 + inset, step - 2, o.h - inset * 2); } };
const KIDS = ['#F2B544', '#E76F51', '#2A9D8F', '#8AB17D', '#5B8DEF', '#E9A6C9'];

/* ---------- the catalogue ---------- */
const sides = [['n', 'Сандал: урд тал'], ['s', 'Сандал: ар тал'], ['wl', 'Сандал: зүүн'], ['e', 'Сандал: баруун']];
const CATALOG = {
  table: {
    name: 'Ширээ', group: 'furniture', layer: 'object', size: [56, 56], min: [30, 30], max: [320, 180], solid: 'rect', zone: 'table',
    defaults: { shape: 'square', n: 1, s: 1, wl: 1, e: 1 },
    props: [{ key: 'shape', label: 'Хэлбэр', type: 'select', options: [['square', 'Дөрвөлжин'], ['round', 'Дугуй']] }, ...sides.map(([key, label]) => ({ key, label, type: 'int', min: 0, max: 6 }))],
    seats: o => sideSeats(o),
    draw(x, o, T, h) {
      x.fillStyle = 'rgba(0,0,0,.1)';
      if (o.shape === 'round') { x.beginPath(); x.ellipse(2, 3, o.w / 2, o.h / 2, 0, 0, 7); x.fill(); const g = x.createRadialGradient(-6, -6, 2, 0, 0, Math.max(o.w, o.h) / 2); g.addColorStop(0, T.table[0]); g.addColorStop(1, T.table[1]); x.fillStyle = g; x.beginPath(); x.ellipse(0, 0, o.w / 2, o.h / 2, 0, 0, 7); x.fill(); }
      else { h.rr(-o.w / 2 + 2, -o.h / 2 + 3, o.w, o.h, 4); x.fill(); x.fillStyle = T.table[1]; h.rr(-o.w / 2, -o.h / 2, o.w, o.h, T.thin ? 3 : 4); x.fill(); x.fillStyle = T.table[0]; x.globalAlpha = .35; h.rr(-o.w / 2 + 4, -o.h / 2 + 4, o.w - 8, o.h - 8, 3); x.fill(); x.globalAlpha = 1; }
      x.strokeStyle = T.table[2]; x.lineWidth = T.thin ? 1.2 : 2; x.stroke(); h.disc(0, 0, 4, '#FFFFFF'); h.disc(0, 0, 2.2, T.accents[0]);
    }
  },
  chair: {
    name: 'Сандал', group: 'furniture', layer: 'object', size: [24, 24], min: [20, 20], max: [32, 32], solid: 'none', zone: 'chair',
    seats: () => [{ x: 0, y: 0, ang: -Math.PI / 2 }], draw() { }
  },
  sofa: {
    name: 'Буйдан', group: 'furniture', layer: 'object', size: [168, 32], min: [60, 26], max: [320, 50], solid: 'rect', zone: 'lounge',
    defaults: { seats: 3 }, props: [{ key: 'seats', label: 'Суудал', type: 'int', min: 1, max: 6 }],
    seats: o => rowSeats(o, o.seats ?? 3, -4, 'sofa'),
    draw(x, o, T, h) { box(x, o, h, T.sofa[0], 10); x.fillStyle = T.sofa[1]; const n = o.seats ?? 3, cw = (o.w - 24) / n; for (let i = 0; i < n; i++) { h.rr(-o.w / 2 + 14 + i * cw, -o.h / 2 + 4, cw - 4, o.h - 10, 7); x.fill(); } x.fillStyle = T.sofa[2]; h.rr(-o.w / 2, o.h / 2 - 10, o.w, 10, 5); x.fill(); }
  },
  bench: {
    name: 'Вандан сандал', group: 'furniture', layer: 'object', size: [200, 24], min: [50, 16], max: [400, 40], solid: 'rect', zone: 'bench',
    defaults: { seats: 4 }, props: [{ key: 'seats', label: 'Суудал', type: 'int', min: 1, max: 8 }],
    seats: o => rowSeats(o, o.seats ?? 4, 0, 'sofa', 8),
    draw(x, o, T, h) { shadow(x, o, h); box(x, o, h, T.long[0]); x.strokeStyle = T.long[1]; x.lineWidth = 1.5; x.stroke(); x.strokeStyle = 'rgba(255,255,255,.22)'; x.lineWidth = 1; for (let i = 1; i < 3; i++) { x.beginPath(); x.moveTo(-o.w / 2 + 4, -o.h / 2 + i * o.h / 3); x.lineTo(o.w / 2 - 4, -o.h / 2 + i * o.h / 3); x.stroke(); } }
  },
  bar: {
    name: 'Баарны тавцан', group: 'furniture', layer: 'object', size: [220, 22], min: [60, 14], max: [520, 40], solid: 'rect', zone: 'bar',
    defaults: { stools: 3 }, props: [{ key: 'stools', label: 'Өндөр сандал', type: 'int', min: 0, max: 10 }],
    seats: o => rowSeats(o, o.stools ?? 3, o.h / 2 + 18, 'stool', 10).map(s => ({ ...s, ang: -Math.PI / 2 })),
    draw(x, o, T, h) { shadow(x, o, h, 6); box(x, o, h, T.bar[0], 6); x.strokeStyle = T.bar[1]; x.lineWidth = 2; x.stroke(); }
  },
  shelf: {
    name: 'Номын тавиур', group: 'furniture', layer: 'object', size: [120, 22], min: [20, 12], max: [400, 60], solid: 'rect',
    draw(x, o, T, h) { shadow(x, o, h); box(x, o, h, T.shelf); spines(x, o, T.spines); }
  },
  display: {
    name: 'Амттаны витрин', group: 'furniture', layer: 'object', size: [80, 36], min: [36, 24], max: [220, 70], solid: 'rect',
    draw(x, o, T, h) {
      shadow(x, o, h); box(x, o, h, '#2E2A27', 4); x.fillStyle = 'rgba(191,225,242,.75)'; h.rr(-o.w / 2 + 4, -o.h / 2 + 4, o.w - 8, o.h - 8, 3); x.fill();
      const n = Math.max(2, Math.floor((o.w - 12) / 16)); for (let i = 0; i < n; i++) { const cx = -o.w / 2 + 10 + (i + .5) * (o.w - 20) / n; h.disc(cx, -o.h / 6, 4.5, ['#F4D9B0', '#E9A6C9', '#C08A4A', '#FFF4DC'][i % 4]); h.disc(cx, o.h / 6, 4, ['#C8553D', '#F2B544', '#F4D9B0'][i % 3]); }
    }
  },
  plant: {
    name: 'Ургамал', group: 'decor', layer: 'object', size: [36, 36], min: [16, 16], max: [90, 90], solid: 'circle',
    draw(x, o, T, h) {
      const s = Math.min(o.w, o.h) / 2;
      if (T.bigLeaves) { h.disc(0, 0, s * .5, T.plant[3]); for (let a = 0; a < 7; a++) { x.fillStyle = T.plant[a % 3]; x.beginPath(); x.ellipse(Math.cos(a * .9) * s * .62, Math.sin(a * .9) * s * .62, s * .62, s * .3, a * .9, 0, 7); x.fill(); } h.disc(0, 0, s * .25, T.plant[3]); }
      else { h.disc(0, 0, s * .7, o.color && hex(o.color) || T.pot); for (let a = 0; a < 5; a++) { x.fillStyle = T.plant[a % 2]; x.beginPath(); x.ellipse(Math.cos(a * 1.257) * s * .4, Math.sin(a * 1.257) * s * .4, s * .42, s * .22, a * 1.257, 0, 7); x.fill(); } h.disc(0, 0, s * .16, T.plant[0]); }
    },
    props: [{ key: 'color', label: 'Ваарны өнгө', type: 'color' }]
  },
  rug: {
    name: 'Хивс', group: 'decor', layer: 'floor', size: [200, 110], min: [40, 40], max: [600, 400], solid: 'none',
    draw(x, o, T, h) { x.fillStyle = Array.isArray(T.rug) ? T.rug[0] : T.rug; h.rr(-o.w / 2, -o.h / 2, o.w, o.h, 10); x.fill(); x.strokeStyle = T.rug[1] || T.wall; x.lineWidth = 1.5; h.rr(-o.w / 2 + 6, -o.h / 2 + 6, o.w - 12, o.h - 12, 6); x.stroke(); }
  },
  floor: {
    name: 'Шалны хэсэг', group: 'room', layer: 'floor0', size: [300, 240], min: [40, 40], max: [760, 480], solid: 'none',
    defaults: { style: 'tiles', color: '#EDE7DC' },
    props: [{ key: 'style', label: 'Шал', type: 'select', options: [['tiles', 'Хавтан'], ['wood', 'Модон шал'], ['plain', 'Энгийн']] }, { key: 'color', label: 'Өнгө', type: 'color' }],
    draw(x, o) {
      const color = hex(o.color) || '#EDE7DC', line = mix(color, '#000000', .1), w = o.w / 2, hh = o.h / 2;
      x.fillStyle = color; x.fillRect(-w, -hh, o.w, o.h); x.save(); x.beginPath(); x.rect(-w, -hh, o.w, o.h); x.clip(); x.strokeStyle = line; x.lineWidth = 1;
      if (o.style === 'tiles') { for (let p = -w; p < w; p += 56) { x.beginPath(); x.moveTo(p, -hh); x.lineTo(p, hh); x.stroke(); } for (let p = -hh; p < hh; p += 56) { x.beginPath(); x.moveTo(-w, p); x.lineTo(w, p); x.stroke(); } }
      else if (o.style === 'wood') { for (let p = -hh, row = 0; p < hh; p += 16, row++) { x.beginPath(); x.moveTo(-w, p); x.lineTo(w, p); x.stroke(); for (let q = -w + (row % 3) * 37; q < w; q += 110) { x.beginPath(); x.moveTo(q, p); x.lineTo(q, p + 16); x.stroke(); } } }
      x.restore();
    }
  },
  wall: {
    name: 'Хана / шилэн хуулт', group: 'room', layer: 'object', size: [200, 8], min: [30, 4], max: [760, 24], solid: 'wall',
    defaults: { material: 'glass', color: '#4E8B3A', gap: 50, gapw: 0 },
    props: [{ key: 'material', label: 'Материал', type: 'select', options: [['glass', 'Шил'], ['wall', 'Хана']] }, { key: 'color', label: 'Жаазны өнгө', type: 'color' }, { key: 'gap', label: 'Гарцын байрлал, %', type: 'int', min: 0, max: 100 }, { key: 'gapw', label: 'Гарцын өргөн', type: 'int', min: 0, max: 200 }],
    draw(x, o, T) {
      for (const [a, b] of wallSegments(o)) {
        const len = b - a; if (len <= 0) continue;
        if (o.material === 'wall') { x.fillStyle = T.wall; x.fillRect(a, -o.h / 2, len, o.h); continue; }
        const frame = hex(o.color) || T.wall; x.fillStyle = 'rgba(191,225,242,.6)'; x.fillRect(a, -o.h / 2, len, o.h);
        x.strokeStyle = frame; x.lineWidth = 2; x.strokeRect(a, -o.h / 2, len, o.h); x.lineWidth = 2.5;
        for (let p = a + 40; p < b - 10; p += 40) { x.beginPath(); x.moveTo(p, -o.h / 2 - 1); x.lineTo(p, o.h / 2 + 1); x.stroke(); }
        x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 1; x.beginPath(); x.moveTo(a + 3, -o.h / 2 + 2); x.lineTo(b - 3, -o.h / 2 + 2); x.stroke();
      }
    }
  },
  panel: {
    name: 'Модон хана', group: 'room', layer: 'wall', size: [120, 10], min: [20, 4], max: [760, 30], solid: 'none',
    defaults: { color: '#7A4E2D' }, props: [{ key: 'color', label: 'Өнгө', type: 'color' }],
    draw(x, o, T, h) { const c = hex(o.color) || '#7A4E2D'; box(x, o, h, c, 1); for (let p = -o.w / 2 + 4, i = 0; p < o.w / 2 - 2; p += 9, i++) { x.fillStyle = [mix(c, '#000000', .2), mix(c, '#FFFFFF', .15), c][i % 3]; x.fillRect(p, -o.h / 2 + 1, 7, o.h - 2); } }
  },
  mural: {
    name: 'Ханын зураг', group: 'room', layer: 'wall', size: [160, 14], min: [30, 6], max: [760, 60], solid: 'none',
    defaults: { style: 'books' }, props: [{ key: 'style', label: 'Зураг', type: 'select', options: [['books', 'Ном зурсан тавиур'], ['drawings', 'Хүүхдийн зураг']] }],
    draw(x, o, T, h) {
      const w = o.w / 2, hh = o.h / 2;
      if (o.style === 'drawings') { box(x, o, h, '#FFFDF7', 2); for (let p = -w + 8, i = 0; p < w - 6; p += 14, i++) { h.disc(p, (i % 2 ? -1 : 1) * hh * .3, Math.min(4, hh * .7), KIDS[i % KIDS.length]); } return; }
      box(x, o, h, '#BFE3F0', 2); x.fillStyle = '#C9B6E4'; x.fillRect(-w, -hh, o.w * .45, o.h);
      for (let p = -w + 3, i = 0; p < w - 3; p += 5, i++) { x.fillStyle = KIDS[(i * 7) % KIDS.length]; x.fillRect(p, -hh + 2, 3.2, o.h - 4); }
      x.strokeStyle = '#E76F51'; x.lineWidth = 1; for (let p = -hh + o.h / 3; p < hh; p += o.h / 3) { x.beginPath(); x.moveTo(-w, p); x.lineTo(w, p); x.stroke(); }
    }
  },
  lamp: {
    name: 'Унжлагатай гэрэл', group: 'decor', layer: 'overhead', size: [70, 70], min: [24, 24], max: [220, 220], solid: 'none',
    defaults: { style: 'bulbs' }, props: [{ key: 'style', label: 'Гэрэл', type: 'select', options: [['bulbs', 'Чийдэн'], ['basket', 'Сүлжмэл бүрхүүл']] }],
    draw(x, o, T, h) {
      const r = Math.min(o.w, o.h) / 2, g = x.createRadialGradient(0, 0, 2, 0, 0, r); g.addColorStop(0, 'rgba(255,214,140,.42)'); g.addColorStop(1, 'rgba(255,214,140,0)'); x.fillStyle = g; x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill();
      if (o.style === 'basket') { h.disc(0, 0, r * .3, '#B98A4E'); x.strokeStyle = '#8A5A2B'; x.lineWidth = 1; for (let i = 1; i <= 2; i++) { x.beginPath(); x.arc(0, 0, r * .3 * i / 2.4, 0, 7); x.stroke(); } h.disc(0, 0, r * .1, '#FFE6A8'); return; }
      for (let i = 0; i < 5; i++) { const a = i * 1.257; h.disc(Math.cos(a) * r * .28, Math.sin(a) * r * .28, 3.2, '#FFE6A8'); h.disc(Math.cos(a) * r * .28, Math.sin(a) * r * .28, 1.6, '#F2B544'); }
    }
  },
  'kids-mat': {
    name: 'Пазлын хивс', group: 'kids', layer: 'floor', size: [130, 100], min: [40, 40], max: [400, 300], solid: 'none',
    draw(x, o, T, h) { const s = 26; x.save(); x.beginPath(); x.rect(-o.w / 2, -o.h / 2, o.w, o.h); x.clip(); for (let a = -o.w / 2, i = 0; a < o.w / 2; a += s, i++) for (let b = -o.h / 2, j = 0; b < o.h / 2; b += s, j++) { x.fillStyle = KIDS[(i + j * 2) % KIDS.length]; x.globalAlpha = .55; x.fillRect(a + 1, b + 1, s - 2, s - 2); x.globalAlpha = .8; h.disc(a + s, b + s / 2, 3.5, KIDS[(i + j * 2) % KIDS.length]); } x.restore(); x.globalAlpha = 1; }
  },
  'kids-table': {
    name: 'Зураг зурах ширээ', group: 'kids', layer: 'object', size: [64, 44], min: [36, 28], max: [160, 100], solid: 'rect',
    draw(x, o, T, h) {
      [[-o.w / 2 - 9, 0], [o.w / 2 + 9, 0], [0, -o.h / 2 - 9], [0, o.h / 2 + 9]].forEach(([sx, sy], i) => h.disc(sx, sy, 6.5, KIDS[i]));
      shadow(x, o, h); box(x, o, h, '#FFF4DC', 5); x.strokeStyle = '#F2B544'; x.lineWidth = 2; x.stroke();
      x.fillStyle = '#FFFFFF'; x.save(); x.rotate(-.15); x.fillRect(-o.w / 4 - 8, -8, 18, 13); x.restore(); x.save(); x.rotate(.2); x.fillRect(2, -6, 16, 12); x.restore();
      KIDS.slice(0, 4).forEach((c, i) => { x.fillStyle = c; x.fillRect(-o.w / 2 + 8 + i * 5, o.h / 2 - 12, 3, 9); });
    }
  },
  'kids-books': {
    name: 'Хүүхдийн номын тавиур', group: 'kids', layer: 'object', size: [90, 20], min: [30, 12], max: [300, 50], solid: 'rect',
    draw(x, o, T, h) { shadow(x, o, h); box(x, o, h, '#F7E7C6', 3); x.strokeStyle = '#C08A4A'; x.lineWidth = 1.5; x.stroke(); spines(x, o, KIDS, 3, 10); }
  },
  toys: {
    name: 'Пазл, тоглоомын сав', group: 'kids', layer: 'object', size: [40, 30], min: [20, 16], max: [120, 90], solid: 'rect',
    draw(x, o, T, h) { shadow(x, o, h); box(x, o, h, '#E9C46A', 4); x.strokeStyle = '#B6771D'; x.lineWidth = 1.5; x.stroke(); for (let i = 0; i < 4; i++) { x.fillStyle = KIDS[i + 1]; x.fillRect(-o.w / 2 + 5 + (i % 2) * (o.w / 2 - 4), -o.h / 2 + 5 + (i >> 1) * (o.h / 2 - 4), o.w / 2 - 8, o.h / 2 - 8); } }
  },
  stairs: {
    name: 'Шат', group: 'room', layer: 'object', size: [70, 120], min: [40, 60], max: [160, 260], solid: 'rect',
    draw(x, o, T, h) { box(x, o, h, '#D9A86C', 2); x.strokeStyle = '#8A5A2B'; x.lineWidth = 1.2; for (let p = -o.h / 2 + 12; p < o.h / 2; p += 12) { x.beginPath(); x.moveTo(-o.w / 2 + 6, p); x.lineTo(o.w / 2 - 6, p); x.stroke(); } x.strokeStyle = '#B98A4E'; x.lineWidth = 4; x.strokeRect(-o.w / 2 + 2, -o.h / 2 + 2, o.w - 4, o.h - 4); x.fillStyle = 'rgba(191,225,242,.55)'; x.fillRect(-o.w / 2, -o.h / 2, 4, o.h); x.fillRect(o.w / 2 - 4, -o.h / 2, 4, o.h); }
  },
  label: {
    name: 'Бичиг', group: 'decor', layer: 'overhead', size: [120, 20], min: [40, 16], max: [300, 30], solid: 'none', rotate: false,
    defaults: { text: 'Хүүхдийн булан' }, props: [{ key: 'text', label: 'Бичвэр', type: 'text', max: 30 }],
    draw(x, o, T, h) { x.font = '800 11px Manrope, sans-serif'; x.textAlign = 'center'; const t = String(o.text || ''); if (!t) return; const w = Math.min(o.w, x.measureText ? x.measureText(t).width + 16 : o.w); x.fillStyle = 'rgba(255,255,255,.78)'; h.rr(-w / 2, -9, w, 18, 9); x.fill(); x.fillStyle = T.label; h.label(t, 0, 4); }
  }
};
const GROUPS = [['furniture', 'Тавилга'], ['kids', 'Хүүхдийн булан'], ['room', 'Өрөө, хана'], ['decor', 'Чимэглэл']];

// Wall segments along the local x axis, leaving out the opening (gap) if any.
function wallSegments(o) {
  const a = -o.w / 2, b = o.w / 2, gw = clampN(o.gapw || 0, 0, o.w);
  if (!gw) return [[a, b]];
  const mid = a + clampN(o.gap ?? 50, 0, 100) / 100 * o.w, g0 = clampN(mid - gw / 2, a, b - gw), g1 = g0 + gw;
  return [[a, g0], [g1, b]].filter(([p, q]) => q - p > .5);
}

/* ---------- what the engine needs ---------- */
// Seats in world coordinates (the engine adds its own walk-around obstacle per seat).
function itemSeats(items) {
  const out = [];
  for (const o of items || []) {
    const spec = CATALOG[o.type]; if (!spec?.seats) continue;
    spec.seats(o).forEach((s, i) => { const [x, y] = toWorld(o, s.x, s.y); out.push({ x, y, ang: s.ang + (o.rot || 0) * DEG, kind: s.kind || 'chair', zone: o.zone || spec.zone || 'chair', label: `${o.name || spec.name} · ${i + 1}-р суудал` }); });
  }
  return out;
}
// Walkway obstacles: turned rectangles { cx, cy, c, s, hw, hh } and circles [x, y, r].
function itemObstacles(items) {
  const rects = [], circles = [];
  const rect = (o, cx, cy, hw, hh) => { const a = (o.rot || 0) * DEG; rects.push({ cx, cy, c: Math.cos(a), s: Math.sin(a), hw, hh }); };
  for (const o of items || []) {
    const solid = CATALOG[o.type]?.solid;
    if (solid === 'rect') rect(o, o.x, o.y, o.w / 2 + 9, o.h / 2 + 9);
    else if (solid === 'circle') circles.push([o.x, o.y, Math.min(o.w, o.h) / 2 + 3]);
    else if (solid === 'wall') for (const [a, b] of wallSegments(o)) { const [cx, cy] = toWorld(o, (a + b) / 2, 0); rect(o, cx, cy, (b - a) / 2 + 4, o.h / 2 + 4); }
  }
  return { rects, circles };
}
const inObstacle = (r, x, y) => { const dx = x - r.cx, dy = y - r.cy; return Math.abs(dx * r.c + dy * r.s) <= r.hw && Math.abs(-dx * r.s + dy * r.c) <= r.hh; };
// Draw one layer: 'floor0' (floor areas), 'floor' (rugs, mats), 'wall' (wall decoration),
// 'object' (furniture, inner walls) or 'overhead' (lamps, labels).
function drawItems(x, items, layer, T, helpers) {
  for (const o of items || []) {
    const spec = CATALOG[o.type]; if (!spec || spec.layer !== layer) continue;
    x.save(); x.translate(o.x, o.y); if (spec.rotate !== false && o.rot) x.rotate(o.rot * DEG);
    spec.draw(x, o, T, helpers); x.restore();
  }
}

/* ---------- making and checking items ---------- */
let serial = 0;
function makeItem(type, x, y, extra = {}) {
  const spec = CATALOG[type]; if (!spec) return null;
  return { id: `${type}-${Date.now().toString(36)}${(serial++).toString(36)}`, type, x, y, w: spec.size[0], h: spec.size[1], rot: 0, ...structuredCloneSafe(spec.defaults || {}), ...extra };
}
function structuredCloneSafe(v) { return JSON.parse(JSON.stringify(v)); }
// Whitelist an item list from a design file, JSON import or saved draft.
function sanitizeItems(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const [i, raw] of list.slice(0, 300).entries()) {
    const spec = raw && CATALOG[raw.type]; if (!spec) continue;
    const o = {
      id: typeof raw.id === 'string' && /^[\w-]{1,40}$/.test(raw.id) ? raw.id : `${raw.type}-${i}`, type: raw.type,
      x: Math.round(clampN(fin(raw.x, 400), 0, 800)), y: Math.round(clampN(fin(raw.y, 260), 0, 520)),
      w: Math.round(clampN(fin(raw.w, spec.size[0]), spec.min[0], spec.max[0])), h: Math.round(clampN(fin(raw.h, spec.size[1]), spec.min[1], spec.max[1])),
      rot: spec.rotate === false ? 0 : Math.round(((fin(raw.rot, 0) % 360) + 540) % 360 - 180)
    };
    if (typeof raw.name === 'string' && raw.name.trim()) o.name = raw.name.trim().slice(0, 30);
    if (typeof raw.zone === 'string' && /^[a-z]{2,12}$/.test(raw.zone)) o.zone = raw.zone;
    // A missing or invalid setting falls back to the type's default.
    const valid = (p, v) => p.type === 'int' ? Number.isFinite(v) : p.type === 'select' ? p.options.some(([k]) => k === v) : p.type === 'text' ? typeof v === 'string' : p.type === 'color' ? !!hex(v) : false;
    for (const p of spec.props || []) {
      const v = valid(p, raw[p.key]) ? raw[p.key] : spec.defaults?.[p.key]; if (!valid(p, v)) continue;
      o[p.key] = p.type === 'int' ? Math.round(clampN(v, p.min, p.max)) : p.type === 'text' ? v.slice(0, p.max || 30) : v;
    }
    out.push(o);
  }
  return out;
}

export {
  CATALOG, GROUPS, DEG, toWorld, toLocal, corners, aabb, contains, wallSegments,
  COUNTER_W, COUNTER_H, counterBox, counterPoint, counterFrame, counterFromFrame,
  itemSeats, itemObstacles, inObstacle, drawItems, makeItem, sanitizeItems
};
