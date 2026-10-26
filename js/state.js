import { store } from './storage.js';

const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
const Prefs = { sound: store.get('sound', true), reduced: store.get('reduced', mq.matches) };
const F = { q: '', purpose: new Set(), sound: 0, wifi: 'any', seats: 'any', openOnly: false, more: false };
const favs = new Set(store.get('favs', []));

export { Prefs, F, favs };
