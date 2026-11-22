# Floor-plan editor and café designs

Frontend only. No server, API, database or Cloudflare change. The engine, the frozen simulation fixtures and the original stylesheets are unchanged for existing layouts.

## Pieces

| File | Role |
| --- | --- |
| `js/simulation/catalog.js` | Object catalogue. Each type is defined in one place: size and limits, whether it turns, what blocks the walkway, its seats, and how it is drawn. It also holds the shared geometry and the resizable/rotatable order counter (`counterBox`, `counterPoint`) and the item whitelist (`sanitizeItems`). |
| `js/simulation/designs/*.js` | One file per café design: `{ id, name, cafes: { ids, names }, layout }`. `designs/index.js` lists them. |
| `js/simulation/layouts.js` | `resolveLayout` also accepts `{ design: id }` and `items`. A café listed in a design's `cafes` is drawn from that design everywhere (public page, owner dashboard, admin editor), ahead of the server template. A template given explicitly as a string still wins. |
| `js/simulation/floor-plan.js` | Small hooks: item seats, item obstacles (turned rectangles), per-layer item drawing, and the counter transform. Without items, and with the default counter, every original code path and random-number sequence is unchanged. |
| `js/features/admin-dashboard/layout-editor.js` | The editor (see below). |
| `styles/floor-editor.css` | Editor-only styles, loaded by the editor module. |

## Catalogue

Items are `{ id, type, x, y, w, h, rot, ...props }`, where `x, y` is the centre in the 800×520 world and `rot` is in degrees. Seats and drawings are defined in the item's own frame and turn with it.

The catalogue contains these types:

- **Furniture:** `table` (square/round, chairs per side), `chair`, `sofa`, `bench`, `bar` (with stools), `shelf`, `display`.
- **Children's corner:** `kids-mat`, `kids-table`, `kids-books`, `toys`.
- **Room:** `floor` (an area with its own floor style), `wall` (inner wall or framed glass partition with an opening), `panel` (wooden wall cladding), `mural` (painted bookshelf or children's drawings), `stairs`.
- **Decoration:** `plant`, `rug`, `lamp`, `label`.

Layers are drawn in this order: `floor0` → `floor` → `wall` → `object` → `overhead`.

To add a type, add one entry to `CATALOG`. The engine and the editor need no change.

## Editor

Existing controls and selectors are unchanged (templates, looks, `data-le-add`, `data-le-act`, keyboard). The editor adds:

- Handles on the selected object. Corner and edge handles change width and length separately, with the opposite edge held in place. The round knob turns the object; Shift snaps to 15°. Sizes snap to 5 and moves to 10 while «Сүлжээнд наалдах» is on.
- A side panel with exact X/Y, width, length, angle, name and the type's own settings.
- The order counter can be resized and turned. The queue spot, barista walk, steam and walkway follow it.
- Classic objects that cannot turn by themselves (round/long table, sofa, chair, shelf, plant, rug, window bar) become equivalent free-form items when turned.
- Undo/redo (Ctrl+Z, Ctrl+Y), duplicate (Ctrl+D), zoom with drag-to-pan, and «Бүгдийг томсгох/жижигрүүлэх».
- «Кафены дизайн» lists the design files. «Дизайн файл (JSON)» exports and imports a whitelisted config. An unsaved draft is kept per café in `localStorage` and can be restored.
- The walkway warning covers the new shapes, because it reads the same grid the visitors use.

## Saving: what goes where

«Хадгалах» still sends `{ preset, overrides }` to the existing API. The server's `sanitizeLayout` keeps only the classic objects and the counter position; this is unchanged. Free-form items, the counter's size and angle, the room (entrance, windows, corners, VIP) and new looks are kept in a design file:

1. Arrange the café in the editor and open «Дизайн файл (JSON)» → «JSON гаргах».
2. Save it as `js/simulation/designs/<name>.js`:

   ```js
   export default {
     id: '<name>',
     name: '…',
     cafes: { ids: ['<café id>'], names: [] },
     layout: <JSON>
   };
   ```

   Then add it to `designs/index.js`.

The requested server whitelist is in [BACKEND_REQUESTS.md](BACKEND_REQUESTS.md) §4.

## Sunny Day Coffee Shop

`designs/sunny-day.js` was drawn from the café's photographs. Positions are approximate; refine them in the editor.

- **Front room:** dark wooden floor; shop-front glass with the entrance; a window bar with three stools and a snake plant; the counter with a cake display; long tables with a bench; wooden wall panels; stairs; basket lamps.
- **Back room:** light tiles; two windows with plants; five dark square tables; bulb lamps.
- **Partition:** a green-framed glass partition with an opening separates the rooms.
- **Children's corner:** puzzle mat, drawing table, low book shelf, puzzle box, the painted-bookshelf mural and the children's drawings.

The design is matched by café name («Sunny Day», «Sunny Day Coffee», «Sunny Day Coffee Shop»). Put the real café id into `cafes.ids` once it is known.

## Tests

- `tests/floor-catalog.test.mjs` (part of `npm test`) covers:
  - catalogue completeness and the whitelist
  - turned geometry and seats
  - glass partition walkway and decorative vs solid objects
  - the resized/rotated counter
  - unchanged default paths and the server keeping only the classic part
  - design matching and export round trip
  - Sunny Day reachability, seat spacing and the simulation
- `node tests/floor-editor.mjs` runs a real Chromium/Edge check of the editor: handles, angle snap, undo/redo, panel, counter, conversion, duplicate/grow/delete, zoom/scale, JSON import/export, draft, design list, phone width. Screenshots go to `.artifacts/floor-editor/`. Set `BROWSER_PATH` if Edge is not at its default path.
