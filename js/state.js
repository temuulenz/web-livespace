import { store } from './storage.js';

const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
const Prefs = { sound: store.get('sound', true), reduced: store.get('reduced', mq.matches) };
// only: { label, ids } limits the map to the cafés of a homepage category (Амттан, Хямдрал, Сул суудал).
const F = { q: '', district: '', purpose: new Set(), sound: 0, wifi: 'any', seats: 'any', openOnly: false, more: false, only: null };
const favs = new Set(store.get('favs', []));

export { Prefs, F, favs };
