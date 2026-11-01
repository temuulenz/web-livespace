// Café-owner dashboard (#owner).
// Shows the application's progress, the café's own visualization, installed devices
// and — only once real sensors report — the café's live seats, noise and Wi-Fi.
import { Component, html, raw, readForm, dateTime } from '../../../framework/index.js';
import { I } from '../../icons.js';
import { Snd } from '../../audio.js';
import { SS, WIFI } from '../../cafes.js';
import { seatRow, ssGlyph, wifiSVG } from '../../components/atmosphere.js';
import { FloorPlan } from '../../simulation/floor-plan.js';
import { LAYOUTS } from '../../simulation/layouts.js';
import { SETUP_STEPS, statusLabel, VIS_STATUSES } from '../../live/levels.js';
import { freshnessHTML } from '../../live/freshness.js';
import { platform } from '../../services/platform.js';
import { toast } from '../../components/feedback.js';
import { openAuth, field } from '../authentication/auth-modal.js';
import { signInPrompt } from '../account/account.js';

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
export const visLabel = key => VIS_STATUSES.find(([k]) => k === key)?.[1] || key;

export function timelineHTML(status, history = []) {
  if (status === 'rejected') return html`<ol class="own-steps"><li class="st-on st-bad"><i></i><span>${statusLabel('rejected')}</span></li></ol>`;
  const index = SETUP_STEPS.findIndex(([key]) => key === status);
  const reached = key => history.find(h => h.to_status === key)?.at;
  return html`<ol class="own-steps">${SETUP_STEPS.map(([key, label], i) => html`<li class="${i < index ? 'st-done' : i === index ? 'st-on' : ''}"><i>${i < index ? raw(I.check) : i + 1}</i><span>${label}${reached(key) && i <= index ? html`<small>${dateTime(reached(key))}</small>` : ''}</span></li>`)}</ol>`;
}

export function liveTilesHTML(live) {
  const seats = live.free_pct != null ? html`<div class="own-tile"><small>${raw(I.seat)} Сул суудал</small>${raw(seatRow(100 - live.free_pct))}<b class="num">${live.free_pct}%</b><span class="muted num">${live.total_seats != null ? `${live.total_seats}-оос ${live.available_seats ?? '—'} сул` : ''}</span></div>` : '';
  const noise = live.noise_level ? html`<div class="own-tile"><small>${raw(ssGlyph(2))} Дуу чимээ</small><span class="sg">${raw(ssGlyph(live.noise_level))}</span><b>${SS[live.noise_level].short}</b><span class="muted num">${Math.round(live.noise_db)} dB</span></div>` : '';
  const wifi = live.wifi_level ? html`<div class="own-tile"><small>${raw(wifiSVG(3, 14))} Wi-Fi</small>${raw(wifiSVG(live.wifi_level, 26))}<b>${WIFI[live.wifi_level]}</b><span class="muted num">${live.wifi_mbps != null ? `${Math.round(live.wifi_mbps)} Mbps` : `чанар ${Math.round(live.wifi_quality)}/100`}</span></div>` : '';
  return html`<div class="own-tiles">${seats}${noise}${wifi}</div>`;
}

export class OwnerPage extends Component {
  initialState() { return { cafes: null, error: null, selected: null, saving: false, formErrors: {} }; }
  events() {
    return {
      'click [data-gate-login]': (e, b) => openAuth({ reason: b.dataset.gateLogin }),
      'click [data-own-cafe]': (e, b) => { Snd.ui('click'); this.setState({ selected: b.dataset.ownCafe }); },
      'submit .own-edit': e => { e.preventDefault(); this.save(e.target); },
      'click [data-own-retry]': () => this.load()
    };
  }
  onMount() {
    this.watch(platform.session.store, s => s.user, () => this.load());
    this.listen(document, 'visibilitychange', () => { if (!document.hidden) this.load(); });
    this.onCleanup(platform.bus.on('cafe:updated', id => { if (this.state.cafes?.some(c => c.id === id)) this.load(); }));
    this.interval(() => { if (!document.hidden) this.load(); }, platform.config.poll_interval_sec * 1000);
    this.load();
  }
  onDestroy() { this.fp?.destroy(); }
  async load() {
    if (!platform.online || !platform.session.hasRole('owner', 'admin')) { this.setState({ cafes: null }); return; }
    try {
      const { cafes } = await platform.api.get('/owner/cafes');
      this.setState({ cafes, error: null, selected: this.state.selected && cafes.some(c => c.id === this.state.selected) ? this.state.selected : cafes[0]?.id });
    } catch (error) { this.setState({ error: error.message || 'Алдаа гарлаа' }); }
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
  onUpdate() { this.syncPlan(); }
  // The café's own animated interior, kept alive across re-renders.
  syncPlan() {
    const cafe = this.current(), wrap = this.$('[data-own-plan]');
    const key = cafe && wrap ? `${cafe.id}:${JSON.stringify(cafe.visualization.layout)}` : null;
    if (key === this.planKey) return;
    this.fp?.destroy(); this.fp = null; this.planKey = key;
    if (!key) return;
    wrap.innerHTML = '';
    const occ = cafe.live.free_pct != null ? 100 - cafe.live.free_pct : 40;
    this.fp = new FloorPlan(wrap, { id: cafe.id, name: cafe.name, occ }, { layout: cafe.visualization.layout, sound: cafe.live.noise_level || 2 });
  }
  render() {
    const user = platform.session.user;
    if (!platform.online) return html`<div class="wrap page"><div class="card gate"><h1>Кафе эзэмшигч</h1><p class="muted">Энэ хувилбар сервергүй ажиллаж байгаа тул самбар ашиглах боломжгүй.</p></div></div>`;
    if (!user) return signInPrompt('owner', 'Кафе эзэмшигчийн самбарт нэвтэрнэ үү.');
    if (!platform.session.hasRole('owner', 'admin')) return html`<div class="wrap page"><div class="card gate"><span class="gate-ic">${raw(I.hand)}</span><h1>Кафе эзэмшигч үү?</h1><p class="muted">«Хамтын ажиллагаа» хуудаснаас хүсэлт илгээснээр кафе эзэмшигчийн самбар нээгдэнэ.</p><a class="btn btn-p" href="#partner">Хамтран ажиллах →</a></div></div>`;
    if (this.state.error) return html`<div class="wrap page"><div class="card gate"><h1>Мэдээлэл ачаалж чадсангүй</h1><p class="muted">${this.state.error}</p><button class="btn btn-o" data-own-retry>Дахин оролдох</button></div></div>`;
    const { cafes } = this.state;
    if (!cafes) return html`<div class="wrap page"><div class="skel" style="height:150px;margin-top:24px"></div><div class="skel" style="height:320px;margin-top:20px"></div></div>`;
    if (!cafes.length) return html`<div class="wrap page"><div class="card gate"><span class="gate-ic">${raw(I.hand)}</span><h1>Кафе бүртгэгдээгүй байна</h1><p class="muted">Хамтран ажиллах хүсэлт илгээсний дараа энд харагдана.</p><a class="btn btn-p" href="#partner">Хүсэлт илгээх →</a></div></div>`;
    const c = this.current();
    const hasData = c.live.mode === 'live' || c.live.mode === 'test';
    const layoutName = c.visualization.layout ? LAYOUTS[c.visualization.layout.preset]?.name : null;
    return html`<div class="page"><div class="wrap own">
      <div class="own-head"><div><span class="tagp">Кафе эзэмшигч</span><h1>${c.name}</h1>
        <p class="muted">${c.address || '—'} · ${c.district} · <span class="num">${c.hours}</span></p></div>
        ${cafes.length > 1 ? html`<div class="chips">${cafes.map(x => html`<button class="chip" data-own-cafe="${x.id}" aria-pressed="${x.id === c.id}">${x.name}</button>`)}</div>` : ''}
        ${c.status === 'active' ? html`<a class="btn btn-o" href="#cafe-${c.id}">Нийтэд харагдах хуудас →</a>` : ''}</div>

      <div class="own-grid">
        <section class="card own-status" data-key="status">
          <div class="card-h"><h2>Хүсэлтийн явц</h2><span class="badge ${c.status === 'active' ? 'b-live' : c.status === 'rejected' ? 'b-stale' : 'b-typ'}">${statusLabel(c.status).toUpperCase()}</span></div>
          <p class="own-msg">${STATUS_TEXT[c.status]}</p>
          ${timelineHTML(c.status, c.history)}
        </section>

        <section class="card own-live" data-key="live">
          <div class="card-h"><h2>Одоогийн байдал</h2></div>
          ${hasData ? html`<div class="cd-fresh">${raw(freshnessHTML(c))}</div>${liveTilesHTML(c.live)}`
            : html`<p class="own-msg">${c.devices.length ? 'Мэдрэгч бүртгэгдсэн боловч хэмжилт хараахан ирээгүй байна.' : 'Мэдрэгч суурилуулсны дараа сул суудал, дуу чимээ, Wi-Fi-ийн бодит хэмжилт энд харагдана.'}</p>
              <p class="muted own-note">Бид бодит хэмжилтгүй үед тоо зохиож харуулахгүй.</p>`}
        </section>

        <section class="card own-vis" data-key="vis">
          <div class="card-h"><h2>Хөдөлгөөнт зураглал</h2><span class="badge ${c.visualization.status === 'ready' ? 'b-live' : 'b-typ'}">${visLabel(c.visualization.status).toUpperCase()}</span></div>
          ${c.visualization.status === 'ready' ? html`
            <div class="plan-wrap own-plan" data-own-plan data-preserve data-key="plan-${c.id}"></div>
            <p class="muted own-note">${layoutName ? `«${layoutName}» загвар дээр үндэслэсэн.` : ''} ${hasData ? 'Хүмүүсийн тоо бодит хэмжилтийг дагана.' : 'Урьдчилсан харагдац — доторх хүмүүс бол жишээ.'}</p>`
            : html`<p class="own-msg">${c.visualization.status === 'in_progress' ? 'Таны илгээсэн зургаар кафены өөрийн зураглалыг бэлтгэж байна.' : 'Манай баг тантай холбогдсоны дараа таны зургаар кафены өөрийн хөдөлгөөнт зураглалыг бүтээнэ.'}</p>`}
        </section>

        <section class="card own-dev" data-key="dev">
          <div class="card-h"><h2>Мэдрэгч, камер</h2></div>
          ${c.devices.length ? html`<ul class="own-devices">${c.devices.map(d => html`<li><span class="dot ${d.online ? 'on' : ''}"></span><b>${d.label || d.id}</b><small class="muted">${d.online ? 'Холбогдсон' : 'Холбогдоогүй'}${d.last_seen_at ? ` · сүүлд ${dateTime(d.last_seen_at)}` : ''}${d.is_test ? ' · туршилтын' : ''}</small></li>`)}</ul>`
            : html`<p class="own-msg">Төхөөрөмж хараахан суурилуулаагүй.</p>`}
        </section>

        ${c.application?.photos.length ? html`<section class="card own-photos" data-key="photos"><div class="card-h"><h2>Илгээсэн зураг</h2></div>
          <div class="ph-grid">${c.application.photos.map((p, i) => html`<figure class="ph"><img src="${p.url}" alt="Кафены зураг ${i + 1}" loading="lazy" decoding="async"></figure>`)}</div></section>` : ''}

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
      </div></div></div>`;
  }
}
