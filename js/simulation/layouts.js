/* ================= café interior layouts =================
 * A layout is plain data. FloorPlan reads it to place furniture, seats, plants and
 * obstacles, so each café can get its own interior without touching the engine.
 *
 * The building shell is shared by every layout: outer walls, the entrance (bottom
 * left), the window wall (top) and the barista counter (top right). Layouts only
 * describe the customer floor. Coordinates use the 800×520 world of FloorPlan.
 *
 * `legacy` is the original interior including the kitchen. It is kept so the seeded
 * regression fixtures can prove the engine still behaves exactly like the original.
 * Every customer-facing layout has `kitchen: false`.
 */

const WINDOWS = [[175, 265], [265, 355], [355, 445], [445, 520]];
const WINDOW_BAR = { x: 165, w: 350, stools: [205, 290, 375, 460], label: [340, 108] };

const ORIGINAL_FLOOR = {
  windows: WINDOWS,
  windowBar: WINDOW_BAR,
  rug: [165, 150, 262, 112],
  round: [
    { x: 220, y: 205, dirs: 'NESW', zone: 't1', name: '1-р ширээ' },
    { x: 370, y: 205, dirs: 'NESW', zone: 't2', name: '2-р ширээ' },
    { x: 515, y: 215, dirs: 'NS', zone: 't3', name: '3-р ширээ' }
  ],
  long: [{ x: 160, y: 330, w: 240, seats: [200, 280, 360], zone: 'long', name: 'Урт ширээ', label: [280, 406] }],
  sofas: [{ x: 430, y: 466, w: 168, seats: [470, 515, 560], sensor: false, table: [515, 425], label: [515, 458] }],
  plants: [[45, 45, 22], [45, 300, 20], [150, 476, 20], [585, 478, 14]],
  shelves: []
};

const LAYOUTS = {
  legacy: { id: 'legacy', name: 'Анхны (гал тогоотой)', kitchen: true, ...ORIGINAL_FLOOR },

  // The original interior without the kitchen. The freed corner becomes customer floor.
  classic: {
    id: 'classic', name: 'Сонгодог', kitchen: false, ...ORIGINAL_FLOOR,
    plants: [...ORIGINAL_FLOOR.plants, [640, 290, 16]],
    shelves: [{ x: 744, y: 300, w: 24, h: 180 }]
  },

  // Quiet reading room: two long tables, bookshelves and a measured sofa nook.
  library: {
    id: 'library', name: 'Номын сан', kitchen: false, windows: WINDOWS, windowBar: WINDOW_BAR,
    rug: null,
    round: [{ x: 515, y: 215, dirs: 'NS', zone: 'round', name: 'Дугуй ширээ' }],
    long: [
      { x: 130, y: 170, w: 300, seats: [170, 250, 330, 400], zone: 'long', name: 'Урт ширээ А', label: [280, 246] },
      { x: 130, y: 320, w: 300, seats: [170, 250, 330, 400], zone: 'long', name: 'Урт ширээ Б', label: [280, 396] }
    ],
    sofas: [{ x: 604, y: 466, w: 168, seats: [644, 689, 734], sensor: true, table: [689, 425], label: [689, 458], zone: 'lounge', name: 'Буйдан' }],
    plants: [[45, 45, 22], [150, 476, 20], [585, 478, 14], [470, 470, 16]],
    shelves: [{ x: 30, y: 110, w: 22, h: 300 }, { x: 744, y: 270, w: 24, h: 130 }]
  },

  // Lively café: many round tables.
  social: {
    id: 'social', name: 'Нийгмийн', kitchen: false, windows: WINDOWS, windowBar: WINDOW_BAR,
    rug: [135, 150, 300, 260],
    round: [
      { x: 200, y: 200, dirs: 'NESW', zone: 'round', name: '1-р ширээ' },
      { x: 360, y: 200, dirs: 'NESW', zone: 'round', name: '2-р ширээ' },
      { x: 515, y: 215, dirs: 'NS', zone: 'round', name: '3-р ширээ' },
      { x: 200, y: 360, dirs: 'NESW', zone: 'round', name: '4-р ширээ' },
      { x: 360, y: 360, dirs: 'NESW', zone: 'round', name: '5-р ширээ' },
      { x: 690, y: 330, dirs: 'NESW', zone: 'round', name: '6-р ширээ' }
    ],
    long: [],
    sofas: [{ x: 470, y: 466, w: 168, seats: [510, 555, 600], sensor: true, table: [555, 425], label: [555, 458], zone: 'lounge', name: 'Буйдан' }],
    plants: [[45, 45, 22], [45, 300, 20], [150, 476, 20], [740, 470, 18]],
    shelves: []
  },

  // Calm lounge: sofas with coffee tables.
  lounge: {
    id: 'lounge', name: 'Тухтай', kitchen: false, windows: WINDOWS, windowBar: WINDOW_BAR,
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
    plants: [[45, 45, 22], [45, 300, 20], [370, 300, 16], [585, 290, 14]],
    shelves: []
  },

  // Work-friendly: long desks and a quiet corner desk.
  workspace: {
    id: 'workspace', name: 'Ажлын', kitchen: false, windows: WINDOWS, windowBar: WINDOW_BAR,
    rug: null,
    round: [{ x: 515, y: 215, dirs: 'NS', zone: 'round', name: 'Дугуй ширээ' }],
    long: [
      { x: 160, y: 180, w: 240, seats: [200, 280, 360], zone: 'long', name: 'Урт ширээ А', label: [280, 256] },
      { x: 160, y: 330, w: 240, seats: [200, 280, 360], zone: 'long', name: 'Урт ширээ Б', label: [280, 406] },
      { x: 612, y: 340, w: 150, seats: [650, 724], zone: 'long', name: 'Булангийн ширээ', label: [687, 416] }
    ],
    sofas: [{ x: 430, y: 466, w: 168, seats: [470, 515, 560], sensor: false, table: [515, 425], label: [515, 458] }],
    plants: [[45, 45, 22], [45, 300, 20], [150, 476, 20], [740, 470, 18]],
    shelves: []
  }
};

const LAYOUT_IDS = Object.keys(LAYOUTS).filter(id => id !== 'legacy');

// Demo assignment so neighbouring cafés don't share one interior.
// A server-provided visualization config (cafe.visualization) takes precedence.
const DEMO_LAYOUT = { A: 'classic', I: 'workspace', F: 'social', O: 'workspace', T: 'library', J: 'social', K: 'library', B: 'social', L: 'library', P: 'lounge', Q: 'lounge', H: 'lounge' };

/**
 * Resolve the interior for a café.
 * Accepts a preset id, a full layout object, or a { preset, overrides } config
 * produced by the admin dashboard (and later by an AI-assisted generator).
 */
function resolveLayout(spec, cafe) {
  if (spec && typeof spec === 'object' && !spec.preset && spec.windowBar !== undefined) return spec;
  const config = typeof spec === 'string' ? { preset: spec } : spec || cafe?.visualization?.layout || null;
  const presetId = config?.preset || DEMO_LAYOUT[cafe?.id] || 'classic';
  const base = LAYOUTS[presetId] || LAYOUTS.classic;
  const overrides = config?.overrides && typeof config.overrides === 'object' ? config.overrides : {};
  const pick = key => Array.isArray(overrides[key]) ? overrides[key] : base[key];
  return { ...base, round: pick('round'), long: pick('long'), sofas: pick('sofas'), plants: pick('plants'), shelves: pick('shelves'), rug: 'rug' in overrides ? overrides.rug : base.rug, kitchen: presetId === 'legacy' };
}

export { LAYOUTS, LAYOUT_IDS, DEMO_LAYOUT, resolveLayout };
