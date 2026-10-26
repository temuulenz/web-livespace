import { clamp, rng, isMobile } from '../dom.js';
import { Prefs } from '../state.js';
import { Snd } from '../audio.js';

/* ================= FLOOR PLAN (canvas, top-down) ================= */
const ZONES = { bar: { d: 'Цонхны баар — цонхны гэрэлтэй, залгууртай.', q: 'Чимээгүй бүс.' }, t1: { d: 'Төв дугуй ширээ — захиалгын лангуунаас холхон.', q: 'Дунд зэргийн чимээтэй.' }, t2: { d: 'Төв дугуй ширээ.', q: 'Дунд зэргийн чимээтэй.' }, t3: { d: 'Лангууны хажуугийн ширээ — кофены машины чимээ сонсогдоно.', q: 'Чимээтэй бүс.' }, long: { d: 'Урт ширээ — багаар сурах, ажиллахад тохиромжтой.', q: 'Дунд зэргийн чимээтэй.' }, sofa: { d: 'Буйдан — энэ хэсгийн мэдрэгч одоогоор холбогдоогүй.', q: 'Тухтай бүс.' } };
class FloorPlan {
  constructor(wrap, cafe, o) {
    this.wrap = wrap; this.cafe = cafe; this.o = o; this.W = 800; this.H = 520; this.sound = o.sound || 2; this.reduced = Prefs.reduced; this.zoom = isMobile() ? 1.5 : 1;
    this.cv = document.createElement('canvas'); this.cv.setAttribute('role', 'img'); this.cv.setAttribute('aria-label', `${cafe.name}-ийн дээрээс харсан зураглал: сандал, ширээ, лангуу, гал тогоо`); wrap.appendChild(this.cv); this.ctx = this.cv.getContext('2d');
    this.r = rng(cafe.id.charCodeAt(0) * 31); this.layout(); this.buildGrid(); this.bg = this.drawStatic();
    this.people = []; this.parts = []; this.bubbles = []; this.fx = []; this.sel = null; this.t = 0; this.nextEv = 2600; this.nextBub = 1200; this.busyUntil = 0;
    this.staff = [{ x: 690, y: 105, pts: [[650, 105], [720, 105], [745, 150], [690, 150]], i: 0, wait: 0, shirt: '#7B542F', hair: '#3E2A17', skin: '#F2C9A0', barista: true }, { x: 690, y: 330, pts: [[690, 335], [748, 335], [745, 450], [660, 450]], i: 0, wait: 0, shirt: '#FFFFFF', hair: '#1F1A17', skin: '#D9A57B', chef: true }];
    const occ = Math.round(cafe.occ * this.countable() / 100); this.target = occ; const free = this.seats.filter(s => s.state === 'free'); for (let i = 0; i < occ && free.length; i++) { const s = free.splice(Math.floor(this.r() * free.length), 1)[0]; const p = this.newPerson(); p.state = 'seated'; p.seat = s; p.x = s.x; p.y = s.y; p.ang = s.ang; s.state = 'occ'; s.person = p; this.people.push(p) }
    this.resize(); this.ro = new ResizeObserver(() => { if (!this.alive) return; cancelAnimationFrame(this.rz); this.rz = requestAnimationFrame(() => this.resize()) }); this.ro.observe(wrap);
    this.events = new AbortController();
    this.cv.addEventListener('click', e => this.click(e), { signal: this.events.signal }); this.cv.addEventListener('mousemove', e => { const p = this.pt(e); this.cv.style.cursor = this.hit(p) ? 'pointer' : 'default' }, { signal: this.events.signal });
    this.emit(); this.last = performance.now(); this.alive = true; this.onFrame = t => this.frame(t); this.raf = requestAnimationFrame(this.onFrame)
  }
  countable() { let count = 0; for (const seat of this.seats) if (seat.state !== 'unknown') count++; return count }
  stats() {
    let free = 0;
    const list = [];
    for (const seat of this.seats) {
      if (seat.state === 'unknown') continue;
      list.push(seat.state);
      if (seat.state === 'free') free++;
    }
    return { free, total: list.length, unknown: this.seats.length - list.length, list };
  }
  emit() { this.o.onStats && this.o.onStats(this.stats()) }
  layout() {
    const S = this.seats = []; let n = 0; const add = (x, y, ang, zone, label, state = 'free', kind = 'chair') => S.push({ id: n++, x, y, ang, zone, label, state, kind, person: null, res: false, flash: 0 });
    [205, 290, 375, 460].forEach((x, i) => add(x, 78, -Math.PI / 2, 'bar', `Цонхны баар ${i + 1}`, 'free', 'stool'));
    const round = (cx, cy, dirs, zone, name) => dirs.forEach((d, i) => { const a = { N: -Math.PI / 2, S: Math.PI / 2, E: 0, W: Math.PI }[d]; add(cx + Math.cos(a) * 38, cy + Math.sin(a) * 38, a + Math.PI, zone, `${name} · ${i + 1}-р суудал`) });
    round(220, 205, ['N', 'E', 'S', 'W'], 't1', '1-р ширээ'); round(370, 205, ['N', 'E', 'S', 'W'], 't2', '2-р ширээ'); round(515, 215, ['N', 'S'], 't3', '3-р ширээ');
    [200, 280, 360].forEach((x, i) => add(x, 312, Math.PI / 2, 'long', `Урт ширээ ${i + 1}`));[200, 280, 360].forEach((x, i) => add(x, 384, -Math.PI / 2, 'long', `Урт ширээ ${i + 4}`));
    [470, 515, 560].forEach((x, i) => add(x, 478, -Math.PI / 2, 'sofa', `Буйдан ${i + 1}`, 'unknown', 'sofa'));
    this.tables = [[220, 205], [370, 205], [515, 215]];
    this.door = [90, 514]; this.order = [580, 112];
  }
  buildGrid() {
    const C = 10, cols = 80, rows = 52, g = new Uint8Array(cols * rows); const R = [], Cc = []; const rect = (x, y, w, h, p = 9) => R.push([x - p, y - p, x + w + p, y + h + p]); const circ = (x, y, r) => Cc.push([x, y, r]);
    rect(20, 20, 760, 8); rect(20, 20, 8, 484); rect(772, 20, 8, 484); rect(20, 496, 40, 8); rect(120, 496, 660, 8); rect(598, 20, 182, 484, 4); rect(0, 504, 50, 16, 0); rect(130, 504, 670, 16, 0); rect(0, 0, 800, 12, 0);
    rect(165, 30, 350, 24); rect(160, 330, 240, 36); rect(430, 462, 168, 36); circ(515, 425, 32);
    this.tables.forEach(([x, y]) => circ(x, y, 34)); this.seats.forEach(s => circ(s.x, s.y, s.kind === 'stool' ? 18 : 19));
    [[45, 45, 25], [45, 300, 23], [150, 476, 23]].forEach(p => circ(...p));
    for (let r = 0; r < rows; r++)for (let c = 0; c < cols; c++) { const x = c * C + 5, y = r * C + 5; if (R.some(q => x >= q[0] && x <= q[2] && y >= q[1] && y <= q[3]) || Cc.some(q => Math.hypot(x - q[0], y - q[1]) < q[2])) g[r * cols + c] = 1 }
    this.g = g; this.cols = cols; this.rows = rows
  }
  path(sx, sy, tx, ty) {
    const C = 10, cols = this.cols, rows = this.rows, g = this.g; const ci = (x, y) => clamp(Math.floor(y / C), 0, rows - 1) * cols + clamp(Math.floor(x / C), 0, cols - 1);
    const s = ci(sx, sy), t = ci(tx, ty); const free = i => i === t || i === s || !g[i];
    const H = i => { const dx = Math.abs(i % cols - t % cols), dy = Math.abs((i / cols | 0) - (t / cols | 0)); return Math.max(dx, dy) + .414 * Math.min(dx, dy) };
    const gs = new Float32Array(cols * rows).fill(1e9), from = new Int32Array(cols * rows).fill(-1), closed = new Uint8Array(cols * rows); gs[s] = 0;
    const heap = [[H(s), s]]; const push = n => { heap.push(n); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break;[heap[p], heap[i]] = [heap[i], heap[p]]; i = p } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (; ;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break;[heap[m], heap[i]] = [heap[i], heap[m]]; i = m } } return top };
    const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]]; let found = false;
    while (heap.length) {
      const [, cur] = pop(); if (cur === t) { found = true; break } if (closed[cur]) continue; closed[cur] = 1; const cx = cur % cols, cy = cur / cols | 0;
      for (const [dx, dy, w] of D) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue; const ni = ny * cols + nx; if (!free(ni)) continue; if (dx && dy && (!free(cy * cols + nx) || !free(ny * cols + cx))) continue; const ng = gs[cur] + w; if (ng < gs[ni]) { gs[ni] = ng; from[ni] = cur; push([ng + H(ni), ni]) } }
    }
    if (!found) return [[tx, ty]]; const pts = []; for (let i = t; i !== -1; i = from[i])pts.push([i % cols * C + 5, (i / cols | 0) * C + 5]); pts.reverse(); pts[pts.length - 1] = [tx, ty];
    const los = (a, b) => { const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(d / 4); for (let k = 1; k < n; k++) { const x = a[0] + (b[0] - a[0]) * k / n, y = a[1] + (b[1] - a[1]) * k / n; const i = ci(x, y); if (i !== t && i !== s && g[i]) return false } return true };
    const out = [pts[0]]; let a = 0; while (a < pts.length - 1) { let b = pts.length - 1; while (b > a + 1 && !los(pts[a], pts[b])) b--; out.push(pts[b]); a = b } return out
  }
  newPerson() { const r = this.r; const P = ['#7B542F', '#B6771D', '#5E3F22', '#C08A4A', '#9C6B36', '#3E2A17', '#A8774A', '#D9B07A']; return { x: 0, y: 0, ang: 0, path: [], state: '', shirt: P[Math.floor(r() * P.length)], hair: ['#3E2A17', '#1F1A17', '#8A5A2B', '#C9A26B', '#2B2B2B'][Math.floor(r() * 5)], skin: ['#F2C9A0', '#E3B48B', '#C99167', '#A8744F'][Math.floor(r() * 4)], item: r() < .5 ? 'laptop' : r() < .6 ? 'book' : 'cup', spd: 52 + r() * 18, t: r() * 10, wait: 0, user: false, alpha: 1 } }
  arrive(user) {
    const free = this.seats.filter(s => s.state === 'free' && !s.res); if (!free.length) return false; let pool = free; if (this.sound <= 2) { const q = free.filter(s => s.zone === 'bar' || s.zone === 'long'); if (q.length && this.r() < .7) pool = q }
    const s = pool[Math.floor(this.r() * pool.length)]; s.res = true; const p = this.newPerson(); p.user = user; p.seat = s; p.x = this.door[0]; p.y = this.door[1] + 4; p.ang = -Math.PI / 2;
    const q = this.people.filter(x => x.state === 'toOrder' || x.state === 'order').length; p.orderPt = [this.order[0], this.order[1] + q * 24];
    if (this.reduced) { this.sit(p); this.people.push(p); return true }
    p.path = this.path(p.x, p.y, ...p.orderPt); p.state = 'toOrder'; this.people.push(p); this.o.onEvent && this.o.onEvent('Шинэ зочин орж ирлээ · кофе захиалж байна', 'in'); return true
  }
  sit(p) {
    const s = p.seat; s.res = false; s.state = 'occ'; s.person = p; p.state = 'seated'; p.x = s.x; p.y = s.y; p.ang = s.ang; s.flash = 1; this.fx.push({ x: s.x, y: s.y, t: 0, c: '#FF9D00' });
    if (p.user) Snd.ui('sit'); this.o.onEvent && this.o.onEvent(`${s.label}-д зочин суулаа`, 'in'); this.emit(); if (this.sel === s) this.o.onSeat && this.o.onSeat(s)
  }
  depart(user) {
    const sat = this.people.filter(p => p.state === 'seated'); if (!sat.length) return false; const p = sat[Math.floor(this.r() * sat.length)]; const s = p.seat; s.state = 'free'; s.person = null; s.flash = 1; this.fx.push({ x: s.x, y: s.y, t: 0, c: '#C08A4A' });
    if (user) Snd.ui('leave'); this.o.onEvent && this.o.onEvent(`${s.label} суллаа`, 'out'); this.emit(); if (this.sel === s) this.o.onSeat && this.o.onSeat(s);
    if (this.reduced) { this.people = this.people.filter(x => x !== p); return true }
    p.state = 'leaving'; p.path = this.path(p.x, p.y, this.door[0], this.door[1] + 4); p.seat = null; return true
  }
  setTarget(pct, fast) { this.target = Math.round(pct * this.countable() / 100); this.busyUntil = fast ? performance.now() + 20000 : 0; this.nextEv = fast ? 150 : 800 }
  setZoom(f) { this.zoom = clamp(this.zoom * f, 1, 2.6); this.resize(true) }
  resize(force) {
    const w = Math.floor(this.wrap.getBoundingClientRect().width); if (!w) return; const cssW = Math.min(2400, Math.round(w * this.zoom)); if (!force && cssW === this.cssW) return; this.cssW = cssW; const cssH = Math.round(cssW * this.H / this.W); const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.style.width = cssW + 'px'; this.cv.style.height = cssH + 'px'; this.cv.width = cssW * dpr; this.cv.height = cssH * dpr; this.k = cssW / this.W * dpr;
    this.wrap.style.height = Math.min(cssH, Math.round(w * this.H / this.W * (isMobile() ? 1.15 : 1))) + 'px'
  }
  pt(e) { const r = this.cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * this.W, (e.clientY - r.top) / r.height * this.H] }
  hit([x, y]) { let best = null, bd = 20; this.seats.forEach(s => { const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = s } }); return best }
  click(e) { const s = this.hit(this.pt(e)); this.sel = s; if (s) { Snd.ui('pop'); s.flash = 1 } this.o.onSeat && this.o.onSeat(s) }
  destroy() { this.alive = false; cancelAnimationFrame(this.raf); cancelAnimationFrame(this.rz); this.ro.disconnect(); this.events.abort() }
  frame(now) { if (!this.alive) return; const dt = Math.min(.05, (now - this.last) / 1000); this.last = now; if (!document.hidden) { this.update(dt, now); this.draw() } this.raf = requestAnimationFrame(this.onFrame) }
  update(dt, now) {
    this.t += dt; const red = this.reduced;
    this.nextEv -= dt * 1000; if (this.nextEv <= 0) {
      const occ = this.seats.filter(s => s.state === 'occ' || s.res).length;
      if (occ < this.target) this.arrive(false); else if (occ > this.target) this.depart(false); else if (this.r() < .4 && !this.busyUntil) { this.depart(false); this.nextEv = 1800; }
      const fast = this.busyUntil && now < this.busyUntil && occ !== this.target; this.nextEv = fast ? (red ? 60 : 420) : 3200 + this.r() * 2800; if (this.busyUntil && occ === this.target) this.busyUntil = 0
    }
    for (const p of this.people) {
      p.t += dt;
      if (p.state === 'toOrder' || p.state === 'toSeat' || p.state === 'leaving') {
        if (red) { if (p.state === 'leaving') p.alpha = 0; else if (p.state === 'toOrder') { p.state = 'order'; p.wait = .2 } else this.sit(p); continue }
        const tg = p.path[0]; if (!tg) { continue } const dx = tg[0] - p.x, dy = tg[1] - p.y, d = Math.hypot(dx, dy), st = p.spd * dt;
        if (d > .5) { const ta = Math.atan2(dy, dx); let da = ta - p.ang; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; p.ang += da * Math.min(1, dt * 10) }
        if (d <= st) { p.x = tg[0]; p.y = tg[1]; p.path.shift(); if (!p.path.length) { if (p.state === 'toOrder') { p.state = 'order'; p.wait = 1.3 + this.r() * .8; p.ang = 0 } else if (p.state === 'toSeat') this.sit(p); else p.state = 'gone' } } else { p.x += dx / d * st; p.y += dy / d * st }
      }
      else if (p.state === 'order') { p.wait -= dt; if (p.wait <= 0) { p.state = 'toSeat'; p.path = red ? [] : this.path(p.x, p.y, p.seat.x, p.seat.y); if (red) this.sit(p) } }
      if (p.state === 'gone') { p.alpha -= dt * 3 }
    }
    this.people = this.people.filter(p => p.alpha > 0);
    for (const s of this.staff) { if (red) break; if (s.wait > 0) { s.wait -= dt; continue } const tg = s.pts[s.i], dx = tg[0] - s.x, dy = tg[1] - s.y, d = Math.hypot(dx, dy); if (d < 1) { s.i = (s.i + 1) % s.pts.length; s.wait = 1 + this.r() * 2; continue } s.ang = Math.atan2(dy, dx); s.x += dx / d * Math.min(d, 38 * dt); s.y += dy / d * Math.min(d, 38 * dt); s.walk = true }
    if (!red) { if (this.r() < dt * 9) this.parts.push({ x: 672 + this.r() * 14, y: 322, vy: -14 - this.r() * 10, vx: (this.r() - .5) * 6, l: 1, r: 3 + this.r() * 3 }); if (this.r() < dt * 2.5) this.parts.push({ x: 712 + this.r() * 8, y: 50, vy: -10, vx: (this.r() - .5) * 4, l: .8, r: 2.5 }) }
    this.parts.forEach(q => { q.x += q.vx * dt; q.y += q.vy * dt; q.l -= dt * .7; q.r += dt * 3 }); this.parts = this.parts.filter(q => q.l > 0);
    this.nextBub -= dt * 1000; if (this.nextBub <= 0 && this.sound >= 3 && !red) { const sat = this.people.filter(p => p.state === 'seated'); if (sat.length) { const p = sat[Math.floor(this.r() * sat.length)]; this.bubbles.push({ p, t: 0, big: this.sound >= 4 }) } this.nextBub = [0, 0, 0, 1600, 800, 450][this.sound] + this.r() * 500 }
    this.bubbles.forEach(b => b.t += dt); this.bubbles = this.bubbles.filter(b => b.t < 2.2 && b.p.state === 'seated');
    this.fx.forEach(f => f.t += dt); this.fx = this.fx.filter(f => f.t < .8); this.seats.forEach(s => s.flash = Math.max(0, s.flash - dt * 1.5))
  }
  rr(x, X, y, w, h, r) { x.beginPath(); x.roundRect ? x.roundRect(X, y, w, h, r) : x.rect(X, y, w, h) }
  drawStatic() {
    const k = 2.5, c = document.createElement('canvas'); c.width = this.W * k; c.height = this.H * k; const x = c.getContext('2d'); x.scale(k, k); const rr = (X, y, w, h, r) => this.rr(x, X, y, w, h, r); const r = rng(5);
    x.fillStyle = '#E4D7BF'; x.fillRect(0, 0, 800, 520);
    // customer wood floor
    x.fillStyle = '#F3E2C4'; x.fillRect(24, 24, 576, 476); x.strokeStyle = '#E7D2AF'; x.lineWidth = 1; for (let y = 24, row = 0; y < 500; y += 22, row++) { x.beginPath(); x.moveTo(24, y); x.lineTo(600, y); x.stroke(); for (let xx = 24 + (row % 2) * 55 + r() * 30; xx < 600; xx += 90 + r() * 40) { x.beginPath(); x.moveTo(xx, y); x.lineTo(xx, y + 22); x.stroke() } }
    // window light
    x.save(); x.globalAlpha = .25; const lg = x.createLinearGradient(0, 24, 0, 200); lg.addColorStop(0, '#FFCF71'); lg.addColorStop(1, 'rgba(255,207,113,0)'); x.fillStyle = lg;[[175, 265], [265, 355], [355, 445], [445, 520]].forEach(([a, b]) => { x.beginPath(); x.moveTo(a, 24); x.lineTo(b, 24); x.lineTo(b + 40, 190); x.lineTo(a + 40, 190); x.fill() }); x.restore();
    // rug
    x.fillStyle = 'rgba(201,134,42,.22)'; rr(165, 150, 262, 112, 22); x.fill(); x.strokeStyle = 'rgba(123,84,47,.35)'; x.setLineDash([6, 5]); x.lineWidth = 1.5; rr(175, 160, 242, 92, 16); x.stroke(); x.setLineDash([]);
    // staff floor: barista
    x.fillStyle = '#EFE7DA'; x.fillRect(600, 24, 176, 226);
    // kitchen checker
    for (let yy = 250; yy < 500; yy += 16)for (let xx = 600; xx < 776; xx += 16) { x.fillStyle = ((xx + yy) / 16) % 2 ? '#F4F1EA' : '#E6E0D3'; x.fillRect(xx, yy, 16, 16) }
    // walls
    x.fillStyle = '#7B542F'; x.fillRect(20, 20, 760, 8); x.fillRect(20, 20, 8, 484); x.fillRect(772, 20, 8, 484); x.fillRect(20, 496, 40, 8); x.fillRect(120, 496, 660, 8);
    x.fillRect(598, 250, 90, 6); x.fillRect(740, 250, 36, 6); x.fillRect(596, 190, 6, 66);
    x.fillStyle = '#BFE1F2';[[175, 265], [265, 355], [355, 445], [445, 520]].forEach(([a, b]) => { x.fillRect(a + 4, 20, b - a - 8, 8) }); x.fillStyle = '#9ACBE5';[[175, 265], [265, 355], [355, 445], [445, 520]].forEach(([a, b]) => x.fillRect(a + 4, 23, b - a - 8, 2));
    // door
    x.strokeStyle = '#7B542F'; x.lineWidth = 2; x.setLineDash([4, 4]); x.beginPath(); x.arc(60, 500, 60, -Math.PI / 2.4, 0); x.stroke(); x.setLineDash([]); x.beginPath(); x.moveTo(60, 500); x.lineTo(60 + 60 * Math.cos(-Math.PI / 2.4), 500 + 60 * Math.sin(-Math.PI / 2.4)); x.stroke();
    x.fillStyle = '#C9955C'; rr(66, 486, 48, 12, 4); x.fill();
    // window bar counter
    x.fillStyle = '#C9955C'; rr(165, 30, 350, 24, 6); x.fill(); x.strokeStyle = '#9C6B3A'; x.lineWidth = 2; x.stroke(); x.strokeStyle = 'rgba(255,255,255,.25)'; x.lineWidth = 1; for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(170, 36 + i * 3); x.lineTo(510, 36 + i * 3); x.stroke() }
    [[230, 42], [400, 42]].forEach(([px, py]) => { x.fillStyle = '#B6771D'; x.beginPath(); x.arc(px, py, 6, 0, 7); x.fill(); x.fillStyle = '#C08A4A'; for (let a = 0; a < 6; a++) { x.beginPath(); x.ellipse(px + Math.cos(a) * 5, py + Math.sin(a) * 5, 4, 2.5, a, 0, 7); x.fill() } });
    // round tables
    this.tables.forEach(([tx, ty], i) => { x.fillStyle = 'rgba(62,42,23,.12)'; x.beginPath(); x.arc(tx + 2, ty + 3, 25, 0, 7); x.fill(); const gr = x.createRadialGradient(tx - 6, ty - 6, 2, tx, ty, 25); gr.addColorStop(0, '#D9A86C'); gr.addColorStop(1, '#B07C45'); x.fillStyle = gr; x.beginPath(); x.arc(tx, ty, 24, 0, 7); x.fill(); x.strokeStyle = '#8A5A2B'; x.lineWidth = 2; x.stroke(); x.fillStyle = '#FFF9EC'; x.beginPath(); x.arc(tx, ty, 5, 0, 7); x.fill(); x.fillStyle = ['#B6771D', '#FF9D00', '#7B542F'][i]; x.beginPath(); x.arc(tx, ty, 2.8, 0, 7); x.fill() });
    // long table
    x.fillStyle = 'rgba(62,42,23,.12)'; rr(163, 334, 240, 36, 6); x.fill(); x.fillStyle = '#C08A52'; rr(160, 330, 240, 36, 6); x.fill(); x.strokeStyle = '#8A5A2B'; x.lineWidth = 2; x.stroke(); x.strokeStyle = 'rgba(255,255,255,.2)'; x.lineWidth = 1; for (let i = 1; i < 5; i++) { x.beginPath(); x.moveTo(164, 330 + i * 7); x.lineTo(396, 330 + i * 7); x.stroke() }
    // sofa
    x.fillStyle = '#9C6B36'; rr(430, 466, 168, 32, 10); x.fill(); x.fillStyle = '#B07E4A';[[440, 470], [488, 470], [536, 470]].forEach(([a, b]) => { rr(a + 4, b, 44, 22, 7); x.fill() }); x.fillStyle = '#7B542F'; rr(430, 488, 168, 10, 5); x.fill();
    x.fillStyle = '#D9A86C'; x.beginPath(); x.ellipse(515, 425, 26, 15, 0, 0, 7); x.fill(); x.strokeStyle = '#8A5A2B'; x.lineWidth = 2; x.stroke(); x.fillStyle = '#fff'; x.beginPath(); x.arc(505, 423, 4, 0, 7); x.fill(); x.fillStyle = '#7B542F'; x.beginPath(); x.arc(505, 423, 2.2, 0, 7); x.fill(); x.fillStyle = '#C08A4A'; rr(518, 418, 14, 10, 2); x.fill();
    // plants
    const plant = (px, py, s) => { x.fillStyle = '#B6771D'; x.beginPath(); x.arc(px, py, s * .55, 0, 7); x.fill(); for (let a = 0; a < 8; a++) { x.fillStyle = a % 2 ? '#C08A4A' : '#D9B07A'; x.beginPath(); x.ellipse(px + Math.cos(a * .8) * s * .55, py + Math.sin(a * .8) * s * .55, s * .55, s * .28, a * .8, 0, 7); x.fill() } x.fillStyle = '#9C6B36'; x.beginPath(); x.arc(px, py, s * .3, 0, 7); x.fill() }; plant(45, 45, 22); plant(45, 300, 20); plant(150, 476, 20); plant(585, 478, 14);
    // coffee counter L
    x.fillStyle = 'rgba(62,42,23,.15)'; x.fillRect(603, 64, 170, 30); x.fillStyle = '#7B542F'; rr(600, 60, 176, 28, 4); x.fill(); rr(600, 60, 28, 130, 4); x.fill(); x.fillStyle = '#A8774A'; rr(603, 63, 170, 22, 3); x.fill(); rr(603, 63, 22, 124, 3); x.fill();
    x.fillStyle = '#C9C2B4'; rr(690, 40, 52, 24, 4); x.fill(); x.strokeStyle = '#8C8577'; x.lineWidth = 1.5; x.stroke(); x.fillStyle = '#3E2A17';[[704, 58], [728, 58]].forEach(([a, b]) => { x.beginPath(); x.arc(a, b, 4, 0, 7); x.fill() }); x.fillStyle = '#C08A4A'; x.fillRect(696, 44, 6, 4);
    x.fillStyle = '#5E3F22'; rr(750, 38, 16, 22, 4); x.fill();
    x.fillStyle = 'rgba(191,225,242,.7)'; rr(605, 96, 18, 60, 3); x.fill();[['#D9B07A', 614, 104], ['#9C6B36', 614, 118], ['#8A5A2B', 614, 132], ['#D9B07A', 614, 146]].forEach(([cl, a, b]) => { x.fillStyle = cl; x.beginPath(); x.arc(a, b, 4.5, 0, 7); x.fill() });
    x.fillStyle = '#3E2A17'; rr(605, 164, 18, 16, 3); x.fill(); x.fillStyle = '#FFCF71'; x.fillRect(608, 167, 12, 5);
    for (let i = 0; i < 4; i++) { x.fillStyle = '#fff'; x.beginPath(); x.arc(640 + i * 12, 74, 4, 0, 7); x.fill(); x.strokeStyle = '#C9C2B4'; x.lineWidth = 1; x.stroke() }
    // kitchen
    x.fillStyle = '#3E3A36'; rr(650, 300, 92, 52, 5); x.fill(); x.strokeStyle = '#8C8577'; x.lineWidth = 2;[[670, 315], [700, 315], [670, 338], [722, 338], [722, 315], [700, 338]].slice(0, 4).forEach(([a, b]) => { x.beginPath(); x.arc(a, b, 8, 0, 7); x.stroke() });
    x.fillStyle = '#9AA3A8'; x.beginPath(); x.arc(679, 325, 11, 0, 7); x.fill(); x.fillStyle = '#9C6B36'; x.beginPath(); x.arc(679, 325, 7.5, 0, 7); x.fill();
    x.fillStyle = '#C9D0D4'; rr(700, 430, 70, 36, 4); x.fill(); x.strokeStyle = '#9AA3A8'; x.stroke(); x.fillStyle = '#C08A4A';[[712, 442], [722, 448], [716, 452]].forEach(([a, b]) => { x.beginPath(); x.arc(a, b, 3.5, 0, 7); x.fill() }); x.fillStyle = '#C08A4A'; x.beginPath(); x.arc(745, 446, 6, 0, 7); x.fill();
    x.fillStyle = '#E8ECEE'; rr(740, 262, 32, 58, 4); x.fill(); x.strokeStyle = '#9AA3A8'; x.stroke(); x.fillStyle = '#9AA3A8'; x.fillRect(744, 288, 24, 2);
    x.fillStyle = '#BFC7CB'; rr(610, 410, 40, 56, 5); x.fill(); x.fillStyle = '#E8ECEE'; rr(616, 418, 28, 22, 4); x.fill();
    // labels
    x.font = '700 11px Manrope, sans-serif'; x.fillStyle = 'rgba(107,80,56,.8)'; x.textAlign = 'center';[['Цонхны баар', 340, 108], ['Орц', 90, 486], ['Урт ширээ', 280, 406], ['Буйдан', 515, 458], ['Кофе захиалга', 690, 110], ['Гал тогоо', 690, 280]].forEach(([t, a, b]) => x.fillText(t, a, b));
    // chairs (static silhouettes)
    this.seats.forEach(s => {
      if (s.kind === 'sofa') return; x.save(); x.translate(s.x, s.y); if (s.kind === 'stool') { x.fillStyle = 'rgba(62,42,23,.15)'; x.beginPath(); x.arc(1, 2, 10, 0, 7); x.fill(); x.fillStyle = '#8A5A2B'; x.beginPath(); x.arc(0, 0, 10, 0, 7); x.fill(); x.fillStyle = '#C9955C'; x.beginPath(); x.arc(0, 0, 7.5, 0, 7); x.fill() }
      else { x.rotate(s.ang + Math.PI / 2); x.fillStyle = 'rgba(62,42,23,.15)'; rr(-9, -7, 19, 19, 4); x.fill(); x.fillStyle = '#E9D6BB'; rr(-10, -9, 20, 18, 4); x.fill(); x.strokeStyle = '#A8774A'; x.lineWidth = 1.5; x.stroke(); x.fillStyle = '#A8774A'; rr(-10, 6, 20, 5, 2.5); x.fill() } x.restore()
    });
    return c
  }
  person(x, p, px, py, ang, walking, time = p.t) {
    const s = walking ? Math.sin(time * 11) * 3.6 : 0; x.save(); x.translate(px, py); x.rotate(ang + Math.PI / 2); x.globalAlpha = p.alpha ?? 1;
    x.fillStyle = 'rgba(62,42,23,.18)'; x.beginPath(); x.ellipse(1, 3, 10, 7, 0, 0, 7); x.fill();
    if (walking) { x.fillStyle = '#3E2A17'; x.beginPath(); x.ellipse(-4, -3 + s, 2.6, 4, 0, 0, 7); x.fill(); x.beginPath(); x.ellipse(4, -3 - s, 2.6, 4, 0, 0, 7); x.fill() }
    x.fillStyle = p.skin; x.beginPath(); x.arc(-9.5, walking ? -s * .6 : -3, 2.6, 0, 7); x.fill(); x.beginPath(); x.arc(9.5, walking ? s * .6 : -3, 2.6, 0, 7); x.fill();
    x.fillStyle = p.shirt; x.beginPath(); x.ellipse(0, 1, 9.5, 6.2, 0, 0, 7); x.fill(); x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 1; x.stroke();
    x.fillStyle = p.skin; x.beginPath(); x.arc(0, -1, 5.6, 0, 7); x.fill(); x.fillStyle = p.hair; x.beginPath(); x.ellipse(0, 1, 5.9, 4.6, 0, 0, Math.PI); x.fill(); if (p.chef) { x.globalAlpha = 1; x.fillStyle = '#fff'; x.beginPath(); x.arc(0, 0, 6.6, 0, 7); x.fill(); x.strokeStyle = '#C9C2B4'; x.stroke(); x.beginPath(); x.arc(0, 0, 3.5, 0, 7); x.stroke() }
    x.restore()
  }
  item(x, p) {
    const s = p.seat; if (!s || s.kind === 'sofa') return; x.save(); x.translate(s.x, s.y); x.rotate(s.ang + Math.PI / 2); x.translate(0, s.kind === 'stool' ? -24 : -19);
    if (p.item === 'laptop') { x.fillStyle = '#8C8577'; this.rr(x, -7, -5, 14, 9, 1.5); x.fill(); x.fillStyle = '#BFE1F2'; this.rr(x, -6, -4, 12, 5, 1); x.fill() } else if (p.item === 'book') { x.fillStyle = '#9C6B36'; this.rr(x, -6, -4, 12, 8, 1); x.fill(); x.fillStyle = '#FFF9EC'; x.fillRect(-.5, -4, 1, 8) } else { x.fillStyle = '#fff'; x.beginPath(); x.arc(0, 0, 3.8, 0, 7); x.fill(); x.fillStyle = '#7B542F'; x.beginPath(); x.arc(0, 0, 2.4, 0, 7); x.fill() } x.restore()
  }
  draw() {
    const x = this.ctx; x.setTransform(this.k, 0, 0, this.k, 0, 0); x.clearRect(0, 0, this.W, this.H); x.drawImage(this.bg, 0, 0, this.W, this.H); const t = this.t;
    // free seat breathing + unknown
    this.seats.forEach(s => {
      if (s.state === 'free') { x.fillStyle = 'rgba(243,226,196,.62)'; x.beginPath(); x.arc(s.x, s.y, s.kind === 'stool' ? 12 : 14, 0, 7); x.fill() }
      if (s.state === 'occ') { x.fillStyle = 'rgba(255,157,0,.9)'; x.beginPath(); x.arc(s.x, s.y, s.kind === 'stool' ? 14 : 16, 0, 7); x.fill(); x.strokeStyle = '#7B542F'; x.lineWidth = 2; x.stroke() }
      if (s.state === 'unknown') { x.strokeStyle = 'rgba(154,133,112,.9)'; x.lineWidth = 1.6; x.setLineDash([3, 3]); this.rr(x, s.x - 14, s.y - 12, 28, 22, 6); x.stroke(); x.setLineDash([]); x.fillStyle = '#9A8570'; x.font = '800 12px Manrope, sans-serif'; x.textAlign = 'center'; x.fillText('?', s.x, s.y + 4) }
      if (s.flash > 0) { x.fillStyle = `rgba(255,207,113,${s.flash * .6})`; x.beginPath(); x.arc(s.x, s.y, 18, 0, 7); x.fill() }
    });
    // seated people & items
    // Keep the original layer order without allocating filtered arrays every frame.
    for (const p of this.people) if (p.state === 'seated') { this.item(x, p); this.person(x, p, p.x, p.y, p.ang, false) }
    for (const s of this.staff) this.person(x, s, s.x, s.y, s.ang || Math.PI / 2, !this.reduced && s.wait <= 0, t);
    for (const p of this.people) if (p.state !== 'seated') this.person(x, p, p.x, p.y, p.ang, p.state !== 'order');
    // order bubble
    for (const p of this.people) if (p.state === 'order') this.bub(x, p.x, p.y - 20, 1, 'cup');
    this.bubbles.forEach(b => { const k = b.t < .25 ? b.t / .25 : b.t > 1.8 ? (2.2 - b.t) / .4 : 1; this.bub(x, b.p.x + (b.big ? 6 : 0), b.p.y - 18, k, 'dots') });
    // particles
    this.parts.forEach(q => { x.fillStyle = `rgba(255,255,255,${q.l * .7})`; x.beginPath(); x.arc(q.x, q.y, q.r, 0, 7); x.fill() });
    this.fx.forEach(f => { x.strokeStyle = f.c; x.globalAlpha = 1 - f.t / .8; x.lineWidth = 2.5; x.beginPath(); x.arc(f.x, f.y, 10 + f.t * 30, 0, 7); x.stroke(); x.globalAlpha = 1 });
    if (this.sel) { const s = this.sel; x.save(); x.translate(s.x, s.y); x.rotate(this.reduced ? 0 : t * 1.2); x.strokeStyle = '#7B542F'; x.lineWidth = 2.2; x.setLineDash([5, 4]); x.beginPath(); x.arc(0, 0, 20, 0, 7); x.stroke(); x.restore(); x.setLineDash([]) }
  }
  bub(x, bx, by, k, kind) {
    if (k <= 0) return; x.save(); x.translate(bx, by); x.scale(k, k); x.fillStyle = '#fff'; x.strokeStyle = '#7B542F'; x.lineWidth = 1.4; this.rr(x, -12, -16, 24, 15, 6); x.fill(); x.stroke(); x.beginPath(); x.moveTo(-3, -1.5); x.lineTo(0, 4); x.lineTo(3, -1.5); x.fill();
    if (kind === 'cup') { x.fillStyle = '#7B542F'; this.rr(x, -5, -12, 9, 7, 2); x.fill(); x.strokeStyle = '#7B542F'; x.beginPath(); x.arc(5, -9, 2, -Math.PI / 2, Math.PI / 2); x.stroke() } else { x.fillStyle = '#7B542F';[-6, 0, 6].forEach(d => { x.beginPath(); x.arc(d, -8.5, 1.7, 0, 7); x.fill() }) } x.restore()
  }
}

export { FloorPlan, ZONES };
