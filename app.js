"use strict";
/* ================= utils ================= */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const store = { get(k, d) { try { const v = localStorage.getItem('ls_' + k); return v == null ? d : JSON.parse(v) } catch (e) { return d } }, set(k, v) { try { localStorage.setItem('ls_' + k, JSON.stringify(v)) } catch (e) { } } };
const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
const Prefs = { sound: store.get('sound', true), reduced: store.get('reduced', mq.matches) };
const isMobile = () => window.matchMedia('(max-width:820px)').matches;

/* ================= icons ================= */
const I = {
  house: '<svg viewBox="0 0 28 28" fill="none"><path d="M3 13.5 14 4l11 9.5" stroke="#3E2A17" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/><path d="M6.5 12.5V24h15V12.5L14 6.3z" fill="#B6771D"/><path d="M11.5 24v-5.5a2.5 2.5 0 0 1 5 0V24z" fill="#FFF4DC"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" fill="none"/></svg>',
  sndOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  sndOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5m0-5-5 5"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
  filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg>',
  locate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  cmp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3.5" y="5" width="7" height="14" rx="2"/><rect x="13.5" y="5" width="7" height="14" rx="2"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  seat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v8H7zM5 12h14M7 12v8M17 12v8"/></svg>',
  plug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 5.5c3-1.3 6-1.3 9 .8 3-2.1 6-2.1 9-.8V19c-3-1.3-6-1.3-9 .8-3-2.1-6-2.1-9-.8z"/><path d="M12 6.3V19.8"/></svg>',
  laptop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M2.5 19h19"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.5 3-5.5 6-5.5s5.4 2 6 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.5c2.4.2 4 1.9 4.5 5"/></svg>',
  sofa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3"/><path d="M3 12a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3z"/><path d="M5 17v2M19 17v2"/></svg>',
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m9 4-5.5 2v14L9 18l6 2 5.5-2V4L15 6z"/><path d="M9 4v14M15 6v14"/></svg>',
  cup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c-.8 1 .8 2 0 3M12 3.5c-.8 1 .8 2 0 3"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20h16M7 16v-4M12 16V8M17 16v-7"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3.5 11 12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/></svg>',
  hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 12.5 4.8 10.3a1.7 1.7 0 0 0-2.4 2.4l5 5.3A6 6 0 0 0 11.8 20H14a6 6 0 0 0 6-6V8.5a1.5 1.5 0 0 0-3 0V12M14 11V5.5a1.5 1.5 0 0 0-3 0V11M11 11V6.5a1.5 1.5 0 0 0-3 0v6"/></svg>',
  lamp: '<svg viewBox="0 0 15 18"><path d="M7.5 0v4" stroke="currentColor" stroke-width="1.4"/><path d="M2 11 5 4h5l3 7z" fill="currentColor"/><path d="M5.5 11h4l-2 4z" fill="currentColor" opacity=".45"/></svg>'
};
const pinSVG = (fill = '#FF9D00', inner = '#3E2A17') => `<svg viewBox="0 0 40 48"><path d="M20 47S4 30.5 4 18.5a16 16 0 0 1 32 0C36 30.5 20 47 20 47z" fill="${fill}" stroke="#fff" stroke-width="2.5"/><path d="M11.5 19.5 20 12l8.5 7.5" stroke="${inner}" stroke-width="2.6" stroke-linejoin="round" fill="none"/><path d="M14 18.5v7.5h12v-7.5L20 13.6z" fill="${inner}"/><path d="M18.2 26v-3.6a1.8 1.8 0 0 1 3.6 0V26z" fill="${fill}"/></svg>`;
const cardPin = (gray) => `<svg class="pinic${gray ? ' gray' : ''}" viewBox="0 0 40 48"><path d="M20 47S3 30 3 18a17 17 0 0 1 34 0c0 12-17 29-17 29z" fill="currentColor"/><path d="M11.5 19 20 11.5l8.5 7.5" stroke="#3E2A17" stroke-width="2.6" stroke-linejoin="round" fill="none"/><path d="M14 18v8h12v-8l-6-5z" fill="#3E2A17"/><path d="M18.2 26v-3.6a1.8 1.8 0 0 1 3.6 0V26z" fill="#B6771D"/></svg>`;

/* ================= sound engine (Web Audio, no files) ================= */
const Snd = {
  ctx: null, nbuf: null, amb: null,
  ensure() { if (!this.ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; try { this.ctx = new C() } catch (e) { return null } } if (this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx },
  noiseBuf() { const c = this.ctx; if (this.nbuf) return this.nbuf; const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0); let l = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; l = (l + .02 * w) / 1.02; d[i] = w * .5 + l * 3 } this.nbuf = b; return b },
  tone(f, dur, { type = 'sine', vol = .15, to = null, delay = 0, dest = null } = {}) { const c = this.ensure(); if (!c) return; const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur * .8); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(g).connect(dest || c.destination); o.start(t); o.stop(t + dur + .05) },
  burst(dur, { vol = .08, f = 2000, q = 1, type = 'bandpass', delay = 0, to = null, dest = null } = {}) { const c = this.ensure(); if (!c) return; const t = c.currentTime + delay, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.noiseBuf(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (to) fl.frequency.exponentialRampToValueAtTime(to, t + dur); fl.Q.value = q; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur); s.connect(fl).connect(g).connect(dest || c.destination); s.start(t, Math.random()); s.stop(t + dur + .05) },
  ui(name) {
    if (!Prefs.sound) return; const s = this; ({
      pop() { s.tone(380, .14, { to: 820, vol: .16 }); s.tone(1240, .08, { vol: .04, delay: .03, type: 'triangle' }) },
      click() { s.burst(.035, { vol: .09, f: 3200, q: 2.5 }) },
      whoosh() { s.burst(.28, { vol: .05, f: 500, to: 2200, q: .8 }) },
      chime() { s.tone(784, .32, { type: 'triangle', vol: .1 }); s.tone(1175, .45, { type: 'triangle', vol: .08, delay: .09 }) },
      sit() { s.tone(170, .16, { to: 95, vol: .17 }); s.burst(.06, { vol: .05, f: 900, q: 1 }) },
      leave() { s.tone(220, .12, { to: 330, vol: .09, type: 'triangle' }) },
      err() { s.tone(330, .15, { vol: .1, type: 'triangle' }); s.tone(247, .2, { vol: .1, type: 'triangle', delay: .12 }) },
      tick() { s.tone(1800, .03, { vol: .04, type: 'square' }) }
    })[name]?.()
  },
  stopAmb() { if (this.amb) { const a = this.amb; this.amb = null; try { const t = this.ctx.currentTime; a.g.gain.cancelScheduledValues(t); a.g.gain.setValueAtTime(a.g.gain.value, t); a.g.gain.linearRampToValueAtTime(0, t + .35); setTimeout(() => a.nodes.forEach(n => { try { n.stop() } catch (e) { } }), 450); a.timers.forEach(clearInterval) } catch (e) { } a.onEnd && a.onEnd() } },
  ambience(level, onEnd) {
    this.stopAmb(); const c = this.ensure(); if (!c) return; const g = c.createGain(); g.gain.value = 0; g.connect(c.destination); const nodes = [], timers = []; const t = c.currentTime;
    const bed = (f, q, vol, type = 'lowpass', lfo = 0, depth = 0) => { const s = c.createBufferSource(); s.buffer = this.noiseBuf(); s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const gg = c.createGain(); gg.gain.value = vol; if (lfo) { const o = c.createOscillator(), og = c.createGain(); o.frequency.value = lfo; og.gain.value = vol * depth; o.connect(og).connect(gg.gain); o.start(); nodes.push(o) } s.connect(fl).connect(gg).connect(g); s.start(); nodes.push(s) };
    const every = (ms, fn) => timers.push(setInterval(fn, ms));
    if (level === 1) { bed(500, .5, .18); every(1500, () => { if (Math.random() < .6) this.burst(.18, { vol: .05, f: 4200, to: 2500, q: 1.4, dest: g }) }) }
    if (level === 2) { bed(700, .6, .35); every(900, () => { if (Math.random() < .45) this.tone(2400 + Math.random() * 900, .18, { type: 'sine', vol: .05, dest: g }) }) }
    if (level === 3) { bed(800, .6, .35); bed(900, 1.4, .5, 'bandpass', 4.5, .6); bed(1500, 1.2, .3, 'bandpass', 6.3, .7); every(700, () => { if (Math.random() < .4) this.tone(2600 + Math.random() * 700, .15, { vol: .05, dest: g }) }) }
    if (level === 4) { bed(900, .6, .6); bed(1000, 1, .8, 'bandpass', 7, .6); bed(1700, 1, .5, 'bandpass', 9, .7); bed(300, .8, .4, 'lowpass'); every(450, () => { if (Math.random() < .5) this.tone(2000 + Math.random() * 1500, .12, { vol: .06, dest: g }) }) }
    if (level === 5) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 48; const lf = c.createOscillator(), lg = c.createGain(); lf.frequency.value = 9; lg.gain.value = 7; lf.connect(lg).connect(o.frequency); const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 420; const og = c.createGain(); og.gain.value = .5; o.connect(fl).connect(og).connect(g); o.start(); lf.start(); nodes.push(o, lf); o.frequency.setValueAtTime(42, t); o.frequency.linearRampToValueAtTime(78, t + 1.6); o.frequency.linearRampToValueAtTime(55, t + 2.6); o.frequency.linearRampToValueAtTime(90, t + 3.6); bed(1200, .7, .5) }
    g.gain.linearRampToValueAtTime(.32, t + .4);
    this.amb = { g, nodes, timers, onEnd };
    setTimeout(() => { if (this.amb && this.amb.g === g) this.stopAmb() }, 4200)
  }
};

/* ================= data ================= */
const SS = [null,
  { k: 1, t: 'Номын сан шиг нам гүм', s: 'Хуудас эргүүлэх чимээ л сонсогдоно', short: 'Нам гүм' },
  { k: 2, t: 'Өглөөний тайван кафе шиг', s: 'Аяга хүрэх чимээ, хааяа намуухан яриа', short: 'Тайван' },
  { k: 3, t: 'Найзууд цугласан кафе шиг', s: 'Яриа тод сонсогдоно, хөгжилтэй уур амьсгал', short: 'Яриатай' },
  { k: 4, t: 'Хүнсний зах шиг хөл хөдөлгөөнтэй', s: 'Олон хүний яриа давхцана, төвлөрөхөд хэцүү', short: 'Шуугиантай' },
  { k: 5, t: 'Хөл хөдөлгөөнтэй арга хэмжээ шиг', s: 'Мотоцикл асаахтай дүйцэх чанга орчин', short: 'Чанга' }];
const WIFI = ['Хэмжилт алга', 'Сул', 'Дундаж', 'Сайн', 'Маш сайн'];
const WIFI_S = ['Мэдээлэл ороогүй', 'Мессеж, имэйлд л хангалттай', 'Вэб үзэх, хичээл уншихад', 'Видео дуудлага хийхэд болно', 'Том файл, видео дуудлага хоёул'];
const CAFES = [
  { id: 'A', x: 470, y: 250, dist: '480 м', walk: 6, hours: '08:00–22:00', open: true, tags: ['Сурах', 'Ажиллах'], occ: 36, sound: 2, wifi: 4, mbps: 64, plugs: [6, 8], note: 'Цонхны гэрэлтэй, чимээгүй булантай' },
  { id: 'I', x: 612, y: 248, dist: '260 м', walk: 3, hours: '08:00–21:00', open: true, tags: ['Сурах', 'Ажиллах'], occ: 55, sound: 3, wifi: 3, mbps: 58, plugs: [5, 8], note: 'Урт ширээтэй, багаар ажиллахад тохиромжтой' },
  { id: 'F', x: 545, y: 128, dist: '560 м', walk: 7, hours: '08:00–20:00', open: true, tags: ['Найзуудтай'], occ: 86, sound: 4, wifi: 2, mbps: 45, plugs: [2, 8], note: 'Оюутнуудын дуртай, үргэлж хөл хөдөлгөөнтэй' },
  { id: 'O', x: 640, y: 470, dist: '470 м', walk: 6, hours: '09:00–23:00', open: false, opens: 'Маргааш 09:00', tags: ['Сурах', 'Ажиллах'], occ: 0, sound: 0, wifi: 0, mbps: null, plugs: null, note: '' },
  { id: 'T', x: 810, y: 440, dist: '700 м', walk: 9, hours: '09:00–22:00', open: true, tags: ['Сурах'], occ: 45, sound: 3, wifi: 3, mbps: 47, plugs: [4, 8], note: 'Номын тавиуртай, тухтай буйдантай' },
  { id: 'J', x: 330, y: 470, dist: '820 м', walk: 10, hours: '08:00–22:00', open: true, tags: ['Найзуудтай'], occ: 70, sound: 4, wifi: 2, mbps: 32, plugs: [2, 6], note: 'Том цонхтой, хөгжимтэй' },
  { id: 'K', x: 855, y: 228, dist: '1.1 км', walk: 14, hours: '07:30–21:00', open: true, tags: ['Сурах', 'Ажиллах'], occ: 30, sound: 1, wifi: 4, mbps: 71, plugs: [7, 8], note: 'Чимээгүй бүстэй, ширээ бүрт залгууртай' },
  { id: 'B', x: 230, y: 575, dist: '1.4 км', walk: 17, hours: '10:00–00:00', open: true, tags: ['Найзуудтай'], occ: 92, sound: 5, wifi: 1, mbps: null, plugs: [1, 6], note: 'Орой амьд хөгжимтэй арга хэмжээ болдог' },
  { id: 'L', x: 160, y: 420, dist: '1.6 км', walk: 19, hours: '10:00–20:00', open: true, tags: ['Сурах', 'Тухтай'], occ: 22, sound: 1, wifi: 3, mbps: 35, plugs: [4, 8], note: 'Хамгийн нам гүм — номын сангийн уур амьсгал' },
  { id: 'P', x: 385, y: 330, dist: '2.8 км', walk: 32, hours: '11:00–22:00', open: true, tags: ['Найзуудтай', 'Тухтай'], occ: 60, sound: 3, wifi: 0, mbps: null, plugs: [3, 8], note: 'Дээврийн тагттай, оройн гэрэлтүүлэг гоё' },
  { id: 'Q', x: 915, y: 575, dist: '910 м', walk: 11, hours: '12:00–20:00', open: false, opens: 'Өнөөдөр 12:00', tags: ['Найзуудтай', 'Сурах'], occ: 0, sound: 0, wifi: 0, mbps: null, plugs: null, note: '' },
  { id: 'H', x: 705, y: 610, dist: '1.2 км', walk: 15, hours: '08:00–22:00', open: true, tags: ['Тухтай', 'Ажиллах'], occ: 15, sound: 2, wifi: 3, mbps: 51, plugs: [5, 6], note: 'Цэцэрлэгт хүрээлэнгийн хажууд, тайван' }
].map(c => ({ ...c, name: 'Кафе ' + c.id }));
const byId = id => CAFES.find(c => c.id === id);
const TOTAL_SEATS = 20;
const freePct = c => c.open ? 100 - c.occ : null;
const crowdCat = o => o < 20 ? ['Маш сул', 1] : o < 40 ? ['Сул', 2] : o < 60 ? ['Дунд зэрэг', 3] : o < 80 ? ['Завгүй', 4] : ['Маш их хүнтэй', 5];
const tone = c => !c.open ? '' : c.occ >= 75 || c.sound >= 4 ? 'y' : c.occ >= 50 || c.sound === 3 ? 'b' : 'q';
const toneVar = t => ({ q: 'var(--sage)', b: 'var(--amb)', y: 'var(--terra)' }[t] || 'var(--closed)');
function mood(c) {
  if (!c.open) return 'Одоо хаалттай байна.';
  if (c.sound <= 2 && c.occ < 50) return c.wifi >= 3 ? 'Яг одоо тайван — ажиллахад тохиромжтой цаг.' : 'Яг одоо тайван — ном уншиж, амрахад сайхан.';
  if (c.sound >= 4 || c.occ >= 80) return 'Яг одоо хөл хөдөлгөөнтэй — найзуудтайгаа уулзахад тохирно.';
  return 'Дунд зэрэг ачаалалтай — богино ажил, уулзалтад болно.'
}
const nowHour = () => clamp(new Date().getHours(), 8, 22);
const SHAPE = [.35, .5, .6, .7, .85, .95, .8, .65, .7, .85, 1, .95, .75, .55, .4];
function profile(c) { const f = c.occ / SHAPE[nowHour() - 8]; return SHAPE.map(s => clamp(Math.round(s * f), 3, 98)) }

/* ================= state ================= */
const F = { q: '', purpose: new Set(), sound: 0, wifi: 'any', seats: 'any', openOnly: false, more: false };
const favs = new Set(store.get('favs', []));
let cmpIds = [];
let selId = null, mapCtl = null, fp = null, homeMini = null;

/* ================= atmosphere components ================= */
function ssGlyph(l) {
  return ['',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 6c3-1.2 6-1.2 9 .6 3-1.8 6-1.8 9-.6v12c-3-1.2-6-1.2-9 .6-3-1.8-6-1.8-9-.6z"/><path d="M12 6.6v12.6"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M5 10h11v4a4.5 4.5 0 0 1-4.5 4.5h-2A4.5 4.5 0 0 1 5 14z"/><path d="M16 11h1.5a2.2 2.2 0 0 1 0 4.4H16M9 4c-.8 1 .8 2 0 3.2M12.5 4c-.8 1 .8 2 0 3.2"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 6.5h12a2 2 0 0 1 2 2V14a2 2 0 0 1-2 2H9l-4 3.5V16a2 2 0 0 1-1-1.8V8.5a2 2 0 0 1 2-2z"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 4.5h10a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 13 12.5H7.5l-3.5 3v-3A1.5 1.5 0 0 1 3 11V6a1.5 1.5 0 0 1 0-1.5z"/><path d="M17 9h3a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 20 17v3l-3.5-3H12a1.5 1.5 0 0 1-1.5-1.5V15"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="16.5" r="3"/><circle cx="18.5" cy="16.5" r="3"/><path d="M5.5 16.5 9 10h5l2.5 6.5M14 10l1-3h3M9 10l-1.5-2.5H5"/></svg>'][l] || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="2 3"><circle cx="12" cy="12" r="8"/></svg>'
}
function ssArt(l, w = 120) {
  const h = w * 2 / 3; let b = '';
  const waves = n => { let s = ''; for (let i = 0; i < n; i++)s += `<path class="wv" d="M${88 + i * 9} ${40 - 10 - i * 5}q${6 + i * 2} ${10 + i * 5} 0 ${20 + i * 10}" stroke="#7B542F" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".7"/>`; return s };
  if (l === 1) b = `<rect x="22" y="58" width="76" height="4" rx="2" fill="#E3D5BF"/><path d="M60 26c-10-6-22-6-34-2v32c12-4 24-4 34 2z" fill="#FFF9EC" stroke="#7B542F" stroke-width="2.4" stroke-linejoin="round"/><path d="M60 26c10-6 22-6 34-2v32c-12-4-24-4-34 2z" fill="#FFF9EC" stroke="#7B542F" stroke-width="2.4" stroke-linejoin="round"/><path class="flip" d="M60 26c8-5 18-5.5 28-3v31c-10-2.5-20-2-28 2z" fill="#FFF4DC" stroke="#B6771D" stroke-width="1.6"/><path d="M33 33h20M33 40h20M33 47h14M68 33h20M68 40h20" stroke="#E3D5BF" stroke-width="2" stroke-linecap="round"/>`;
  if (l === 2) b = `<ellipse cx="54" cy="62" rx="30" ry="5" fill="#E3D5BF"/><path d="M34 32h40v14a16 16 0 0 1-16 16h-8a16 16 0 0 1-16-16z" fill="#FFF9EC" stroke="#7B542F" stroke-width="2.6"/><path d="M74 36h5a6 6 0 0 1 0 12h-5" fill="none" stroke="#7B542F" stroke-width="2.6"/><ellipse cx="54" cy="33" rx="18" ry="3" fill="#B6771D"/><path class="stm" d="M46 26c-3-4 3-6 0-10" stroke="#B6771D" stroke-width="2.2" fill="none" stroke-linecap="round"/><path class="stm" d="M55 25c-3-4 3-6 0-10" stroke="#B6771D" stroke-width="2.2" fill="none" stroke-linecap="round"/><path class="stm" d="M64 26c-3-4 3-6 0-10" stroke="#B6771D" stroke-width="2.2" fill="none" stroke-linecap="round"/><path class="wv" d="M92 30q6 10 0 20" stroke="#7B542F" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".5"/>`;
  if (l === 3) b = `<circle cx="36" cy="54" r="9" fill="#C8573E"/><circle cx="36" cy="44" r="7" fill="#F2C9A0"/><circle cx="74" cy="54" r="9" fill="#6F8F5E"/><circle cx="74" cy="44" r="7" fill="#D9A57B"/><g class="bub"><rect x="12" y="10" width="32" height="20" rx="8" fill="#fff" stroke="#7B542F" stroke-width="2"/><path d="M24 30l-3 6 8-6" fill="#fff" stroke="#7B542F" stroke-width="2" stroke-linejoin="round"/><circle cx="21" cy="20" r="2" fill="#7B542F"/><circle cx="28" cy="20" r="2" fill="#7B542F"/><circle cx="35" cy="20" r="2" fill="#7B542F"/></g><g class="bub b2"><rect x="62" y="8" width="32" height="20" rx="8" fill="#FFF4DC" stroke="#7B542F" stroke-width="2"/><path d="M74 28l-1 6 6-6" fill="#FFF4DC" stroke="#7B542F" stroke-width="2" stroke-linejoin="round"/><path d="M70 18h16" stroke="#7B542F" stroke-width="2" stroke-linecap="round"/></g>${waves(1)}`;
  if (l === 4) { const hs = [[22, '#C8573E'], [40, '#6F8F5E'], [58, '#E0A23A'], [76, '#4A7BA6']]; b = hs.map(([x, cl]) => `<circle cx="${x}" cy="62" r="7" fill="${cl}"/><circle cx="${x}" cy="54" r="5.5" fill="#F2C9A0"/>`).join('') + [[6, 6, 'b1'], [34, 2, 'b2'], [58, 10, 'b3'], [22, 24, 'b4']].map(([x, y, k]) => `<g class="bub ${k}"><rect x="${x}" y="${y}" width="26" height="16" rx="7" fill="#fff" stroke="#7B542F" stroke-width="1.8"/><path d="M${x + 7} ${y + 8}h12" stroke="#7B542F" stroke-width="1.8" stroke-linecap="round"/></g>`).join('') + waves(2) }
  if (l === 5) b = `<g class="vib"><circle cx="30" cy="54" r="11" fill="none" stroke="#3E2A17" stroke-width="4.5"/><circle cx="78" cy="54" r="11" fill="none" stroke="#3E2A17" stroke-width="4.5"/><path d="M30 54l12-16h18l18 16" stroke="#3E2A17" stroke-width="4" fill="none" stroke-linejoin="round"/><path d="M42 38h18l4 8H46z" fill="#C8573E"/><path d="M58 32l8 0 4 6" stroke="#3E2A17" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M40 46h14" stroke="#7B542F" stroke-width="3"/></g><circle class="puff" cx="16" cy="50" r="5" fill="#C9C2B4"/><circle class="puff" cx="14" cy="46" r="4" fill="#DDD6CA"/><circle class="puff" cx="12" cy="52" r="3.5" fill="#C9C2B4"/>${waves(3)}`;
  if (!l) b = `<circle cx="60" cy="40" r="20" fill="none" stroke="#C9C2B4" stroke-width="2.5" stroke-dasharray="4 4"/><text x="60" y="46" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="18" fill="#9A8570">?</text>`;
  return `<svg class="ss" data-l="${l}" style="--l:${l}" width="${w}" height="${h}" viewBox="0 0 120 80" aria-hidden="true">${b}</svg>`
}
function wifiSVG(l, w = 40) { return `<svg class="wf w${l}" width="${w}" height="${w * .8}" viewBox="0 0 40 32" style="color:${l ? 'var(--brown)' : 'var(--ink3)'}" aria-hidden="true"><path class="a a3${l >= 3 ? ' on' : ''}" d="M4 12.5a23 23 0 0 1 32 0"/><path class="a a2${l >= 2 ? ' on' : ''}" d="M9.5 18a15 15 0 0 1 21 0"/><path class="a a1 on" d="M15 23.5a7.5 7.5 0 0 1 10 0"/><circle class="d" cx="20" cy="28" r="2.6" fill="${l ? 'currentColor' : 'var(--line2)'}"/></svg>` }
function crowdDots(o) { const n = crowdCat(o)[1]; let s = ''; for (let i = 1; i <= 5; i++)s += `<i class="${i <= n ? 'f' : ''}"></i>`; return `<span class="crowd-dots ${n <= 2 ? 'c-q' : n === 3 ? 'c-b' : 'c-y'}" aria-hidden="true">${s}</span>` }
function crowdMini(o) { const n = crowdCat(o)[1]; const k = n <= 2 ? 1 : n === 3 ? 2 : 3; let s = ''; for (let i = 1; i <= 3; i++)s += `<i class="${i <= k ? 'f' : ''}"></i>`; return `<span class="crowd-dots ${k === 1 ? 'c-q' : k === 2 ? 'c-b' : 'c-y'}">${s}</span>` }
const seatBar = p => `<div class="mtr"><i style="width:${p}%;background:${p >= 50 ? 'var(--sage)' : p >= 25 ? 'var(--amb)' : 'var(--terra)'}"></i></div>`;

/* ================= map ================= */
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
const ROADS = [[[0, 150], [1000, 138], 22], [[0, 372], [1000, 308], 34], [[0, 525], [1000, 512], 22], [[120, 0], [110, 680], 20], [[300, 0], [318, 680], 22], [[560, 0], [548, 680], 30], [[760, 0], [770, 680], 20], [[935, 0], [925, 680], 24]];
let MAP_SVG = null;
function mapSVG() {
  if (MAP_SVG) return MAP_SVG; const r = rng(7); let s = '';
  const dseg = (px, py, [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay, t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1); return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) };
  const river = t => [685 + Math.sin(t * 5) * 26, t * 680];
  const zones = [[400, 170, 120, 90], [440, 560, 170, 110], [200, 560, 90, 90], [610, 520, 80, 70]];
  const inZone = (x, y, w, h) => zones.some(([zx, zy, zw, zh]) => x + w > zx - 8 && x < zx + zw + 8 && y + h > zy - 8 && y < zy + zh + 8);
  s += `<rect width="1000" height="680" fill="#D9E8C2"/>`;
  // park
  s += `<rect x="440" y="560" width="170" height="110" rx="18" fill="#BCD99A"/><circle cx="525" cy="615" r="30" fill="none" stroke="#E8DCC4" stroke-width="7"/><path d="M440 615h55M555 615h55" stroke="#E8DCC4" stroke-width="7"/>`;
  // river
  let rp = 'M' + river(0).join(' '); for (let t = .02; t <= 1.001; t += .02)rp += ' L' + river(t).map(v => v.toFixed(1)).join(' ');
  s += `<path d="${rp}" stroke="#A9D7F0" stroke-width="20" fill="none" stroke-linecap="round"/><path d="${rp}" stroke="#C7E7F7" stroke-width="6" fill="none" stroke-dasharray="14 22"/>`;
  // roads
  ROADS.forEach(([a, b, w]) => { s += `<path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}" stroke="#8C8577" stroke-width="${w}" stroke-linecap="square"/>` });
  ROADS.forEach(([a, b, w]) => { if (w >= 26) s += `<path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}" stroke="#F4EFE4" stroke-width="2.5" stroke-dasharray="16 14"/>` });
  // plaza & landmarks
  s += `<rect x="400" y="170" width="120" height="90" rx="6" fill="#EFE6D6" stroke="#D8CBB4" stroke-width="2"/><rect x="420" y="186" width="80" height="36" rx="4" fill="#F7F1E6" stroke="#D8CBB4"/><circle cx="460" cy="242" r="7" fill="#9A8570"/>`;
  s += `<circle cx="245" cy="605" r="36" fill="#E9806A"/><g stroke="#FCE3D6" stroke-width="2.5">${[0, 1, 2, 3, 4, 5].map(i => `<path d="M245 605L${245 + Math.cos(i * Math.PI / 3) * 34} ${605 + Math.sin(i * Math.PI / 3) * 34}"/>`).join('')}</g><circle cx="245" cy="605" r="9" fill="#FCE3D6"/>`;
  s += `<rect x="615" y="525" width="70" height="60" rx="5" fill="#D8C69C" stroke="#B9A574" stroke-width="2"/><rect x="633" y="540" width="34" height="26" fill="#3F7D63"/><circle cx="650" cy="547" r="5" fill="#E9B949"/>`;
  // buildings
  const cols = ['#F6D58A', '#E9A15B', '#E2765A', '#BFD7EA', '#F3E1C0', '#9EC1DE', '#F4C27A', '#EDE3CF']; const B = [];
  for (let i = 0; i < 900 && B.length < 150; i++) {
    const w = 20 + r() * 30, h = 16 + r() * 22, x = r() * (1000 - w), y = r() * (680 - h), cx = x + w / 2, cy = y + h / 2; const half = Math.hypot(w, h) / 2;
    if (ROADS.some(([a, b, rw]) => dseg(cx, cy, a, b) < half + rw / 2 + 4)) continue; if (Math.abs(river(cy / 680)[0] - cx) < half + 16) continue; if (inZone(x, y, w, h)) continue;
    if (CAFES.some(c => Math.abs(c.x - cx) < w / 2 + 22 && c.y - cy < h / 2 + 52 && cy - c.y < h / 2 + 30)) continue;
    if (B.some(o => x < o[0] + o[2] + 6 && x + w > o[0] - 6 && y < o[1] + o[3] + 6 && y + h > o[1] - 6)) continue; B.push([x, y, w, h, cols[Math.floor(r() * cols.length)]])
  }
  B.forEach(([x, y, w, h, c]) => { s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${c}"/><rect x="${x.toFixed(1)}" y="${(y + h * .62).toFixed(1)}" width="${w.toFixed(1)}" height="${(h * .38).toFixed(1)}" fill="#000" opacity=".08"/>`; if (w > 28) { for (let k = x + 5; k < x + w - 5; k += 7)s += `<rect x="${k.toFixed(1)}" y="${(y + h * .7).toFixed(1)}" width="3.5" height="3.5" fill="#fff" opacity=".7"/>` } });
  // trees
  for (let i = 0, n = 0; i < 500 && n < 90; i++) { const x = r() * 1000, y = r() * 680; if (ROADS.some(([a, b, rw]) => dseg(x, y, a, b) < rw / 2 + 8)) continue; if (Math.abs(river(y / 680)[0] - x) < 18) continue; if (B.some(o => x > o[0] - 6 && x < o[0] + o[2] + 6 && y > o[1] - 6 && y < o[1] + o[3] + 6)) continue; if (CAFES.some(c => Math.abs(c.x - x) < 26 && c.y - y < 54 && y - c.y < 30)) continue; const rr = 5 + r() * 4; s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rr.toFixed(1)}" fill="#7FB560"/><circle cx="${(x - 1.5).toFixed(1)}" cy="${(y - 1.5).toFixed(1)}" r="${(rr * .5).toFixed(1)}" fill="#9BCB7A"/>`; n++ }
  // labels
  const lab = (x, y, t, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="${-t.length * 3.3 - 8}" y="-10" width="${t.length * 6.6 + 16}" height="20" rx="10" fill="#fff" opacity=".92"/><text text-anchor="middle" y="4" font-family="Manrope,sans-serif" font-size="11" font-weight="700" fill="#5A4430">${t}</text></g>`;
  s += lab(460, 160, 'Сүхбаатарын талбай') + lab(180, 148, 'Жамъян гүний гудамж', -1) + lab(160, 358, 'Энхтайваны өргөн чөлөө', -3.7) + lab(553, 40, 'Чингисийн өргөн чөлөө', 90) + lab(245, 655, 'Улсын цирк') + lab(525, 575, 'Үндэсний парк') + lab(650, 505, 'Чойжин ламын сүм') + lab(930, 90, 'Их тойруу', 90);
  // you are here
  s += `<g transform="translate(575 292)"><circle class="you" r="18" fill="#1A73E8" opacity=".18"/><circle r="9" fill="#1A73E8" stroke="#fff" stroke-width="3"/></g><text x="594" y="296" font-family="Manrope" font-size="12" font-weight="800" fill="#1A73E8">Та энд</text>`;
  MAP_SVG = `<svg class="base" viewBox="0 0 1000 680" aria-hidden="true"><style>.you{animation:you 2.2s ease-out infinite;transform-origin:center;transform-box:fill-box}@keyframes you{0%{transform:scale(.5);opacity:.5}100%{transform:scale(1.8);opacity:0}}</style>${s}</svg>`; return MAP_SVG
}
function markerHTML(c) {
  const t = tone(c); const pd = { q: '3.4s', b: '2.4s', y: '1.5s' }[t] || '0s';
  return `<button class="mk${c.open ? '' : ' closed'}" data-mk="${c.id}" style="left:${c.x}px;top:${c.y}px;--pc:${toneVar(t)};--pd:${pd}" aria-label="${c.name}: ${c.open ? crowdCat(c.occ)[0] + ', ' + SS[c.sound].short + ' дуу, Wi-Fi ' + WIFI[c.wifi] : 'хаалттай'}">
  <span class="mk-name">${c.name}</span>
  <span class="mk-pinw">${c.open ? '<span class="mk-ring"></span>' : ''}${pinSVG(c.open ? '#FF9D00' : '#C9C2B4')}</span>
  <span class="mk-pill">${crowdMini(c.occ)}<span class="sep"></span><span class="sg">${ssGlyph(c.sound)}</span><span class="sep"></span>${wifiSVG(c.wifi, 15)}</span>
 </button>`}
function buildMap(vp, { interactive = true, onSelect = null, focus = null } = {}) {
  vp.insertAdjacentHTML('beforeend', `<div class="map-inner">${mapSVG()}<div class="mk-layer">${CAFES.map(markerHTML).join('')}</div></div>`);
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
    vp.addEventListener('pointerdown', e => { if (e.target.closest('.map-ctrl,.pv,.map-legend,.map-note')) return; drag = { x: e.clientX, y: e.clientY, sx: st.x, sy: st.y, id: e.pointerId }; moved = false });
    vp.addEventListener('pointermove', e => { if (!drag || drag.id !== e.pointerId) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (!moved && Math.hypot(dx, dy) > 5) { moved = true; vp.classList.add('drag'); try { vp.setPointerCapture(e.pointerId) } catch (_) { } } if (moved) { st.x = drag.sx + dx; st.y = drag.sy + dy; apply() } });
    const end = () => { drag = null; vp.classList.remove('drag') }; vp.addEventListener('pointerup', end); vp.addEventListener('pointercancel', end);
    vp.addEventListener('wheel', e => { e.preventDefault(); const r = vp.getBoundingClientRect(); zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top) }, { passive: false });
    vp.insertAdjacentHTML('beforeend', `<div class="map-ctrl"><button data-z="in" aria-label="Томруулах">${I.plus}</button><button data-z="out" aria-label="Жижигрүүлэх">${I.minus}</button><button data-z="me" aria-label="Миний байршил">${I.locate}</button></div>`);
    $('.map-ctrl', vp).addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; Snd.ui('click'); if (b.dataset.z === 'in') zoomBy(1.3); else if (b.dataset.z === 'out') zoomBy(1 / 1.3); else { st.s = 1.4; centerOn(575, 292) } });
  }
  $('.mk-layer', vp).addEventListener('click', e => { const m = e.target.closest('.mk'); if (!m || moved) return; e.stopPropagation(); onSelect && onSelect(m.dataset.mk, 'map') });
  if (interactive) vp.addEventListener('click', e => { if (moved || e.target.closest('.mk,.pv,.map-ctrl,.map-legend,.map-note')) return; onSelect && onSelect(null, 'map') });
  const ro = new ResizeObserver(fit); ro.observe(vp); fit();
  return { fit, centerOn, setPv(el) { pvEl = el; placePv() }, select(id) { $$('.mk', vp).forEach(m => m.classList.toggle('sel', m.dataset.mk === id)) }, hover(id, on) { const m = $(`.mk[data-mk="${id}"]`, vp); m && m.classList.toggle('hov', on) }, dim(set) { $$('.mk', vp).forEach(m => m.classList.toggle('dim', !set.has(m.dataset.mk))) }, destroy() { ro.disconnect() } }
}

/* ================= filters ================= */
const PURPOSES = [['Сурах', I.book], ['Ажиллах', I.laptop], ['Найзуудтай', I.people], ['Тухтай', I.sofa]];
function matches(c) {
  if (F.q && !c.name.toLowerCase().includes(F.q.toLowerCase())) return false; if (F.openOnly && !c.open) return false;
  if (F.purpose.size && ![...F.purpose].every(p => c.tags.includes(p))) return false;
  if (F.sound && c.sound !== F.sound) return false;
  if (F.wifi !== 'any' && !(c.open && c.wifi >= (F.wifi === 'good' ? 3 : 4))) return false;
  if (F.seats !== 'any' && !(c.open && freePct(c) >= +F.seats)) return false; return true
}
const activeCount = () => F.purpose.size + (F.sound ? 1 : 0) + (F.wifi !== 'any') + (F.seats !== 'any') + (F.openOnly ? 1 : 0);
const soundFilterLabel = () => F.sound ? `${F.sound}/5 · ${SS[F.sound].short}` : 'Бүгд';
const soundFilterHint = () => F.sound ? SS[F.sound].t : 'Бүх түвшний кафег харуулна.';
function filtersHTML(full) {
  const pc = PURPOSES.map(([p, ic]) => `<button class="chip" data-f="purpose" data-v="${p}" aria-pressed="${F.purpose.has(p)}">${ic}${p}</button>`).join('');
  const sc = `<div class="sound-filter" data-sound-filter>
   <output class="sound-value" data-sound-value>${soundFilterLabel()}</output>
   <input class="sound-range" type="range" min="0" max="5" step="1" value="${F.sound}" style="--sound-progress:${F.sound * 20}%" data-sound-range aria-label="Дуу чимээний түвшин" aria-valuetext="${soundFilterLabel()}">
   <div class="sound-ticks" aria-hidden="true">${[0, 1, 2, 3, 4, 5].map(l => `<span class="${l === F.sound ? 'on' : ''}" title="${l ? SS[l].short : 'Бүгд'}">${l || 'Бүгд'}</span>`).join('')}</div>
   <small class="sound-hint" data-sound-hint>${soundFilterHint()}</small>
  </div>`;
  const opt = (k, v, l) => `<button class="chip" data-f="${k}" data-v="${v}" aria-pressed="${F[k] === v}">${l}</button>`;
  const extra = `<div class="fgrp"><span>${wifiSVG(3, 14)} Wi-Fi</span><div class="chips">${opt('wifi', 'any', 'Бүгд')}${opt('wifi', 'good', 'Сайн ба түүнээс дээш')}${opt('wifi', 'great', 'Маш сайн')}</div></div>
 <div class="fgrp"><span>${I.seat} Сул суудал</span><div class="chips">${opt('seats', 'any', 'Бүгд')}${opt('seats', '30', '30%+ сул')}${opt('seats', '50', '50%+ сул')}</div></div>
 <div class="tgl-row" style="border:0;padding:0"><div><b>Зөвхөн нээлттэй</b><small>Хаалттай кафег нуух</small></div><button class="sw" role="switch" data-f="openOnly" aria-checked="${F.openOnly}" aria-label="Зөвхөн нээлттэй"></button></div>`;
  return `<div class="fgrp"><span>${I.target} Зорилго</span><div class="chips">${pc}</div></div>
 <div class="fgrp"><span>${ssGlyph(2)} Дуу чимээ — ямар мэдрэмжтэй вэ?</span>${sc}</div>
 ${full ? extra : `<button class="more" data-more aria-expanded="${F.more}">Нарийвчлах (Wi-Fi, суудал) ${I.chev}</button><div class="morebox${F.more ? ' open' : ''}"><div>${extra}</div></div>`}`
}
function syncFilterUI() {
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
  const rm = e.target.closest('[data-rm]'); if (rm) { const [k, v] = rm.dataset.rm.split(':'); Snd.ui('click'); if (k === 'purpose') F.purpose.delete(v); else if (k === 'sound') F.sound = 0; else if (k === 'openOnly') F.openOnly = false; else F[k] = 'any'; syncFilterUI(); refreshResults() }
  if (e.target.closest('[data-reset]')) { F.purpose.clear(); F.sound = 0; F.wifi = 'any'; F.seats = 'any'; F.openOnly = false; F.q = ''; $$('#q,#q2').forEach(i => i.value = ''); Snd.ui('whoosh'); syncFilterUI(); refreshResults() }
});
function activeHTML(n) {
  const a = []; F.purpose.forEach(p => a.push([`purpose:${p}`, p])); if (F.sound) a.push(['sound:', SS[F.sound].short]); if (F.wifi !== 'any') a.push(['wifi:', F.wifi === 'good' ? 'Wi-Fi сайн+' : 'Wi-Fi маш сайн']); if (F.seats !== 'any') a.push(['seats:', F.seats + '%+ сул']); if (F.openOnly) a.push(['openOnly:', 'Нээлттэй']);
  return `<span><b class="num">${n}</b> кафе</span>` + a.map(([k, l]) => `<span class="ac">${l}<button data-rm="${k}" aria-label="${l} шүүлтүүрийг арилгах">${I.x}</button></span>`).join('') + (a.length ? '<button class="rst" data-reset>Цэвэрлэх</button>' : '')
}
function whyLine(c) { if (!c.open) return `Хаалттай · ${c.opens} нээгдэнэ`; const p = []; if (F.sound === c.sound || c.sound <= 2) p.push(SS[c.sound].short.toLowerCase() + ' орчин'); if (F.wifi !== 'any' || c.wifi >= 4) p.push('Wi-Fi ' + WIFI[c.wifi].toLowerCase()); if (F.seats !== 'any' || freePct(c) >= 60) p.push(freePct(c) + '% сул'); if (F.purpose.size) p.unshift([...F.purpose].join(', ').toLowerCase() + 'д тохирно'); return p.length ? `<strong>Яагаад:</strong> ${p.slice(0, 3).join(' · ')}` : c.note }
let refreshResults = () => { };

/* ================= shared bits ================= */
function favBtn(id) { return `<button class="heart" data-fav="${id}" aria-pressed="${favs.has(id)}" aria-label="Хадгалах">${I.heart}</button>` }
function cmpBtn(id) { return `<button class="cmpb" data-cmp="${id}" aria-pressed="${cmpIds.includes(id)}" aria-label="Харьцуулахад нэмэх" title="Харьцуулах">${I.cmp}</button>` }
function toggleFav(id, btn) {
  const c = byId(id); if (favs.has(id)) { favs.delete(id); Snd.ui('click'); toast(`${c.name} хадгалснаас хасагдлаа`) } else { favs.add(id); Snd.ui('chime'); toast(`${c.name} хадгалагдлаа`, true) } store.set('favs', [...favs]);
  $$(`[data-fav="${id}"]`).forEach(b => { b.setAttribute('aria-pressed', favs.has(id)); if (favs.has(id)) { b.classList.remove('burst'); void b.offsetWidth; b.classList.add('burst') } }); renderFavCount(true)
}
function toggleCmp(id) { const c = byId(id); if (cmpIds.includes(id)) cmpIds = cmpIds.filter(x => x !== id); else { if (cmpIds.length >= 3) { Snd.ui('err'); toast('Нэг дор 3 хүртэл кафе харьцуулна'); return } cmpIds.push(id); Snd.ui('pop') } $$(`[data-cmp="${id}"]`).forEach(b => b.setAttribute('aria-pressed', cmpIds.includes(id))); renderTray() }
document.addEventListener('click', e => {
  const f = e.target.closest('[data-fav]'); if (f) { e.stopPropagation(); toggleFav(f.dataset.fav, f); return } const c = e.target.closest('[data-cmp]'); if (c) { e.stopPropagation(); toggleCmp(c.dataset.cmp); return }
  const p = e.target.closest('[data-play]'); if (p) { e.stopPropagation(); playAmb(+p.dataset.play, p) }
}, true);
function playAmb(l, btn) {
  const was = btn.classList.contains('on'); $$('[data-play].on').forEach(b => { b.classList.remove('on'); b.innerHTML = I.play + ' Сонсох' }); Snd.stopAmb(); if (was) return;
  if (!Snd.ensure()) { toast('Энэ хөтөч дуу тоглуулахыг дэмжихгүй байна'); return } btn.classList.add('on'); btn.innerHTML = I.stop + ' Зогсоох'; Snd.ambience(l, () => { btn.classList.remove('on'); btn.innerHTML = I.play + ' Сонсох' })
}
function renderTray() {
  const t = $('#cmpTray'); if (!cmpIds.length) { t.classList.remove('show'); return }
  t.innerHTML = `<b>Харьцуулах</b><div class="ct">${cmpIds.map(id => `<span class="ci">${byId(id).name}<button data-cmp="${id}" aria-label="Хасах">${I.x}</button></span>`).join('')}</div><button class="btn btn-y" id="cmpGo" ${cmpIds.length < 2 ? 'disabled style="opacity:.5"' : ''}>Харьцуулах (${cmpIds.length})</button>`; t.classList.add('show'); $('#cmpGo').onclick = () => { if (cmpIds.length >= 2) openCompare(); else toast('Дор хаяж 2 кафе сонгоно уу') }
}
function openCompare() {
  Snd.ui('whoosh'); const cs = cmpIds.map(byId); const best = (f) => { const v = cs.filter(c => c.open).map(f); return Math.max(...v) };
  const row = (lab, fn) => `<tr><th>${lab}</th>${cs.map(fn).join('')}</tr>`;
  openModal(`<div class="mdl-h"><div><span class="eyebrow">Харьцуулалт</span><h2>Аль нь яг одоо тохирох вэ?</h2></div><button class="pv-x" data-close aria-label="Хаах">${I.x}</button></div>
 <div style="overflow-x:auto"><table class="cmp-t"><tr><th></th>${cs.map(c => `<td><b style="font-size:18px">${c.name}</b><br><span class="open-st${c.open ? '' : ' closed'}">${I.lamp}${c.open ? 'Нээлттэй' : 'Хаалттай'}</span></td>`).join('')}</tr>
 ${row('Сул суудал', c => c.open ? `<td><b class="num ${freePct(c) === best(x => freePct(x)) ? 'best' : ''}">${freePct(c)}%</b>${seatBar(freePct(c))}</td>` : '<td class="muted">—</td>')}
 ${row('Хүмүүс', c => c.open ? `<td>${crowdDots(c.occ)}<br><b>${crowdCat(c.occ)[0]}</b></td>` : '<td class="muted">—</td>')}
 ${row('Дуу чимээ', c => c.open ? `<td>${ssArt(c.sound, 90)}<br><b style="font-size:14px">${SS[c.sound].t}</b></td>` : '<td class="muted">—</td>')}
 ${row('Wi-Fi', c => c.open ? `<td>${wifiSVG(c.wifi, 40)}<br><b>${WIFI[c.wifi]}</b>${c.mbps ? `<br><small class="muted">${c.mbps} Mbps хэмжсэн</small>` : ''}</td>` : '<td class="muted">—</td>')}
 ${row('Зай', c => `<td><b>${c.dist}</b><br><small class="muted">${c.walk} мин алхана</small></td>`)}
 ${row('', c => `<td><a class="btn btn-o" href="#cafe-${c.id}" data-close>Үзэх →</a></td>`)}</table></div>
 <p class="muted" style="font-size:12px;margin:14px 0 0"><span class="badge b-demo">ДЕМО</span> Прототипийн жишээ өгөгдөл.</p>`, true)
}

/* ================= modal / toast ================= */
function openModal(html, wide) { const m = $('#modal'); m.innerHTML = `<div class="mdl-bg" data-bg><div class="mdl${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${html}</div></div>`; const bg = $('[data-bg]', m); bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-close]')) closeModal() }); setTimeout(() => { const f = $('button,a,input', bg); f && f.focus() }, 50) }
function closeModal() { $('#modal').innerHTML = '' }
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); $('#sndPop').hidden = true; $('#favPop').hidden = true; if (selId && location.hash.startsWith('#explore')) selectCafe(null) } });
function toast(msg, ok) { const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = (ok ? `<span class="tk">${I.check}</span>` : '') + msg; $('#toasts').appendChild(t); setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320) }, 2400) }

/* ================= header ================= */
function renderHeaderBits() {
  $('#logoIc').innerHTML = I.house; $('#locPill').innerHTML = I.pin + ' Сүхбаатар дүүрэг'; renderSndBtn(); renderFavCount();
  $('#tabbar').innerHTML = [['home', I.home, 'Нүүр'], ['explore', I.map, 'Газрын зураг'], ['cafes', I.grid, 'Кафенууд'], ['about', I.info, 'Тухай'], ['partner', I.hand, 'Хамтрах']].map(([h, ic, l]) => `<a href="#${h}" data-nav="${h}">${ic}<span>${l}</span></a>`).join('')
}
function renderSndBtn() { $('#sndBtn').innerHTML = Prefs.sound ? I.sndOn : I.sndOff; $('#sndBtn').setAttribute('aria-pressed', Prefs.sound) }
function renderFavCount(b) { $('#favBtn').innerHTML = I.heart + (favs.size ? `<span class="cnt${b ? ' bump' : ''}">${favs.size}</span>` : '') }
$('#sndBtn').onclick = e => {
  e.stopPropagation(); const p = $('#sndPop'); $('#favPop').hidden = true; p.hidden = !p.hidden; if (!p.hidden) {
    p.innerHTML = `<h3>Дуу ба хөдөлгөөн</h3>
 <div class="tgl-row"><div><b>Интерфэйсийн дуу</b><small>Дарах, хадгалах үеийн зөөлөн дуу</small></div><button class="sw" role="switch" id="swSnd" aria-checked="${Prefs.sound}" aria-label="Интерфэйсийн дуу"></button></div>
 <div class="tgl-row"><div><b>Хөдөлгөөн багасгах</b><small>Анимацыг зогсоож, статик дүрслэл харуулна</small></div><button class="sw" role="switch" id="swRm" aria-checked="${Prefs.reduced}" aria-label="Хөдөлгөөн багасгах"></button></div>
 <div class="tgl-row"><div><b>Орчны дуу сонсох</b><small>Кафе бүрийн «Сонсох» товчоор зөвхөн өөрөө асаана. Автоматаар тоглохгүй.</small></div></div>`;
    $('#swSnd').onclick = () => { Prefs.sound = !Prefs.sound; store.set('sound', Prefs.sound); $('#swSnd').setAttribute('aria-checked', Prefs.sound); renderSndBtn(); if (Prefs.sound) { Snd.ensure(); Snd.ui('chime') } };
    $('#swRm').onclick = () => { Prefs.reduced = !Prefs.reduced; store.set('reduced', Prefs.reduced); $('#swRm').setAttribute('aria-checked', Prefs.reduced); document.documentElement.classList.toggle('rm', Prefs.reduced); if (fp) fp.reduced = Prefs.reduced; Snd.ui('click') }
  }
};
$('#favBtn').onclick = e => { e.stopPropagation(); const p = $('#favPop'); $('#sndPop').hidden = true; p.hidden = !p.hidden; if (!p.hidden) { p.innerHTML = `<h3>Хадгалсан кафе</h3>` + (favs.size ? [...favs].map(id => { const c = byId(id); return `<div class="fav-item">${pinSVG(c.open ? '#FF9D00' : '#C9C2B4').replace('<svg', '<svg width="22" height="26"')}<a href="#cafe-${id}">${c.name}</a><span class="muted" style="font-size:13px">${c.open ? freePct(c) + '% сул' : 'Хаалттай'}</span></div>` }).join('') : `<p class="muted" style="margin:0">Одоогоор хадгалсан кафе алга. Картын ♡ товчийг дарж хадгална.</p>`) } };
document.addEventListener('click', e => { if (!e.target.closest('#sndPop,#sndBtn')) $('#sndPop').hidden = true; if (!e.target.closest('#favPop,#favBtn')) $('#favPop').hidden = true; if (e.target.closest('#favPop a')) $('#favPop').hidden = true });

/* ================= cafe card (V1 layout, upgraded) ================= */
function cafeCard(c) {
  const fp_ = freePct(c);
  const tiles = c.open ? `<div class="tile"><div class="ti">${I.seat.replace('<svg', '<svg width="20" height="20"')}</div><b class="num">${fp_}%</b><small>сул суудал</small></div>
  <div class="tile"><div class="ti">${ssArt(c.sound, 40)}</div><b style="font-size:13px">${SS[c.sound].short}</b><small>дуу чимээ</small></div>
  <div class="tile"><div class="ti">${wifiSVG(c.wifi, 30)}</div><b style="font-size:13px">${WIFI[c.wifi]}</b><small>Wi-Fi</small></div>
  <div class="tile"><div class="ti">${I.plug.replace('<svg', '<svg width="20" height="20"')}</div><b class="num">${c.plugs ? Math.round(c.plugs[0] / c.plugs[1] * 100) + '%' : '—'}</b><small>залгуур сул</small></div>`
    : `<div class="unav"><b>Хаалттай · ${c.opens} нээгдэнэ</b>Хаалттай үед бодит цагийн мэдээлэл харагдахгүй.</div>`;
  return `<article class="ccard">
  <div class="cc-top">${cardPin(!c.open)}<div><h3>${c.name}</h3><div class="meta num">${c.dist} · ${c.hours}</div></div><span class="open-st${c.open ? '' : ' closed'}">${I.lamp}${c.open ? 'Нээлттэй' : 'Хаалттай'}</span></div>
  <div class="tags">${c.tags.join(' · ')}</div>
  ${c.open ? `<div style="display:flex;align-items:center;gap:10px;font-size:14px">${crowdDots(c.occ)}<b>${crowdCat(c.occ)[0]}</b><span class="badge b-demo" style="margin-left:auto">ДЕМО</span></div>` : ''}
  <div class="tiles">${tiles}</div>
  <div class="cc-act"><a class="btn btn-o" href="#cafe-${c.id}">Дэлгэрэнгүй →</a>${favBtn(c.id)}${cmpBtn(c.id)}</div>
 </article>`}

/* ================= pages ================= */
const app = $('#app');
function footer() {
  return `<footer><div class="wrap"><div class="ft"><div><a class="logo" href="#home" style="color:#fff">${I.house}<span><b>Live</b>Space</span></a><p style="max-width:380px;margin-top:14px">Улаанбаатарын кафенуудын сул суудал, дуу чимээ, Wi-Fi-г очихоосоо өмнө харж, өөрт тохирох газраа сонгоорой.</p></div>
 <div><h4>ЦЭС</h4><a href="#explore">Газрын зураг</a><a href="#cafes">Кафенууд</a><a href="#about">Бидний тухай</a><a href="#partner">Хамтын ажиллагаа</a></div>
 <div><h4>КАФЕ ЭЗЭМШИГЧ</h4><a href="#staff">Ажилтны шууд хяналт</a><a href="#partner">Кафегаа нэмэх</a><span style="display:block;padding:4px 0">Улаанбаатар, Монгол</span></div></div>
 <div class="ft-b"><span>© 2026 LiveSpace</span><span>Прототип · бүх утга демо өгөгдөл</span></div></div></footer>`}
const lampSVG = (c, shape) => shape === 0 ? `<svg viewBox="0 0 110 60"><path d="M10 56C10 30 30 12 55 12s45 18 45 44z" fill="${c}"/><rect x="5" y="52" width="100" height="6" rx="3" fill="#7B542F"/><ellipse cx="55" cy="58" rx="9" ry="4" fill="#FFF4DC"/></svg>` : shape === 1 ? `<svg viewBox="0 0 110 60"><path d="M45 4h20l40 52H5z" fill="${c}"/><rect x="45" y="0" width="20" height="8" rx="2" fill="#7B542F"/><ellipse cx="55" cy="56" rx="9" ry="4" fill="#FFF4DC"/></svg>` : `<svg viewBox="0 0 110 60"><path d="M30 56c0-22 10-40 25-40s25 18 25 40z" fill="${c}"/><rect x="51" y="8" width="8" height="10" fill="#7B542F"/><rect x="24" y="52" width="62" height="6" rx="3" fill="#3E2A17"/><ellipse cx="55" cy="58" rx="8" ry="3.5" fill="#FFF4DC"/></svg>`;
function lamp(x, cord, c, shape, stat, cls = '') { return `<div class="lamp ${cls}" style="left:${x}"><div class="cord" style="height:${cord}px"></div>${lampSVG(c, shape)}<div class="cone"></div>${stat ? `<div class="stat" style="--st:${cord + 120}px">${stat}</div>` : ''}</div>` }
function plantSVG(w, flip) { return `<svg width="${w}" viewBox="0 0 120 170" style="${flip ? 'transform:scaleX(-1)' : ''}"><path d="M60 110C55 70 60 30 62 0c10 30 12 70 0 110z" fill="#7A8A4E"/><path d="M60 110C40 80 15 70 0 72c20 10 40 25 58 40z" fill="#8A9A5B"/><path d="M62 110c18-30 40-42 58-42-18 12-36 28-56 44z" fill="#8A9A5B"/><path d="M28 120h64l-8 50H36z" fill="#B6771D"/></svg>` }

function renderHome() {
  const open = CAFES.filter(c => c.open); const avg = Math.round(open.reduce((s, c) => s + freePct(c), 0) / open.length); const good = open.filter(c => c.wifi >= 3).length;
  const stat = (n, l) => `<b class="num" data-count="${n}">${n}</b><span>${l}</span>`;
  app.innerHTML = `<div class="page">
 <section class="hero" aria-label="LiveSpace">
  <div class="hero-bar"></div>
  ${lamp('0%', 30, '#FF9D00', 0, stat(CAFES.length, 'кафе харагдаж байна'), 'l1')}${lamp('9%', 150, '#B6771D', 1, stat(open.length, 'одоо нээлттэй'), 'l2')}
  ${lamp('78%', 130, '#FFCF71', 1, `<b class="num" data-count="${avg}" data-suf="%">${avg}%</b><span>дундаж сул суудал</span>`, 'l3')}${lamp('89%', 60, '#7B542F', 2, stat(good, 'кафед Wi-Fi сайн'), 'l4')}
  <div class="arch">
   <h1>Өнөөдөр <em>хаана</em><br>суух вэ?</h1>
   <p>Ойролцоох кафенуудын сул суудал, дуу чимээ, Wi-Fi-г нэг дороос хараад сурах, ажиллах, найзуудтайгаа уулзах газраа сонгоорой.</p>
   <form class="hsearch" id="hs">${I.search}<input id="hq" placeholder="Кафе хайх, жишээ нь «Кафе A»" aria-label="Кафе хайх"><button class="btn btn-p">Газрын зураг харах</button></form>
   <div class="chips">${PURPOSES.map(([p, ic]) => `<button class="chip" data-go-purpose="${p}">${ic}${p}</button>`).join('')}</div>
   <div class="hstats"><div>${stat(open.length, 'одоо нээлттэй')}</div><div><b class="num">${avg}%</b><span>дундаж сул суудал</span></div></div>
  </div>
  <div class="shelf"></div>
  <div class="deco" style="left:5%">${plantSVG(120)}</div><div class="deco" style="left:15%">${plantSVG(70, 1)}</div>
  <div class="deco" style="right:6%;bottom:0"><svg width="170" viewBox="0 0 170 180"><path d="M60 30h50l-4 26H64z" fill="#fff" stroke="#3E2A17" stroke-width="5"/><path d="M110 36c14 0 14 16 0 16" stroke="#3E2A17" stroke-width="5" fill="none"/><ellipse cx="85" cy="70" rx="80" ry="12" fill="#7B542F"/><rect x="80" y="76" width="10" height="90" fill="#7B542F"/><ellipse cx="85" cy="172" rx="40" ry="8" fill="#7B542F"/></svg></div>
 </section>
 <div class="wrap">
  <section class="sec"><div class="sec-h"><h2>Яг одоо ямар газар хэрэгтэй вэ?</h2><p>Зорилгоо сонгоход газрын зураг танд тохирох кафенуудыг шууд тодруулна.</p></div>
   <div class="purp">${[['Сурах', I.book, 'Нам гүм, сул суудалтай'], ['Ажиллах', I.laptop, 'Wi-Fi сайн, залгууртай'], ['Найзуудтай', I.people, 'Яриатай, хөгжилтэй'], ['Тухтай', I.sofa, 'Тайван, буйдантай']].map(([p, ic, d]) => `<button data-go-purpose="${p}"><span class="ic">${ic}</span><b>${p}</b><span>${d}</span></button>`).join('')}</div></section>
  <section class="sec"><div class="mapprev">
   <div><span class="eyebrow">Газрын зураг</span><h2 style="margin-top:8px">Кафе руу орохгүйгээр уур амьсгалыг нь хар</h2><p class="muted">Тэмдэг бүр гурван зүйлийг товч харуулна.</p>
    <div class="legend3"><div><span class="lg-ic">${crowdMini(30)}</span><span><b>Хүмүүс</b> — дүүрсэн цэгийн тоо</span></div><div><span class="lg-ic" style="color:var(--brown)">${ssGlyph(1).replace('<svg', '<svg width="18" height="18"')}</span><span><b>Дуу чимээ</b> — номноос мотоцикл хүртэл</span></div><div><span class="lg-ic">${wifiSVG(4, 22)}</span><span><b>Wi-Fi</b> — хөдөлж буй зураасны тоо</span></div></div>
    <a class="btn btn-p" href="#explore">Газрын зураг нээх →</a></div>
   <div class="mini ex-map" id="miniMap" role="link" tabindex="0" aria-label="Газрын зураг нээх"></div></div></section>
  <section class="sec"><div class="sec-h"><h2>Ойролцоох кафенууд</h2><p>Танд хамгийн ойр 6 кафе</p></div>
   <div class="cgrid">${[...CAFES].sort((a, b) => parseFloat(a.dist) * (a.dist.includes('км') ? 1000 : 1) - parseFloat(b.dist) * (b.dist.includes('км') ? 1000 : 1)).slice(0, 6).map(cafeCard).join('')}</div>
   <div style="text-align:center;margin-top:28px"><a class="btn btn-o" href="#cafes">Бүх кафе харах →</a></div></section>
  <section class="sec"><div class="sec-h"><h2>Чимээг тоогоор биш, мэдрэмжээр</h2><p>«54 dB» гэхээс «өглөөний тайван кафе шиг» гэвэл шууд ойлгомжтой. Сонсох товчоор жишээ дууг нь сонсоорой.</p></div>
   <div class="ss-row">${[1, 2, 3, 4, 5].map(l => `<div class="ss-card"><div class="art" style="background:${['', '#EEF3E8', '#F3F6EC', '#FBF0DC', '#F9E7DD', '#F7DCD3'][l]}">${ssArt(l, 120)}</div><div class="lvl" aria-label="${l}/5">${[1, 2, 3, 4, 5].map(i => `<i style="${i <= l ? `background:${l <= 2 ? 'var(--sage)' : l === 3 ? 'var(--amb)' : 'var(--terra)'}` : ''}"></i>`).join('')}</div><b>${SS[l].t}</b><span>${SS[l].s}</span><button class="play" data-play="${l}">${I.play} Сонсох</button></div>`).join('')}</div></section>
  <div class="band"><div><h2>Кафе эзэмшигч үү?</h2><p>Кафегаа LiveSpace-д нэмж, илүү олон зочинд хүрээрэй.</p></div><a class="btn btn-y" href="#partner">Хамтран ажиллах →</a></div>
 </div>${footer()}</div>`;
  homeMini = buildMap($('#miniMap'), { interactive: false, onSelect: id => { if (id) { Snd.ui('pop'); location.hash = 'explore'; setTimeout(() => selectCafe(id, 'list'), 80) } } });
  $('#miniMap').addEventListener('click', e => { if (!e.target.closest('.mk')) { Snd.ui('whoosh'); location.hash = 'explore' } });
  $('#miniMap').addEventListener('keydown', e => { if (e.key === 'Enter') location.hash = 'explore' });
  $('#hs').onsubmit = e => { e.preventDefault(); F.q = $('#hq').value.trim(); Snd.ui('whoosh'); location.hash = 'explore' };
  $$('[data-go-purpose]').forEach(b => b.onclick = () => { F.purpose.clear(); F.purpose.add(b.dataset.goPurpose); Snd.ui('pop'); location.hash = 'explore' });
  countUp();
}
function countUp() { if (Prefs.reduced) return; $$('[data-count]').forEach(el => { const n = +el.dataset.count, suf = el.dataset.suf || ''; let t0 = null; const step = t => { t0 = t0 || t; const k = Math.min(1, (t - t0) / 900); el.textContent = Math.round(n * (1 - Math.pow(1 - k, 3))) + suf; if (k < 1) requestAnimationFrame(step) }; requestAnimationFrame(step) }) }

/* ---------- explore ---------- */
function listCard(c, i) {
  const fp_ = freePct(c); return `<button class="lcard${c.id === selId ? ' sel' : ''}" data-card="${c.id}" style="animation-delay:${Math.min(i, 8) * 35}ms" aria-label="${c.name}">
 <div class="lc-h">${pinSVG(c.open ? '#FF9D00' : '#C9C2B4').replace('<svg', '<svg width="22" height="27"')}<b>${c.name}</b><span class="open-st${c.open ? '' : ' closed'}" style="font-size:12px">${c.open ? 'Нээлттэй' : 'Хаалттай'}</span><span class="muted num">${c.dist}</span></div>
 ${c.open ? `<div class="ind3"><div class="ind">${I.seat.replace('<svg', '<svg width="16" height="16"')}<div><b class="num">${fp_}% сул</b><small>${crowdCat(c.occ)[0]}</small></div></div><div class="ind"><span style="color:var(--brown);display:grid">${ssGlyph(c.sound).replace('<svg', '<svg width="16" height="16"')}</span><div><b>${SS[c.sound].short}</b><small>${SS[c.sound].t}</small></div></div><div class="ind">${wifiSVG(c.wifi, 18)}<div><b>${WIFI[c.wifi]}</b><small>Wi-Fi</small></div></div></div>` : ''}
 <div class="lc-why">${whyLine(c)}</div></button>`
}
function renderExplore() {
  app.innerHTML = `<section class="ex page" id="ex">
  <aside class="ex-side" id="exSide" aria-label="Кафены жагсаалт">
   <div class="sh-handle" id="shHandle" role="button" tabindex="0" aria-label="Жагсаалтыг томруулах"><span></span></div>
   <div class="ex-top"><h1 class="ex-h">Яг одоо ямар газар хэрэгтэй вэ?</h1>
    <div class="mrow"><label class="srch">${I.search}<input id="q2" placeholder="Кафе хайх" aria-label="Кафе хайх" value=""></label><button class="btn btn-o" id="mFilter" style="padding:10px 14px">${I.filter}<span id="mfCount"></span></button></div>
    <label class="srch fdesk">${I.search}<input id="q" placeholder="Кафе хайх" aria-label="Кафе хайх"></label>
    <div class="fdesk fbox">${filtersHTML(false)}</div></div>
   <div class="ex-active" id="exActive"></div>
   <div class="ex-list" id="exList"></div>
  </aside>
  <div class="ex-map" id="exMap"><div class="map-note"><span class="badge b-demo">ДЕМО</span>Тэмдэг дээр дарж уур амьсгалыг нь хар</div>
   <div class="compass" aria-hidden="true"><svg width="52" height="52" viewBox="0 0 52 52"><path d="M26 6l5 20-5 20-5-20z" fill="#B6771D"/><path d="M26 6l5 20h-10z" fill="#FF9D00"/><text x="26" y="5" text-anchor="middle" font-size="7" font-weight="800" fill="#7B542F" font-family="Manrope">Хойд</text></svg></div>
   <div class="map-legend"><div>${crowdMini(30)} Хүмүүс</div><div><span class="sg">${ssGlyph(2)}</span> Дуу чимээ</div><div>${wifiSVG(3, 18)} Wi-Fi</div></div></div>
 </section>`;
  $$('#q,#q2').forEach(i => { i.value = F.q; i.oninput = () => { F.q = i.value; $$('#q,#q2').forEach(o => { if (o !== i) o.value = i.value }); refreshResults() } });
  mapCtl = buildMap($('#exMap'), { onSelect: (id, from) => selectCafe(id, from) });
  refreshResults = updateExplore; updateExplore();
  const list = $('#exList');
  list.addEventListener('click', e => { const c = e.target.closest('[data-card]'); if (c) selectCafe(c.dataset.card, 'list') });
  list.addEventListener('mouseover', e => { const c = e.target.closest('[data-card]'); if (c) mapCtl.hover(c.dataset.card, true) });
  list.addEventListener('mouseout', e => { const c = e.target.closest('[data-card]'); if (c) mapCtl.hover(c.dataset.card, false) });
  $('#exMap').addEventListener('mouseover', e => { const m = e.target.closest('.mk'); if (m) { const c = $(`[data-card="${m.dataset.mk}"]`); c && c.classList.add('hov') } });
  $('#exMap').addEventListener('mouseout', e => { const m = e.target.closest('.mk'); if (m) { const c = $(`[data-card="${m.dataset.mk}"]`); c && c.classList.remove('hov') } });
  // mobile sheet
  const side = $('#exSide'), h = $('#shHandle'); let sd = null;
  const setFull = v => { side.classList.toggle('full', v); h.setAttribute('aria-label', v ? 'Жагсаалтыг багасгах' : 'Жагсаалтыг томруулах'); Snd.ui('whoosh') };
  h.addEventListener('click', () => { if (!sd || !sd.moved) setFull(!side.classList.contains('full')) });
  h.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFull(!side.classList.contains('full')) } });
  h.addEventListener('pointerdown', e => { sd = { y: e.clientY, full: side.classList.contains('full'), moved: false, h: side.offsetHeight }; h.setPointerCapture(e.pointerId) });
  h.addEventListener('pointermove', e => { if (!sd) return; const dy = e.clientY - sd.y; if (Math.abs(dy) > 6) sd.moved = true; if (!sd.moved) return; side.classList.add('drag'); const base = sd.full ? 0 : sd.h - 236; side.style.transform = `translateY(${clamp(base + dy, 0, sd.h - 120)}px)` });
  h.addEventListener('pointerup', e => { if (!sd) return; side.classList.remove('drag'); side.style.transform = ''; if (sd.moved) { const dy = e.clientY - sd.y; setFull(sd.full ? dy < 80 : dy < -60) } setTimeout(() => sd = null, 0) });
  $('#mFilter').onclick = () => { Snd.ui('whoosh'); openModal(`<div class="mdl-h"><h2>Шүүлтүүр</h2><button class="pv-x" data-close aria-label="Хаах" style="margin-left:auto">${I.x}</button></div><div style="display:flex;flex-direction:column;gap:18px">${filtersHTML(true)}</div><div style="display:flex;gap:10px;margin-top:22px"><button class="btn btn-g" data-reset>Цэвэрлэх</button><button class="btn btn-p" data-close style="flex:1" id="mfApply">Үр дүн харах</button></div>`) };
  if (selId) setTimeout(() => selectCafe(selId, 'list', true), 60);
}
function updateExplore() {
  const res = CAFES.filter(matches); const set = new Set(res.map(c => c.id));
  const list = $('#exList'); if (!list) return;
  const sorted = [...res].sort((a, b) => (b.open - a.open) || (freePct(b) - freePct(a)));
  list.innerHTML = sorted.length ? sorted.map(listCard).join('') : `<div class="empty">${emptyArt()}<b>Тохирох кафе олдсонгүй</b>Шүүлтүүрээ сулруулаад дахин үзээрэй.<br><br><button class="btn btn-o" data-reset>Шүүлтүүр цэвэрлэх</button></div>`;
  $('#exActive').innerHTML = activeHTML(res.length); const mf = $('#mfCount'); if (mf) mf.textContent = activeCount() ? ' ' + activeCount() : '';
  const ap = $('#mfApply'); if (ap) ap.textContent = `${res.length} кафе харах`;
  mapCtl && mapCtl.dim(set)
}
function emptyArt() { return `<svg viewBox="0 0 90 90"><ellipse cx="45" cy="76" rx="30" ry="5" fill="#EFE3D1"/><path d="M22 34h40v18a20 20 0 0 1-20 20h0a20 20 0 0 1-20-20z" fill="#FFF9EC" stroke="#7B542F" stroke-width="3"/><path d="M62 38h5a7 7 0 0 1 0 14h-5" fill="none" stroke="#7B542F" stroke-width="3"/><circle cx="35" cy="48" r="2.5" fill="#7B542F"/><circle cx="49" cy="48" r="2.5" fill="#7B542F"/><path d="M36 60c3-3 9-3 12 0" stroke="#7B542F" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>` }
function previewHTML(c) {
  const t = tone(c); const fp_ = freePct(c);
  return `<div class="pv-h"><div><h3>${c.name}</h3><div class="meta num">${c.dist} · ${c.walk} мин алхана · ${c.hours}</div></div><button class="pv-x" data-pvclose aria-label="Хаах">${I.x}</button></div>
 ${c.open ? `<div class="pv-mood ${t}">${mood(c)}</div>
 <div class="pv-rows">
  <div class="pv-r"><div class="art">${I.seat.replace('<svg', '<svg width="22" height="22"')}</div><div><b class="num">${fp_}% суудал сул</b>${seatBar(fp_)}<small style="display:flex;align-items:center;gap:6px;margin-top:4px">${crowdDots(c.occ)} ${crowdCat(c.occ)[0]} · ${TOTAL_SEATS}-оос ${Math.round(fp_ * TOTAL_SEATS / 100)}</small></div></div>
  <div class="pv-r"><div class="art">${ssArt(c.sound, 50)}</div><div><b>${SS[c.sound].t}</b><small>${SS[c.sound].s}</small></div></div>
  <div class="pv-r"><div class="art">${wifiSVG(c.wifi, 32)}</div><div><b>Wi-Fi ${WIFI[c.wifi].toLowerCase()}</b><small>${c.mbps ? `${c.mbps} Mbps хэмжсэн · ` : ''}${WIFI_S[c.wifi]}</small></div></div>
 </div>
 <div style="display:flex;align-items:center;gap:8px"><span class="badge b-demo">ДЕМО</span><small class="muted">Прототипийн жишээ утга</small></div>`: `<div class="pv-closed"><b style="display:block;color:var(--ink)">Хаалттай · ${c.opens} нээгдэнэ</b>Хаалттай үед бодит цагийн мэдээлэл харагдахгүй.</div>`}
 <div class="pv-act"><a class="btn btn-p" href="#cafe-${c.id}">Кафе дотор харах →</a>${favBtn(c.id)}${cmpBtn(c.id)}</div>`
}
function selectCafe(id, from, silent) {
  const ex = $('#exMap'); if (!ex) return;
  selId = id; $$('.pv').forEach(p => p.remove()); mapCtl.select(id);
  $$('[data-card]').forEach(c => c.classList.toggle('sel', c.dataset.card === id));
  if (!id) return;
  const c = byId(id); if (!silent) Snd.ui('pop');
  const pv = document.createElement('div'); pv.className = 'pv'; pv.dataset.id = id; pv.innerHTML = previewHTML(c);
  (isMobile() ? document.body : ex).appendChild(pv); mapCtl.setPv(pv);
  $('[data-pvclose]', pv).onclick = () => { Snd.ui('click'); selectCafe(null) };
  const card = $(`[data-card="${id}"]`); if (card && from === 'map') card.scrollIntoView({ block: 'nearest', inline: 'center', behavior: Prefs.reduced ? 'auto' : 'smooth' });
  if (from === 'list' || isMobile()) mapCtl.centerOn(c.x, c.y, isMobile() ? 1.5 : 1.2);
}

/* ---------- cafes page ---------- */
function renderCafes() {
  app.innerHTML = `<div class="page"><div class="lamps-hd">${lamp('3%', 0, '#FF9D00', 0, '', 'l1')}${lamp('13%', 60, '#B6771D', 1, '', 'l2')}${lamp('23%', 30, '#FFCF71', 0, '', 'l3')}${lamp('72%', 40, '#FFCF71', 1, '', 'l4')}${lamp('82%', 10, '#7B542F', 2, '', 'l5')}${lamp('91%', 50, '#FF9D00', 1, '', 'l6')}
  <div><h1>Бүх кафе</h1><p id="cfCount"></p></div></div>
 <div class="wrap"><button class="btn btn-o mf-open" id="mfo" style="margin-bottom:14px">${I.filter} Шүүлтүүр <span id="mfc"></span></button>
 <div class="cafes"><aside class="fpanel" id="fpanel"><h2>Шүүлтүүр <button data-reset>Цэвэрлэх</button></h2><label class="srch">${I.search}<input id="q" placeholder="Кафе хайх" aria-label="Кафе хайх"></label>${filtersHTML(true)}</aside>
 <div><div class="ex-active" id="exActive" style="padding:0 0 14px"></div><div class="cgrid2" id="cgrid"></div></div></div></div>${footer()}</div>`;
  const q = $('#q'); q.value = F.q; q.oninput = () => { F.q = q.value; updateCafes() };
  $('#mfo').onclick = () => { $('#fpanel').classList.toggle('mopen'); Snd.ui('whoosh') };
  refreshResults = updateCafes; updateCafes()
}
function updateCafes() { const res = CAFES.filter(matches).sort((a, b) => (b.open - a.open) || (freePct(b) - freePct(a))); $('#cgrid').innerHTML = res.length ? res.map(cafeCard).join('') : `<div class="empty" style="grid-column:1/-1">${emptyArt()}<b>Тохирох кафе олдсонгүй</b><br><button class="btn btn-o" data-reset>Шүүлтүүр цэвэрлэх</button></div>`; $('#cfCount').textContent = `${res.length} кафе олдлоо · сул суудлаар эрэмбэлсэн`; $('#exActive').innerHTML = activeHTML(res.length); $('#mfc').textContent = activeCount() ? '· ' + activeCount() : '' }

/* ---------- cafe detail ---------- */
function renderCafe(id) {
  const c = byId(id); if (!c) { app.innerHTML = `<div class="wrap empty">${emptyArt()}<b>Кафе олдсонгүй</b><a class="btn btn-o" href="#explore">Газрын зураг руу буцах</a></div>`; return }
  selId = id;
  app.innerHTML = `<div class="wrap page"><div class="skel" style="height:150px;margin-top:24px"></div><div class="skel" style="height:420px;margin-top:20px"></div></div>`;
  setTimeout(() => { if (location.hash === '#cafe-' + id) buildCafe(c) }, Prefs.reduced ? 0 : 380)
}
function buildCafe(c) {
  const t = tone(c), fp_ = freePct(c);
  app.innerHTML = `<div class="page"><div class="wrap cd">
 <div class="cd-nav"><a class="btn btn-o" href="#explore" style="padding:10px 16px">← Газрын зураг</a><span class="muted" style="font-size:14px">Кафенууд / ${c.name}</span></div>
 <div class="roof"><svg viewBox="0 0 1000 150" preserveAspectRatio="none" aria-hidden="true"><path d="M110 148 500 8l390 140z" fill="#FFCF71"/><path d="M90 150 500 4l410 146" fill="none" stroke="#B6771D" stroke-width="10" stroke-linejoin="round"/><rect x="760" y="40" width="40" height="70" fill="#B6771D"/></svg><div class="rt"><h1>${c.name}</h1><small>${c.note || '—'}</small></div></div>
 <div class="cd-bar"><span class="open-st${c.open ? '' : ' closed'}">${I.lamp}${c.open ? 'Нээлттэй' : 'Хаалттай'}</span><span class="pillx num">${I.clock.replace('<svg', '<svg width="16" height="16"')}${c.hours}</span><span class="pillx num">${c.dist} · ${c.walk} мин алхана</span>${favBtn(c.id)}${cmpBtn(c.id)}<span class="badge b-demo">ДЕМО өгөгдөл</span></div>
 ${c.open ? `<p class="mood-line" id="moodLine">${mood(c)}</p>
 <div class="mstrip" aria-label="Товч үзүүлэлт"><div><small>Сул суудал</small><b class="num" data-free-m>${fp_}%</b>${seatBar(fp_)}</div><div><small>Хүмүүс</small>${crowdDots(c.occ)}<b data-crowd-m>${crowdCat(c.occ)[0]}</b></div><div><small>Дуу чимээ</small><span style="color:var(--brown)">${ssGlyph(c.sound).replace('<svg', '<svg width="22" height="22"')}</span><b style="font-size:14px">${SS[c.sound].short}</b></div><div><small>Wi-Fi</small>${wifiSVG(c.wifi, 30)}<b style="font-size:14px">${WIFI[c.wifi]}</b></div></div>
 <div class="cd-grid">
  <section class="card" aria-label="Кафены зураглал">
   <div class="card-h"><h2>Кафе дотор</h2><div class="r"><div class="seg" role="tablist" id="viewSeg"><span class="ind-s"></span><button role="tab" aria-selected="true" data-view="plan">Зураглал</button><button role="tab" aria-selected="false" data-view="table">Хүснэгт</button></div></div></div>
   <div id="viewPlan"><div class="plan-outer"><div class="plan-wrap" id="planWrap"></div><div class="plan-tools"><button data-pz="in" aria-label="Томруулах">${I.plus}</button><button data-pz="out" aria-label="Жижигрүүлэх">${I.minus}</button></div></div>
    <div class="plan-legend"><span><svg viewBox="0 0 22 22"><rect x="4" y="5" width="14" height="13" rx="3" fill="#fff" stroke="#6F8F5E" stroke-width="2" stroke-dasharray="3 2"/><rect x="4" y="3" width="14" height="4" rx="2" fill="#A8774A"/></svg>Сул сандал</span><span><svg viewBox="0 0 22 22"><rect x="4" y="5" width="14" height="13" rx="3" fill="#E9D6BB"/><circle cx="11" cy="12" r="5" fill="#4A7BA6"/><circle cx="11" cy="10" r="3.2" fill="#F2C9A0"/></svg>Хүнтэй</span><span><svg viewBox="0 0 22 22"><rect x="3.5" y="4.5" width="15" height="14" rx="3" fill="none" stroke="#9A8570" stroke-width="1.6" stroke-dasharray="2.5 2"/><text x="11" y="15.5" text-anchor="middle" font-size="10" font-weight="800" fill="#9A8570" font-family="Manrope">?</text></svg>Мэдээлэлгүй</span><span class="badge b-demo">ДЕМО</span></div>
    <div class="plan-ctl"><button class="btn btn-o" id="addG" style="padding:9px 14px">${I.plus} Зочин орж ирэх</button><button class="btn btn-g" id="remG">Зочин гарах</button><span class="note">Дүрүүд жинхэнэ хүмүүс биш — суудлын төлөв өөрчлөгдөхийг харуулах дүрслэл. Сандал дээр дарж дэлгэрэнгүйг харна.</span></div>
    <div id="seatInfo"></div><div class="elog" id="elog" aria-live="polite"></div></div>
   <div id="viewTable" hidden>${tableHTML(c)}</div>
  </section>
  <div class="side-stack">
   <section class="card mcard"><h3>${I.seat.replace('<svg', '<svg width="16" height="16"')} Сул суудал <span class="badge b-demo">ДЕМО</span></h3><div class="big-pct"><b class="num" id="freePct">${fp_}%</b><span>сул</span></div><div style="margin-top:10px" id="freeBar">${seatBar(fp_)}</div><small class="muted num" id="freeSub" style="display:block;margin-top:6px"></small><div class="chairs" id="chairs" aria-hidden="true"></div></section>
   <section class="card mcard"><h3>${I.people.replace('<svg', '<svg width="16" height="16"')} Хүмүүс</h3><div class="crowd-big" id="crowdBig"></div></section>
   <section class="card mcard"><h3>${ssGlyph(2).replace('<svg', '<svg width="16" height="16"')} Дуу чимээ <span class="badge b-demo">ДЕМО</span></h3><div id="ssBox"></div>
    <div class="ss-scale" role="group" aria-label="Дууны түвшнийг жишээгээр солих">${[1, 2, 3, 4, 5].map(l => `<button data-ssl="${l}" aria-label="${SS[l].t}" class="${l === c.sound ? 'on' : ''}">${ssGlyph(l)}</button>`).join('')}</div>
    <small class="muted" style="display:block;margin-top:8px">Түвшнүүдийг дарж харьцуулаарай. Кафены үнэлгээ: <b>${SS[c.sound].short}</b>.</small></section>
   <section class="card mcard"><h3>${wifiSVG(3, 16)} Wi-Fi</h3><div id="wfBox"></div><div class="wf-demo" role="group" aria-label="Wi-Fi түвшнийг жишээгээр харах">${[1, 2, 3, 4].map(l => `<button data-wfl="${l}" class="${l === c.wifi ? 'on' : ''}">${WIFI[l]}</button>`).join('')}</div></section>
  </div>
 </div>
 <section class="card te"><div class="card-h"><h2>Өдрийн турш ямар байх вэ?</h2><div class="r" id="teBadge"></div></div>
  <div class="te-grid"><div><svg class="chart" id="teChart" viewBox="0 0 600 200" aria-hidden="true"></svg><input type="range" id="teSl" min="8" max="22" step="1" value="${nowHour()}" aria-label="Цаг сонгох"><div class="te-labels"><span>08:00</span><span>12:00</span><span>15:00</span><span>18:00</span><span>22:00</span></div></div>
  <div class="te-pv" id="tePv"></div></div><div class="insights" id="teIns"></div></section>
 `: `<div class="card" style="margin-top:20px;text-align:center;padding:40px">${emptyArt()}<h2 style="margin:10px 0">Одоо хаалттай</h2><p class="muted">${c.opens} нээгдэнэ. Хаалттай үед суудал, дуу чимээ, Wi-Fi-н мэдээлэл харагдахгүй.</p><a class="btn btn-p" href="#explore">Нээлттэй кафе хайх</a></div>`}
 </div>${footer()}</div>`;
  if (!c.open) return;
  renderSS(c.sound); renderWF(c.wifi, c);
  // floor plan
  fp = new FloorPlan($('#planWrap'), c, { onStats: updSeats, onEvent: logEvent, onSeat: seatInfo, sound: c.sound });
  $$('[data-pz]').forEach(b => b.onclick = () => { Snd.ui('click'); fp.setZoom(b.dataset.pz === 'in' ? 1.4 : 1 / 1.4) });
  $('#addG').onclick = () => { if (!fp.arrive(true)) { Snd.ui('err'); toast('Сул сандал үлдсэнгүй') } else Snd.ui('click') };
  $('#remG').onclick = () => { if (!fp.depart(true)) { Snd.ui('err'); toast('Суусан зочин алга') } };
  // tabs
  const seg = $('#viewSeg'); const moveInd = () => { const b = $('[aria-selected="true"]', seg); const ind = $('.ind-s', seg); ind.style.width = b.offsetWidth + 'px'; ind.style.transform = `translateX(${b.offsetLeft - 4}px)` }; moveInd();
  seg.addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (!b) return; Snd.ui('click'); $$('[data-view]', seg).forEach(x => x.setAttribute('aria-selected', x === b)); moveInd(); $('#viewPlan').hidden = b.dataset.view !== 'plan'; $('#viewTable').hidden = b.dataset.view !== 'table'; if (b.dataset.view === 'table') $('#viewTable').innerHTML = tableHTML(c, fp.stats()) });
  $$('[data-ssl]').forEach(b => b.onclick = () => { Snd.ui('tick'); $$('[data-ssl]').forEach(x => x.classList.toggle('on', x === b)); renderSS(+b.dataset.ssl); fp.sound = +b.dataset.ssl });
  $$('[data-wfl]').forEach(b => b.onclick = () => { Snd.ui('tick'); $$('[data-wfl]').forEach(x => x.classList.toggle('on', x === b)); renderWF(+b.dataset.wfl, c, true) });
  initTE(c);
  $('#repBtn').onclick = () => openReport(c);
}
function renderSS(l) { $('#ssBox').innerHTML = `<div class="ssbig"><div class="art" style="background:${['', '#EEF3E8', '#F3F6EC', '#FBF0DC', '#F9E7DD', '#F7DCD3'][l]}">${ssArt(l, 120)}</div><div><b>${SS[l].t}</b><small>${SS[l].s}</small><br><button class="play" data-play="${l}" style="margin-top:8px">${I.play} Сонсох</button></div></div>` }
function renderWF(l, c, demo) { $('#wfBox').innerHTML = `<div class="wfbig">${wifiSVG(l, 84)}<div><b>${WIFI[l]}</b><small>${WIFI_S[l]}</small><br><small>${!demo && c.mbps ? `<b class="num" style="font-size:13px;display:inline">${c.mbps} Mbps</b> хэмжсэн · <span class="badge b-demo">ДЕМО</span>` : demo ? 'Жишээ: зураасны тоо ба хурдаар чанарыг ойлгоно' : 'Хурдны хэмжилт ороогүй'}</small></div></div>` }
function updSeats(s) {
  const pct = Math.round(s.free / s.total * 100); const el = $('#freePct'); if (!el) return;
  animNum(el, pct, '%'); $('#freeBar i').style.width = pct + '%'; $('#freeBar i').style.background = pct >= 50 ? 'var(--sage)' : pct >= 25 ? 'var(--amb)' : 'var(--terra)';
  $('#freeSub').textContent = `${s.total}-оос ${s.free} сандал сул · буйдангийн ${s.unknown} суудлын мэдээлэл алга`;
  $('#chairs').innerHTML = s.list.map(st => `<i class="${st === 'occ' ? 'o' : ''}"></i>`).join('');
  const occ = 100 - pct; const cc = crowdCat(occ); $('#crowdBig').innerHTML = `${crowdDots(occ)}<div><b>${cc[0]}</b><br><small class="muted">${occ}% дүүрсэн</small></div>`;
  const m = $('[data-free-m]'); if (m) { m.textContent = pct + '%'; m.nextElementSibling.firstElementChild.style.width = pct + '%'; $('[data-crowd-m]').textContent = cc[0] }
}
function animNum(el, to, suf) { const from = parseInt(el.textContent) || 0; if (from === to || Prefs.reduced) { el.textContent = to + suf; return } let t0 = null; const step = t => { t0 = t0 || t; const k = Math.min(1, (t - t0) / 600); el.textContent = Math.round(from + (to - from) * k) + suf; if (k < 1) requestAnimationFrame(step) }; requestAnimationFrame(step) }
function logEvent(msg, kind) { const l = $('#elog'); if (!l) return; const d = document.createElement('div'); d.className = kind; d.textContent = msg; l.prepend(d); while (l.children.length > 4) l.lastChild.remove() }
function seatInfo(s) {
  const box = $('#seatInfo'); if (!box) return; if (!s) { box.innerHTML = ''; return }
  const st = { free: ['Сул', 'Одоогоор хүнгүй'], occ: ['Хүнтэй', 'Одоо хүн сууж байна'], unknown: ['Мэдээлэлгүй', 'Энэ хэсгийн өгөгдөл ирээгүй'] }[s.state];
  box.innerHTML = `<div class="seatinfo"><div class="si-ic" style="color:${s.state === 'free' ? 'var(--sage)' : s.state === 'occ' ? 'var(--brown)' : 'var(--ink3)'}">${s.zone === 'sofa' ? I.sofa : I.seat}</div><div><b>${s.label} · ${st[0]}</b><small>${ZONES[s.zone].d} ${ZONES[s.zone].q}</small></div></div>`
}
function tableHTML(c, s) {
  const pct = s ? Math.round(s.free / s.total * 100) : freePct(c); return `<table class="tbl"><tr><th>Үзүүлэлт</th><th>Одоо</th><th>Төлөв</th></tr>
 <tr><td>Сул суудал</td><td class="num"><b>${pct}%</b> (${TOTAL_SEATS}-оос ${Math.round(pct * TOTAL_SEATS / 100)})</td><td>${seatBar(pct)}</td></tr>
 <tr><td>Хүмүүс</td><td>${crowdCat(100 - pct)[0]}</td><td>${crowdDots(100 - pct)}</td></tr>
 <tr><td>Дуу чимээ</td><td>${SS[c.sound].t}</td><td><span style="color:var(--brown)">${ssGlyph(c.sound).replace('<svg', '<svg width="20" height="20"')}</span></td></tr>
 <tr><td>Wi-Fi</td><td>${WIFI[c.wifi]}${c.mbps ? ` · ${c.mbps} Mbps` : ''}</td><td>${wifiSVG(c.wifi, 26)}</td></tr>
 <tr><td>Залгуур</td><td class="num">${c.plugs ? `${c.plugs[0]}/${c.plugs[1]} сул` : '—'}</td><td>${I.plug.replace('<svg', '<svg width="18" height="18"')}</td></tr>
 <tr><td>Ажлын цаг</td><td class="num">${c.hours}</td><td><span class="open-st">${I.lamp}Нээлттэй</span></td></tr></table><p class="muted" style="font-size:12px"><span class="badge b-demo">ДЕМО</span> Бүх утга прототипийн жишээ.</p>`
}
function initTE(c) {
  const prof = profile(c), nh = nowHour(); const X = h => 44 + (h - 8) / 14 * 536, Y = v => 170 - v / 100 * 150;
  let d = 'M' + prof.map((v, i) => `${X(8 + i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' L');
  const bands = prof.slice(0, 14).map((v, i) => { const m = (v + prof[i + 1]) / 2; return `<rect x="${X(8 + i) + 1}" y="182" width="${536 / 14 - 2}" height="8" rx="2" fill="${m < 45 ? '#6F8F5E' : m <= 70 ? '#C9862A' : '#C8573E'}"/>` }).join('');
  const svg = $('#teChart');
  svg.innerHTML = `${[0, 50, 100].map(v => `<line x1="44" x2="580" y1="${Y(v)}" y2="${Y(v)}" stroke="#EFE3D1"/><text x="38" y="${Y(v) + 4}" text-anchor="end" font-size="10" fill="#6B5038" font-family="Manrope">${v}%</text>`).join('')}
 <path d="${d} L${X(22)} 170 L${X(8)} 170Z" fill="#E8D3B0" opacity=".55"/><path d="${d}" fill="none" stroke="#7B542F" stroke-width="2.5" stroke-dasharray="6 5"/>
 <clipPath id="pastC"><rect x="0" y="0" width="${X(nh)}" height="200"/></clipPath><path d="${d}" fill="none" stroke="#7B542F" stroke-width="3" clip-path="url(#pastC)"/>
 ${bands}<line x1="${X(nh)}" x2="${X(nh)}" y1="14" y2="176" stroke="#2E7D4F" stroke-width="2"/><rect x="${X(nh) - 28}" y="0" width="56" height="16" rx="8" fill="#2E7D4F"/><text x="${X(nh)}" y="11.5" text-anchor="middle" font-size="9.5" font-weight="800" fill="#fff" font-family="Manrope">ОДОО</text>
 <g id="teSel"><line id="teL" y1="14" y2="176" stroke="#C8573E" stroke-width="2"/><circle id="teD" r="6.5" fill="#C8573E" stroke="#fff" stroke-width="3"/></g>`;
  const busyI = prof.indexOf(Math.max(...prof)), quietI = prof.indexOf(Math.min(...prof.slice(0, 6)));
  $('#teIns').innerHTML = `<div style="background:var(--terraBg)">Ихэвчлэн ${String(8 + busyI).padStart(2, '0')}:00–${String(9 + busyI).padStart(2, '0')}:30 хамгийн ачаалалтай <span class="badge b-typ">ДУНДАЖ</span></div><div style="background:var(--sageBg)">Чимээгүй ажиллахад хамгийн тохиромжтой: ${String(8 + quietI).padStart(2, '0')}:00–${String(9 + quietI).padStart(2, '0')}:30 <span class="badge b-typ">ДУНДАЖ</span></div>`;
  const sl = $('#teSl'); let lastH = nh;
  const upd = (user) => {
    const h = +sl.value, v = prof[h - 8]; $('#teL').setAttribute('x1', X(h)); $('#teL').setAttribute('x2', X(h)); $('#teD').setAttribute('cx', X(h)); $('#teD').setAttribute('cy', Y(v));
    const snd = clamp(c.sound + Math.round((v - c.occ) / 25), 1, 5); const t = v >= 75 || snd >= 4 ? 'y' : v >= 50 || snd === 3 ? 'b' : 'q'; const pv = $('#tePv'); pv.className = 'te-pv ' + (t === 'q' ? '' : t);
    const when = h === nh ? 'ОДОО' : h < nh ? 'ӨНӨӨДӨР ӨНГӨРСӨН' : 'ТААМАГ'; const bd = h === nh ? '<span class="badge b-demo">ДЕМО</span>' : h < nh ? '<span class="badge b-typ">ДУНДАЖ</span>' : '<span class="badge b-fc">ТААМАГ</span>';
    pv.innerHTML = `<div class="t">${String(h).padStart(2, '0')}:00 · ${when} ${bd}</div><h3>${crowdCat(v)[0]}</h3><div style="display:flex;gap:12px;align-items:center;margin-bottom:12px">${ssArt(snd, 90)}<b style="font-size:14px">${SS[snd].t}</b></div><div class="g"><div><small>Сул суудал</small><b class="num">~${100 - v}%</b></div><div><small>Хүмүүс</small><b class="num">~${v}% дүүрсэн</b></div></div><p style="margin:12px 0 0;font-size:13px;color:var(--ink2)">${h !== nh ? 'Зураглал энэ цагийн ердийн ачааллыг харуулж байна.' : 'Зураглал одоогийн төлөвийг харуулж байна.'}</p>`;
    $('#teBadge').innerHTML = h === nh ? '' : `<button class="btn btn-g" id="teNow">Одоо руу буцах</button>`; const tn = $('#teNow'); if (tn) tn.onclick = () => { sl.value = nh; upd(true) };
    if (user && h !== lastH) { Snd.ui('tick'); lastH = h; fp && fp.setTarget(100 - v, h !== nh) }
  };
  sl.oninput = () => upd(true); upd(false)
}
function openReport(c) {
  Snd.ui('whoosh'); const sel = {}; const grp = (k, lab, opts) => `<div class="rgrp"><b>${lab}</b><div class="ropt" data-g="${k}">${opts.map(([v, l, ic]) => `<button data-v="${v}" aria-pressed="false">${ic || ''}${l}</button>`).join('')}</div></div>`;
  openModal(`<div class="mdl-h"><div><span class="eyebrow">${c.name} · ${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}</span><h2>Энд одоо ямар байна?</h2><small class="muted">Нэг ч сонголт хангалттай · ~10 секунд</small></div><button class="pv-x" data-close aria-label="Хаах" style="margin-left:auto">${I.x}</button></div>
 ${grp('crowd', 'Хүмүүс', [['20', 'Цөөн', crowdMini(10)], ['50', 'Дунд', crowdMini(50)], ['85', 'Олон', crowdMini(90)]])}
 ${grp('sound', 'Дуу чимээ', [[1, 'Нам гүм', `<span style="color:var(--brown)">${ssGlyph(1)}</span>`], [3, 'Яриатай', `<span style="color:var(--brown)">${ssGlyph(3)}</span>`], [5, 'Чанга', `<span style="color:var(--brown)">${ssGlyph(5)}</span>`]])}
 ${grp('wifi', 'Wi-Fi', [[4, 'Сайн', wifiSVG(4, 22)], [2, 'Дунд', wifiSVG(2, 22)], [1, 'Муу', wifiSVG(1, 22)]])}
 <button class="btn btn-p" id="repGo" style="width:100%;margin-top:6px;padding:15px">Мэдээлэл илгээх</button>
 <p class="muted" style="font-size:12px;display:flex;gap:8px;align-items:center;margin:12px 0 0"><span style="display:inline-flex;gap:2px">${[1, .65, .4, .18].map(o => `<i style="width:12px;height:8px;border-radius:2px;background:var(--brown);opacity:${o}"></i>`).join('')}</span>Мэдээлэл хуучрах тусам нөлөө нь буурна (0 → 60 мин).</p>`);
  $$('.ropt').forEach(g => g.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; Snd.ui('tick'); const on = b.getAttribute('aria-pressed') !== 'true'; $$('button', g).forEach(x => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', on); if (on) sel[g.dataset.g] = +b.dataset.v; else delete sel[g.dataset.g] }));
  $('#repGo').onclick = () => {
    if (!Object.keys(sel).length) { Snd.ui('err'); toast('Нэг зүйл сонгоно уу'); return } closeModal(); Snd.ui('chime'); toast('Баярлалаа — LiveSpace шинэчлэгдлээ.', true);
    if (sel.sound) { c.sound = sel.sound; renderSS(c.sound); $$('[data-ssl]').forEach(x => x.classList.toggle('on', +x.dataset.ssl === c.sound)); fp.sound = c.sound }
    if (sel.wifi) { c.wifi = sel.wifi; renderWF(c.wifi, c); $$('[data-wfl]').forEach(x => x.classList.toggle('on', +x.dataset.wfl === c.wifi)) }
    if (sel.crowd) { c.occ = Math.round((c.occ + sel.crowd) / 2); fp.setTarget(100 - c.occ, false) }
    $('#moodLine').textContent = mood(c); logEvent('Таны мэдээлэл нэмэгдлээ · жин 1.0 → 30 мин дараа 0.5', 'in')
  }
}

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
    this.resize(); this.ro = new ResizeObserver(() => { cancelAnimationFrame(this.rz); this.rz = requestAnimationFrame(() => this.resize()) }); this.ro.observe(wrap);
    this.cv.addEventListener('click', e => this.click(e)); this.cv.addEventListener('mousemove', e => { const p = this.pt(e); this.cv.style.cursor = this.hit(p) ? 'pointer' : 'default' });
    this.emit(); this.last = performance.now(); this.alive = true; this.raf = requestAnimationFrame(t => this.frame(t))
  }
  countable() { return this.seats.filter(s => s.state !== 'unknown').length }
  stats() { const c = this.seats.filter(s => s.state !== 'unknown'); return { free: c.filter(s => s.state === 'free').length, total: c.length, unknown: this.seats.length - c.length, list: c.map(s => s.state) } }
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
  newPerson() { const r = this.r; const P = ['#C8573E', '#6F8F5E', '#4A7BA6', '#E0A23A', '#8E6BB0', '#D97F9A', '#3E8E8A', '#5E3F22']; return { x: 0, y: 0, ang: 0, path: [], state: '', shirt: P[Math.floor(r() * P.length)], hair: ['#3E2A17', '#1F1A17', '#8A5A2B', '#C9A26B', '#2B2B2B'][Math.floor(r() * 5)], skin: ['#F2C9A0', '#E3B48B', '#C99167', '#A8744F'][Math.floor(r() * 4)], item: r() < .5 ? 'laptop' : r() < .6 ? 'book' : 'cup', spd: 52 + r() * 18, t: r() * 10, wait: 0, user: false, alpha: 1 } }
  arrive(user) {
    const free = this.seats.filter(s => s.state === 'free' && !s.res); if (!free.length) return false; let pool = free; if (this.sound <= 2) { const q = free.filter(s => s.zone === 'bar' || s.zone === 'long'); if (q.length && this.r() < .7) pool = q }
    const s = pool[Math.floor(this.r() * pool.length)]; s.res = true; const p = this.newPerson(); p.user = user; p.seat = s; p.x = this.door[0]; p.y = this.door[1] + 4; p.ang = -Math.PI / 2;
    const q = this.people.filter(x => x.state === 'toOrder' || x.state === 'order').length; p.orderPt = [this.order[0], this.order[1] + q * 24];
    if (this.reduced) { this.sit(p); this.people.push(p); return true }
    p.path = this.path(p.x, p.y, ...p.orderPt); p.state = 'toOrder'; this.people.push(p); this.o.onEvent && this.o.onEvent('Шинэ зочин орж ирлээ · кофе захиалж байна', 'in'); return true
  }
  sit(p) {
    const s = p.seat; s.res = false; s.state = 'occ'; s.person = p; p.state = 'seated'; p.x = s.x; p.y = s.y; p.ang = s.ang; s.flash = 1; this.fx.push({ x: s.x, y: s.y, t: 0, c: '#6F8F5E' });
    if (p.user) Snd.ui('sit'); this.o.onEvent && this.o.onEvent(`${s.label}-д зочин суулаа`, 'in'); this.emit(); if (this.sel === s) this.o.onSeat && this.o.onSeat(s)
  }
  depart(user) {
    const sat = this.people.filter(p => p.state === 'seated'); if (!sat.length) return false; const p = sat[Math.floor(this.r() * sat.length)]; const s = p.seat; s.state = 'free'; s.person = null; s.flash = 1; this.fx.push({ x: s.x, y: s.y, t: 0, c: '#C9862A' });
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
  destroy() { this.alive = false; cancelAnimationFrame(this.raf); this.ro.disconnect() }
  frame(now) { if (!this.alive) return; const dt = Math.min(.05, (now - this.last) / 1000); this.last = now; if (!document.hidden) { this.update(dt, now); this.draw() } this.raf = requestAnimationFrame(t => this.frame(t)) }
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
    [[230, 42], [400, 42]].forEach(([px, py]) => { x.fillStyle = '#B6771D'; x.beginPath(); x.arc(px, py, 6, 0, 7); x.fill(); x.fillStyle = '#6F8F5E'; for (let a = 0; a < 6; a++) { x.beginPath(); x.ellipse(px + Math.cos(a) * 5, py + Math.sin(a) * 5, 4, 2.5, a, 0, 7); x.fill() } });
    // round tables
    this.tables.forEach(([tx, ty], i) => { x.fillStyle = 'rgba(62,42,23,.12)'; x.beginPath(); x.arc(tx + 2, ty + 3, 25, 0, 7); x.fill(); const gr = x.createRadialGradient(tx - 6, ty - 6, 2, tx, ty, 25); gr.addColorStop(0, '#D9A86C'); gr.addColorStop(1, '#B07C45'); x.fillStyle = gr; x.beginPath(); x.arc(tx, ty, 24, 0, 7); x.fill(); x.strokeStyle = '#8A5A2B'; x.lineWidth = 2; x.stroke(); x.fillStyle = '#FFF9EC'; x.beginPath(); x.arc(tx, ty, 5, 0, 7); x.fill(); x.fillStyle = ['#C8573E', '#E0A23A', '#8E6BB0'][i]; x.beginPath(); x.arc(tx, ty, 2.8, 0, 7); x.fill() });
    // long table
    x.fillStyle = 'rgba(62,42,23,.12)'; rr(163, 334, 240, 36, 6); x.fill(); x.fillStyle = '#C08A52'; rr(160, 330, 240, 36, 6); x.fill(); x.strokeStyle = '#8A5A2B'; x.lineWidth = 2; x.stroke(); x.strokeStyle = 'rgba(255,255,255,.2)'; x.lineWidth = 1; for (let i = 1; i < 5; i++) { x.beginPath(); x.moveTo(164, 330 + i * 7); x.lineTo(396, 330 + i * 7); x.stroke() }
    // sofa
    x.fillStyle = '#7F9A6E'; rr(430, 466, 168, 32, 10); x.fill(); x.fillStyle = '#93AE82';[[440, 470], [488, 470], [536, 470]].forEach(([a, b]) => { rr(a + 4, b, 44, 22, 7); x.fill() }); x.fillStyle = '#6A845B'; rr(430, 488, 168, 10, 5); x.fill();
    x.fillStyle = '#D9A86C'; x.beginPath(); x.ellipse(515, 425, 26, 15, 0, 0, 7); x.fill(); x.strokeStyle = '#8A5A2B'; x.lineWidth = 2; x.stroke(); x.fillStyle = '#fff'; x.beginPath(); x.arc(505, 423, 4, 0, 7); x.fill(); x.fillStyle = '#7B542F'; x.beginPath(); x.arc(505, 423, 2.2, 0, 7); x.fill(); x.fillStyle = '#E9806A'; rr(518, 418, 14, 10, 2); x.fill();
    // plants
    const plant = (px, py, s) => { x.fillStyle = '#B6771D'; x.beginPath(); x.arc(px, py, s * .55, 0, 7); x.fill(); for (let a = 0; a < 8; a++) { x.fillStyle = a % 2 ? '#6F8F5E' : '#89A86F'; x.beginPath(); x.ellipse(px + Math.cos(a * .8) * s * .55, py + Math.sin(a * .8) * s * .55, s * .55, s * .28, a * .8, 0, 7); x.fill() } x.fillStyle = '#5E7B4E'; x.beginPath(); x.arc(px, py, s * .3, 0, 7); x.fill() }; plant(45, 45, 22); plant(45, 300, 20); plant(150, 476, 20); plant(585, 478, 14);
    // coffee counter L
    x.fillStyle = 'rgba(62,42,23,.15)'; x.fillRect(603, 64, 170, 30); x.fillStyle = '#7B542F'; rr(600, 60, 176, 28, 4); x.fill(); rr(600, 60, 28, 130, 4); x.fill(); x.fillStyle = '#A8774A'; rr(603, 63, 170, 22, 3); x.fill(); rr(603, 63, 22, 124, 3); x.fill();
    x.fillStyle = '#C9C2B4'; rr(690, 40, 52, 24, 4); x.fill(); x.strokeStyle = '#8C8577'; x.lineWidth = 1.5; x.stroke(); x.fillStyle = '#3E2A17';[[704, 58], [728, 58]].forEach(([a, b]) => { x.beginPath(); x.arc(a, b, 4, 0, 7); x.fill() }); x.fillStyle = '#E9806A'; x.fillRect(696, 44, 6, 4);
    x.fillStyle = '#5E3F22'; rr(750, 38, 16, 22, 4); x.fill();
    x.fillStyle = 'rgba(191,225,242,.7)'; rr(605, 96, 18, 60, 3); x.fill();[['#E0A23A', 614, 104], ['#C8573E', 614, 118], ['#8A5A2B', 614, 132], ['#E0A23A', 614, 146]].forEach(([cl, a, b]) => { x.fillStyle = cl; x.beginPath(); x.arc(a, b, 4.5, 0, 7); x.fill() });
    x.fillStyle = '#3E2A17'; rr(605, 164, 18, 16, 3); x.fill(); x.fillStyle = '#FFCF71'; x.fillRect(608, 167, 12, 5);
    for (let i = 0; i < 4; i++) { x.fillStyle = '#fff'; x.beginPath(); x.arc(640 + i * 12, 74, 4, 0, 7); x.fill(); x.strokeStyle = '#C9C2B4'; x.lineWidth = 1; x.stroke() }
    // kitchen
    x.fillStyle = '#3E3A36'; rr(650, 300, 92, 52, 5); x.fill(); x.strokeStyle = '#8C8577'; x.lineWidth = 2;[[670, 315], [700, 315], [670, 338], [722, 338], [722, 315], [700, 338]].slice(0, 4).forEach(([a, b]) => { x.beginPath(); x.arc(a, b, 8, 0, 7); x.stroke() });
    x.fillStyle = '#9AA3A8'; x.beginPath(); x.arc(679, 325, 11, 0, 7); x.fill(); x.fillStyle = '#C8573E'; x.beginPath(); x.arc(679, 325, 7.5, 0, 7); x.fill();
    x.fillStyle = '#C9D0D4'; rr(700, 430, 70, 36, 4); x.fill(); x.strokeStyle = '#9AA3A8'; x.stroke(); x.fillStyle = '#6F8F5E';[[712, 442], [722, 448], [716, 452]].forEach(([a, b]) => { x.beginPath(); x.arc(a, b, 3.5, 0, 7); x.fill() }); x.fillStyle = '#E9806A'; x.beginPath(); x.arc(745, 446, 6, 0, 7); x.fill();
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
  person(x, p, px, py, ang, walking) {
    const s = walking ? Math.sin(p.t * 11) * 3.6 : 0; x.save(); x.translate(px, py); x.rotate(ang + Math.PI / 2); x.globalAlpha = p.alpha ?? 1;
    x.fillStyle = 'rgba(62,42,23,.18)'; x.beginPath(); x.ellipse(1, 3, 10, 7, 0, 0, 7); x.fill();
    if (walking) { x.fillStyle = '#3E2A17'; x.beginPath(); x.ellipse(-4, -3 + s, 2.6, 4, 0, 0, 7); x.fill(); x.beginPath(); x.ellipse(4, -3 - s, 2.6, 4, 0, 0, 7); x.fill() }
    x.fillStyle = p.skin; x.beginPath(); x.arc(-9.5, walking ? -s * .6 : -3, 2.6, 0, 7); x.fill(); x.beginPath(); x.arc(9.5, walking ? s * .6 : -3, 2.6, 0, 7); x.fill();
    x.fillStyle = p.shirt; x.beginPath(); x.ellipse(0, 1, 9.5, 6.2, 0, 0, 7); x.fill(); x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 1; x.stroke();
    x.fillStyle = p.skin; x.beginPath(); x.arc(0, -1, 5.6, 0, 7); x.fill(); x.fillStyle = p.hair; x.beginPath(); x.ellipse(0, 1, 5.9, 4.6, 0, 0, Math.PI); x.fill(); if (p.chef) { x.globalAlpha = 1; x.fillStyle = '#fff'; x.beginPath(); x.arc(0, 0, 6.6, 0, 7); x.fill(); x.strokeStyle = '#C9C2B4'; x.stroke(); x.beginPath(); x.arc(0, 0, 3.5, 0, 7); x.stroke() }
    x.restore()
  }
  item(x, p) {
    const s = p.seat; if (!s || s.kind === 'sofa') return; x.save(); x.translate(s.x, s.y); x.rotate(s.ang + Math.PI / 2); x.translate(0, s.kind === 'stool' ? -24 : -19);
    if (p.item === 'laptop') { x.fillStyle = '#8C8577'; this.rr(x, -7, -5, 14, 9, 1.5); x.fill(); x.fillStyle = '#BFE1F2'; this.rr(x, -6, -4, 12, 5, 1); x.fill() } else if (p.item === 'book') { x.fillStyle = '#C8573E'; this.rr(x, -6, -4, 12, 8, 1); x.fill(); x.fillStyle = '#FFF9EC'; x.fillRect(-.5, -4, 1, 8) } else { x.fillStyle = '#fff'; x.beginPath(); x.arc(0, 0, 3.8, 0, 7); x.fill(); x.fillStyle = '#7B542F'; x.beginPath(); x.arc(0, 0, 2.4, 0, 7); x.fill() } x.restore()
  }
  draw() {
    const x = this.ctx; x.setTransform(this.k, 0, 0, this.k, 0, 0); x.clearRect(0, 0, this.W, this.H); x.drawImage(this.bg, 0, 0, this.W, this.H); const t = this.t;
    // free seat breathing + unknown
    this.seats.forEach(s => {
      if (s.state === 'free') { const a = .45 + Math.sin(t * 2 + s.id) * .2 * (this.reduced ? 0 : 1); x.strokeStyle = `rgba(111,143,94,${a})`; x.lineWidth = 2; x.setLineDash([3, 3]); x.beginPath(); x.arc(s.x, s.y, s.kind === 'stool' ? 13 : 15, 0, 7); x.stroke(); x.setLineDash([]) }
      if (s.state === 'unknown') { x.strokeStyle = 'rgba(154,133,112,.9)'; x.lineWidth = 1.6; x.setLineDash([3, 3]); this.rr(x, s.x - 14, s.y - 12, 28, 22, 6); x.stroke(); x.setLineDash([]); x.fillStyle = '#9A8570'; x.font = '800 12px Manrope, sans-serif'; x.textAlign = 'center'; x.fillText('?', s.x, s.y + 4) }
      if (s.flash > 0) { x.fillStyle = `rgba(255,207,113,${s.flash * .6})`; x.beginPath(); x.arc(s.x, s.y, 18, 0, 7); x.fill() }
    });
    // seated people & items
    this.people.filter(p => p.state === 'seated').forEach(p => { this.item(x, p); this.person(x, p, p.x, p.y, p.ang, false) });
    this.staff.forEach(s => { this.person(x, { ...s, alpha: 1, t: t }, s.x, s.y, s.ang || Math.PI / 2, !this.reduced && s.wait <= 0) });
    this.people.filter(p => p.state !== 'seated').forEach(p => this.person(x, p, p.x, p.y, p.ang, p.state !== 'order'));
    // order bubble
    this.people.filter(p => p.state === 'order').forEach(p => { this.bub(x, p.x, p.y - 20, 1, 'cup') });
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

/* ---------- about ---------- */
function renderAbout() {
  app.innerHTML = `<div class="page"><div class="wrap">
 <section class="ab-hero"><div><span class="tagp">Бидний тухай</span><h1>Кафегаа очихоосоо өмнө мэдээрэй</h1><p>LiveSpace нь Улаанбаатарын кафенуудын сул суудал, дуу чимээ, Wi-Fi, залгуурын мэдээллийг нэг дор харуулдаг платформ юм. Сурах, ажиллах, найзуудтайгаа уулзах тохиромжтой газар хайхад зарцуулах цагийг тань хэмнэхийг зорьдог.</p><a class="btn btn-p" href="#explore">Газрын зураг үзэх →</a></div>
  <div class="orbit" aria-hidden="true"><div class="core">${I.house}</div><span class="fl" style="left:8%;top:6%">${I.seat.replace('<svg', '<svg width="14" height="14"')} 60% сул</span><span class="fl" style="right:4%;top:14%"><span style="color:var(--brown);display:grid">${ssGlyph(2).replace('<svg', '<svg width="14" height="14"')}</span>Тайван</span><span class="fl" style="left:4%;bottom:12%">${wifiSVG(4, 16)} Маш сайн</span><span class="fl" style="right:10%;bottom:6%">${I.plug.replace('<svg', '<svg width="14" height="14"')} Залгуур</span></div></section>
 <div class="g2"><div class="icard"><span class="ic">${I.target}</span><b>Эрхэм зорилго</b><span>Хүн бүр өөрт тохирох орчныг хялбар, хурдан олох боломжийг бүрдүүлэх.</span></div><div class="icard"><span class="ic">${I.eye}</span><b>Алсын хараа</b><span>Улаанбаатарын кафе, хамтын ажлын орон зайн мэдээллийг нэг дороос, ил тод, бодит цагаар харуулдаг найдвартай эх сурвалж болох.</span></div></div>
 <section class="sec"><div class="sec-h"><h2>Хэрхэн ажилладаг вэ?</h2></div><div class="g4">${[['Газраа сонго', 'Газрын зураг эсвэл кафены жагсаалтаас ойролцоох кафегаа олоорой.'], ['Тэмдгийг хар', 'Хүмүүс, дуу чимээ, Wi-Fi-г тэмдэг дээрээс нь шууд харна.'], ['Дотор талыг хар', 'Дээрээс харсан зураглалаас сул сандал, тайван булангаа олоорой.'], ['Кафе руу', 'Очихоосоо өмнө бүгдийг мэдсэн тул цаг, зам хоёроо хэмнэнэ.']].map(([b, s], i) => `<div class="icard"><span class="stepn">${i + 1}</span><b>${b}</b><span>${s}</span></div>`).join('')}</div></section>
 <section class="sec"><div class="sec-h"><h2>Бидний харуулдаг мэдээлэл</h2><p>Тоог тайлбарлах шаардлагагүйгээр шууд ойлгогдохуйц.</p></div><div class="g4">
  <div class="icard"><div class="demo-art"><div class="big-pct"><b class="num" style="font-size:40px">60%</b><span>сул</span></div></div><b>Сул суудал — хувиар</b><span>«12/20» гэж бодох хэрэггүй. Хэдэн хувь нь сул байгааг шууд харна.</span></div>
  <div class="icard"><div class="demo-art">${ssArt(2, 110)}</div><b>Дуу чимээ — зүйрлэлээр</b><span>Номын сангаас мотоцикл хүртэл 5 таних түвшин. dB-ээр биш, мэдрэмжээр.</span></div>
  <div class="icard"><div class="demo-art">${wifiSVG(4, 64)}</div><b>Wi-Fi — хөдөлдөг зураасаар</b><span>Зураасны тоо, хөдөлгөөний хурд чанарыг илэрхийлнэ. Хурдыг зөвхөн хэмжсэн үед бичнэ.</span></div>
  <div class="icard"><div class="demo-art">${crowdDots(70)}</div><b>Хүмүүс — 5 түвшин</b><span>Маш сулаас маш их хүнтэй хүртэл. Дуу чимээ ба хүний тоо тусдаа: олон хүнтэй ч нам гүм байж болно.</span></div></div></section>
 <section class="sec"><div class="sec-h"><h2>Мэдээлэл хэр шинэ вэ?</h2><p>Бодит хэмжилт, түүхэн дундаж, жишээ өгөгдлийг хэзээ ч хольж харуулахгүй.</p></div><div class="g4">${[['b-live', 'ШУУД', 'Сүүлийн 15 минутын хэрэглэгч эсвэл мэдрэгчийн өгөгдөл.'], ['b-typ', 'ДУНДАЖ', 'Тухайн өдөр, цагийн түүхэн хэв маяг.'], ['b-fc', 'ТААМАГ', 'Дараагийн цагуудын урьдчилсан тооцоо.'], ['b-demo', 'ДЕМО', 'Прототипийн жишээ утга. Энэ хувилбарт бүх утга ДЕМО.']].map(([c, l, d]) => `<div class="icard"><span class="badge ${c}" style="align-self:flex-start">${l}</span><span>${d}</span></div>`).join('')}</div></section>
 <section class="sec"><div class="sec-h"><h2>Түгээмэл асуулт</h2></div><div class="faq">${[['Дуу чимээний түвшинг хэрхэн уншдаг вэ?', '5 түвшин бий: номын сан шиг нам гүм, өглөөний тайван кафе шиг, найзууд цугласан кафе шиг, хүнсний зах шиг, арга хэмжээ шиг чанга. «Сонсох» товчоор жишээ дууг нь сонсож болно.'], ['Зураглал дээрх хүмүүс жинхэнэ үйлчлүүлэгч үү?', 'Үгүй. Дүрүүд нь суудлын төлөв өөрчлөгдөхийг ойлгомжтой харуулах дүрслэл юм. Хэнийг ч дагаж мөрддөггүй.'], ['Хаалттай кафены мэдээлэл яагаад харагдахгүй байна вэ?', 'Хаалттай үед бодит цагийн өгөгдөл ирдэггүй. Хуучирсан утгыг харуулбал төөрөгдүүлэх тул «—» гэж харуулна.'], ['Кафегаа LiveSpace-д хэрхэн нэмүүлэх вэ?', '«Хамтын ажиллагаа» хуудсаар хүсэлт илгээгээрэй. Бид тантай холбогдож мэдрэгч, зураглалыг тохируулна.']].map(([q, a]) => `<details><summary>${q}<i>+</i></summary><p>${a}</p></details>`).join('')}</div></section>
 <div class="band"><div><h2>Кафе эзэмшигч үү?</h2><p>Кафегаа LiveSpace-д нэмж, илүү олон зочинд хүрээрэй.</p></div><a class="btn btn-y" href="#partner">Хамтран ажиллах →</a></div></div>${footer()}</div>`;
  $$('.faq details').forEach(d => d.addEventListener('toggle', () => Snd.ui('click')))
}

/* ---------- partner ---------- */
function renderPartner() {
  app.innerHTML = `<div class="page"><div class="wrap">
 <section class="ab-hero" style="grid-template-columns:1fr"><div><span class="tagp">Хамтын ажиллагаа</span><h1>Кафегаа LiveSpace-д нэгтгээрэй</h1><p>Бид Улаанбаатарын кафе, коворкинг, номын сангуудтай хамтран ажиллаж, зочдод тохирох орчноо олоход нь тусалдаг. Таны кафе газрын зураг дээр гарч, бодит цагийн мэдээллээрээ илүү олон хүнд хүрнэ.</p><a class="btn btn-p" href="#pform">Хүсэлт илгээх →</a></div></section>
 <section class="sec"><div class="sec-h"><h2>Хамтран ажилласнаар</h2></div><div class="g4">${[[I.people, 'Илүү олон хэрэглэгч', 'Сурах, ажиллах газар хайж буй хэрэглэгчдэд таны кафе газрын зураг дээр харагдана.'], [I.clock, 'Бодит цагийн мэдээлэл', 'Сул суудал, дуу чимээ, Wi-Fi-гаа хэрэглэгчиддээ шууд харуулна.'], [I.chart, 'Ачааллын тойм', 'Өдрийн аль цагт ачаалал ихтэй, тайван байдгийг харж, үйлчилгээгээ төлөвлөнө.'], [I.star, 'Брэндээ таниулах', 'Кафены онцлог, тав тухтай орчноо олон хүнд таниулна.']].map(([ic, b, s]) => `<div class="icard"><span class="ic">${ic}</span><b>${b}</b><span>${s}</span></div>`).join('')}</div>
  <p style="text-align:center;margin-top:18px"><a class="btn btn-o" href="#staff">Ажилтны шууд хяналтыг үзэх →</a></p></section>
 <section class="sec" id="pform"><div class="sec-h"><h2>Хамтран ажиллах хүсэлт</h2></div>
 <form class="form" id="pf" novalidate>
  ${[['f1', 'Кафены нэр', 'Жишээ: Кафе A', 'text', 1], ['f2', 'Холбоо барих хүн', 'Овог, нэр', 'text', 1], ['f3', 'Утасны дугаар', '8800 0000', 'tel', 1], ['f4', 'И-мэйл', 'name@example.com', 'email', 1]].map(([id, l, p, t, req]) => `<div class="fld"><label for="${id}">${l}</label><input id="${id}" type="${t}" placeholder="${p}" ${req ? 'required' : ''}><span class="em"></span></div>`).join('')}
  <div class="fld"><label for="f5">Дүүрэг</label><select id="f5"><option>Сүхбаатар</option><option>Чингэлтэй</option><option>Баянгол</option><option>Хан-Уул</option><option>Баянзүрх</option><option>Сонгинохайрхан</option></select></div>
  <div class="fld"><label for="f6">Байгууллагын төрөл</label><select id="f6"><option>Кафе</option><option>Коворкинг</option><option>Номын сан</option></select></div>
  <div class="fld full"><label for="f7">Нэмэлт мэдээлэл</label><textarea id="f7" rows="4" placeholder="Кафенийхаа тухай товч бичнэ үү"></textarea></div>
  <div class="fld full" style="flex-direction:row;align-items:center;gap:14px;flex-wrap:wrap"><button class="btn btn-p">Хүсэлт илгээх</button><span class="muted" style="font-size:13px">Эсвэл: [И-мэйл хаяг] · [Утасны дугаар]</span></div>
 </form></section></div>${footer()}</div>`;
  $('#pf').onsubmit = e => {
    e.preventDefault(); let ok = true; $$('#pf [required]').forEach(i => { const f = i.closest('.fld'); const bad = !i.value.trim() || (i.type === 'email' && !/^\S+@\S+\.\S+$/.test(i.value)) || (i.type === 'tel' && i.value.replace(/\D/g, '').length < 8); f.classList.toggle('err', bad); $('.em', f).textContent = bad ? (i.value.trim() ? (i.type === 'email' ? 'И-мэйл хаяг буруу байна' : '8 оронтой дугаар оруулна уу') : 'Энэ талбарыг бөглөнө үү') : ''; if (bad) ok = false });
    if (!ok) { Snd.ui('err'); return } Snd.ui('chime'); $('#pf').innerHTML = `<div class="done"><svg viewBox="0 0 84 84"><circle cx="42" cy="42" r="38" fill="#E5EEDC"/><path class="ck" d="M26 43l11 11 22-24" fill="none" stroke="#4E6B40" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg><h2 style="margin:12px 0 6px">Хүсэлт хүлээж авлаа</h2><p class="muted">Бид 2 ажлын өдөрт тантай холбогдоно. (Прототип — хүсэлт хаашаа ч илгээгдээгүй.)</p></div>`
  }
}

/* ---------- staff ---------- */
function renderStaff() {
  const c = byId('A');
  app.innerHTML = `<div class="page"><div class="wrap" style="padding-block:28px 0">
 <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span class="badge" style="background:var(--brown);color:#fff;font-size:11px">АЖИЛТАН</span><h1 style="font-size:34px">Шууд хяналт</h1><span class="muted">${c.name} · ${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}</span><span class="badge b-demo" style="margin-left:auto">ДЕМО</span></div>
 <div class="st-grid"><div style="display:flex;flex-direction:column;gap:20px">
  <section class="card"><div class="card-h"><h2>Танхимын төлөв</h2></div><div class="occ-ring"><svg viewBox="0 0 150 150"><circle cx="75" cy="75" r="60" fill="none" stroke="#F1E8DA" stroke-width="16"/><circle class="v" id="occC" cx="75" cy="75" r="60" fill="none" stroke="#C8573E" stroke-width="16" stroke-linecap="round" stroke-dasharray="377" stroke-dashoffset="377" transform="rotate(-90 75 75)"/><text x="75" y="80" text-anchor="middle" font-size="30" font-weight="800" font-family="Manrope" fill="#3E2A17" id="occT">0%</text><text x="75" y="100" text-anchor="middle" font-size="11" fill="#6B5038" font-family="Manrope">дүүрсэн</text></svg>
   <div style="display:grid;grid-template-columns:repeat(3,auto);gap:22px"><div><small class="muted">Сул суудал</small><b class="num" style="display:block;font-size:28px" id="stFree">—</b></div><div><small class="muted">Дуу чимээ</small><b style="display:block;font-size:16px;margin-top:6px">${SS[4].t}</b></div><div><small class="muted">Хүлээлт</small><b class="num" style="display:block;font-size:28px">~8 мин</b></div></div></div>
   <div class="plan-wrap" id="planWrap" style="margin-top:16px"></div></section>
  <div style="display:flex;flex-direction:column;gap:10px"><span class="eyebrow">Юу анхаарах вэ</span>
   <div class="ins"><span>${I.chart.replace('<svg', '<svg width="22" height="22"')}</span><div><b>Хүмүүс ердийнхөөс хурдан нэмэгдэж байна</b><small>Сүүлийн 30 минутад +18% (ердийн +8%) · <span class="badge b-typ">ДУНДАЖ</span></small></div></div>
   <div class="ins a"><span>${I.clock.replace('<svg', '<svg width="22" height="22"')}</span><div><b>Оргил ачаалал ~35 минутын дараа</b><small>Баристагийн нэмэлт ээлж хэрэгтэй байж магадгүй · <span class="badge b-fc">ТААМАГ</span></small></div></div>
   <div class="ins"><span style="color:var(--brown)">${ssGlyph(4).replace('<svg', '<svg width="22" height="22"')}</span><div><b>Дуу чимээ энэ цагийн хэвийн хэмжээнээс өндөр</b><small>«Хүнсний зах шиг» — ердийн «Тайван кафе шиг»</small></div></div></div>
 </div>
 <div style="display:flex;flex-direction:column;gap:20px">
  <section class="card"><div class="card-h"><h2>Түр төлөв</h2></div><div id="tsList" style="display:flex;flex-direction:column;gap:8px"></div>
   <div class="chips" style="margin-top:12px">${['Wi-Fi ажиллахгүй', 'Суудал хязгаартай', 'Арга хэмжээ болж байна', 'Чимээгүй хэсэг түр хаалттай'].map(t => `<button class="chip" data-ts="${t}">+ ${t}</button>`).join('')}</div>
   <div style="display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap"><small class="muted">Дуусах:</small><div class="seg" id="expSeg"><span class="ind-s"></span>${['30 мин', '1 цаг', '2 цаг', 'Өдрийн эцэс'].map((t, i) => `<button data-exp="${t}" aria-selected="${i === 2}">${t}</button>`).join('')}</div></div></section>
  <section class="amb"><div style="display:flex;gap:10px;align-items:center"><h3>ДАСАН ЗОХИЦОХ ОРЧИН</h3><span class="badge" style="border:1px solid var(--amberL);color:var(--amberL)">ЗӨВХӨН ЗӨВЛӨМЖ</span></div>
   <span>Одоо: ачаалал өндөр · «хүнсний зах шиг» чимээтэй</span>
   <div class="seg" id="musSeg"><span class="ind-s"></span><button data-mus="calm" aria-selected="true">Тайван</button><button data-mus="mid" aria-selected="false">Дунд</button><button data-mus="up" aria-selected="false">Эрч хүчтэй</button></div>
   <div style="display:flex;gap:16px;align-items:center"><div class="eq" id="eq">${'<i></i>'.repeat(6)}</div><div><b style="color:#fff" id="musV">Хөгжмийн дуу 32%</b><br><small id="musR">Санал болгосон: орчны чимээ аль хэдийн өндөр байна.</small></div></div>
   <small style="color:#BFAE95">Тоног төхөөрөмжийг удирдахгүй — зөвхөн ажилтанд санал болгоно.</small></section>
 </div></div></div>${footer()}</div>`;
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
function route() {
  const h = (location.hash || '#home').slice(1); Snd.stopAmb(); if (fp) { fp.destroy(); fp = null } if (mapCtl) { mapCtl.destroy(); mapCtl = null } if (homeMini) { homeMini.destroy(); homeMini = null } refreshResults = () => { }; closeModal();
  const key = h.startsWith('cafe-') ? 'cafe' : h; $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === key || (key === 'cafe' && a.dataset.nav === 'explore') || (key === 'staff' && a.dataset.nav === 'partner')));
  document.body.classList.toggle('on-explore', key === 'explore');
  if (key !== 'explore') $$('.pv').forEach(p => p.remove());
  if (key === 'explore') renderExplore(); else if (key === 'cafes') renderCafes(); else if (key === 'cafe') renderCafe(h.slice(5)); else if (key === 'about') renderAbout(); else if (key === 'partner') renderPartner(); else if (key === 'staff') renderStaff(); else renderHome();
  if (key !== 'explore') window.scrollTo(0, 0); renderTray()
}
document.addEventListener('click', e => { const a = e.target.closest('a[href^="#"]'); if (a && a.getAttribute('href') === '#pform') { e.preventDefault(); $('#pform').scrollIntoView({ behavior: Prefs.reduced ? 'auto' : 'smooth' }); return } if (a && !e.defaultPrevented) { Snd.ui('click') } });
window.addEventListener('hashchange', route);
let lastMobile = isMobile(); window.addEventListener('resize', () => { const m = isMobile(); if (m !== lastMobile) { lastMobile = m; if ((location.hash || '').startsWith('#explore')) route() } });
document.documentElement.classList.toggle('rm', Prefs.reduced);
renderHeaderBits(); route();
