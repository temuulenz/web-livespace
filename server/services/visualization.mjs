// Café-specific visualization: turning a café's photographs and details into a
// FloorPlan layout config ({ preset, overrides }, see js/simulation/layouts.js).
//
// Today our team does this by hand in the admin dashboard. The `suggest` step is a
// provider interface so an AI agent can take over later without changing the rest:
//
//   provider = {
//     name: 'vision-model-x',
//     async suggest({ cafe, form, photos }) → { layout: { preset, overrides }, rationale, confidence }
//   }
//
// `photos` are { id, mime, read: () => Promise<Buffer> } so a provider can send the
// images to a vision model. Whatever a provider returns is only a suggestion: an
// admin reviews it and saves it; nothing is published automatically.

import { LAYOUTS, LAYOUT_IDS } from '../../js/simulation/layouts.js';

const OLD_PRESETS = { classic: 'minimal', library: 'minimal', workspace: 'minimal', social: 'artistic', lounge: 'artistic' };

// Keyword rules: a transparent baseline and the fallback when no AI provider is configured.
const RULES = [
  ['artistic', /буйдан|тух|амрах|lounge|найз|хөгжим|арга хэмжээ|уулзалт|олон хүн|event|урлаг|art|өнгөлөг/i],
  ['minimal', /ном|номын|чимээгүй|нам гүм|унш|сурах|сурлага|коворкинг|ажил|оффис|cowork|laptop|минимал/i]
];

export const ruleBasedProvider = {
  name: 'rules',
  async suggest({ cafe, form }) {
    const text = [cafe.category, cafe.description, form?.description, form?.extra, ...(JSON.parse(cafe.tags || '[]'))].join(' ');
    const hit = RULES.find(([, regex]) => regex.test(text));
    const preset = hit ? hit[0] : 'minimal';
    return {
      layout: { preset, overrides: {} },
      rationale: hit ? `Тайлбар, ангилалд «${text.match(hit[1])[0]}» гэсэн үг байгаа тул «${LAYOUTS[preset].name}» загвар санал болгов.` : 'Тодорхой түлхүүр үг олдсонгүй — минимал загвараас эхэлнэ.',
      confidence: hit ? 0.5 : 0.2
    };
  }
};

// Keep only values FloorPlan understands, so a bad suggestion cannot break the page.
export function sanitizeLayout(layout) {
  if (!layout || typeof layout !== 'object') return null;
  const preset = LAYOUT_IDS.includes(layout.preset) ? layout.preset : OLD_PRESETS[layout.preset] || 'minimal';
  const overrides = {};
  const finite = (...values) => values.every(Number.isFinite);
  const nums = (value, n) => Array.isArray(value) && value.length === n && value.every(v => Number.isFinite(v));
  const inFloor = (x, y) => x >= 24 && x <= 776 && y >= 24 && y <= 500;
  const name = (value, fallback) => String(value || fallback).slice(0, 30);
  const src = layout.overrides && typeof layout.overrides === 'object' ? layout.overrides : {};
  if (Array.isArray(src.plants)) overrides.plants = src.plants.filter(p => nums(p, 3) && inFloor(p[0], p[1]) && p[2] > 4 && p[2] < 40).slice(0, 30);
  if (Array.isArray(src.round)) overrides.round = src.round.filter(t => t && finite(t.x, t.y) && inFloor(t.x, t.y) && /^[NESW]{1,4}$/.test(t.dirs || '')).slice(0, 20).map(t => ({ x: t.x, y: t.y, dirs: t.dirs, zone: ['t1', 't2', 't3'].includes(t.zone) ? t.zone : 'round', name: name(t.name, 'Ширээ') }));
  if (Array.isArray(src.long)) overrides.long = src.long.filter(t => t && finite(t.x, t.y, t.w) && t.w >= 60 && Array.isArray(t.seats) && t.seats.every(Number.isFinite) && inFloor(t.x, t.y) && inFloor(t.x + t.w, t.y + 36)).slice(0, 10).map(t => ({ x: t.x, y: t.y, w: t.w, seats: t.seats.slice(0, 8), zone: 'long', name: name(t.name, 'Урт ширээ'), label: nums(t.label, 2) ? t.label : null }));
  if (Array.isArray(src.sofas)) overrides.sofas = src.sofas.filter(f => f && finite(f.x, f.y, f.w) && inFloor(f.x, f.y) && Array.isArray(f.seats) && f.seats.every(Number.isFinite)).slice(0, 8).map(f => ({ x: f.x, y: f.y, w: f.w, seats: f.seats.slice(0, 5), sensor: !!f.sensor, table: nums(f.table, 2) ? f.table : null, label: nums(f.label, 2) ? f.label : null, zone: f.sensor ? 'lounge' : 'sofa', name: name(f.name, 'Буйдан') }));
  if (Array.isArray(src.chairs)) overrides.chairs = src.chairs.filter(c => c && finite(c.x, c.y) && inFloor(c.x, c.y) && /^[NESW]$/.test(c.dir || '')).slice(0, 40).map(c => ({ x: c.x, y: c.y, dir: c.dir }));
  if (Array.isArray(src.shelves)) overrides.shelves = src.shelves.filter(b => b && finite(b.x, b.y, b.w, b.h) && inFloor(b.x, b.y) && b.w > 0 && b.h > 0).slice(0, 12).map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
  if (src.rug === null || nums(src.rug, 4)) overrides.rug = src.rug;
  if (src.windowBar === null) overrides.windowBar = null;
  else if (src.windowBar && finite(src.windowBar.x, src.windowBar.w) && Array.isArray(src.windowBar.stools) && src.windowBar.stools.every(Number.isFinite) && nums(src.windowBar.label, 2)) overrides.windowBar = { x: src.windowBar.x, w: src.windowBar.w, stools: src.windowBar.stools.slice(0, 8), label: src.windowBar.label };
  if (src.counter && finite(src.counter.x, src.counter.y)) overrides.counter = { x: Math.min(600, Math.max(28, src.counter.x)), y: Math.min(246, Math.max(24, src.counter.y)) };
  return { preset, overrides };
}

export function createCustomizer({ provider = ruleBasedProvider } = {}) {
  return {
    provider: provider.name,
    async suggest(input) {
      const result = await provider.suggest(input);
      return { ...result, layout: sanitizeLayout(result.layout), provider: provider.name, created_at: new Date().toISOString() };
    }
  };
}
