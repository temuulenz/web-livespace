// Internal admin / developer dashboard (#admin). Functional first: every table maps
// directly to an API endpoint in server/routes/admin.mjs.
import { Component, html, raw, readForm, dateTime } from '../../../framework/index.js';
import { I } from '../../icons.js';
import { Snd } from '../../audio.js';
import { LayoutEditor } from './layout-editor.js';
import { SETUP_STATUSES, statusLabel, VIS_STATUSES } from '../../live/levels.js';
import { platform } from '../../services/platform.js';
import { toast } from '../../components/feedback.js';
import { openAuth } from '../authentication/auth-modal.js';
import { signInPrompt } from '../account/account.js';
import { liveTilesHTML, timelineHTML, visLabel } from '../owner-dashboard/owner-page.js';

const TABS = [['overview', 'Тойм'], ['applications', 'Хүсэлтүүд'], ['cafes', 'Кафенууд'], ['users', 'Хэрэглэгчид'], ['devices', 'Төхөөрөмж'], ['measurements', 'Хэмжилт']];
const when = iso => iso ? dateTime(iso) : '—';
const statusBadge = status => html`<span class="badge ${status === 'active' ? 'b-live' : status === 'rejected' ? 'b-stale' : 'b-typ'}">${statusLabel(status)}</span>`;
const modeBadge = mode => html`<span class="badge ${mode === 'demo' ? 'b-demo' : 'b-live'}">${mode === 'demo' ? 'ДЕМО' : 'БОДИТ'}</span>`;
const exampleBody = (cafeId, deviceId) => JSON.stringify({ schema_version: '1.0', cafe_id: cafeId, device_id: deviceId, timestamp: '2026-11-01T10:30:00Z', measurements: { available_seats: 12, occupied_seats: 18, total_seats: 30, noise_level_db: 42, wifi_quality: 85, wifi_download_mbps: 64 }, device_status: { state: 'online', battery_pct: 90 } }, null, 2);

export class AdminPage extends Component {
  initialState() {
    const tab = new URLSearchParams(location.hash.split('?')[1] || '').get('tab');
    return { tab: TABS.some(([k]) => k === tab) ? tab : 'overview', data: {}, cafe: null, loading: false, error: null, token: null, suggestion: null, filter: { cafe_id: '', device_id: '' }, auto: false };
  }
  events() {
    return {
      'click [data-gate-login]': (e, b) => openAuth({ reason: b.dataset.gateLogin }),
      'click [data-tab]': (e, b) => this.go(b.dataset.tab),
      'click [data-open-cafe]': (e, b) => { e.preventDefault(); this.openCafe(b.dataset.openCafe); },
      'click [data-back]': () => { this.setState({ cafe: null, token: null, suggestion: null }); this.load(); },
      'click [data-refresh]': () => this.load(),
      'submit [data-form]': (e, form) => { e.preventDefault(); this[form.dataset.form](form); },
      'click [data-suggest]': () => this.suggest(),
      'click [data-rotate]': (e, b) => this.rotate(b.dataset.rotate),
      'click [data-revoke]': (e, b) => this.revoke(b.dataset.revoke),
      'change [data-filter]': (e, el) => { this.setState({ filter: { ...this.state.filter, [el.name]: el.value } }); this.load(); },
      'change [data-auto]': (e, el) => this.setState({ auto: el.checked }),
      'change [name="role"]': () => this.load()
    };
  }
  onMount() {
    this.watch(platform.session.store, s => s.user, () => { this.invalidate(); this.load(); });
    this.interval(() => { if (this.state.auto && !document.hidden && this.state.tab === 'measurements' && !this.state.cafe) this.load(); }, 15000);
    this.load();
  }
  onDestroy() { this.editor?.destroy(); }
  onUpdate() { this.syncEditor(); }

  go(tab) {
    Snd.ui('click');
    history.replaceState(null, '', `#admin?tab=${tab}`);
    this.setState({ tab, cafe: null, token: null, suggestion: null });
    this.load();
  }

  async load() {
    if (!platform.session.hasRole('admin')) return;
    const api = platform.api, { tab, filter } = this.state;
    this.setState({ loading: true, error: null });
    try {
      let data;
      if (tab === 'overview') data = await api.get('/admin/overview');
      else if (tab === 'applications') data = await api.get('/admin/applications');
      else if (tab === 'cafes') data = await api.get('/admin/cafes');
      else if (tab === 'users') data = await api.get(`/admin/users${this.$('[name="role"]')?.value ? '?role=' + this.$('[name="role"]').value : ''}`);
      else if (tab === 'devices') data = { ...(await api.get('/admin/devices')), ...(await api.get('/admin/cafes')) };
      else if (tab === 'measurements') {
        const q = new URLSearchParams(Object.entries(filter).filter(([, v]) => v)).toString();
        data = { ...(await api.get(`/admin/measurements?limit=200${q ? '&' + q : ''}`)), ...(await api.get('/admin/cafes')), ...(await api.get('/admin/devices')) };
      }
      this.setState({ data, loading: false });
      if (this.state.cafe) await this.openCafe(this.state.cafe.id, true);
    } catch (error) { this.setState({ loading: false, error: error.message }); }
  }

  async openCafe(id, quiet) {
    try {
      const [{ cafe }, { devices }, { measurements }] = await Promise.all([platform.api.get(`/admin/cafes/${id}`), platform.api.get('/admin/devices'), platform.api.get(`/admin/measurements?cafe_id=${encodeURIComponent(id)}&limit=20`)]);
      if (!quiet) Snd.ui('pop');
      this.setState({ cafe: { ...cafe, devices: devices.filter(d => d.cafe_id === id), measurements } });
    } catch (error) { toast(error.message); }
  }

  async run(promise, message) {
    try { const result = await promise; Snd.ui('chime'); if (message) toast(message, true); return result; }
    catch (error) { Snd.ui('err'); toast(error.details ? `${error.message}: ${Object.entries(error.details).map(([k, v]) => `${k} — ${v}`).join('; ')}` : error.message); return null; }
  }

  async saveStatus(form) {
    const { status, note } = readForm(form);
    if (await this.run(platform.api.post(`/admin/cafes/${this.state.cafe.id}/status`, { status, note }), 'Төлөв шинэчлэгдлээ')) this.openCafe(this.state.cafe.id, true);
  }
  async saveInfo(form) {
    const v = readForm(form), body = {};
    for (const key of ['name', 'category', 'district', 'address', 'hours', 'phone', 'contact_name', 'email', 'description', 'data_mode']) body[key] = v[key];
    for (const key of ['lat', 'lng', 'map_x', 'map_y']) body[key] = v[key] === '' ? null : Number(v[key]);
    for (const key of ['total_seats', 'sort_order']) if (v[key] !== '') body[key] = Number(v[key]);
    body.tags = v.tags.split(',').map(t => t.trim()).filter(Boolean);
    if (v.demo.trim()) { try { body.demo = JSON.parse(v.demo); } catch { toast('Демо утга JSON буруу байна'); return; } }
    if (await this.run(platform.api.patch(`/admin/cafes/${this.state.cafe.id}`, body), 'Хадгалагдлаа')) this.openCafe(this.state.cafe.id, true);
  }
  layoutFromForm(form) {
    const v = readForm(form);
    return { status: v.vstatus, notes: v.notes, layout: this.editor.getLayout() };
  }
  async saveVisualization(form) {
    const body = this.layoutFromForm(form);
    if (this.state.suggestion) body.generator = `suggested:${this.state.suggestion.provider}`;
    if (await this.run(platform.api.put(`/admin/cafes/${this.state.cafe.id}/visualization`, body), 'Зураглал хадгалагдлаа')) { this.setState({ suggestion: null }); this.openCafe(this.state.cafe.id, true); }
  }
  async suggest() {
    const result = await this.run(platform.api.post(`/admin/cafes/${this.state.cafe.id}/visualization/suggest`));
    if (result) { this.setState({ suggestion: result.suggestion }); this.editor?.setLayout(result.suggestion.layout); }
  }
  // One layout editor per opened café; it survives re-renders (data-preserve).
  syncEditor() {
    const root = this.$('[data-adm-editor]'), cafe = this.state.cafe;
    const key = root && cafe ? cafe.id : null;
    if (key === this.editorKey && (!key || root.firstChild)) return;
    this.editor?.destroy(); this.editor = null; this.editorKey = key;
    if (!key) return;
    this.editor = new LayoutEditor(root, { layout: cafe.visualization.layout, cafe: { id: cafe.id, name: cafe.name } });
  }
  async saveDevice(form) {
    const v = readForm(form);
    const result = await this.run(platform.api.post('/admin/devices', { id: v.id || undefined, cafe_id: v.cafe_id || this.state.cafe?.id, label: v.label, kind: v.kind, is_test: v.is_test }), 'Төхөөрөмж бүртгэгдлээ');
    if (result) { this.setState({ token: { id: result.device.id, cafe_id: result.device.cafe_id, value: result.token } }); this.state.cafe ? this.openCafe(this.state.cafe.id, true) : this.load(); }
  }
  async rotate(id) {
    if (!confirm(`${id}: шинэ токен үүсгэх үү? Хуучин токен ажиллахаа болино.`)) return;
    const result = await this.run(platform.api.post(`/admin/devices/${encodeURIComponent(id)}/token`), 'Шинэ токен үүслээ');
    if (result) this.setState({ token: { id, cafe_id: this.state.cafe?.id || '', value: result.token } });
  }
  async revoke(id) {
    if (!confirm(`${id}: төхөөрөмжийг идэвхгүй болгох уу? Энэ төхөөрөмжөөс ирэх хэмжилтийг хүлээж авахгүй.`)) return;
    if (await this.run(platform.api.del(`/admin/devices/${encodeURIComponent(id)}`), 'Идэвхгүй болголоо')) this.state.cafe ? this.openCafe(this.state.cafe.id, true) : this.load();
  }

  /* ---------- views ---------- */
  render() {
    if (!platform.online) return html`<div class="wrap page"><div class="card gate"><h1>Админ</h1><p class="muted">Энэ хувилбар сервергүй ажиллаж байна.</p></div></div>`;
    if (!platform.session.user) return signInPrompt('admin', 'Зөвхөн LiveSpace багийн гишүүд нэвтэрнэ.');
    if (!platform.session.hasRole('admin')) return html`<div class="wrap page"><div class="card gate"><h1>Хандах эрхгүй</h1><p class="muted">Энэ хуудас зөвхөн LiveSpace багт зориулагдсан.</p><a class="btn btn-o" href="#home">Нүүр хуудас</a></div></div>`;
    const { tab, cafe, loading, error } = this.state;
    return html`<div class="page"><div class="wrap adm">
      <div class="adm-head"><span class="badge" style="background:var(--brown);color:#fff">LIVESPACE БАГ</span><h1>Админ самбар</h1>
        <button class="btn btn-g" data-refresh>${loading ? 'Ачаалж байна…' : 'Шинэчлэх'}</button></div>
      <nav class="chips adm-tabs">${TABS.map(([key, label]) => html`<button class="chip" data-tab="${key}" aria-pressed="${key === tab && !cafe}">${label}</button>`)}</nav>
      ${error ? html`<p class="auth-msg" role="alert">${error}</p>` : ''}
      ${this.state.token ? this.tokenView() : ''}
      ${cafe ? this.cafeView() : this[`${tab}View`]()}
    </div></div>`;
  }

  tokenView() {
    const { id, cafe_id: cafeId, value } = this.state.token;
    return html`<section class="card adm-token" data-key="token"><h2>${raw(I.sensor)} ${id} — төхөөрөмжийн токен</h2>
      <p>Энэ токеныг <b>одоо</b> хуулж төхөөрөмжид тохируулна уу. Дахин харагдахгүй (зөвхөн hash хадгалагдана).</p>
      <pre class="adm-code">${value}</pre>
      <details><summary>Илгээх жишээ</summary><pre class="adm-code">POST ${location.origin}/api/v1/ingest/measurements
Authorization: Bearer ${value}
Content-Type: application/json

${exampleBody(cafeId, id)}</pre></details></section>`;
  }

  overviewView() {
    const d = this.state.data;
    if (!('cafes' in d) || Array.isArray(d.cafes)) return html`<p class="muted">Ачаалж байна…</p>`;
    const stat = (n, label) => html`<div class="icard"><b class="num adm-n">${n}</b><span>${label}</span></div>`;
    return html`<div class="g4">${stat(d.cafes, 'Нийт кафе')}${stat(d.active, 'Идэвхтэй')}${stat(d.pending_applications, 'Хүлээгдэж буй хүсэлт')}${stat(d.owners, 'Эзэмшигч')}${stat(`${d.devices_online}/${d.devices}`, 'Онлайн төхөөрөмж')}${stat(d.measurements_24h, 'Сүүлийн 24 цагийн хэмжилт')}${stat(d.stream_clients, 'Шууд холболт (SSE)')}</div>
      <section class="card" style="margin-top:16px"><h2>Тохиргоо</h2><table class="adm-t"><tbody>
        <tr><th>Polling давтамж</th><td>${d.config.poll_interval_sec} сек (LS_POLL_INTERVAL_SEC)</td></tr>
        <tr><th>Хуучирсан гэж тооцох</th><td>${d.config.stale_after_sec} сек (LS_STALE_AFTER_SEC)</td></tr>
        <tr><th>Төхөөрөмж offline</th><td>${d.config.device_offline_sec} сек (LS_DEVICE_OFFLINE_SEC)</td></tr>
        <tr><th>Зураглалын санал</th><td>${d.config.visualization_provider}</td></tr></tbody></table></section>`;
  }

  applicationsView() {
    const apps = this.state.data.applications || [];
    if (!apps.length) return html`<p class="muted">Хүсэлт алга.</p>`;
    return html`<div class="adm-scroll"><table class="adm-t"><thead><tr><th>Огноо</th><th>Кафе</th><th>Холбоо барих</th><th>Эзэмшигчийн бүртгэл</th><th>Зураг</th><th>Төлөв</th><th></th></tr></thead><tbody>
      ${apps.map(a => html`<tr><td class="num">${when(a.created_at)}</td><td><b>${a.name}</b><br><small class="muted">${a.form.address} · ${a.form.district}</small></td>
        <td>${a.form.contact_name}<br><small class="muted">${a.form.phone} · ${a.form.email}</small></td><td>${a.owner_email || html`<span class="muted">үүсгээгүй</span>`}</td>
        <td class="num">${a.photo_count}</td><td>${statusBadge(a.status)}</td><td><button class="btn btn-o" data-open-cafe="${a.cafe_id}">Нээх</button></td></tr>`)}</tbody></table></div>`;
  }

  cafesView() {
    const cafes = this.state.data.cafes || [];
    return html`<div class="adm-scroll"><table class="adm-t"><thead><tr><th>Кафе</th><th>Төлөв</th><th>Өгөгдөл</th><th>Эзэмшигч</th><th>Төхөөрөмж</th><th>Сүүлийн хэмжилт</th><th>Зураглал</th><th></th></tr></thead><tbody>
      ${cafes.map(c => html`<tr><td><b>${c.name}</b><br><small class="muted">${c.id}</small></td><td>${statusBadge(c.status)}</td><td>${modeBadge(c.data_mode)}</td><td>${c.owner_email || '—'}</td><td class="num">${c.device_count}</td><td class="num">${when(c.last_measurement_at)}</td><td>${visLabel(c.visualization_status)}</td><td><button class="btn btn-o" data-open-cafe="${c.id}">Засах</button></td></tr>`)}</tbody></table></div>`;
  }

  usersView() {
    const users = this.state.data.users || [];
    return html`<label class="adm-filter">Үүрэг: <select name="role"><option value="">Бүгд</option><option value="owner">Кафе эзэмшигч</option><option value="user">Хэрэглэгч</option><option value="admin">Админ</option></select></label>
      <div class="adm-scroll"><table class="adm-t"><thead><tr><th>И-мэйл</th><th>Нэр</th><th>Үүрэг</th><th>Кафе</th><th>Бүртгүүлсэн</th></tr></thead><tbody>
      ${users.map(u => html`<tr><td>${u.email}</td><td>${u.name || '—'}</td><td>${u.role}</td><td>${u.cafes || '—'}</td><td class="num">${when(u.created_at)}</td></tr>`)}</tbody></table></div>`;
  }

  deviceForm(cafes, cafeId) {
    return html`<form class="form adm-form" data-form="saveDevice" novalidate><h3>Төхөөрөмж бүртгэх</h3>
      <div class="fld"><label>ID (заавал биш)</label><input name="id" placeholder="sensor_001"></div>
      ${cafeId ? html`<input type="hidden" name="cafe_id" value="${cafeId}">` : html`<div class="fld"><label>Кафе</label><select name="cafe_id">${cafes.map(c => html`<option value="${c.id}">${c.name}</option>`)}</select></div>`}
      <div class="fld"><label>Нэр</label><input name="label" placeholder="Танхимын камер"></div>
      <div class="fld"><label>Төрөл</label><select name="kind"><option value="sensor">Мэдрэгч</option><option value="camera">Камер</option><option value="gateway">Gateway</option><option value="simulator">Симулятор</option></select></div>
      <label class="adm-check"><input type="checkbox" name="is_test"> Туршилтын төхөөрөмж (өгөгдөл нь «ТУРШИЛТ» гэж тэмдэглэгдэнэ)</label>
      <div class="fld full"><button class="btn btn-p">Бүртгэх</button></div></form>`;
  }

  devicesTable(devices) {
    if (!devices.length) return html`<p class="muted">Төхөөрөмж алга.</p>`;
    return html`<div class="adm-scroll"><table class="adm-t"><thead><tr><th>ID</th><th>Кафе</th><th>Нэр / төрөл</th><th>Төлөв</th><th>Сүүлд</th><th>Батарей</th><th></th></tr></thead><tbody>
      ${devices.map(d => html`<tr class="${d.revoked_at ? 'muted' : ''}"><td><code>${d.id}</code>${d.is_test ? html` <span class="badge b-typ">ТУРШИЛТ</span>` : ''}</td><td>${d.cafe_name || d.cafe_id}</td><td>${d.label || '—'}<br><small class="muted">${d.kind}</small></td>
        <td>${d.revoked_at ? 'Идэвхгүй' : html`<span class="dot ${d.online ? 'on' : ''}"></span> ${d.online ? 'Онлайн' : 'Офлайн'}`}${d.last_status?.state && d.last_status.state !== 'online' ? html`<br><small>${d.last_status.state} ${d.last_status.message || ''}</small>` : ''}</td>
        <td class="num">${when(d.last_seen_at)}</td><td class="num">${d.last_status?.battery_pct != null ? d.last_status.battery_pct + '%' : '—'}</td>
        <td>${d.revoked_at ? '' : html`<button class="btn btn-g" data-rotate="${d.id}">Токен</button> <button class="btn btn-g" data-revoke="${d.id}">Цуцлах</button>`}</td></tr>`)}</tbody></table></div>`;
  }

  devicesView() {
    const { devices = [], cafes = [] } = this.state.data;
    return html`${this.devicesTable(devices)}<section class="card" style="margin-top:16px">${this.deviceForm(cafes)}</section>`;
  }

  measurementsTable(rows) {
    if (!rows.length) return html`<p class="muted">Хэмжилт алга.</p>`;
    return html`<div class="adm-scroll"><table class="adm-t"><thead><tr><th>#</th><th>Хэмжсэн</th><th>Хүлээн авсан</th><th>Кафе / төхөөрөмж</th><th>Суудал (сул/хүнтэй/нийт)</th><th>Дуу dB</th><th>Wi-Fi</th><th>JSON</th></tr></thead><tbody>
      ${rows.map(m => html`<tr><td class="num">${m.id}</td><td class="num">${when(m.ts)}</td><td class="num">${when(m.received_at)}</td><td>${m.cafe_id}<br><small class="muted">${m.device_id}${m.is_test ? ' · туршилт' : ''}</small></td>
        <td class="num">${m.available_seats ?? '—'} / ${m.occupied_seats ?? '—'} / ${m.total_seats ?? '—'}</td><td class="num">${m.noise_db ?? '—'}</td><td class="num">${m.wifi_quality ?? '—'}${m.wifi_down_mbps != null ? ` · ${m.wifi_down_mbps} Mbps` : ''}</td>
        <td><details><summary>харах</summary><pre class="adm-code">${JSON.stringify(m.raw, null, 2)}</pre></details></td></tr>`)}</tbody></table></div>`;
  }

  measurementsView() {
    const { measurements = [], cafes = [], devices = [] } = this.state.data, f = this.state.filter;
    return html`<div class="adm-filters">
      <label class="adm-filter">Кафе <select name="cafe_id" data-filter><option value="">Бүгд</option>${cafes.map(c => html`<option value="${c.id}" ${raw(f.cafe_id === c.id ? 'selected' : '')}>${c.name}</option>`)}</select></label>
      <label class="adm-filter">Төхөөрөмж <select name="device_id" data-filter><option value="">Бүгд</option>${devices.map(d => html`<option value="${d.id}" ${raw(f.device_id === d.id ? 'selected' : '')}>${d.id}</option>`)}</select></label>
      <label class="adm-check"><input type="checkbox" data-auto ${raw(this.state.auto ? 'checked' : '')}> 15 сек тутам шинэчлэх</label></div>
      ${this.measurementsTable(measurements)}`;
  }

  cafeView() {
    const c = this.state.cafe, s = this.state.suggestion;
    const input = (name, label, value, type = 'text') => html`<div class="fld"><label>${label}</label><input name="${name}" type="${type}" value="${value ?? ''}" ${raw(type === 'number' ? 'step="any"' : '')}></div>`;
    return html`<div class="adm-cafe">
      <div class="adm-head"><button class="btn btn-g" data-back>← Буцах</button><h2>${c.name}</h2>${statusBadge(c.status)}${modeBadge(c.data_mode)}
        ${c.status === 'active' ? html`<a class="btn btn-o" href="#cafe-${c.id}">Нийтийн хуудас →</a>` : ''}</div>
      <div class="adm-grid">
        <section class="card"><h3>Тохиргооны явц</h3>${timelineHTML(c.status, c.history)}
          <form class="form adm-form" data-form="saveStatus" novalidate>
            <div class="fld"><label>Шинэ төлөв</label><select name="status">${SETUP_STATUSES.map(k => html`<option value="${k}" ${raw(k === c.status ? 'selected' : '')}>${statusLabel(k)}</option>`)}</select></div>
            <div class="fld"><label>Тэмдэглэл</label><input name="note" placeholder="Жишээ: Эзэмшигчтэй утсаар ярьсан"></div>
            <div class="fld full"><button class="btn btn-p">Төлөв шинэчлэх</button></div></form>
          <details><summary>Түүх (${c.history.length})</summary><ul class="adm-list">${c.history.map(h => html`<li><span class="num">${when(h.at)}</span> ${h.from_status ? statusLabel(h.from_status) + ' → ' : ''}<b>${statusLabel(h.to_status)}</b>${h.note ? ` — ${h.note}` : ''}</li>`)}</ul></details>
          <h3 style="margin-top:16px">Одоогийн хэмжилт</h3>
          ${['live', 'test'].includes(c.live.mode) ? html`<p class="muted">${c.live.mode === 'test' ? 'Туршилтын төхөөрөмж' : 'Бодит'} · ${when(c.live.updated_at)}${c.live.stale ? ' · ХУУЧИРСАН' : ''}</p>${liveTilesHTML(c.live)}` : html`<p class="muted">${c.live.mode === 'demo' ? 'Демо горим — жишээ утга харуулж байна.' : 'Хэмжилт ирээгүй.'}</p>`}
        </section>

        <section class="card"><h3>Кафены мэдээлэл</h3>
          <form class="form adm-form" data-form="saveInfo" novalidate>
            ${input('name', 'Нэр', c.name)}${input('category', 'Ангилал', c.category)}${input('district', 'Дүүрэг', c.district)}${input('hours', 'Ажлын цаг', c.hours)}
            <div class="fld full"><label>Хаяг</label><input name="address" value="${c.address}"></div>
            ${input('lat', 'Өргөрөг (lat)', c.lat, 'number')}${input('lng', 'Уртраг (lng)', c.lng, 'number')}${input('map_x', 'Газрын зураг X (0–1000)', c.map_x, 'number')}${input('map_y', 'Газрын зураг Y (0–680)', c.map_y, 'number')}
            ${input('phone', 'Утас', c.phone)}${input('contact_name', 'Холбоо барих', c.contact_name)}${input('email', 'И-мэйл', c.email)}${input('total_seats', 'Суудлын тоо', c.total_seats, 'number')}
            ${input('tags', 'Зорилго (таслалаар)', c.tags.join(', '))}${input('sort_order', 'Эрэмбэ', c.sort_order, 'number')}
            <div class="fld"><label>Өгөгдлийн горим</label><select name="data_mode"><option value="live" ${raw(c.data_mode === 'live' ? 'selected' : '')}>Бодит (мэдрэгч)</option><option value="demo" ${raw(c.data_mode === 'demo' ? 'selected' : '')}>Демо (жишээ утга)</option></select></div>
            <div class="fld full"><label>Тайлбар</label><textarea name="description" rows="3">${c.description}</textarea></div>
            <div class="fld full"><label>Демо утга (JSON, зөвхөн демо горимд)</label><textarea name="demo" rows="3" class="adm-mono">${c.demo ? JSON.stringify(c.demo) : ''}</textarea></div>
            <div class="fld full"><button class="btn btn-p">Хадгалах</button></div></form>
        </section>

        <section class="card adm-wide"><h3>Хөдөлгөөнт зураглал</h3>
          <div class="adm-vis">
            <form class="form adm-form" data-form="saveVisualization" novalidate>
              <div class="fld"><label>Төлөв</label><select name="vstatus">${VIS_STATUSES.map(([k, l]) => html`<option value="${k}" ${raw(k === c.visualization.status ? 'selected' : '')}>${l}</option>`)}</select></div>
              <div class="fld full"><label>Тэмдэглэл</label><textarea name="notes" rows="2">${c.visualization.notes || ''}</textarea></div>
              ${s ? html`<p class="adm-suggest">${raw(I.star)} <b>Санал (${s.provider}, итгэл ${Math.round(s.confidence * 100)}%):</b> ${s.rationale}</p>` : ''}
              <div class="fld full adm-actions"><button type="button" class="btn btn-g" data-suggest>Зургаас санал авах</button><button class="btn btn-p">Хадгалах</button></div>
            </form>
            <div data-adm-editor data-preserve data-key="adm-editor-${c.id}"></div>
          </div>
        </section>

        ${c.application ? html`<section class="card adm-wide"><h3>Хүсэлт ба зураг</h3>
          <div class="ph-grid">${c.application.photos.map((p, i) => html`<a class="ph" href="${p.url}" target="_blank" rel="noopener"><img src="${p.url}" alt="Зураг ${i + 1}" loading="lazy"></a>`)}</div>
          <table class="adm-t"><tbody>${Object.entries(c.application.form).map(([k, v]) => html`<tr><th>${k}</th><td>${Array.isArray(v) ? v.join(', ') : v ?? '—'}</td></tr>`)}<tr><th>Эзэмшигч</th><td>${c.owner ? `${c.owner.email} (${c.owner.role})` : 'үүсгээгүй'}</td></tr></tbody></table></section>` : ''}

        <section class="card adm-wide"><h3>Төхөөрөмж</h3>${this.devicesTable(c.devices.map(d => ({ ...d, cafe_name: c.name })))}${this.deviceForm([], c.id)}</section>
        <section class="card adm-wide"><h3>Сүүлийн хэмжилтүүд</h3>${this.measurementsTable(c.measurements)}</section>
      </div></div>`;
  }
}

