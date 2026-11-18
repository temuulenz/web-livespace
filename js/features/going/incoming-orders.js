// Staff / owner view of upcoming visitors: «Ойрын 1 цагт N хүн ирнэ» and the incoming
// pre-orders with Хүлээн авах / Бэлэн / Цуцлах. Staff see an order code and the last four
// phone digits only; status changes go through the customer adapter.
import { Component, html, raw } from '../../../framework/index.js';
import { I } from '../../icons.js';
import { Snd } from '../../audio.js';
import { toast } from '../../components/feedback.js';
import { customer } from '../../services/customer-adapter.js';
import { formatMNT, arrivalAt, arrivingWithin, clockText, STATUS_LABEL, canTransition } from '../../services/customer-rules.js';

export class IncomingOrders extends Component {
  initialState() { return { list: null, now: Date.now(), busy: null, confirm: null }; }
  events() {
    return {
      'click [data-inc-set]': (e, b) => { const [id, status] = b.dataset.incSet.split('|'); if (status === 'cancelled' && this.state.confirm !== id) { Snd.ui('click'); this.setState({ confirm: id }); return; } this.set(id, status); },
      'click [data-inc-keep]': () => this.setState({ confirm: null })
    };
  }
  onMount() {
    this.onCleanup(customer.subscribe(() => this.load()));
    this.interval(() => this.load(), 15000);
    this.load();
  }
  async load() { this.setState({ list: await customer.going.incoming(this.props.cafeId), now: Date.now() }); }
  async set(id, status) {
    this.setState({ busy: id });
    try {
      await customer.going.setStatus(id, status);
      Snd.ui(status === 'cancelled' ? 'click' : 'chime');
      toast(status === 'accepted' ? 'Захиалгыг хүлээн авлаа' : status === 'ready' ? 'Захиалга бэлэн боллоо' : 'Захиалга цуцлагдлаа', status !== 'cancelled');
    } catch (error) { Snd.ui('err'); toast(error.message); }
    this.setState({ busy: null, confirm: null });
  }
  whenText(visit) {
    const minutes = Math.round((arrivalAt(visit) - this.state.now) / 60000);
    return minutes > 0 ? `≈ ${clockText(arrivalAt(visit))} · ${minutes} мин дараа` : `≈ ${clockText(arrivalAt(visit))} · ирэх цаг болсон`;
  }
  rowHTML(v) {
    const { busy, confirm } = this.state, wait = busy === v.id;
    const btn = (status, label, cls = 'btn-o') => canTransition(v.status, status) ? html`<button class="btn ${cls}" data-inc-set="${v.id}|${status}" ${raw(wait ? 'disabled' : '')}>${label}</button>` : '';
    const actions = confirm === v.id
      ? html`<span class="me-ask">Цуцлах уу?</span><button class="btn btn-g me-danger" data-inc-set="${v.id}|cancelled" ${raw(wait ? 'disabled' : '')}>Тийм</button><button class="btn btn-g" data-inc-keep>Үгүй</button>`
      : v.status === 'ready' ? html`<small class="muted">Зочныг хүлээж байна</small>`
      : html`${btn('accepted', 'Хүлээн авах', 'btn-p')}${btn('ready', 'Бэлэн', 'btn-p')}${btn('cancelled', 'Цуцлах', 'btn-g')}`;
    return html`<article class="inc-row st-${v.status}" data-key="inc-${v.id}">
      <div class="inc-top"><b class="num">${v.code}</b><span class="muted num">${v.phone}</span><span class="badge going-st st-${v.status}">${STATUS_LABEL[v.status]}</span>${v.simulated ? html`<span class="badge b-demo">ДЕМО</span>` : ''}</div>
      <p class="inc-when num">${raw(I.clock)}${this.whenText(v)}</p>
      <ul class="going-lines">${v.lines.map(l => html`<li><span><b class="num">${l.qty} ×</b> ${l.name}</span><span class="num">${formatMNT(l.price * l.qty)}</span></li>`)}</ul>
      <div class="inc-tot"><span>Нийт · Кафе дээр төлнө</span><b class="num">${formatMNT(v.total)}</b></div>
      ${v.note ? html`<p class="going-note-txt">«${v.note}»</p>` : ''}
      <div class="inc-act">${actions}</div>
    </article>`;
  }
  render() {
    const { list, now } = this.state;
    const head = html`<div class="card-h"><h2>${raw(I.people)} Ирэх зочид</h2>${customer.mode === 'mock' ? html`<span class="badge b-demo">ДЕМО</span>` : ''}</div>`;
    if (!list) return html`${head}<div class="skel" style="height:120px"></div>`;
    const soon = arrivingWithin(list, now), orders = list.filter(v => v.lines.length), plain = list.length - orders.length;
    return html`${head}
      <div class="inc-sum"><b class="num">${soon}</b><span class="inc-sum-t"><span>Ойрын 1 цагт <b class="num">${soon}</b> хүн ирнэ</span>${plain ? html`<small class="muted">${plain} нь урьдчилсан захиалгагүй</small>` : ''}</span></div>
      <h3 class="inc-h">Урьдчилсан захиалга <span class="muted num">${orders.length}</span></h3>
      ${orders.length ? html`<div class="inc-list">${orders.map(v => this.rowHTML(v))}</div>` : html`<p class="muted">Одоогоор урьдчилсан захиалга алга.</p>`}`;
  }
}
