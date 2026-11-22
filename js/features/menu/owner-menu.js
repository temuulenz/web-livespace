import { Component, html, raw } from '../../../framework/index.js';
import { platform } from '../../services/platform.js';
import { formatMNT } from '../../services/customer-rules.js';

const groups = [['products', 'Бүтээгдэхүүн'], ['categories', 'Ангилал'], ['variants', 'Сонголт'], ['promotions', 'Урамшуулал']];
const label = key => groups.find(g => g[0] === key)[1];
const selected = yes => raw(yes ? 'selected' : '');
const checked = yes => raw(yes ? 'checked' : '');
const catalogPath = (id, kind) => '/owner/cafes/' + encodeURIComponent(id) + (kind === 'promotions' ? '/promotions' : '/menu/' + kind);
const itemPath = (id, kind, entity) => catalogPath(id, kind) + '/' + encodeURIComponent(entity);
const ubDate = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Ulaanbaatar', dateStyle: 'short', timeStyle: 'short'
});
const ubOffset = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Ulaanbaatar', timeZoneName: 'longOffset' });
const timeInput = iso => iso ? ubDate.format(new Date(iso)).replace(' ', 'T') : '';
function mongoliaISO(value) {
  const probe = new Date(value + ':00Z');
  const offset = ubOffset.formatToParts(probe).find(part => part.type === 'timeZoneName').value.slice(3) || 'Z';
  return new Date(value + ':00' + offset).toISOString();
}

export class OwnerMenu extends Component {
  initialState() { return { kind: 'products', rows: null, edit: null, confirm: null, saving: false, error: '', note: '', lookup: {}, offset: 0, more: false }; }
  events() {
    return {
      'click [data-om-kind]': (e, b) => this.open(b.dataset.omKind),
      'click [data-om-new]': () => this.setState({ edit: {}, error: '', note: '' }),
      'click [data-om-edit]': (e, b) => this.setState({ edit: this.state.rows.find(row => row.id === b.dataset.omEdit), error: '', note: '' }),
      'click [data-om-cancel]': () => this.setState({ edit: null, confirm: null, error: '' }),
      'click [data-om-ask]': (e, b) => this.setState({ confirm: b.dataset.omAsk, error: '' }),
      'click [data-om-archive]': (e, b) => this.archive(b.dataset.omArchive),
      'click [data-om-retry]': () => { this.setState({ edit: null, confirm: null }); this.load() },
      'click [data-om-page]': (e, b) => this.open(this.state.kind, Number(b.dataset.omPage)),
      'submit [data-om-form]': e => { e.preventDefault(); this.save(e.target) },
      'submit [data-om-image]': e => { e.preventDefault(); this.saveImage(e.target) },
      'click [data-om-remove-image]': () => this.saveImage(null)
    };
  }
  onMount() {
    this.controller = new AbortController();
    this.onCleanup(() => this.controller.abort());
    this.load();
  }
  async open(kind, offset = 0) {
    this.setState({ kind, offset, rows: null, edit: null, confirm: null, error: '', note: '' });
    this.load();
  }
  async load() {
    const { kind, offset, lookup } = this.state, cafe = this.props.cafeId;
    const previous = this.loadVersion = (this.loadVersion || 0) + 1;
    const opts = { signal: this.controller.signal };
    const apply = () => !opts.signal.aborted && previous === this.loadVersion;
    try {
      const relation = kind === 'products' ? 'categories' : kind === 'variants' ? 'products' : '';
      const [data, related] = await Promise.all([
        platform.api.get(catalogPath(cafe, kind) + '?limit=50&offset=' + offset, opts),
        relation ? platform.api.get(catalogPath(cafe, relation) + '?limit=100', opts) : null
      ]);
      if (apply()) this.setState({
        rows: data.items, more: data.pagination?.has_more || false,
        lookup: relation ? { ...lookup, [relation]: related.items } : lookup, error: ''
      });
    } catch (err) {
      if (apply()) this.setState({ rows: [], error: err.status === 404 ? 'Энэ кафены цэсийг өөрчлөх эрх эсвэл мэдээлэл алга.' : 'Мэдээллийг ачаалж чадсангүй.' });
    }
  }
  async write(operation, { keepEditing = false } = {}) {
    if (this.state.saving) return;
    const signal = this.controller.signal;
    this.setState({ saving: true, error: '', note: '' });
    try {
      const data = await operation({ signal });
      if (!signal.aborted) {
        this.setState({ saving: false, edit: keepEditing ? data.item : null, confirm: null, note: 'Өөрчлөлт хадгалагдлаа.' });
        await this.load();
      }
    } catch (err) {
      if (!signal.aborted) this.setState({ saving: false, error: err.status === 409 ? 'Мэдээлэл өөрчлөгдсөн байна. Дахин ачаалж, өөрчлөлтөө шалгана уу.' : err.message || 'Өөрчлөлт хадгалагдсангүй.' });
    }
  }
  async save(form) {
    const { kind, edit } = this.state, values = new FormData(form);
    const text = key => String(values.get(key) || '').trim();
    const number = key => Number(values.get(key));
    const cafe = this.props.cafeId;
    let input;
    try {
      const name = text('name'), description = text('description');
      switch (kind) {
        case 'categories': input = { name, description, published: values.has('published') }; break;
        case 'products': input = {
          name, description, category_id: text('category_id'), base_price: number('base_price'),
          discounted_price: text('discounted_price') ? number('discounted_price') : null,
          published: values.has('published'), featured: values.has('featured')
        }; break;
        case 'variants': input = { name, product_id: text('product_id'), price: number('price'), active: values.has('active') }; break;
        case 'promotions': input = {
          title: name, description, terms: text('terms'), starts_at: mongoliaISO(text('starts_at')), ends_at: mongoliaISO(text('ends_at')),
          published: values.has('published'), ...(edit.id ? {} : { type: 'percentage', discount_value: number('discount_value') })
        }; break;
      }
      if (!name) throw new Error('Нэр оруулна уу.');
    } catch (error) { this.setState({ error: error.message }); return }
    await this.write(opts => edit.id
      ? platform.api.patch(itemPath(cafe, kind, edit.id), { ...input, version: edit.version }, opts)
      : platform.api.post(catalogPath(cafe, kind), input, opts));
  }
  archive(id) {
    const { kind, rows } = this.state, item = rows.find(row => row.id === id);
    if (!item) return;
    const path = itemPath(this.props.cafeId, kind, id);
    if (kind === 'products') return this.write(opts => platform.api.patch(path, { version: item.version, archived: true, published: false }, opts));
    if (kind === 'variants') return this.write(opts => platform.api.patch(path, { version: item.version, active: false }, opts));
    return this.write(opts => platform.api.request('DELETE', path, kind === 'promotions' ? { version: item.version } : undefined, opts));
  }
  saveImage(form) {
    const item = this.state.edit;
    if (!item?.id) return;
    const path = itemPath(this.props.cafeId, 'products', item.id) + '/image';
    const file = form ? new FormData(form).get('photo') : null;
    if (form && (!file?.size || file.size > 1048576 || !['image/jpeg','image/png','image/webp'].includes(file.type))) {
      this.setState({ error: 'JPEG, PNG эсвэл WebP зураг сонгоно уу. 1 МБ хүртэл.' });
      return;
    }
    return this.write(async opts => {
      if (!file) return platform.api.request('DELETE', path, { version: item.version }, opts);
      const image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      if (opts.signal.aborted) return;
      return platform.api.put(path, { image, version: item.version }, opts);
    }, { keepEditing: true });
  }
  form() {
    const { kind, edit, lookup, saving } = this.state;
    const rel = (name, legend, rows) => html`<label>${legend}<select name="${name}" required><option value="">Сонгох…</option>
      ${rows?.map(row => html`<option value="${row.id}" ${selected(row.id === edit[name])}>${row.name}</option>`)}</select></label>`;
    const price = (name, legend, required = true) => html`<label>${legend}<input name="${name}" type="number" min="0" max="1000000000" step="1" value="${edit[name] ?? ''}" ${raw(required ? 'required' : '')}></label>`;
    return html`<div class="om-editor" data-key="om-${kind}-${edit.id || 'new'}"><form class="business-form" data-om-form>
      <h3>${edit.id ? 'Мэдээлэл засах' : 'Шинэ бүртгэл'}</h3>
      <label>Нэр<input name="name" value="${edit.name || edit.title || ''}" maxlength="120" required></label>
      ${kind !== 'variants' ? html`<label>Тайлбар<textarea name="description" maxlength="2000">${edit.description || ''}</textarea></label>` : ''}
      ${kind === 'products' ? html`${rel('category_id', 'Ангилал', lookup.categories)}${price('base_price', 'Үндсэн үнэ (₮)')}${price('discounted_price', 'Хямдарсан үнэ (₮)', false)}
        <label class="business-check"><input name="featured" type="checkbox" ${checked(edit.featured)}>Онцлох бүтээгдэхүүн</label>` : ''}
      ${kind === 'variants' ? html`${rel('product_id', 'Бүтээгдэхүүн', lookup.products)}${price('price', 'Үнэ (₮)')}
        <label class="business-check"><input name="active" type="checkbox" ${checked(edit.active ?? true)}>Идэвхтэй</label>` : ''}
      ${kind === 'promotions' ? html`<label>Нөхцөл<textarea name="terms" maxlength="2000">${edit.terms || ''}</textarea></label>
        ${!edit.id ? html`<label>Хямдрал (%)<input name="discount_value" type="number" min="1" max="100" required></label>` : ''}
        <label>Эхлэх огноо, цаг (Улаанбаатар)<input type="datetime-local" name="starts_at" value="${timeInput(edit.starts_at)}" required></label>
        <label>Дуусах огноо, цаг (Улаанбаатар)<input type="datetime-local" name="ends_at" value="${timeInput(edit.ends_at)}" required></label>` : ''}
      ${kind !== 'variants' ? html`<label class="business-check"><input name="published" type="checkbox" ${checked(edit.published)}>Нийтлэх</label>` : ''}
      <div class="business-actions"><button class="btn btn-p" ${raw(saving ? 'disabled' : '')}>Хадгалах</button>
        <button type="button" class="btn btn-o" data-om-cancel>Болих</button></div>
    </form>
    ${kind === 'products' && edit.id ? html`<form class="business-form om-image" data-om-image>
      ${edit.image_ref ? html`<img src="/api/v1${itemPath(this.props.cafeId, kind, edit.id)}/image?v=${edit.version}" alt="Бүтээгдэхүүний зураг" width="116" height="88" loading="lazy">` : ''}
      <label>Бүтээгдэхүүний зураг (1 МБ хүртэл)<input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required></label>
      <div class="business-actions"><button class="btn btn-o" ${raw(saving ? 'disabled' : '')}>Зураг хадгалах</button>
        ${edit.image_ref ? html`<button type="button" class="btn btn-g" data-om-remove-image>Зураг арилгах</button>` : ''}</div>
    </form>` : ''}</div>`;
  }
  render() {
    const { kind, rows, edit, confirm, saving, error, note, offset, more, lookup } = this.state;
    const relationMissing = kind === 'products' ? !lookup.categories?.length : kind === 'variants' ? !lookup.products?.length : false;
    return html`<div class="business-panel om"><h2>Цэс ба урамшуулал</h2>
      <div class="chips" role="group" aria-label="Цэс удирдах">${groups.map(([k, l]) => html`<button class="chip" aria-pressed="${k === kind}" data-om-kind="${k}" ${raw(saving ? 'disabled' : '')}>${l}</button>`)}</div>
      ${error ? html`<p role="alert" class="adm-error">${error}</p><button class="btn btn-o" data-om-retry>Дахин ачаалах</button>` : ''}
      ${note || saving ? html`<p role="status">${saving ? 'Хадгалж байна…' : note}</p>` : ''}
      ${!rows ? html`<p role="status">Ачаалж байна…</p>` : ''}
      ${relationMissing && rows && !error ? html`<p class="muted">${kind === 'products' ? 'Эхлээд цэсийн ангилал үүсгэнэ үү.' : 'Эхлээд бүтээгдэхүүн нэмнэ үү.'}</p>` : ''}
      ${rows && !edit && !relationMissing && !error ? html`<button class="btn btn-p om-new" data-om-new>Шинээр нэмэх</button>` : ''}
      ${edit ? this.form() : ''}
      ${rows?.length ? html`<ul class="me-list" aria-label="${label(kind)}">${rows.map(row => html`<li data-key="om-row-${row.id}">
        <strong>${row.name || row.title}</strong>
        <small class="muted"> · ${row.archived ? 'Архивласан' : kind === 'variants' ? (row.active ? 'Идэвхтэй' : 'Идэвхгүй') : row.published ? 'Нийтэлсэн' : 'Ноорог'}${row.base_price != null ? ' · ' + formatMNT(row.base_price) : ''}</small>
        ${!row.archived ? html`<div class="me-btns">
          ${confirm === row.id ? html`<span>Үргэлжлүүлэх үү?</span><button class="btn btn-o" data-om-archive="${row.id}" ${raw(saving ? 'disabled' : '')}>Батлах</button><button class="btn btn-g" data-om-cancel>Болих</button>`
            : html`<button class="btn btn-o" data-om-edit="${row.id}" ${raw(saving ? 'disabled' : '')}>Засах</button>
              <button class="btn btn-g" data-om-ask="${row.id}" ${raw(saving ? 'disabled' : '')}>${kind === 'categories' ? 'Устгах' : kind === 'variants' ? 'Идэвхгүй болгох' : 'Архивлах'}</button>`}
        </div>` : ''}
      </li>`)}</ul>` : rows && !error ? html`<p class="muted">Бүртгэл алга.</p>` : ''}
      ${offset || more ? html`<nav class="cf-pages" aria-label="Цэсийн хуудас">${offset ? html`<button class="btn btn-o" data-om-page="${Math.max(0, offset - 50)}">Өмнөх</button>` : ''}${more ? html`<button class="btn btn-o" data-om-page="${offset + 50}">Дараах</button>` : ''}</nav>` : ''}
    </div>`;
  }
}
