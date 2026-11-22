/* Sunny Day Coffee Shop — drawn from the café's photographs.
 *
 * Two rooms divided in the middle by a green-framed glass partition with an opening:
 *  - Front room (left): dark wooden floor, the glass shop front with the entrance, a window bar
 *    with three high stools and a snake plant, the order counter with a cake display, long
 *    wooden tables with a bench along the window wall (brown wooden wall panels between the
 *    windows), the wooden staircase, basket pendant lamps.
 *  - Back room (right): large light tiles, two windows with plants on the sills, square dark
 *    tables with chairs, bulb pendant lamps, and the children's corner: a puzzle mat, a drawing
 *    table, a low book shelf and a puzzle box, next to the painted bookshelf mural and the
 *    children's drawings on the corner walls.
 *
 * This file is plain data in the format the admin layout editor exports ("Дизайн файл (JSON)"):
 * { preset, look, overrides, items }. Objects in `items` come from js/simulation/catalog.js.
 * Positions are approximate; adjust them in the editor and paste the exported JSON back here.
 */
export default {
  id: 'sunny-day',
  name: 'Sunny Day Coffee Shop',
  // Which cafés use this design: their ids, or their names (case and spacing ignored).
  cafes: { ids: [], names: ['Sunny Day', 'Sunny Day Coffee', 'Sunny Day Coffee Shop'] },
  layout: {
    preset: 'minimal',
    look: { name: 'Sunny Day', base: 'minimal', floorStyle: 'tiles', floor: '#EEE9E0', wall: '#3F4A44', wood: '#5B4638', sofa: '#8A6A4F', plant: '#5E9B4E', accent: '#F2B544' },
    overrides: {
      windowBar: null, rug: null, round: [], long: [], sofas: [], chairs: [], plants: [], shelves: [], cuts: null, vip: null,
      door: { side: 'left', at: 455 },
      windows: [
        { side: 'left', a: 60, b: 180 }, { side: 'left', a: 205, b: 365 },
        { side: 'bottom', a: 120, b: 170 }, { side: 'bottom', a: 230, b: 280 },
        { side: 'top', a: 450, b: 540 }, { side: 'top', a: 620, b: 710 }
      ],
      counter: { x: 204, y: 24, w: 176, h: 190, rot: 0 }
    },
    items: [
      // floors of the two rooms
      { id: 'floor-front', type: 'floor', x: 210, y: 262, w: 372, h: 476, style: 'wood', color: '#7B5E4A' },
      { id: 'floor-back', type: 'floor', x: 590, y: 262, w: 372, h: 476, style: 'tiles', color: '#EEE9E0' },
      // the green-framed glass partition with its opening
      { id: 'partition', type: 'wall', name: 'Шилэн хуулт', x: 400, y: 262, w: 476, h: 8, rot: 90, material: 'glass', color: '#4E8B3A', gap: 62, gapw: 70 },

      // front room
      { id: 'window-bar', type: 'bar', name: 'Цонхны баар', x: 46, y: 280, w: 160, h: 20, rot: -90, stools: 3 },
      { id: 'snake-plant', type: 'plant', x: 44, y: 186, w: 26, h: 26, color: '#8BC34A' },
      { id: 'cakes', type: 'display', name: 'Амттаны витрин', x: 120, y: 50, w: 70, h: 34 },
      { id: 'table-long-1', type: 'table', name: 'Урт ширээ 1', x: 135, y: 405, w: 110, h: 36, shape: 'square', n: 2, s: 0, wl: 0, e: 0 },
      { id: 'table-long-2', type: 'table', name: 'Урт ширээ 2', x: 255, y: 405, w: 110, h: 36, shape: 'square', n: 2, s: 0, wl: 0, e: 0 },
      { id: 'bench', type: 'bench', name: 'Вандан сандал', x: 195, y: 484, w: 230, h: 18, seats: 4 },
      { id: 'panel-1', type: 'panel', x: 92, y: 492, w: 50, h: 8, color: '#7A4E2D' },
      { id: 'panel-2', type: 'panel', x: 200, y: 492, w: 56, h: 8, color: '#7A4E2D' },
      { id: 'panel-3', type: 'panel', x: 300, y: 492, w: 36, h: 8, color: '#7A4E2D' },
      { id: 'stairs', type: 'stairs', x: 352, y: 440, w: 64, h: 110 },
      { id: 'lamp-basket-1', type: 'lamp', x: 76, y: 236, w: 60, h: 60, style: 'basket' },
      { id: 'lamp-basket-2', type: 'lamp', x: 76, y: 326, w: 60, h: 60, style: 'basket' },
      { id: 'lamp-front', type: 'lamp', x: 195, y: 395, w: 120, h: 80, style: 'bulbs' },
      { id: 'label-bar', type: 'label', x: 130, y: 210, w: 110, h: 20, text: 'Цонхны баар' },

      // back room
      { id: 'sill-plant-1', type: 'plant', x: 495, y: 40, w: 22, h: 22, color: '#F4B6C2' },
      { id: 'sill-plant-2', type: 'plant', x: 665, y: 40, w: 22, h: 22, color: '#F4B6C2' },
      { id: 'table-1', type: 'table', name: '1-р ширээ', x: 480, y: 120, w: 56, h: 56, shape: 'square', n: 0, s: 1, wl: 1, e: 1 },
      { id: 'table-2', type: 'table', name: '2-р ширээ', x: 650, y: 120, w: 56, h: 56, shape: 'square', n: 0, s: 1, wl: 1, e: 1 },
      { id: 'table-3', type: 'table', name: '3-р ширээ', x: 480, y: 290, w: 56, h: 56, shape: 'square', n: 1, s: 1, wl: 0, e: 1 },
      { id: 'table-4', type: 'table', name: '4-р ширээ', x: 650, y: 290, w: 56, h: 56, shape: 'square', n: 1, s: 1, wl: 1, e: 1 },
      { id: 'table-5', type: 'table', name: '5-р ширээ', x: 700, y: 440, w: 100, h: 56, shape: 'square', n: 2, s: 0, wl: 1, e: 0 },
      { id: 'lamp-back', type: 'lamp', x: 565, y: 205, w: 130, h: 110, style: 'bulbs' },

      // children's corner and the painted walls
      { id: 'kids-mat', type: 'kids-mat', name: 'Пазлын хивс', x: 500, y: 440, w: 140, h: 100 },
      { id: 'kids-table', type: 'kids-table', x: 500, y: 438, w: 60, h: 40 },
      { id: 'kids-books', type: 'kids-books', x: 520, y: 486, w: 96, h: 14 },
      { id: 'puzzle-box', type: 'toys', x: 446, y: 468, w: 34, h: 26 },
      { id: 'mural-books', type: 'mural', name: 'Ном зурсан хана', x: 766, y: 380, w: 150, h: 12, rot: 90, style: 'books' },
      { id: 'mural-drawings', type: 'mural', name: 'Хүүхдийн зураг', x: 690, y: 490, w: 120, h: 10, style: 'drawings' },
      { id: 'label-kids', type: 'label', x: 500, y: 378, w: 130, h: 20, text: 'Хүүхдийн булан' }
    ]
  }
};
