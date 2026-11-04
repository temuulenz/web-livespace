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

// Keyword rules: a transparent baseline and the fallback when no AI provider is configured.
const RULES = [
  ['library', /ном|номын|чимээгүй|нам гүм|унш|сурах|сурлага/i],
  ['workspace', /коворкинг|ажил|залгуур|оффис|cowork|laptop/i],
  ['lounge', /буйдан|тух|амрах|lounge/i],
  ['social', /найз|хөгжим|арга хэмжээ|уулзалт|олон хүн|event/i]
];

export const ruleBasedProvider = {
  name: 'rules',
  async suggest({ cafe, form }) {
    const text = [cafe.category, cafe.description, form?.description, form?.extra, ...(JSON.parse(cafe.tags || '[]'))].join(' ');
    const hit = RULES.find(([, regex]) => regex.test(text));
    const preset = hit ? hit[0] : 'classic';
    return {
      layout: { preset, overrides: {} },
      rationale: hit ? `Тайлбар, ангилалд «${text.match(hit[1])[0]}» гэсэн үг байгаа тул «${LAYOUTS[preset].name}» загвар санал болгов.` : 'Тодорхой түлхүүр үг олдсонгүй — сонгодог загвараас эхэлнэ.',
      confidence: hit ? 0.5 : 0.2
    };
  }
};

// Keep only values FloorPlan understands, so a bad suggestion cannot break the page.
export function sanitizeLayout(layout) {
  if (!layout || typeof layout !== 'object') return null;
  const preset = LAYOUT_IDS.includes(layout.preset) ? layout.preset : 'classic';
  const overrides = {};
  const nums = (value, n) => Array.isArray(value) && value.length === n && value.every(v => Number.isFinite(v));
  const inFloor = (x, y) => x > 28 && x < 772 && y > 28 && y < 496 && !(x > 598 && y < 256);
  const src = layout.overrides && typeof layout.overrides === 'object' ? layout.overrides : {};
  if (Array.isArray(src.plants)) overrides.plants = src.plants.filter(p => nums(p, 3) && inFloor(p[0], p[1])).slice(0, 20);
  if (Array.isArray(src.round)) overrides.round = src.round.filter(t => t && Number.isFinite(t.x) && Number.isFinite(t.y) && inFloor(t.x, t.y) && /^[NESW]{1,4}$/.test(t.dirs || '')).slice(0, 12).map(t => ({ x: t.x, y: t.y, dirs: t.dirs, zone: 'round', name: String(t.name || 'Ширээ').slice(0, 30) }));
  if (Array.isArray(src.long)) overrides.long = src.long.filter(t => t && [t.x, t.y, t.w].every(Number.isFinite) && Array.isArray(t.seats) && t.seats.every(Number.isFinite) && inFloor(t.x, t.y) && inFloor(t.x + t.w, t.y + 36)).slice(0, 6).map(t => ({ x: t.x, y: t.y, w: t.w, seats: t.seats.slice(0, 8), zone: 'long', name: String(t.name || 'Урт ширээ').slice(0, 30), label: nums(t.label, 2) ? t.label : null }));
  if (Array.isArray(src.sofas)) overrides.sofas = src.sofas.filter(f => f && [f.x, f.y, f.w].every(Number.isFinite) && Array.isArray(f.seats) && f.seats.every(Number.isFinite)).slice(0, 4).map(f => ({ x: f.x, y: f.y, w: f.w, seats: f.seats.slice(0, 5), sensor: !!f.sensor, table: nums(f.table, 2) ? f.table : null, label: nums(f.label, 2) ? f.label : null, zone: f.sensor ? 'lounge' : 'sofa', name: String(f.name || 'Буйдан').slice(0, 30) }));
  if (Array.isArray(src.shelves)) overrides.shelves = src.shelves.filter(b => b && [b.x, b.y, b.w, b.h].every(Number.isFinite)).slice(0, 8);
  if (src.rug === null || nums(src.rug, 4)) overrides.rug = src.rug;
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
