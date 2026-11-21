import { Component, html, raw } from '../../../framework/index.js';
import { I } from '../../icons.js';
import { platform } from '../../services/platform.js';
import { formatMNT } from '../../services/customer-rules.js';
import { activePromotion, ratingText } from '../home/recommendations.js';
import { menuPhoto } from './menu-view.js';

const stockLabels = { available: 'Байгаа', sold_out: 'Дууссан', temporarily_unavailable: 'Түр байхгүй' };

export class PublicMenu extends Component {
  initialState() { return { menu: null, inventory: null, promos: null, reviews: null, rate: '', failed: false, section: '', offset: 0 }; }
  events() {
    return {
      'click [data-pm-retry]': () => this.loadMenu(),
      'change [data-pm-category]': (e, field) => { this.setState({ section: field.value }); this.loadMenu(0, field.value) },
      'click [data-pm-chip]': (e, b) => {
        const section = b.dataset.pmChip;
        if (section === this.state.section) return;
        this.setState({ section });
        this.loadMenu(0, section);
      },
      'click [data-pm-expand]': () => {
        const expanded = !this.state.expanded;
        this.setState({ expanded });
        if (!expanded && this.state.offset) this.loadMenu(0);
      },
      'click [data-pm-page]': (e, b) => this.loadMenu(Number(b.dataset.pmPage))
    };
  }
  onMount() {
    const ctrl = new AbortController();
    this.options = { signal: ctrl.signal, retry: 0 };
    this.onCleanup(() => { ctrl.abort(); this.menuController?.abort() });
    this.base = '/cafes/' + encodeURIComponent(this.props.cafeId);
    this.loadMenu();
    this.listen(this.el, 'error', event => { if (event.target.matches?.('[data-menu-photo]')) event.target.hidden = true }, { capture: true });
    if (this.props.preview) return;
    for (const [key, path, adapt] of [
      ['inventory', '/inventory?limit=100', data => data.items],
      ['promos', '/promotions?state=active&limit=10', data => data.items],
      ['reviews', '/reviews?limit=5', data => data.items],
      ['rate', '/ratings', data => ratingText(data, this.props.cafeId)]
    ]) {
      platform.api.get(this.base + path, this.options).then(data => {
        if (!ctrl.signal.aborted) this.setState({ [key]: adapt(data) });
      }).catch(() => {});
    }
  }
  async loadMenu(offset = this.state.offset, section = this.state.section) {
    this.menuController?.abort();
    this.menuController = new AbortController();
    const signal = this.menuController.signal;
    this.setState({ offset, failed: false, loading: true });
    const query = new URLSearchParams({ limit: '24', offset: String(offset) });
    if (section) query.set('category_id', section);
    try {
      const menu = await platform.api.get(this.base + '/menu?' + query, { signal });
      if (!signal.aborted) this.setState({ menu, loading: false });
    } catch {
      if (!signal.aborted) this.setState({ failed: true, loading: false });
    }
  }
  product(p, name) {
    const fallback = menuPhoto({ category: name });
    const photo = p.image_ref ? '/api/v1' + this.base + '/menu/products/' + encodeURIComponent(p.id) + '/image' : fallback;
    const stock = variant => this.state.inventory?.find(row => row.product_id === p.id && (row.variant_id || '') === variant)?.status;
    return html`<article class="menu-item pm-item">
      <div class="pm-photo" style="background-image:url('${fallback.replaceAll("'", '%27')}')"><img src="${photo}" alt="" width="116" height="88" loading="lazy" decoding="async" data-menu-photo></div>
      <div class="menu-txt"><strong>${p.name}</strong>${p.featured ? html`<span class="tagp2">Онцлох</span>` : ''}
        <span class="menu-price">${formatMNT(p.discounted_price ?? p.base_price)}</span>
        ${stockLabels[stock('')] ? html`<small>${stockLabels[stock('')]}</small>` : ''}
        ${p.description ? html`<small>${p.description}</small>` : ''}
        ${p.variants?.length ? html`<ul class="pm-variants">${p.variants.map(v => html`<li>${v.name} · ${formatMNT(v.discounted_price ?? v.price)}${stockLabels[stock(v.id)] ? ' · ' + stockLabels[stock(v.id)] : ''}</li>`)}</ul>` : ''}
      </div></article>`;
  }
  render() {
    const { menu, section, offset, failed, loading, promos, reviews, rate } = this.state;
    const names = new Map(menu?.categories?.map(c => [c.id, c.name]));
    const active = promos?.filter(item => activePromotion({ items: [item] })) || [];
    const detail = this.props.detail, expanded = !detail || this.state.expanded;
    const products = [...(menu?.products || [])].sort((a, b) => b.featured - a.featured);
    const list = expanded ? products : products.slice(0, 5);
    const categories = menu?.categories || [];
    return html`<div class="${detail ? 'cd-menu' : 'business-panel'} pm">
      ${detail ? html`<div class="card-h"><h2>${raw(I.cup)} Меню</h2>
        ${products.length || menu?.pagination?.has_more || this.state.expanded ? html`<button class="btn btn-o" data-pm-expand aria-expanded="${!!this.state.expanded}" aria-controls="cdPublishedMenu">${this.state.expanded ? 'Товч цэс' : 'Бүх меню'} ${raw(I.arr)}</button>` : ''}
        </div>` : html`<h2>Цэс</h2>`}
      ${categories.length ? detail ? html`<div class="chips menu-cats" role="group" aria-label="Цэсийн ангилал">
        <button class="chip" data-pm-chip="" aria-pressed="${!section}">Бүгд</button>
        ${categories.map(c => html`<button class="chip" data-key="pm-chip-${c.id}" data-pm-chip="${c.id}" aria-pressed="${c.id === section}">${c.name}</button>`)}
      </div>` : html`<label class="cf-order">Ангилал <select data-pm-category><option value="">Бүх бүтээгдэхүүн</option>${categories.map(c => html`<option value="${c.id}" ${raw(c.id === section ? 'selected' : '')}>${c.name}</option>`)}</select></label>` : ''}
      <div ${raw(detail ? 'id="cdPublishedMenu"' : '')} aria-busy="${!!loading}">
      ${failed ? html`<p role="alert">Цэсийг ачаалж чадсангүй.</p><button class="btn btn-o" data-pm-retry>Дахин оролдох</button>`
        : !menu || loading ? html`<p role="status">Цэс ачаалж байна…</p>`
        : list.length ? html`<div class="menu-grid${expanded ? '' : ' cd-menu-row'}">${list.map(p => this.product(p, names.get(p.category_id)))}</div>`
        : html`<p class="muted">Нийтэлсэн бүтээгдэхүүн алга.</p>`}
      ${expanded && !loading && !failed && (offset > 0 || menu?.pagination?.has_more) ? html`<nav class="cf-pages" aria-label="Цэсийн хуудас">
        ${offset ? html`<button class="btn btn-o" data-pm-page="${Math.max(0, offset - 24)}">Өмнөх</button>` : ''}
        ${menu?.pagination?.has_more ? html`<button class="btn btn-o" data-pm-page="${offset + 24}">Дараах</button>` : ''}
      </nav>` : ''}
      </div>
      ${active.length ? html`<section class="pm-extra"><h3>Идэвхтэй урамшуулал</h3><ul>${active.map(p => html`<li><strong>${p.title}</strong>${p.description ? html`<p>${p.description}</p>` : ''}${p.terms ? html`<small>${p.terms}</small>` : ''}</li>`)}</ul></section>` : ''}
      ${reviews?.length ? html`<section class="pm-extra"><h3>Зочдын сэтгэгдэл ${rate ? '· ★ ' + rate : ''}</h3><ul>${reviews.map(r => html`<li><strong>${r.author_name}</strong>${r.comment ? html`<p>${r.comment}</p>` : ''}${r.reply?.text ? html`<p><strong>Кафены хариу</strong> ${r.reply.text}</p>` : ''}</li>`)}</ul></section>` : ''}
    </div>`;
  }
}
