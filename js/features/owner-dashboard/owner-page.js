// Café-owner dashboard (#owner).
// Эзэмшигч ихэвчлэн лангууны ард утас, таблетаас хардаг: хэдхэн секундэд «одоо хэр
// ачаалалтай, хэн ирэх гэж байна, ямар захиалга бэлтгэх вэ, аль цаг ачаалалтай байсан» гэдгийг
// мэдэх ёстой. Тиймээс дээр нь 3 товч карт, доор нь табууд: Өнөөдөр | Захиалга | Цэс | Тайлан.
// Техникийн мэдээлэл (төхөөрөмжийн id, dBFS, inference, түүхийн хүснэгт) устгагдаагүй — «Тайлан»
// табын доорх хаалттай «Техникийн дэлгэрэнгүй» хэсэгт байна.
import { Component, html, raw, readForm, dateTime } from '../../../framework/index.js';
import { I } from '../../icons.js';
import { Snd } from '../../audio.js';
import { SS, WIFI, byId } from '../../cafes.js';
import { seatRow, ssGlyph, wifiSVG } from '../../components/atmosphere.js';
import { FloorPlan } from '../../simulation/floor-plan.js';
import { LAYOUTS } from '../../simulation/layouts.js';
import { SETUP_STEPS, statusLabel, VIS_STATUSES } from '../../live/levels.js';
import { sensorState } from '../../live/sensor-state.js';
import { trustState } from '../../live/status.js';
import { sensorPanelHTML, deviceDiagnosticsHTML, sensorStatusLabel, sensorSourceLabel } from '../../live/sensor-ui.js';
import { SensorHistory } from '../sensors/sensor-history.js';
import { platform } from '../../services/platform.js';
import { customer } from '../../services/customer-adapter.js';
import { arrivingWithin } from '../../services/customer-rules.js';
import { store } from '../../storage.js';
import { toast } from '../../components/feedback.js';
import { openAuth, field } from '../authentication/auth-modal.js';
import { signInPrompt } from '../account/account.js';
import { IncomingOrders } from '../going/incoming-orders.js';
import { OwnerMenu } from '../menu/owner-menu.js';
import { CafePhotoManager } from '../cafe/cafe-photo-manager.js';
import { MenuEditor } from '../menu/menu-editor.js';
import { OwnerReport } from './owner-report.js';
import { noiseWord, deviceWords } from './owner-words.js';

const STATUS_TEXT = {
  submitted: 'Таны хүсэлтийг хүлээн авлаа. Манай баг тантай удахгүй холбогдоно.',
  under_review: 'Манай баг хүсэлтийг тань хянаж байна.',
  contacting: 'Бид тантай холбогдож, суурилуулалтын цагийг тохиролцоно.',
  visualization: 'Таны илгээсэн зургаар кафены хөдөлгөөнт зураглалыг бэлтгэж байна.',
  sensors: 'Мэдрэгч, камер суурилуулж байна.',
  testing: 'Хэмжилтийг шалгаж байна. Удахгүй LiveSpace дээр нийтэд харагдана.',
  active: 'Таны кафе LiveSpace дээр идэвхтэй байна.',
  rejected: 'Энэ удаад хамтран ажиллах боломжгүй боллоо. Дэлгэрэнгүйг и-мэйлээр мэдэгдэнэ.'
};
const TABS = [['today', 'Өнөөдөр'], ['orders', 'Захиалга'], ['menu', 'Цэс'], ['report', 'Тайлан']];
// Шошго ДЕМО / ШУУД / ТУРШИЛТ / ХУУЧИРСАН / МЭДЭЭЛЭЛГҮЙ хэвээр, ард нь энгийн үгээр.
const TRUST_BADGE = { live: ['b-live', 'ШУУД'], test: ['b-typ', 'ТУРШИЛТ'], stale: ['b-stale', 'ХУУЧИРСАН'], none: ['b-stale', 'МЭДЭЭЛЭЛГҮЙ'], demo: ['b-demo', 'ДЕМО'] };
export const visLabel = key => VIS_STATUSES.find(([k]) => k === key)?.[1] || key;

export function timelineHTML(status, history = []) {
  if (status === 'rejected') return html`<ol class="own-steps"><li class="st-on st-bad"><i></i><span>${statusLabel('rejected')}</span></li></ol>`;
  const index = SETUP_STEPS.findIndex(([key]) => key === status);
  const reached = key => history.find(h => h.to_status === key)?.at;
  return html`<ol class="own-steps">${SETUP_STEPS.map(([key, label], i) => html`<li class="${i < index ? 'st-done' : i === index ? 'st-on' : ''}"><i>${i < index ? raw(I.check) : i + 1}</i><span>${label}${reached(key) && i <= index ? html`<small>${dateTime(reached(key))}</small>` : ''}</span></li>`)}</ol>`;
}

// Админы самбарт ашиглагддаг техникийн хувилбар (өөрчлөөгүй).
export function liveTilesHTML(live) {
  const seats = live.free_pct != null ? html`<div class="own-tile"><small>${raw(I.seat)} Сул суудал</small>${raw(seatRow(100 - live.free_pct))}<b class="num">${live.free_pct}%</b><span class="muted num">${live.total_seats != null ? `${live.total_seats}-оос ${live.available_seats ?? '—'} сул` : ''}</span></div>` : '';
  const noise = live.noise_level ? html`<div class="own-tile"><small>${raw(ssGlyph(2))} Дуу чимээ</small><span class="sg">${raw(ssGlyph(live.noise_level))}</span><b>${SS[live.noise_level].short}</b><span class="muted num">${Math.round(live.noise_db)} dB</span></div>` : '';
  const wifi = live.wifi_level ? html`<div class="own-tile"><small>${raw(wifiSVG(3, 14))} Wi-Fi</small>${raw(wifiSVG(live.wifi_level, 26))}<b>${WIFI[live.wifi_level]}</b><span class="muted num">${live.wifi_mbps != null ? `${Math.round(live.wifi_mbps)} Mbps` : `чанар ${Math.round(live.wifi_quality)}/100`}</span></div>` : '';
  return html`${raw(sensorPanelHTML({ live }))}<div class="own-tiles">${seats}${noise}${wifi}</div>`;
}

// Эзэмшигчийн «Одоогийн байдал»: энгийн үгээр, түүхий dBFS-гүй.
function ownerTilesHTML(c, sensor) {
  const live = c.live;
  const people = sensor ? html`<div class="own-tile"><small>${raw(I.people)} Ажиглагдсан хүн</small><b class="num">${sensor.observedPeople ?? '—'}</b><span class="muted">${sensor.observedPeople == null ? 'Одоогоор тоо ирээгүй' : 'Хүний тоо нь сул суудлын тоо биш'}</span></div>` : '';
  const seats = live.free_pct != null ? html`<div class="own-tile"><small>${raw(I.seat)} Сул суудал</small>${raw(seatRow(100 - live.free_pct))}<b class="num">${live.free_pct}%</b><span class="muted num">${live.total_seats != null && live.available_seats != null ? `${live.total_seats}-оос ${live.available_seats} сул` : ''}</span></div>` : '';
  const noiseText = sensor ? noiseWord(sensor.noise) : live.noise_level ? `Дуу чимээ: ${SS[live.noise_level].short}` : '';
  const noise = noiseText ? html`<div class="own-tile"><small>${raw(ssGlyph(2))} Дуу чимээ</small><b>${noiseText.replace('Дуу чимээ: ', '')}</b></div>` : '';
  const wifi = live.wifi_level ? html`<div class="own-tile"><small>${raw(wifiSVG(3, 14))} Wi-Fi</small>${raw(wifiSVG(live.wifi_level, 26))}<b>${WIFI[live.wifi_level]}</b><span class="muted num">${live.wifi_mbps != null ? `${Math.round(live.wifi_mbps)} Mbps` : ''}</span></div>` : '';
  return html`<div class="own-tiles">${people}${seats}${noise}${wifi}</div>`;
}

// «Юу хийх вэ?» — next steps when data or a device connection is lost.
const NEXT_STEPS = {
  load: ['Интернэт холболтоо шалгаад «Дахин оролдох»-г дарна уу.', 'Болохгүй бол хуудсаа дахин ачаална уу.', 'Асуудал үргэлжилбэл LiveSpace-ийн багт хандана уу.'],
  device: ['Утасны цахилгаан залгаатай эсэхийг шалгана уу.', 'Кафены Wi-Fi ажиллаж байгаа, утас сүлжээнд холбогдсон эсэхийг шалгана уу.', 'Утсыг унтрааж асаана уу — холбогдмогц хэмжилт өөрөө үргэлжилнэ.', 'Тасалдал үргэлжилбэл LiveSpace-ийн багт хандана уу.']
};
const nextStepsHTML = (kind, note = '') => html`<div class="own-next" role="note"><h3>Юу хийх вэ?</h3><ol>${NEXT_STEPS[kind].map(s => html`<li>${s}</li>`)}</ol>${note ? html`<p class="muted">${note}</p>` : ''}</div>`;
const savedTab = () => { const t = store.get('ownTab', 'today'); return TABS.some(([k]) => k === t) ? t : 'today'; };

export class OwnerPage extends Component {
  initialState() { return { cafes: null, error: null, selected: null, saving: false, formErrors: {}, tab: savedTab(), incoming: null, now: Date.now(), open: { status: false, vis: true, tech: false } }; }
  events() {
    return {
      'click [data-gate-login]': (e, b) => openAuth({ reason: b.dataset.gateLogin }),
      'click [data-own-cafe]': (e, b) => { Snd.ui('click'); this.setState({ selected: b.dataset.ownCafe, incoming: null }); this.loadIncoming(); },
      'click [data-own-tab]': (e, b) => this.go(b.dataset.ownTab),
      'keydown [data-own-tab]': (e, b) => {
        const index = TABS.findIndex(([key]) => key === b.dataset.ownTab);
        const last = TABS.length - 1;
        const next = { ArrowLeft: (index + last) % TABS.length, ArrowRight: (index + 1) % TABS.length, Home: 0, End: last }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        const [key] = TABS[next];
        this.go(key);
        this.$(`[data-own-tab="${key}"]`)?.focus();
      },
      'click [data-own-go]': (e, b) => this.go(b.dataset.ownGo, true),
      // <details> нээлттэй эсэхийг төлөвт хадгална — дахин зурахад хаагдахгүй.
      'click [data-own-open]': (e, b) => { e.preventDefault(); const k = b.dataset.ownOpen; this.setState({ open: { ...this.state.open, [k]: !this.state.open[k] } }); },
      'submit .own-edit': e => { e.preventDefault(); this.save(e.target); },
      'click [data-own-retry]': () => this.load()
    };
  }
  // Tab switch; the summary cards also bring the tabs into view.
  go(tab, scroll = false) {
    Snd.ui('click'); store.set('ownTab', tab); this.setState({ tab });
    if (scroll) this.$('.own-tabs')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  onMount() {
    this.watch(platform.session.store, s => s.user, () => this.load());
    this.listen(document, 'visibilitychange', () => { if (!document.hidden) this.load(); });
    this.onCleanup(platform.bus.on('cafe:updated', id => { const live=byId(id)?.live;if(live&&this.state.cafes?.some(c=>c.id===id))this.setState({cafes:this.state.cafes.map(c=>c.id===id?{...c,live}:c)}); }));
    this.onCleanup(customer.subscribe(() => this.loadIncoming()));
    this.interval(() => { if (!document.hidden) this.load(); }, Math.max(30000, platform.config.poll_interval_sec * 1000));
    this.interval(() => { if (!document.hidden) this.loadIncoming(); }, 15000);
    this.load();
  }
  onDestroy() { this.fp?.destroy(); this.historyView?.destroy(); this.photoView?.destroy(); }
  async load() {
    if(this.loadingRequest || Date.now()<(this.retryAfter || 0))return;
    if (!platform.online || !platform.session.hasRole('owner', 'admin')) { this.setState({ cafes: null }); return; }
    this.loadingRequest=true;
    try {
      const { cafes } = await platform.api.get('/owner/cafes');
      this.setState({ cafes, error: null, selected: this.state.selected && cafes.some(c => c.id === this.state.selected) ? this.state.selected : cafes[0]?.id });
      if (!this.state.incoming) this.loadIncoming();
    } catch (error) { if(error.status===503)this.retryAfter=Date.now()+900000;this.setState({ error: error.message || 'Алдаа гарлаа' }); } finally {this.loadingRequest=false;}
  }
  // Ирэх зочид, захиалгын тоо — дээрх карт ба «Захиалга» табын тэмдэгт.
  async loadIncoming() {
    if (this.current()?.data_mode !== 'demo') return;
    const id = this.state.selected; if (!id) return;
    try { const list = await customer.going.incoming(id); if (this.mounted && id === this.state.selected) this.setState({ incoming: list, now: Date.now() }); } catch { /* картууд «—» хэвээр */ }
  }
  async save(form) {
    const cafe = this.current();
    this.setState({ saving: true, formErrors: {} });
    try {
      await platform.api.patch(`/owner/cafes/${cafe.id}`, readForm(form));
      Snd.ui('chime'); toast('Мэдээлэл хадгалагдлаа', true);
      await this.load();
    } catch (error) { Snd.ui('err'); this.setState({ formErrors: error.details || {} }); toast(error.message); }
    this.setState({ saving: false });
  }
  current() { return this.state.cafes?.find(c => c.id === this.state.selected); }
  source(c) { return c.live?.sensor?.dataSource || (c.devices.length && c.devices.every(d => d.is_test) ? 'simulated' : 'real'); }
  onUpdate() { this.syncPlan(); this.syncHistory(); this.syncCustomer(); this.syncReport(); this.syncPhotos(); }
  syncPhotos() {
    const cafe=this.current(),root=this.$('[data-owner-photos]');
    if(cafe&&root&&this.photoCafe===cafe.id&&this.photoView?.el===root)return;
    this.photoView?.destroy();this.photoView=null;this.photoCafe=null;
    if(cafe&&root){this.photoCafe=cafe.id;this.photoView=this.child(CafePhotoManager,root,{cafeId:cafe.id});}
  }
  // Incoming visitors / pre-orders and the menu editor for the selected café.
  syncCustomer() {
    const cafe = this.current(), orders = this.$('[data-own-orders]'), menu = this.$('[data-own-menu]');
    const key = cafe && `${cafe.id}:${cafe.data_mode}:${this.state.tab}`;
    if (key && this.custCafe === key) return;
    this.ordersView?.destroy(); this.menuView?.destroy(); this.ordersView = this.menuView = null; this.custCafe = null;
    if (!cafe || !orders || !menu) return;
    this.custCafe = key;
    if (this.state.tab === 'orders' && cafe.data_mode === 'demo') this.ordersView = this.child(IncomingOrders, orders, { cafeId: cafe.id });
    if (this.state.tab === 'menu') this.menuView = this.child(cafe.data_mode === 'demo' ? MenuEditor : OwnerMenu, menu, { cafeId: cafe.id, editor: 'owner' });
  }
  syncReport() {
    const cafe = this.current(), root = this.$('[data-own-report]');
    if (!cafe || !root) return;
    if (this.reportCafe === cafe.id && this.reportView?.el === root) { this.reportView.setProps({ source: this.source(cafe) }); return; }
    this.reportView?.destroy(); this.reportCafe = cafe.id;
    this.reportView = this.child(OwnerReport, root, { cafeId: cafe.id, source: this.source(cafe) });
  }
  syncHistory() {
    const cafe = this.current(), root = this.$('[data-owner-sensor-history]');
    if (!cafe || !root) return;
    if (this.historyCafe === cafe.id && this.historyView?.el === root) { this.historyView.setProps({ source: cafe.live?.sensor?.dataSource || 'real' }); return; }
    this.historyView?.destroy(); this.historyCafe = cafe.id;
    this.historyView = this.child(SensorHistory, root, { cafeId: cafe.id, source: cafe.live?.sensor?.dataSource || 'real', role: 'owner' });
  }
  // The café's own animated interior, kept alive across re-renders.
  syncPlan() {
    const cafe = this.current(), wrap = this.$('[data-own-plan]');
    const key = cafe && wrap ? `${cafe.id}:${JSON.stringify(cafe.visualization.layout)}` : null;
    if (key === this.planKey) { this.fp?.syncTelemetry(cafe, platform.config.sensor_stale_after_sec ?? 30); return; }
    this.fp?.destroy(); this.fp = null; this.planKey = key;
    if (!key) return;
    wrap.innerHTML = '';
    const occ = cafe.live.free_pct != null ? 100 - cafe.live.free_pct : 40;
    this.fp = new FloorPlan(wrap, { ...cafe, occ }, { layout: cafe.visualization.layout, sound: cafe.live.noise_level || 2 });
    this.fp.syncTelemetry(cafe, platform.config.sensor_stale_after_sec ?? 30);
  }

  /* ---------- дээрх 3 карт ---------- */
  summaryHTML(c, sensor, trust) {
    const { incoming, now } = this.state, demo = customer.mode === 'mock' && c.data_mode === 'demo' ? html`<span class="badge b-demo">ДЕМО</span>` : '';
    const soon = incoming ? arrivingWithin(incoming, now) : null;
    const waiting = incoming ? incoming.filter(v => v.lines.length && ['pending', 'accepted'].includes(v.status)).length : null;
    const people = sensor?.observedPeople;
    const card = (go, big, text, foot) => html`<button type="button" class="own-sum-c" data-own-go="${go}"><b class="num">${big}</b><span>${text}</span>${foot}</button>`;
    return html`<div class="own-sum" role="group" aria-label="Товч мэдээлэл">
      ${card('today', people ?? '—', people == null ? 'Хүний тоо одоогоор алга' : `Одоо ${people} хүн`, html`<small class="own-sum-f t-${trust.kind}">${trust.text}</small>`)}
      ${card('orders', soon ?? '—', `Ойрын 1 цагт ${soon ?? '—'} хүн ирнэ`, demo)}
      ${card('orders', waiting ?? '—', `${waiting ?? '—'} захиалга хүлээгдэж байна`, demo)}
    </div>`;
  }

  render() {
    const user = platform.session.user;
    if (!platform.online) return html`<div class="wrap page"><div class="card gate"><h1>Кафе эзэмшигч</h1><p class="muted">Энэ хувилбар сервергүй ажиллаж байгаа тул самбар ашиглах боломжгүй.</p></div></div>`;
    if (!user) return signInPrompt('owner', 'Кафе эзэмшигчийн самбарт нэвтэрнэ үү.');
    if (!platform.session.hasRole('owner', 'admin')) return html`<div class="wrap page"><div class="card gate"><span class="gate-ic">${raw(I.hand)}</span><h1>Кафе эзэмшигч үү?</h1><p class="muted">«Хамтын ажиллагаа» хуудаснаас хүсэлт илгээснээр кафе эзэмшигчийн самбар нээгдэнэ.</p><a class="btn btn-p" href="#partner">Хамтран ажиллах →</a></div></div>`;
    if (this.state.error) return html`<div class="wrap page"><div class="card gate"><h1>Мэдээлэл ачаалж чадсангүй</h1><p class="muted">${this.state.error}</p>${nextStepsHTML('load')}<button class="btn btn-o" data-own-retry>Дахин оролдох</button></div></div>`;
    const { cafes, tab } = this.state;
    if (!cafes) return html`<div class="wrap page"><div class="skel" style="height:150px;margin-top:24px"></div><div class="skel" style="height:320px;margin-top:20px"></div></div>`;
    if (!cafes.length) return html`<div class="wrap page"><div class="card gate"><span class="gate-ic">${raw(I.hand)}</span><h1>Кафе бүртгэгдээгүй байна</h1><p class="muted">Хамтран ажиллах хүсэлт илгээсний дараа энд харагдана.</p><a class="btn btn-p" href="#partner">Хүсэлт илгээх →</a></div></div>`;
    const c = this.current(), stale = platform.config.sensor_stale_after_sec ?? 30;
    const hasData = c.live.mode === 'live' || c.live.mode === 'test';
    const sensor = sensorState(c, { staleAfterSec: stale }), trust = trustState(c, { staleAfterSec: stale });
    const [badgeClass, badgeWord] = TRUST_BADGE[trust.kind];
    const layoutName = c.visualization.layout ? LAYOUTS[c.visualization.layout.preset]?.name : null;
    const active = c.status === 'active';
    const waiting = this.state.incoming?.filter(v => v.lines.length && ['pending', 'accepted'].includes(v.status)).length || 0;
    const meta = [c.address, c.district, c.hours].filter(Boolean);
    const panel = key => tab === key ? '' : raw('hidden'), open = key => this.state.open[key] ? raw('open') : '';

    const statusCard = active
      ? html`<details class="card own-status own-active" data-key="status" ${open('status')}><summary data-own-open="status"><span class="badge b-live">Идэвхтэй ✓</span><span class="muted">${STATUS_TEXT.active}</span></summary>${timelineHTML(c.status, c.history)}</details>`
      : html`<section class="card own-status" data-key="status">
          <div class="card-h"><h2>Хүсэлтийн явц</h2><span class="badge ${c.status === 'rejected' ? 'b-stale' : 'b-typ'}">${statusLabel(c.status).toUpperCase()}</span></div>
          <p class="own-msg">${STATUS_TEXT[c.status]}</p>${timelineHTML(c.status, c.history)}</section>`;

    return html`<div class="page"><div class="wrap own">
      <div class="own-head"><div><span class="tagp">Кафе эзэмшигч</span><h1>${c.name}</h1>
        ${meta.length ? html`<p class="muted num own-meta">${meta.join(' · ')}</p>` : ''}</div>
        ${cafes.length > 1 ? html`<div class="chips">${cafes.map(x => html`<button class="chip" data-own-cafe="${x.id}" aria-pressed="${x.id === c.id}">${x.name}</button>`)}</div>` : ''}
        ${active ? html`<a class="btn btn-o own-public" href="#cafe-${c.id}">Нийтэд харагдах хуудас →</a>` : ''}</div>

      ${this.summaryHTML(c, sensor, trust)}

      <div class="own-tabs" role="tablist" aria-label="Самбарын хэсэг">${TABS.map(([k, l]) => html`<button type="button" role="tab" data-own-tab="${k}" id="own-tab-${k}" aria-selected="${k === tab}" aria-controls="own-panel-${k}" tabindex="${k === tab ? 0 : -1}">${l}${k === 'orders' && waiting ? html`<span class="own-tab-n num" aria-label="${waiting} хүлээгдэж буй">${waiting}</span>` : ''}</button>`)}</div>

      <div class="own-panel" data-own-panel="today" id="own-panel-today" role="tabpanel" aria-labelledby="own-tab-today" ${panel('today')}>
        ${statusCard}
        <section class="card own-live" data-key="live">
          <div class="card-h"><h2>Одоогийн байдал</h2><span class="badge ${badgeClass}">${badgeWord}</span></div>
          ${hasData ? html`<p class="own-trust t-${trust.kind}">${trust.text}</p>${ownerTilesHTML(c, sensor)}`
            : html`<p class="own-msg">${c.devices.length ? 'Утас бүртгэгдсэн боловч хэмжилт хараахан ирээгүй байна.' : 'Утас (мэдрэгч) суурилуулсны дараа хүний тоо, дуу чимээ, Wi-Fi энд харагдана.'}</p>
              <p class="muted own-note">Бид бодит хэмжилтгүй үед тоо зохиож харуулахгүй.</p>`}
        </section>
        <section class="card own-dev" data-key="dev">
          <div class="card-h"><h2>Утас, мэдрэгч</h2></div>
          ${c.devices.length ? html`<ul class="own-devices">${c.devices.map(d => html`<li><span class="dot ${d.online ? 'on' : ''}"></span><b>${d.label || 'Утас'}</b><small class="muted">${deviceWords(d)}${d.is_test ? ' · Туршилтын өгөгдөл' : ''}</small></li>`)}</ul>`
            : html`<p class="own-msg">Утас (мэдрэгч) хараахан суурилуулаагүй.</p>`}
          ${c.devices.some(d => !d.online) ? nextStepsHTML('device', 'Энэ хооронд зочдод «Мэдээлэл хуучирсан» гэж харагдана; хуучин тоог шинэ мэт харуулахгүй.') : ''}
        </section>
        ${c.visualization.status === 'ready' ? html`<details class="card own-vis" data-key="vis" ${open('vis')}><summary data-own-open="vis"><h2>Танхимын зураглал</h2></summary>
            <div class="plan-wrap own-plan" data-own-plan data-preserve data-key="plan-${c.id}"></div>
            <p class="muted own-note">${layoutName ? `«${layoutName}» загвар. ` : ''}Дүрслэл — сандал дээрх хүмүүс, байршил нь бодит суудлын илрүүлэлт биш.</p></details>`
          : html`<section class="card own-vis" data-key="vis"><div class="card-h"><h2>Танхимын зураглал</h2><span class="badge b-typ">${visLabel(c.visualization.status).toUpperCase()}</span></div><p class="own-msg">${c.visualization.status === 'in_progress' ? 'Таны илгээсэн зургаар кафены өөрийн зураглалыг бэлтгэж байна.' : 'Манай баг тантай холбогдсоны дараа таны зургаар кафены өөрийн хөдөлгөөнт зураглалыг бүтээнэ.'}</p></section>`}
        ${c.application?.photos.length ? html`<section class="card own-photos" data-key="photos"><div class="card-h"><h2>Илгээсэн зураг</h2></div>
          <div class="ph-grid">${c.application.photos.map((p, i) => html`<figure class="ph"><img src="${p.url}" alt="Кафены зураг ${i + 1}" loading="lazy" decoding="async"></figure>`)}</div></section>` : ''}
        <section class="card own-photos" data-key="public-photos"><div data-owner-photos data-preserve data-key="owner-photos-${c.id}"></div></section>
        <section class="card own-info" data-key="info">
          <div class="card-h"><h2>Кафены мэдээлэл</h2></div>
          <form class="form own-edit" novalidate>
            ${field(this.state.formErrors, { name: 'hours', label: 'Ажлын цаг (08:00–22:00)', value: c.hours })}
            ${field(this.state.formErrors, { name: 'phone', label: 'Утас', value: c.phone })}
            ${field(this.state.formErrors, { name: 'contact_name', label: 'Холбоо барих хүн', value: c.contact_name })}
            <div class="fld full"><label for="own-desc">Тайлбар</label><textarea id="own-desc" name="description" rows="3">${c.description}</textarea></div>
            <div class="fld full"><button class="btn btn-p" ${raw(this.state.saving ? 'disabled' : '')}>Хадгалах</button></div>
          </form>
        </section>
      </div>

      <div class="own-panel" data-own-panel="orders" id="own-panel-orders" role="tabpanel" aria-labelledby="own-tab-orders" ${panel('orders')}><section class="card own-orders" data-key="orders"><div data-own-orders data-preserve data-key="orders-${c.id}">${c.data_mode !== 'demo' ? html`<h2>Захиалга</h2><p class="muted">Энэ кафед захиалгын үйлчилгээ холбогдоогүй байна.</p>` : ''}</div></section></div>
      <div class="own-panel" data-own-panel="menu" id="own-panel-menu" role="tabpanel" aria-labelledby="own-tab-menu" ${panel('menu')}><section class="card own-menu" data-key="menu"><div data-own-menu data-preserve data-key="menu-${c.id}"></div></section></div>
      <div class="own-panel" data-own-panel="report" id="own-panel-report" role="tabpanel" aria-labelledby="own-tab-report" ${panel('report')}>
        <section class="card own-report" data-key="report"><div data-own-report data-preserve data-key="report-${c.id}"></div></section>
        <details class="card own-tech" data-key="tech" ${open('tech')}><summary data-own-open="tech"><h2>Техникийн дэлгэрэнгүй</h2><small class="muted">Төхөөрөмжийн дугаар, хэмжилтийн түүхий утга, хүснэгт</small></summary>
          ${hasData ? raw(sensorPanelHTML(c, false, { staleAfterSec: stale })) : ''}
          ${c.devices.length ? html`<ul class="own-devices own-devices-tech">${c.devices.map(d => html`<li><b>${d.id}</b><small class="muted">${sensorStatusLabel(d.status)} · ${sensorSourceLabel(d.is_test ? 'simulated' : 'real')}${d.last_seen_at ? ` · сүүлд ${dateTime(d.last_seen_at)}` : ''}</small>${raw(deviceDiagnosticsHTML(d))}</li>`)}</ul>` : ''}
          <div data-owner-sensor-history data-preserve data-key="sensor-history-${c.id}"></div>
        </details>
      </div>
    </div></div>`;
  }
}
