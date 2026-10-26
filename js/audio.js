import { Prefs } from './state.js';

/* ================= sound engine (Web Audio, no files) ================= */
const Snd = {
  ctx: null, nbuf: null, amb: null,
  ensure() { if (!this.ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; try { this.ctx = new C() } catch (e) { return null } } if (this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx },
  noiseBuf() { const c = this.ctx; if (this.nbuf) return this.nbuf; const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0); let l = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; l = (l + .02 * w) / 1.02; d[i] = w * .5 + l * 3 } this.nbuf = b; return b },
  tone(f, dur, { type = 'sine', vol = .15, to = null, delay = 0, dest = null } = {}) { const c = this.ensure(); if (!c) return; const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur * .8); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(g).connect(dest || c.destination); o.onended = () => { o.disconnect(); g.disconnect() }; o.start(t); o.stop(t + dur + .05) },
  burst(dur, { vol = .08, f = 2000, q = 1, type = 'bandpass', delay = 0, to = null, dest = null } = {}) { const c = this.ensure(); if (!c) return; const t = c.currentTime + delay, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.noiseBuf(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (to) fl.frequency.exponentialRampToValueAtTime(to, t + dur); fl.Q.value = q; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur); s.connect(fl).connect(g).connect(dest || c.destination); s.onended = () => { s.disconnect(); fl.disconnect(); g.disconnect() }; s.start(t, Math.random()); s.stop(t + dur + .05) },
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
  stopAmb() {
    if (!this.amb) return;
    const a = this.amb;
    this.amb = null;
    clearTimeout(a.endTimer);
    a.timers.forEach(clearInterval);
    try {
      const t = this.ctx.currentTime;
      a.g.gain.cancelScheduledValues(t);
      a.g.gain.setValueAtTime(a.g.gain.value, t);
      a.g.gain.linearRampToValueAtTime(0, t + .35);
    } catch (e) { }
    // Keep the existing fade, then release every node in this preview's graph.
    setTimeout(() => {
      a.nodes.forEach(node => {
        try { node.stop() } catch (e) { }
        try { node.disconnect() } catch (e) { }
      });
      a.connections.forEach(node => { try { node.disconnect() } catch (e) { } });
    }, 450);
    a.onEnd && a.onEnd();
  },
  ambience(level, onEnd) {
    this.stopAmb(); const c = this.ensure(); if (!c) return; const g = c.createGain(); g.gain.value = 0; g.connect(c.destination); const nodes = [], timers = [], connections = [g]; const t = c.currentTime;
    const bed = (f, q, vol, type = 'lowpass', lfo = 0, depth = 0) => { const s = c.createBufferSource(); s.buffer = this.noiseBuf(); s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const gg = c.createGain(); gg.gain.value = vol; connections.push(fl, gg); if (lfo) { const o = c.createOscillator(), og = c.createGain(); o.frequency.value = lfo; og.gain.value = vol * depth; connections.push(og); o.connect(og).connect(gg.gain); o.start(); nodes.push(o) } s.connect(fl).connect(gg).connect(g); s.start(); nodes.push(s) };
    const every = (ms, fn) => timers.push(setInterval(fn, ms));
    if (level === 1) { bed(500, .5, .18); every(1500, () => { if (Math.random() < .6) this.burst(.18, { vol: .05, f: 4200, to: 2500, q: 1.4, dest: g }) }) }
    if (level === 2) { bed(700, .6, .35); every(900, () => { if (Math.random() < .45) this.tone(2400 + Math.random() * 900, .18, { type: 'sine', vol: .05, dest: g }) }) }
    if (level === 3) { bed(800, .6, .35); bed(900, 1.4, .5, 'bandpass', 4.5, .6); bed(1500, 1.2, .3, 'bandpass', 6.3, .7); every(700, () => { if (Math.random() < .4) this.tone(2600 + Math.random() * 700, .15, { vol: .05, dest: g }) }) }
    if (level === 4) { bed(900, .6, .6); bed(1000, 1, .8, 'bandpass', 7, .6); bed(1700, 1, .5, 'bandpass', 9, .7); bed(300, .8, .4, 'lowpass'); every(450, () => { if (Math.random() < .5) this.tone(2000 + Math.random() * 1500, .12, { vol: .06, dest: g }) }) }
    if (level === 5) { bed(900, .6, .7); bed(1100, 1, .9, 'bandpass', 8, .6); bed(1900, 1, .6, 'bandpass', 11, .7); bed(250, .8, .5, 'lowpass'); let beat = 0; every(300, () => { const strong = beat++ % 2 === 0; this.tone(strong ? 90 : 120, .22, { to: 50, vol: strong ? .45 : .25, dest: g }); this.burst(.08, { vol: .08, f: 1800, q: 1, dest: g }) }) }
    g.gain.linearRampToValueAtTime(.32, t + .4);
    this.amb = { g, nodes, timers, connections, onEnd, endTimer: null };
    this.amb.endTimer = setTimeout(() => { if (this.amb && this.amb.g === g) this.stopAmb() }, 4200)
  }
};

export { Snd };
