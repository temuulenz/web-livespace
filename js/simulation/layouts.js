/* ================= café interior layouts =================
 * A layout is plain data. FloorPlan reads it to place furniture, seats, plants and
 * obstacles, so each café can get its own interior without touching the engine.
 *
 * There are two templates. A template sets the look (colours, floor, decoration;
 * see THEMES in floor-plan.js) and a starting arrangement. Inside a template every
 * object can be moved in the admin layout editor: tables with their chairs, single
 * chairs, sofas, the window bar, shelves, plants, the rug and the order counter.
 * The outer walls, the windows (top) and the entrance (bottom left) are fixed.
 * Coordinates use the 800×520 world of FloorPlan.
 *
 * `legacy` is the original interior including the kitchen. It is kept so the seeded
 * regression fixtures can prove the engine still behaves exactly like the original.
 */

const WINDOWS = [[175, 265], [265, 355], [355, 445], [445, 520]];
const WINDOW_BAR = { x: 165, w: 350, stools: [205, 290, 375, 460], label: [340, 108] };
// Top-left corner of the barista area (counter, coffee machine, staff floor), 176×226.
const COUNTER = { x: 600, y: 24 };

const ORIGINAL_FLOOR = {
  windows: WINDOWS,
  windowBar: WINDOW_BAR,
  counter: COUNTER,
  rug: [165, 150, 262, 112],
  round: [
    { x: 220, y: 205, dirs: 'NESW', zone: 't1', name: '1-р ширээ' },
    { x: 370, y: 205, dirs: 'NESW', zone: 't2', name: '2-р ширээ' },
    { x: 515, y: 215, dirs: 'NS', zone: 't3', name: '3-р ширээ' }
  ],
  long: [{ x: 160, y: 330, w: 240, seats: [200, 280, 360], zone: 'long', name: 'Урт ширээ', label: [280, 406] }],
  sofas: [{ x: 430, y: 466, w: 168, seats: [470, 515, 560], sensor: false, table: [515, 425], label: [515, 458] }],
  chairs: [],
  plants: [[45, 45, 22], [45, 300, 20], [150, 476, 20], [585, 478, 14]],
  shelves: []
};

const LAYOUTS = {
  legacy: { id: 'legacy', name: 'Анхны (гал тогоотой)', theme: 'original', kitchen: true, ...ORIGINAL_FLOOR },

  // Calm and clean: light floor, dark frame, light wood, sage plants. Starts from the
  // original arrangement without the kitchen.
  minimal: {
    id: 'minimal', name: 'Минимал', theme: 'minimal', kitchen: false, ...ORIGINAL_FLOOR,
    plants: [...ORIGINAL_FLOOR.plants, [640, 290, 16]],
    shelves: [{ x: 744, y: 300, w: 24, h: 180 }]
  },

  // Warm and decorated: terrazzo floor, green walls, terracotta and mustard furniture,
  // velvet sofas, pendant lamps, string lights and a patterned rug.
  artistic: {
    id: 'artistic', name: 'Артистик', theme: 'artistic', kitchen: false, windows: WINDOWS, windowBar: WINDOW_BAR, counter: COUNTER,
    rug: [165, 150, 262, 112],
    round: [
      { x: 220, y: 205, dirs: 'NESW', zone: 'round', name: '1-р ширээ' },
      { x: 370, y: 205, dirs: 'EW', zone: 'round', name: '2-р ширээ' },
      { x: 515, y: 215, dirs: 'NS', zone: 'round', name: '3-р ширээ' },
      { x: 690, y: 330, dirs: 'EW', zone: 'round', name: '4-р ширээ' }
    ],
    long: [],
    sofas: [
      { x: 160, y: 466, w: 168, seats: [200, 245, 290], sensor: true, table: [245, 425], label: [245, 458], zone: 'lounge', name: 'Буйдан А' },
      { x: 400, y: 466, w: 168, seats: [440, 485, 530], sensor: true, table: [485, 425], label: [485, 458], zone: 'lounge', name: 'Буйдан Б' },
      { x: 604, y: 466, w: 168, seats: [644, 689, 734], sensor: true, table: [689, 425], label: [689, 458], zone: 'lounge', name: 'Буйдан В' }
    ],
    chairs: [],
    plants: [[45, 45, 24], [45, 300, 22], [370, 300, 18], [585, 290, 16]],
    shelves: []
  }
};

const LAYOUT_IDS = Object.keys(LAYOUTS).filter(id => id !== 'legacy');
const EDITABLE = ['windowBar', 'counter', 'rug', 'round', 'long', 'sofas', 'chairs', 'plants', 'shelves'];
// Visualizations saved before there were two templates keep working.
const OLD_PRESETS = { classic: 'minimal', library: 'minimal', workspace: 'minimal', social: 'artistic', lounge: 'artistic' };

// Demo assignment so neighbouring cafés don't share one look.
// A server-provided visualization config (cafe.visualization) takes precedence.
const DEMO_LAYOUT = { A: 'minimal', I: 'minimal', F: 'artistic', O: 'minimal', T: 'minimal', J: 'artistic', K: 'minimal', B: 'artistic', L: 'minimal', P: 'artistic', Q: 'artistic', H: 'artistic' };

const presetOf = id => LAYOUTS[id] ? id : OLD_PRESETS[id] || null;

/**
 * Resolve the interior for a café.
 * Accepts a preset id, a full layout object, or a { preset, overrides } config
 * produced by the admin layout editor (and later by an AI-assisted generator).
 */
function resolveLayout(spec, cafe) {
  if (spec && typeof spec === 'object' && !spec.preset && spec.windowBar !== undefined) return spec;
  const config = typeof spec === 'string' ? { preset: spec } : spec || cafe?.visualization?.layout || null;
  const presetId = presetOf(config?.preset) || DEMO_LAYOUT[cafe?.id] || 'minimal';
  const base = LAYOUTS[presetId];
  const overrides = config?.overrides && typeof config.overrides === 'object' ? config.overrides : {};
  const out = { ...base, kitchen: presetId === 'legacy' };
  for (const key of EDITABLE) if (key in overrides && (Array.isArray(overrides[key]) || overrides[key] === null || typeof overrides[key] === 'object')) out[key] = overrides[key];
  if (!out.counter) out.counter = COUNTER;
  for (const key of ['round', 'long', 'sofas', 'chairs', 'plants', 'shelves']) if (!Array.isArray(out[key])) out[key] = [];
  return out;
}

// The editable part of a layout, as saved in { preset, overrides }.
function arrangementOf(layout) {
  const copy = JSON.parse(JSON.stringify(layout));
  return Object.fromEntries(EDITABLE.map(key => [key, copy[key] ?? null]));
}

export { LAYOUTS, LAYOUT_IDS, DEMO_LAYOUT, EDITABLE, resolveLayout, arrangementOf };
