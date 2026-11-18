// Public café menu: photo, name, ₮ price, grouped by category. Items marked
// «өнөөдөр байхгүй» stay visible but greyed with a «Дууссан» label.
import { Component, html, raw } from '../../../framework/index.js';
import { I } from '../../icons.js';
import { Snd } from '../../audio.js';
import { customer } from '../../services/customer-adapter.js';
import { formatMNT, groupMenu, MENU_CATEGORIES } from '../../services/customer-rules.js';

// Items without a photo get a small drawing in the site's own palette.
const BG = { 'Кофе': '#F4E5CC', 'Цай': '#F8EEDD', 'Ундаа': '#FBF4E8', 'Амттан': '#EFDABA', 'Хоол': '#E9CEA6' };
const ART = {
  'Кофе': '<path d="M38 34h40v18a20 20 0 0 1-20 20h0a20 20 0 0 1-20-20z" fill="#FFF9EC" stroke="#7B542F" stroke-width="3"/><path d="M78 39h5a7 7 0 0 1 0 14h-5" fill="none" stroke="#7B542F" stroke-width="3"/><ellipse cx="58" cy="36" rx="17" ry="3.5" fill="#B6771D"/><path d="M52 36c3-3 9-3 12 0" stroke="#FFF4DC" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M50 14c-3 4 3 7 0 12M62 12c-3 4 3 7 0 12" stroke="#B6771D" stroke-width="2.5" fill="none" stroke-linecap="round"/><ellipse cx="58" cy="76" rx="30" ry="4" fill="#7B542F" opacity=".25"/>',
  'Цай': '<path d="M36 40h44v12a22 22 0 0 1-44 0z" fill="#FFF9EC" stroke="#7B542F" stroke-width="3"/><path d="M80 44h4a6 6 0 0 1 0 12h-5" fill="none" stroke="#7B542F" stroke-width="3"/><path d="M58 40V20" stroke="#7B542F" stroke-width="1.5"/><rect x="53" y="12" width="10" height="9" rx="1.5" fill="#FF9D00"/><ellipse cx="58" cy="76" rx="30" ry="4" fill="#7B542F" opacity=".25"/>',
  'Ундаа': '<path d="M42 22h32l-5 52H47z" fill="#FFF9EC" stroke="#7B542F" stroke-width="3" stroke-linejoin="round"/><path d="M45 40h26l-3 32H48z" fill="#FFCF71"/><path d="M62 10l-6 40" stroke="#B6771D" stroke-width="3.5" stroke-linecap="round"/><circle cx="66" cy="27" r="7" fill="#FF9D00" stroke="#7B542F" stroke-width="2"/><ellipse cx="58" cy="78" rx="24" ry="3.5" fill="#7B542F" opacity=".25"/>',
  'Амттан': '<path d="M28 58 82 40v26H28z" fill="#FFF4DC" stroke="#7B542F" stroke-width="3" stroke-linejoin="round"/><path d="M28 58 82 40v8L28 66z" fill="#B6771D"/><path d="M28 58c18-4 36-11 54-18" stroke="#7B542F" stroke-width="3" fill="none"/><circle cx="70" cy="35" r="5" fill="#FF9D00"/><ellipse cx="56" cy="74" rx="34" ry="4" fill="#7B542F" opacity=".25"/>',
  'Хоол': '<path d="M26 44h64a32 22 0 0 1-64 0z" fill="#FFF9EC" stroke="#7B542F" stroke-width="3"/><path d="M34 44c4-10 12-14 18-10 6-8 16-6 20 2 6-2 12 2 12 8" fill="#FFCF71" stroke="#B6771D" stroke-width="2.5"/><circle cx="48" cy="40" r="3" fill="#7A8A4E"/><circle cx="66" cy="38" r="3" fill="#7A8A4E"/><ellipse cx="58" cy="76" rx="30" ry="4" fill="#7B542F" opacity=".25"/>'
};
export const menuPhoto = item => item.photo || `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 116 88"><rect width="116" height="88" fill="${BG[item.category] || '#F4E5CC'}"/>${ART[item.category] || ART['Кофе']}</svg>`)}`;

export const menuItemHTML = item => html`<article class="menu-item${item.available ? '' : ' is-out'}" data-key="mi-${item.id}">
  <img src="${menuPhoto(item)}" alt="" loading="lazy" decoding="async" width="116" height="88">
  <div class="menu-txt"><b>${item.name}</b><span class="menu-price num">${formatMNT(item.price)}</span></div>
  ${item.available ? '' : html`<span class="menu-out">Дууссан</span>`}
</article>`;

export class MenuSection extends Component {
  initialState() { return { items: null, error: '', cat: 'all' }; }
  events() {
    return {
      'click [data-menu-cat]': (e, b) => { Snd.ui('click'); this.setState({ cat: b.dataset.menuCat }); },
      'click [data-menu-retry]': () => this.load()
    };
  }
  onMount() { this.onCleanup(customer.subscribe(() => this.load())); this.load(); }
  async load() {
    try { this.setState({ items: await customer.menu.list(this.props.cafeId), error: '' }); }
    catch (error) { this.setState({ error: error.message || 'Цэс ачаалж чадсангүй' }); }
  }
  render() {
    const { items, error, cat } = this.state;
    const demo = customer.mode === 'mock';
    const head = html`<div class="card-h"><h2>${raw(I.cup)} Цэс</h2>${demo ? html`<span class="badge b-demo">ТУРШИЛТЫН ЦЭС</span>` : html`<span class="badge b-live">ХАДГАЛСАН ЦЭС</span>`}</div>`;
    if (error) return html`${head}<p class="muted" role="alert">${error}</p><button class="btn btn-o" data-menu-retry>Дахин оролдох</button>`;
    if (!items) return html`${head}<div class="skel" style="height:140px"></div>`;
    if (!items.length) return html`${head}<p class="muted">Энэ кафе цэсээ хараахан оруулаагүй байна.</p>`;
    const groups = groupMenu(items), cats = groups.map(([c]) => c);
    const shown = cat === 'all' || !cats.includes(cat) ? groups : groups.filter(([c]) => c === cat);
    const out = items.filter(item => !item.available).length;
    return html`${head}
      <p class="muted menu-note">${demo ? 'Жишээ цэс · эзэмшигчийн хадгалсан өөрчлөлт биш. ' : ''}Үнэ төгрөгөөр${out ? html` · <span class="menu-out-k">Дууссан</span> — өнөөдөр байхгүй` : ''} · Төлбөрийг кафе дээр төлнө.</p>
      ${cats.length > 1 ? html`<div class="chips menu-cats" role="group" aria-label="Цэсийн ангилал">
        <button class="chip" data-menu-cat="all" aria-pressed="${cat === 'all' || !cats.includes(cat)}">Бүгд</button>
        ${MENU_CATEGORIES.filter(c => cats.includes(c)).map(c => html`<button class="chip" data-menu-cat="${c}" aria-pressed="${c === cat}">${c}</button>`)}</div>` : ''}
      ${shown.map(([category, list]) => html`<section class="menu-group" data-key="mg-${category}"><h3>${category}</h3><div class="menu-grid">${list.map(menuItemHTML)}</div></section>`)}`;
  }
}
