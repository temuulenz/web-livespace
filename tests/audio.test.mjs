import assert from 'node:assert/strict';
import test from 'node:test';

test('audio preserves preview timing and releases timers and audio nodes after fading', async () => {
  const nodes = [], timers = new Map(), intervals = new Map();
  let id = 0, ended = 0;
  const parameter = () => ({ value: 0, calls: [], setValueAtTime(...args) { this.calls.push(['set', ...args]); }, linearRampToValueAtTime(...args) { this.calls.push(['linear', ...args]); }, exponentialRampToValueAtTime(...args) { this.calls.push(['exponential', ...args]); }, cancelScheduledValues(...args) { this.calls.push(['cancel', ...args]); } });
  const node = type => {
    const result = { type, gain: parameter(), frequency: parameter(), Q: { value: 0 }, stops: [], connect(destination) { return destination; }, start() {}, stop(time) { this.stops.push(time); }, disconnect() { this.disconnected = true; } };
    nodes.push(result); return result;
  };
  class AudioContext {
    currentTime = 4;
    sampleRate = 64;
    state = 'running';
    destination = {};
    createGain() { return node('gain'); }
    createOscillator() { return node('oscillator'); }
    createBufferSource() { return node('source'); }
    createBiquadFilter() { return node('filter'); }
    createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  }
  globalThis.window = { matchMedia: () => ({ matches: false }), AudioContext };
  globalThis.localStorage = { getItem: () => null };
  const { Snd } = await import('../js/audio.js');
  const originals = { setTimeout, clearTimeout, setInterval, clearInterval };
  globalThis.setTimeout = (callback, delay) => { timers.set(++id, { callback, delay }); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  globalThis.setInterval = (callback, delay) => { intervals.set(++id, { callback, delay }); return id; };
  globalThis.clearInterval = id => intervals.delete(id);
  try {
    Snd.ambience(5, () => ended++);
    const preview = Snd.amb;
    assert.equal(timers.get(preview.endTimer).delay, 4200);
    assert.equal([...intervals.values()][0].delay, 300);
    assert.deepEqual(preview.g.gain.calls.at(-1), ['linear', .32, 4.4]);
    Snd.stopAmb();
    assert.equal(Snd.amb, null); assert.equal(ended, 1);
    assert.equal(intervals.size, 0);
    assert.equal(timers.has(preview.endTimer), false);
    assert.deepEqual(preview.g.gain.calls.at(-1), ['linear', 0, 4.35]);
    const fade = [...timers.values()].find(timer => timer.delay === 450);
    fade.callback();
    assert.ok(preview.nodes.every(node => node.disconnected));
    assert.ok(preview.connections.every(node => node.disconnected));
    Snd.stopAmb(); assert.equal(ended, 1);
    Snd.tone(380, .14, { to: 820, vol: .16 });
    const oscillator = nodes.at(-2), gain = nodes.at(-1);
    assert.deepEqual(oscillator.frequency.calls[0], ['set', 380, 4]);
    assert.equal(oscillator.stops[0], 4 + .14 + .05);
    oscillator.onended();
    assert.ok(oscillator.disconnected && gain.disconnected);
    Snd.burst(.035);
    const [source, filter, burstGain] = nodes.slice(-3);
    source.onended();
    assert.ok(source.disconnected && filter.disconnected && burstGain.disconnected);
  } finally { Object.assign(globalThis, originals); }
});
