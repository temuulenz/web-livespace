// Owner / staff menu editor: add, edit, delete, photo preview, ₮ price, category and the
// «өнөөдөр байгаа» toggle. Everything goes through the customer adapter (the mock keeps
// it in this browser's localStorage until the menu API is connected).
import { Component, html, raw, readForm } from '../../../framework/index.js';
import { I } from '../../icons.js';
import { Snd } from '../../audio.js';
import { toast } from '../../components/feedback.js';
import { customer } from '../../services/customer-adapter.js';
import { formatMNT, parsePrice, validateMenuItem, imageError, MENU_CATEGORIES, IMAGE_TYPES, NAME_MAX } from '../../services/customer-rules.js';
import { menuPhoto } from './menu-view.js';

// Shrink a photo before storing it, so a 2 MB upload becomes a light thumbnail.
async function photoDataURL(file, max = 640) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close?.();
      const webp = canvas.toDataURL('image/webp', .82);
      return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', .82);
    } catch { /* fall back to the original file below */ }
  }
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
}

const EDITOR_LABEL = { owner: 'Эзэмшигч', staff: 'Ажилтан', admin: 'LiveSpace админ' };
const ROLE_NOTE = {
  admin: 'Кафе эзэмшигчээс авсан цэсийн мэдээллийг энд оруулж, засна. Эзэмшигч өөрөө ч өөрийн самбараас засах боломжтой; мөр бүр хэн сүүлд өөрчилснийг харуулна.',
  owner: 'Цэсээ өөрөө оруулж, засах боломжтой. Хүсвэл цэсийн мэдээллээ LiveSpace багт илгээхэд админ оруулж өгнө.',
  staff: 'Өнөөдөр дууссан бүтээгдэхүүнийг «Өнөөдөр байгаа» товчоор унтраана уу.'
};
const fld = (errors, name, label, control, extra = '') => html`<div class="fld${errors[name] ? ' err' : ''}${raw(extra)}"><label for="me-${name}">${label}</label>${control}<span class="em" role="alert">${errors[name] || ''}</span></div>`;

export class MenuEditor extends Component {
  initialState() { return { items: null, error: '', editing: null, errors: {}, photo: null, busy: false, confirmDelete: null }; }
  events() {
    return {
      'click [data-me-new]': () => this.edit('new'),
      'click [data-me-edit]': (e, b) => this.edit(b.dataset.meEdit),
      'click [data-me-cancel]': () => { Snd.ui('click'); this.setState({ editing: null, errors: {}, photo: null }); },
      'submit .me-form': e => { e.preventDefault(); this.save(e.target); },
      'change [data-me-file]': (e, input) => this.pickPhoto(input),
      'click [data-me-photo-clear]': () => { Snd.ui('click'); this.setState({ photo: null, errors: { ...this.state.errors, photo: '' } }); },
      'click [data-me-avail]': (e, b) => this.toggle(b.dataset.meAvail, b.getAttribute('aria-checked') !== 'true'),
      'click [data-me-del]': (e, b) => { Snd.ui('click'); this.setState({ confirmDelete: b.dataset.meDel }); },
      'click [data-me-del-no]': () => this.setState({ confirmDelete: null }),
      'click [data-me-del-yes]': (e, b) => this.remove(b.dataset.meDelYes)
    };
  }
  onMount() { this.onCleanup(customer.subscribe(() => this.load())); this.load(); }
  async load() {
    try { this.setState({ items: await customer.menu.list(this.props.cafeId), error: '' }); }
    catch (error) { this.setState({ error: error.message || 'Цэс ачаалж чадсангүй' }); }
  }
  item(id) { return this.state.items?.find(item => item.id === id); }
  // Who is editing: 'owner' (café owner), 'staff' or 'admin' (LiveSpace team entering the owner's menu).
  role() { return EDITOR_LABEL[this.props.editor] ? this.props.editor : 'owner'; }
  edit(id) {
    Snd.ui('whoosh');
    this.setState({ editing: id, errors: {}, photo: id === 'new' ? null : this.item(id)?.photo ?? null, confirmDelete: null });
    this.timeout(() => { const form = this.$('.me-form'); form?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); this.$('#me-name')?.focus(); }, 30);
  }
  async pickPhoto(input) {
    const file = input.files?.[0]; input.value = '';
    if (!file) return;
    const problem = imageError(file);
    if (problem) { Snd.ui('err'); this.setState({ errors: { ...this.state.errors, photo: problem } }); return; }
    try { this.setState({ photo: await photoDataURL(file), errors: { ...this.state.errors, photo: '' } }); }
    catch { Snd.ui('err'); this.setState({ errors: { ...this.state.errors, photo: 'Зургийг уншиж чадсангүй' } }); }
  }
  async save(form) {
    const values = readForm(form);
    const errors = validateMenuItem(values);
    if (Object.keys(errors).length) { Snd.ui('err'); this.setState({ errors }); return; }
    const editing = this.state.editing;
    this.setState({ busy: true });
    try {
      await customer.menu.save(this.props.cafeId, { id: editing === 'new' ? undefined : editing, name: values.name, price: parsePrice(values.price), category: values.category, photo: this.state.photo, available: !!values.available, editedBy: this.role() });
      Snd.ui('chime'); toast(editing === 'new' ? `«${values.name}» цэсэнд нэмэгдлээ` : `«${values.name}» хадгалагдлаа`, true);
      this.setState({ editing: null, errors: {}, photo: null, busy: false });
    } catch (error) {
      Snd.ui('err'); this.setState({ busy: false, errors: error.details || {} }); toast(error.message);
    }
  }
  async toggle(id, available) {
    const item = this.item(id); if (!item) return;
    Snd.ui('click');
    try { await customer.menu.setAvailable(this.props.cafeId, id, available, this.role()); toast(available ? `«${item.name}» өнөөдөр байгаа` : `«${item.name}» — Дууссан`, available); }
    catch (error) { Snd.ui('err'); toast(error.message); }
  }
  async remove(id) {
    const item = this.item(id);
    try { await customer.menu.remove(this.props.cafeId, id); Snd.ui('click'); toast(`«${item?.name}» цэснээс хасагдлаа`); this.setState({ confirmDelete: null, editing: this.state.editing === id ? null : this.state.editing }); }
    catch (error) { Snd.ui('err'); toast(error.message); }
  }

  formHTML() {
    const { editing, errors, photo, busy } = this.state;
    const item = editing === 'new' ? { name: '', price: '', category: '', available: true } : this.item(editing);
    if (!item) return '';
    const preview = photo ? photo : menuPhoto({ category: item.category || 'Кофе' });
    return html`<form class="form me-form" novalidate data-key="me-form-${editing}">
      <h3 class="me-form-h">${editing === 'new' ? 'Шинэ бүтээгдэхүүн' : 'Бүтээгдэхүүн засах'}</h3>
      <div class="fld full me-photo${errors.photo ? ' err' : ''}">
        <img src="${preview}" alt="Зургийн урьдчилсан харагдац" width="116" height="88" class="${photo ? '' : 'is-placeholder'}">
        <div class="me-photo-act"><label class="btn btn-o">${raw(I.photo)} Зураг сонгох<input type="file" accept="${IMAGE_TYPES.join(',')}" data-me-file hidden></label>
          ${photo ? html`<button type="button" class="btn btn-g" data-me-photo-clear>Зураг арилгах</button>` : ''}
          <small class="muted">JPG, PNG, WEBP · 2 МБ хүртэл</small><span class="em" role="alert">${errors.photo || ''}</span></div>
      </div>
      ${fld(errors, 'name', 'Нэр', html`<input id="me-name" name="name" maxlength="${NAME_MAX + 10}" value="${item.name}" placeholder="Жишээ нь: Латте" autocomplete="off">`)}
      ${fld(errors, 'price', 'Үнэ (₮)', html`<div class="me-price"><input id="me-price" name="price" inputmode="numeric" value="${item.price}" placeholder="8500" autocomplete="off"><span aria-hidden="true">₮</span></div>`)}
      ${fld(errors, 'category', 'Ангилал', html`<select id="me-category" name="category"><option value="">Сонгох…</option>${MENU_CATEGORIES.map(c => html`<option value="${c}" ${raw(c === item.category ? 'selected' : '')}>${c}</option>`)}</select>`)}
      <div class="fld me-check"><label><input type="checkbox" name="available" ${raw(item.available ? 'checked' : '')}> Өнөөдөр байгаа</label><small class="muted">Унтраавал нийтийн цэсэнд «Дууссан» гэж харагдана.</small></div>
      <div class="fld full me-actions"><button class="btn btn-p" ${raw(busy ? 'disabled' : '')}>${busy ? 'Хадгалж байна…' : 'Хадгалах'}</button><button type="button" class="btn btn-g" data-me-cancel>Болих</button></div>
    </form>`;
  }
  rowHTML(item) {
    const confirming = this.state.confirmDelete === item.id;
    return html`<li class="me-row${item.available ? '' : ' is-out'}" data-key="me-${item.id}">
      <img src="${menuPhoto(item)}" alt="" width="58" height="44" loading="lazy" decoding="async">
      <div class="me-info"><b>${item.name}</b><small class="muted"><span class="num">${formatMNT(item.price)}</span>${item.available ? '' : ' · Дууссан'}${item.editedBy ? html` · <span class="me-by me-by-${item.editedBy}">${EDITOR_LABEL[item.editedBy]} засварласан</span>` : ''}</small></div>
      <div class="me-avail"><span>Өнөөдөр байгаа</span><button class="sw" role="switch" data-me-avail="${item.id}" aria-checked="${item.available}" aria-label="${item.name} өнөөдөр байгаа"></button></div>
      <div class="me-btns">${confirming
        ? html`<span class="me-ask">Устгах уу?</span><button class="btn btn-g me-danger" data-me-del-yes="${item.id}">Тийм</button><button class="btn btn-g" data-me-del-no>Үгүй</button>`
        : html`<button class="btn btn-g" data-me-edit="${item.id}">Засах</button><button class="btn btn-g" data-me-del="${item.id}" aria-label="${item.name} устгах">Устгах</button>`}</div>
    </li>`;
  }
  render() {
    const { items, error, editing } = this.state;
    const head = html`<div class="card-h"><h2>${raw(I.cup)} Цэс засах</h2>${customer.mode === 'mock' ? html`<span class="badge b-demo">ДЕМО</span>` : ''}
      <div class="r"><button class="btn btn-p me-new" data-me-new ${raw(editing === 'new' ? 'disabled' : '')}>${raw(I.plus)} Шинэ бүтээгдэхүүн</button></div></div>`;
    if (error) return html`${head}<p class="muted">${error}</p>`;
    if (!items) return html`${head}<div class="skel" style="height:160px"></div>`;
    const note = html`<p class="muted me-note">${ROLE_NOTE[this.role()]}${customer.mode === 'mock' ? ' Демо: өөрчлөлт зөвхөн энэ хөтөч дээр хадгалагдана.' : ''}</p>`;
    return html`${head}${note}${editing ? this.formHTML() : ''}
      ${items.length ? MENU_CATEGORIES.filter(c => items.some(i => i.category === c)).map(c => html`<section class="me-group" data-key="meg-${c}"><h3>${c}</h3><ul class="me-list">${items.filter(i => i.category === c).map(i => this.rowHTML(i))}</ul></section>`)
        : html`<p class="muted">Цэс хоосон байна. «Шинэ бүтээгдэхүүн» товчоор нэмнэ үү.</p>`}`;
  }
}
