/* Café design files.
 *
 * A design is one café's own interior, kept as a data file next to this one and exported
 * from the admin layout editor ("Дизайн файл (JSON)"). The server stores only the template
 * and the classic objects ({ preset, overrides }), so designs with free-form objects live here.
 *
 * To add a café: export its JSON in the editor, save it as `designs/<name>.js`
 * (`export default { id, name, cafes: { ids, names }, layout }`) and list it below.
 * A café listed in `cafes` is drawn from its design everywhere: the public page, the owner
 * dashboard and the admin editor.
 */
import sunnyDay from './sunny-day.js';

const DESIGNS = Object.fromEntries([sunnyDay].map(design => [design.id, design]));

const normalize = name => String(name || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const designOf = id => typeof id === 'string' && Object.hasOwn(DESIGNS, id) ? DESIGNS[id] : null;
function designFor(cafe) {
  if (!cafe) return null;
  const name = normalize(cafe.name);
  return Object.values(DESIGNS).find(d => d.cafes?.ids?.includes(cafe.id) || (name && d.cafes?.names?.some(n => normalize(n) === name))) || null;
}

export { DESIGNS, designOf, designFor };
