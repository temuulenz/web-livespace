// «Очих» (going) on the café page: the aggregate «N хүн ирэхээр төлөвлөж байна», the
// signed-in visitor's active visit with countdown and «Цуцлах», and the flow
// arrival time (15/30/60 мин) → optional pre-order (cart, total, note) → confirm.
// One active visit at a time; it expires on its own after arrival time + grace period.
// No payment in this version: «Кафе дээр төлнө».
import { Component, html, raw } from '../../../framework/index.js';
import { I } from '../../icons.js';
import { Snd } from '../../audio.js';
import { closeModal, toast } from '../../components/feedback.js';
import { openModalComponent } from '../../components/modal-component.js';
import { customer } from '../../services/customer-adapter.js';
import {
  ARRIVAL_OPTIONS, GRACE_MIN, NOTE_MAX, MAX_QTY, STATUS_LABEL, formatMNT, formatPhone, groupMenu,
  setQty, cartLines, linesTotal, countdown, arrivalAt, clockText
} from '../../services/customer-rules.js';
import { menuPhoto } from '../menu/menu-view.js';
import { openPhoneAuth } from '../authentication/phone-auth.js';

const PAY_NOTE = 'Кафе дээр төлнө';
const linesHTML = lines => html`<ul class="going-lines">${lines.map(l => html`<li><span><b class="num">${l.qty} ×</b> ${l.name}</span><span class="num">${formatMNT(l.price * l.qty)}</span></li>`)}</ul>`;
const statusBadge = status => html`<span class="badge going-st st-${status}">${STATUS_LABEL[status] || status}</span>`;

/* ---------------- flow (modal) ---------------- */
class GoingFlow extends Component {
  initialState() { return { step: 'time', minutes: null, cart: {}, busy: false, error: '' }; }
  events() {
    return {
      'click [data-minutes]': (e, b) => { Snd.ui('tick'); this.setState({ minutes: +b.dataset.minutes, error: '' }); },
      'click [data-qty]': (e, b) => { const [id, delta] = b.dataset.qty.split('|'); Snd.ui('click'); this.setState({ cart: setQty(this.state.cart, id, (this.state.cart[id] || 0) + +delta) }); },
      'input [data-note]': (e, t) => { this.note = t.value; const c = this.$('[data-note-count]'); if (c) c.textContent = `${t.value.length}/${NOTE_MAX}`; },
      'click [data-step]': (e, b) => { Snd.ui('click'); this.setState({ step: b.dataset.step, error: '' }); },
      'click [data-going-confirm]': () => this.confirm()
    };
  }
  async confirm() {
    const { cafe, menu, onDone } = this.props;
    this.setState({ busy: true, error: '' });
    try {
      await customer.going.create({ cafeId: cafe.id, cafeName: cafe.name, minutes: this.state.minutes, cart: this.state.cart, note: this.note || '' });
      Snd.ui('chime'); closeModal();
      toast(`${cafe.name} таныг хүлээж байна`, true);
      onDone?.();
    } catch (error) {
      Snd.ui('err');
      if (error.code === 'login_required') { openPhoneAuth({ reason: 'going', onSuccess: () => openGoingFlow(cafe, menu, onDone) }); return; }
      this.setState({ busy: false, error: error.message });
    }
  }
  render() {
    const { cafe, menu } = this.props, { step, minutes, cart, busy, error } = this.state;
    const steps = ['time', 'order', 'confirm'], index = steps.indexOf(step);
    const titles = { time: 'Хэдэн минутын дараа ирэх вэ?', order: 'Урьдчилан захиалах уу?', confirm: 'Баталгаажуулах' };
    const head = html`<div class="mdl-h"><div><span class="eyebrow">${raw(I.walk.replace('<svg', '<svg width="14" height="14"'))} ${cafe.name} · Очих</span><h2>${titles[step]}</h2>
      <ol class="going-steps" aria-label="Алхам ${index + 1}/3">${steps.map((s, i) => html`<li class="${i < index ? 'done' : i === index ? 'on' : ''}"></li>`)}</ol></div>
      <button class="pv-x" data-close aria-label="Хаах" style="margin-left:auto">${raw(I.x)}</button></div>`;
    const err = error ? html`<p class="auth-msg" role="alert">${error}</p>` : '';
    const lines = cartLines(cart, menu), total = linesTotal(lines), count = lines.reduce((n, l) => n + l.qty, 0);

    if (step === 'time') {
      const now = Date.now();
      return html`${head}
        <div class="going-times" role="group" aria-label="Ирэх хугацаа">${ARRIVAL_OPTIONS.map(m => html`<button class="going-time" data-minutes="${m}" aria-pressed="${m === minutes}"><b class="num">${m} мин</b><small class="num">≈ ${clockText(now + m * 60000)}</small></button>`)}</div>
        <p class="muted going-hint">Кафе таныг сонгосон цагаас хойш ${GRACE_MIN} минут хүлээнэ. Дараа нь автоматаар цуцлагдана.</p>${err}
        <div class="going-foot"><button class="btn btn-p" data-step="order" ${raw(minutes ? '' : 'disabled')}>Үргэлжлүүлэх ${raw(I.arr)}</button></div>`;
    }
    if (step === 'order') {
      const groups = groupMenu(menu, { hideUnavailable: true }), out = menu.filter(m => !m.available).length;
      return html`${head}
        <p class="muted going-hint">Заавал биш. Ирэхэд тань бэлэн болгоно. ${out ? 'Дууссан бүтээгдэхүүн харагдахгүй.' : ''}</p>
        <div class="going-menu">${groups.length ? groups.map(([category, list]) => html`<section data-key="gm-${category}"><h3>${category}</h3>${list.map(item => {
          const qty = cart[item.id] || 0;
          return html`<div class="going-item${qty ? ' on' : ''}" data-key="gi-${item.id}"><img src="${menuPhoto(item)}" alt="" width="58" height="44" loading="lazy"><div><b>${item.name}</b><small class="num">${formatMNT(item.price)}</small></div>
            <div class="going-qty"><button data-qty="${item.id}|-1" aria-label="${item.name} хасах" ${raw(qty ? '' : 'disabled')}>${raw(I.minus)}</button><output class="num" aria-live="polite">${qty}</output><button data-qty="${item.id}|1" aria-label="${item.name} нэмэх" ${raw(qty >= MAX_QTY ? 'disabled' : '')}>${raw(I.plus)}</button></div></div>`;
        })}</section>`) : html`<p class="muted">Одоогоор захиалах боломжтой бүтээгдэхүүн алга.</p>`}</div>
        <div class="fld going-note"><label for="going-note">Нэмэлт хүсэлт (заавал биш)</label><textarea id="going-note" data-note rows="2" maxlength="${NOTE_MAX}" placeholder="Жишээ нь: сүүгүй, цонхны дэргэд">${this.note || ''}</textarea><small class="muted num" data-note-count>${(this.note || '').length}/${NOTE_MAX}</small></div>
        ${err}
        <div class="going-foot"><div class="going-total"><small>Нийт</small><b class="num">${formatMNT(total)}</b></div>
          <button class="btn btn-g" data-step="time">Буцах</button><button class="btn btn-p" data-step="confirm">${count ? html`Үргэлжлүүлэх <span class="num">(${count})</span>` : 'Захиалгагүй үргэлжлүүлэх'}</button></div>`;
    }
    const at = Date.now() + minutes * 60000;
    return html`${head}
      <dl class="going-sum">
        <div><dt>Кафе</dt><dd>${cafe.name}</dd></div>
        <div><dt>Ирэх цаг</dt><dd class="num">≈ ${clockText(at)} · ${minutes} минутын дараа</dd></div>
        <div><dt>Урьдчилсан захиалга</dt><dd>${lines.length ? linesHTML(lines) : 'Захиалгагүй'}</dd></div>
        ${this.note?.trim() ? html`<div><dt>Хүсэлт</dt><dd>${this.note.trim()}</dd></div>` : ''}
        ${lines.length ? html`<div class="going-sum-total"><dt>Нийт</dt><dd class="num">${formatMNT(total)}</dd></div>` : ''}
      </dl>
      <p class="going-pay">${raw(I.info)} <span><b>${PAY_NOTE}.</b> Энэ хувилбарт онлайн төлбөр байхгүй. Кафе таныг ${GRACE_MIN} минут хүлээгээд автоматаар цуцална.</span></p>
      ${err}
      <div class="going-foot"><button class="btn btn-g" data-step="order">Буцах</button><button class="btn btn-p" data-going-confirm ${raw(busy ? 'disabled' : '')}>${busy ? 'Илгээж байна…' : 'Баталгаажуулах'}</button></div>`;
  }
}
function openGoingFlow(cafe, menu, onDone) { Snd.ui('whoosh'); return openModalComponent(GoingFlow, { cafe, menu, onDone }, true); }

/* ---------------- café page panel ---------------- */
export class GoingPanel extends Component {
  initialState() { return { loaded: false, user: null, active: null, count: 0, confirmCancel: false, busy: false, now: Date.now() }; }
  events() {
    return {
      'click [data-going-start]': () => this.start(),
      'click [data-going-cancel]': () => { Snd.ui('click'); this.setState({ confirmCancel: true }); },
      'click [data-going-keep]': () => this.setState({ confirmCancel: false }),
      'click [data-going-cancel-yes]': () => this.cancel(),
      'click [data-going-login]': () => openPhoneAuth({ reason: 'going' }),
      'click [data-going-signout]': async () => { await customer.auth.signOut(); Snd.ui('click'); toast('Системээс гарлаа'); }
    };
  }
  onMount() {
    this.onCleanup(customer.subscribe(() => this.load()));
    this.interval(() => this.tick(), 1000);
    this.interval(() => this.load(), 30000);
    this.load();
  }
  async load() {
    const [user, active, summary] = await Promise.all([customer.auth.current(), customer.going.active(), customer.going.publicSummary(this.props.cafe.id)]);
    const before = this.state.active;
    if (before && active && before.id === active.id && before.status !== active.status && active.status === 'ready') { Snd.ui('chime'); toast(`${active.cafeName}: таны захиалга бэлэн боллоо`, true); }
    this.setState({ loaded: true, user, active, count: summary.count, now: Date.now(), ...(active ? {} : { confirmCancel: false }) });
  }
  tick() {
    const { active } = this.state, now = Date.now();
    if (!active) return;
    if (countdown(active, now).phase === 'expired') { toast('Таны «Очих»-ын хугацаа дууслаа'); this.load(); return; }
    this.setState({ now });
  }
  async start() {
    const { cafe } = this.props;
    const open = async () => openGoingFlow(cafe, await customer.menu.list(cafe.id), () => this.load());
    if (!(await customer.auth.current())) { openPhoneAuth({ reason: 'going', onSuccess: () => this.load().then(() => { if (!this.state.active) open(); }) }); return; }
    if (this.state.active) return;
    open();
  }
  async cancel() {
    const { active } = this.state; if (!active) return;
    this.setState({ busy: true });
    try { await customer.going.cancel(active.id); Snd.ui('click'); toast('«Очих» цуцлагдлаа'); }
    catch (error) { Snd.ui('err'); toast(error.message); }
    this.setState({ busy: false, confirmCancel: false });
    this.load();
  }
  activeHTML(active) {
    const { now, confirmCancel, busy } = this.state, here = active.cafeId === this.props.cafe.id;
    const cd = countdown(active, now);
    const cancelUI = confirmCancel
      ? html`<div class="going-ask"><span>«Очих»-ыг цуцлах уу?</span><button class="btn btn-g me-danger" data-going-cancel-yes ${raw(busy ? 'disabled' : '')}>Тийм, цуцлах</button><button class="btn btn-g" data-going-keep>Үгүй</button></div>`
      : html`<button class="btn btn-o" data-going-cancel>Цуцлах</button>`;
    if (!here) return html`<div class="going-other"><p>Та <a href="#cafe-${active.cafeId}">${active.cafeName || 'өөр кафе'}</a> руу <b class="num">≈ ${clockText(arrivalAt(active))}</b>-д очихоор бүртгүүлсэн байна. Нэг удаад нэг л газар сонгоно.</p>${cancelUI}</div>`;
    return html`<div class="going-active ph-${cd.phase}" data-key="going-${active.id}">
      <div class="going-timer" role="timer" aria-live="off"><small>${cd.phase === 'travel' ? 'Ирэх хүртэл' : 'Таныг хүлээж байна'}</small><b class="num">${cd.text}</b><small class="num">≈ ${clockText(arrivalAt(active))}${cd.phase === 'grace' ? ' · цаг болсон' : ''}</small></div>
      <div class="going-detail">
        <div class="going-row"><b>Та очихоор бүртгүүлсэн</b>${active.lines.length ? statusBadge(active.status) : ''}<small class="muted num">${active.code}</small></div>
        ${active.lines.length ? html`${linesHTML(active.lines)}<div class="going-row going-tot"><span>Нийт · ${PAY_NOTE}</span><b class="num">${formatMNT(active.total)}</b></div>` : html`<p class="muted">Урьдчилсан захиалгагүй · ${PAY_NOTE}</p>`}
        ${active.note ? html`<p class="going-note-txt">«${active.note}»</p>` : ''}
        ${cd.phase === 'grace' ? html`<p class="muted">Сонгосон цаг өнгөрсөн. ${GRACE_MIN} минутын дотор ирэхгүй бол автоматаар цуцлагдана.</p>` : ''}
        ${cancelUI}
      </div></div>`;
  }
  render() {
    const { loaded, user, active, count } = this.state, { cafe } = this.props;
    const head = html`<div class="card-h"><h2>${raw(I.walk)} Очих</h2>${customer.mode === 'mock' ? html`<span class="badge b-demo">ДЕМО</span>` : ''}</div>`;
    if (!loaded) return html`${head}<div class="skel" style="height:90px"></div>`;
    const summary = html`<p class="going-count">${raw(I.people)}${count ? html`<span><b class="num">${count} хүн</b> ирэхээр төлөвлөж байна</span>` : html`<span class="muted">Одоогоор ирэхээр төлөвлөсөн хүн алга</span>`}</p>`;
    const body = active ? this.activeHTML(active) : cafe.open
      ? html`<div class="going-cta"><p class="muted">Ирэх цагаа сонгоод, хүсвэл урьдчилан захиалаарай — очиход тань бэлэн болно. ${PAY_NOTE}.</p><button class="btn btn-p" data-going-start>${raw(I.walk)} Очих</button></div>`
      : html`<div class="going-cta"><p class="muted">Кафе хаалттай үед «Очих» боломжгүй.</p><button class="btn btn-p" disabled>Очих</button></div>`;
    const who = user ? html`<p class="going-who muted"><span class="num">${formatPhone(user.phone)}</span> · <button class="linkb" data-going-signout>Гарах</button></p>`
      : html`<p class="going-who muted">«Очих», урьдчилсан захиалгад утсаар нэвтэрнэ. <button class="linkb" data-going-login>Нэвтрэх</button></p>`;
    return html`${head}${summary}${body}${who}`;
  }
}
