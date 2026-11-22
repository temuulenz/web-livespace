// Internal admin / developer dashboard (#admin). Functional first: every table maps
// directly to an API endpoint in server/routes/admin.mjs.
import { Component, html, raw, readForm, dateTime } from '../../../framework/index.js';
import { I } from '../../icons.js';
import { Snd } from '../../audio.js';
import { LayoutEditor } from './layout-editor.js';
import { mountLocationPicker } from './location-picker.js';
import { SETUP_STATUSES, statusLabel, VIS_STATUSES } from '../../live/levels.js';
import { platform } from '../../services/platform.js';
import { toast } from '../../components/feedback.js';
import { openAuth } from '../authentication/auth-modal.js';
import { signInPrompt } from '../account/account.js';
import { liveTilesHTML, timelineHTML, visLabel } from '../owner-dashboard/owner-page.js';
import { deviceDiagnosticsHTML, sensorStatusLabel, sensorSourceLabel } from '../../live/sensor-ui.js';
import { SensorHistory } from '../sensors/sensor-history.js';
import { PublicMenu } from '../menu/public-menu.js';
import { OwnerMenu } from '../menu/owner-menu.js';
import { MenuEditor } from '../menu/menu-editor.js';
import { CafePhotoManager } from '../cafe/cafe-photo-manager.js';

const TABS = [['overview', 'Тойм'], ['applications', 'Хүсэлтүүд'], ['cafes', 'Кафенууд'], ['users', 'Хэрэглэгчид'], ['devices', 'Төхөөрөмж'], ['measurements', 'Хэмжилт'], ['audit', 'Аудит'], ['health', 'Системийн төлөв'], ['settings', 'Платформын тохиргоо']];
const when = iso => iso ? dateTime(iso) : '—';
const statusBadge = status => html`<span class="badge ${status === 'active' ? 'b-live' : status === 'rejected' ? 'b-stale' : 'b-typ'}">${statusLabel(status)}</span>`;
const modeBadge = mode => html`<span class="badge ${mode === 'demo' ? 'b-demo' : 'b-live'}">${mode === 'demo' ? 'ДЕМО' : 'БОДИТ'}</span>`;
const exampleBody = (cafeId, deviceId) => JSON.stringify({ schemaVersion: 1, type: 'sensor.telemetry', messageId: 'GENERATE-A-NEW-UUID', deviceId, locationId: cafeId, timestamp: new Date().toISOString(), occupancy: { observedPeople: 8, confidence: 0.87 }, noise: { rms: 0.014, dbfs: -37.1, estimatedDbSpl: null, calibrated: false }, device: { batteryPercent: 85, batteryTemperatureC: 36.5, charging: true, inferenceMs: 1200, uptimeSeconds: 3600 } }, null, 2);

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
      'click [data-owner-remove]': () => { Snd.ui('click'); this.setState({ confirmOwnerRemove: true }); },
      'click [data-owner-keep]': () => this.setState({ confirmOwnerRemove: false }),
      'click [data-owner-remove-yes]': () => this.removeOwner(),
      'click [data-open-menu]': async (e, b) => { e.preventDefault(); await this.openCafe(b.dataset.openMenu); this.timeout(() => this.$('[data-admin-menu]')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60); },
      'click [data-back]': () => { this.setState({ cafe: null, token: null, suggestion: null }); this.load(); },
      'click [data-refresh]': () => this.load(),
      'submit [data-form]': (e, form) => { e.preventDefault(); this[form.dataset.form](form); },
      'click [data-suggest]': () => this.suggest(),
      'click [data-rotate]': (e, b) => this.rotate(b.dataset.rotate),
      'click [data-revoke]': (e, b) => this.revoke(b.dataset.revoke),
      'click [data-enable-device]': (e, b) => this.toggleDevice(b.dataset.enableDevice, b.dataset.enabled !== 'true'),
      'click [data-user-revoke-sessions]': (e, b) => this.revokeUserSessions(b.dataset.userRevokeSessions),
      'click [data-user-delete]': (e, b) => this.deleteManagedUser(b.dataset.userDelete),
      'click [data-cafe-archive]': (e, b) => this.archiveCafe(b.dataset.cafeArchive),
      'click [data-cafe-delete]': (e, b) => this.deleteCafe(b.dataset.cafeDelete),
      'change [data-filter]': (e, el) => { this.setState({ filter: { ...this.state.filter, [el.name]: el.value } }); this.load(); },
      'change [data-auto]': (e, el) => this.setState({ auto: el.checked }),
      'change [name="role"]': () => this.load()
    };
  }
  onMount() {
    this.watch(platform.session.store, s => s.user, () => { this.invalidate(); this.load(); });
    this.onCleanup(platform.bus.on('sensor:updated', () => {
      if (this._sensorRefresh) return;
      this._sensorRefresh = true;
      this.timeout(() => { this._sensorRefresh = false; if (!document.hidden) this.load(); }, 150);
    }));
    this.interval(() => { if (!document.hidden && (this.state.cafe || this.state.tab === 'devices')) this.load(); }, 30000);
    this.interval(() => { if (this.state.auto && !document.hidden && this.state.tab === 'measurements' && !this.state.cafe) this.load(); }, 15000);
    this.load();
  }
  onDestroy() { this.editor?.destroy(); this.historyView?.destroy(); this.menuView?.destroy(); this.photoView?.destroy(); this.locOff?.(); }
  onUpdate() { this.syncEditor(); this.syncHistory(); this.syncMenu(); this.syncPhotos(); this.syncLocation(); }
  syncPhotos() {
    const cafeId=this.state.cafe?.id,root=this.$('[data-admin-photos]');
    if(cafeId&&root&&this.photoCafe===cafeId&&this.photoView?.el===root)return;
    this.photoView?.destroy();this.photoView=null;this.photoCafe=null;
    if(cafeId&&root&&platform.session.user?.is_super_admin){this.photoCafe=cafeId;this.photoView=this.child(CafePhotoManager,root,{cafeId});}
  }
  // Location is picked on the map; one picker per opened café (it survives re-renders).
  syncLocation() {
    const host = this.$('[data-loc-map]'), key = host ? this.state.cafe?.id : null;
    if (key === this.locKey && (!key || host.firstChild)) return;
    this.locOff?.(); this.locOff = null; this.locKey = key;
    if (key) this.locOff = mountLocationPicker(host, host.closest('form'));
  }
  // The café's menu: admins enter/correct the menu the owner sends; owners can edit it too.
  syncMenu() {
    const cafeId = this.state.cafe?.id, root = this.$('[data-admin-menu]');
    if (cafeId && root && this.menuCafe === cafeId && this.menuView?.el === root) return;
    this.menuView?.destroy(); this.menuView = null; this.menuCafe = null;
    if (!cafeId || !root) return;
    this.menuCafe = cafeId;
    const cafe = this.state.cafe;
    if (cafe.data_mode === 'demo') this.menuView = this.child(MenuEditor, root, { cafeId, editor: 'admin' });
    else if (platform.session.user?.is_super_admin || cafe.owner?.id === platform.session.user?.id) this.menuView = this.child(OwnerMenu, root, { cafeId });
    else this.menuView = this.child(PublicMenu, root, { cafeId, preview: true });
  }
  syncHistory() {
    const cafeId = this.state.cafe?.id || this.state.filter.cafe_id, root = this.$('[data-admin-sensor-history]');
    if (!cafeId || !root) { this.historyView?.destroy(); this.historyView = null; return; }
    if (this.historyCafe === cafeId && this.historyView?.el === root) return;
    this.historyView?.destroy(); this.historyCafe = cafeId;
    this.historyView = this.child(SensorHistory, root, { cafeId, role: 'admin', source: this.state.cafe?.live?.sensor?.dataSource || 'real' });
  }

  go(tab) {
    Snd.ui('click');
    history.replaceState(null, '', `#admin?tab=${tab}`);
    this.setState({ tab, cafe: null, token: null, suggestion: null });
    this.load();
  }

  async load() {
    if (!platform.session.hasRole('admin') || Date.now()<(this.retryAfter || 0)) return;
    if(this.loadingRequest){this.reloadPending=true;return;}
    this.loadingRequest=true;
    const api = platform.api, { tab, filter } = this.state;
    this.setState({ loading: true, error: null });
    try {
      let data;
      if (tab === 'overview') data = await api.get('/admin/overview');
      else if (tab === 'applications') data = await api.get('/admin/applications');
      else if (tab === 'cafes') data = await api.get('/admin/cafes');
      else if (tab === 'users') data = await api.get(`/admin/users${this.$('[name="role"]')?.value ? '?role=' + this.$('[name="role"]').value : ''}`);
      else if (tab === 'devices') data = { ...(await api.get('/admin/devices')), ...(await api.get('/admin/cafes')) };
      else if (tab === 'audit') data = platform.session.user?.is_super_admin ? await api.get('/admin/audit') : { events: [] };
      else if (tab === 'health') data = await api.get('/health').catch(() => ({ ok: false, deployment: 'Unavailable', database: 'Unavailable' }));
      else if (tab === 'settings' && platform.session.user?.is_super_admin) data = { ...(await api.get('/admin/settings/featured-cafe')), ...(await api.get('/admin/cafes')) };
      else if (tab === 'settings') data = {};
      else if (tab === 'measurements') {
        const q = new URLSearchParams(Object.entries(filter).filter(([, v]) => v)).toString();
        data = { ...(await api.get(`/admin/measurements?limit=200${q ? '&' + q : ''}`)), ...(await api.get('/admin/cafes')), ...(await api.get('/admin/devices')) };
      }
      this.setState({ data, loading: false });
      if (this.state.cafe) await this.openCafe(this.state.cafe.id, true);
    } catch (error) { if(error.status===503)this.retryAfter=Date.now()+900000;this.setState({ loading: false, error: error.message }); } finally {this.loadingRequest=false;if(this.reloadPending){this.reloadPending=false;if(this.mounted)this.load();}}
  }

  async openCafe(id, quiet) {
    try {
      const [{ cafe }, { devices }, { measurements }, { users: owners }] = await Promise.all([platform.api.get(`/admin/cafes/${id}`), platform.api.get('/admin/devices'), platform.api.get(`/admin/measurements?cafe_id=${encodeURIComponent(id)}&limit=20`), platform.api.get('/admin/users?role=owner').catch(() => ({ users: [] }))]);
      if (!quiet) Snd.ui('pop');
      this.setState({ cafe: { ...cafe, devices: devices.filter(d => d.cafe_id === id), measurements, ownerOptions: owners.filter(u => !u.disabled_at) }, confirmOwnerRemove: false });
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
  // Assign or change the café's owner account (must already have the «Кафе эзэмшигч» role).
  async saveOwner(form) {
    const email = readForm(form).owner_email;
    if (!email) { Snd.ui('err'); toast('Эзэмшигчийн и-мэйлийг оруулна уу'); return; }
    const result = await this.run(platform.api.put(`/admin/cafes/${this.state.cafe.id}/owner`, { email }));
    if (result) { toast(result.changed ? `Эзэмшигч: ${result.owner.email}` : 'Энэ хүн аль хэдийн эзэмшигч байна', true); this.openCafe(this.state.cafe.id, true); }
  }
  async removeOwner() {
    if (await this.run(platform.api.put(`/admin/cafes/${this.state.cafe.id}/owner`, { email: null }), 'Эзэмшигчийг хаслаа')) this.openCafe(this.state.cafe.id, true);
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
  async saveFeatured(form) {
    const cafe_id = readForm(form).cafe_id || null;
    if (await this.run(platform.api.put('/admin/settings/featured-cafe', { cafe_id }), 'Онцлох кафе шинэчлэгдлээ')) { platform.featuredCafeId = cafe_id; this.load(); }
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
    if (result) this.setState({ token: { id, cafe_id: this.state.cafe?.id || this.state.data.devices?.find(d => d.id === id)?.cafe_id || '', value: result.token } });
  }
  async toggleDevice(id, enabled) {
    if (await this.run(platform.api.patch(`/admin/devices/${encodeURIComponent(id)}`, { enabled }), enabled ? 'Идэвхжүүллээ' : 'Түр зогсоолоо')) this.state.cafe ? this.openCafe(this.state.cafe.id, true) : this.load();
  }
  async updateDevice(form) {
    const v = readForm(form);
    if (await this.run(platform.api.patch(`/admin/devices/${encodeURIComponent(v.device_id)}`, { cafe_id: v.cafe_id, label: v.label, kind: v.kind, is_test: !!v.is_test }), 'Хадгалагдлаа')) this.state.cafe ? this.openCafe(this.state.cafe.id, true) : this.load();
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
      <nav class="chips adm-tabs">${TABS.filter(([key]) => key !== 'settings' || platform.session.user?.is_super_admin).map(([key, label]) => html`<button class="chip" data-tab="${key}" aria-pressed="${key === tab && !cafe}">${label}</button>`)}</nav>
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
      <p>Device ID: <code>${id}</code> · Location ID: <code>${cafeId}</code></p>
      <details><summary>Android WebSocket тохиргоо / JSON</summary><pre class="adm-code">${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/sensors
Authorization: Bearer ${value}

${exampleBody(cafeId, id)}</pre></details></section>`;
  }
  settingsView() {
    if (!platform.session.user?.is_super_admin) return html`<p class="muted">Super Admin эрх шаардлагатай.</p>`;
    const { cafes = [], cafe_id } = this.state.data;
    return html`<section class="card"><h2>Нүүр хуудасны онцлох кафе</h2><p class="muted">Зөвхөн идэвхтэй бодит кафег сонгоно. Хэмжилтгүй үед бодит тоо зохиож харуулахгүй.</p>
      <form class="form adm-form" data-form="saveFeatured"><label>Онцлох кафе<select name="cafe_id"><option value="">Сонгоогүй</option>${cafes.filter(c => c.status === 'active' && c.data_mode === 'live').map(c => html`<option value="${c.id}" ${raw(c.id === cafe_id ? 'selected' : '')}>${c.name} · ${c.id}</option>`)}</select></label><button class="btn btn-p">Хадгалах</button></form></section>`;
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
    return html`${platform.session.user?.is_super_admin ? html`<details><summary>Шинэ кафе үүсгэх</summary><form class="form adm-form" data-form="createCafe"><label>Кафены нэр<input name="name" maxlength="80" required></label><button class="btn btn-p">Үүсгэх</button></form></details>` : ''}
      ${cafes.length ? html`<div class="adm-scroll"><table class="adm-t"><thead><tr><th>Кафе</th><th>Төлөв</th><th>Өгөгдөл</th><th>Эзэмшигч</th><th>Төхөөрөмж</th><th>Сүүлийн хэмжилт</th><th>Зураглал</th><th></th></tr></thead><tbody>
      ${cafes.map(c => html`<tr><td><b>${c.name}</b><br><small class="muted">${c.id}</small></td><td>${statusBadge(c.status)}</td><td>${modeBadge(c.data_mode)}</td><td>${c.owner_email || '—'}</td><td class="num">${c.device_count}</td><td class="num">${when(c.last_measurement_at)}</td><td>${visLabel(c.visualization_status)}</td><td><button class="btn btn-o" data-open-cafe="${c.id}">Засах</button> <button class="btn btn-g" data-open-menu="${c.id}">Цэс</button>${platform.session.user?.is_super_admin && !['I','cafe_9f81309be58b4d48'].includes(c.id) ? html` <button class="btn btn-g" data-cafe-archive="${c.id}">Архивлах</button>${c.status === 'archived' && !c.owner_email ? html` <button class="btn btn-g" data-cafe-delete="${c.id}">Устгах</button>` : ''}` : ''}</td></tr>`)}</tbody></table></div>` : html`<p class="muted">Кафе алга.</p>`}`;
  }

  async createCafe(form) {
    const name = readForm(form).name.trim();
    if (!name) return;
    const result = await this.run(platform.api.post('/admin/cafes', { name }), 'Кафе үүслээ');
    if (result) { form.reset(); await this.load(); this.openCafe(result.cafe.id); }
  }
  async archiveCafe(id) {
    if (!confirm('Энэ кафег архивлах уу? Нийтийн жагсаалтаас хасагдана.')) return;
    if (await this.run(platform.api.post(`/admin/cafes/${encodeURIComponent(id)}/archive`), 'Кафе архивлагдлаа')) this.load();
  }
  async deleteCafe(id) {
    if (!confirm('Архивлагдсан, холбоогүй кафег бүрмөсөн устгах уу?')) return;
    if (await this.run(platform.api.del(`/admin/cafes/${encodeURIComponent(id)}`), 'Кафе устгагдлаа')) this.load();
  }
  auditView() {
    if (!platform.session.user?.is_super_admin) return html`<p class="muted">Super Admin эрх шаардлагатай.</p>`;
    const events = this.state.data.events || [];
    return events.length ? html`<div class="adm-scroll"><table class="adm-t"><thead><tr><th>Огноо</th><th>Үйлдэл</th><th>Гүйцэтгэгч</th><th>Зорилт</th></tr></thead><tbody>${events.map(event => html`<tr><td class="num">${when(event.at)}</td><td>${event.action}</td><td>${event.actor_id}</td><td>${event.target_id}</td></tr>`)}</tbody></table></div>` : html`<p class="muted">Аудитын бүртгэл алга.</p>`;
  }
  healthView() {
    const health = this.state.data;
    return html`<section class="card"><h2>API ба өгөгдлийн сан</h2><p>${health.ok ? 'Ажиллаж байна' : 'Мэдээлэл авах боломжгүй'}</p><p class="muted">${health.deployment || 'Unavailable'} · ${health.database || 'Unavailable'} · ${when(health.time)}</p><p class="muted">Өөр байршуулалтын API, хадгалалт, ажлын дараалал болон алдааны хурд: Unavailable</p></section>`;
  }

  async confirmUserManagement(form) {
    const { password } = readForm(form); form.reset();
    await this.run(platform.api.post('/auth/reauthenticate', { password }), 'Нэвтрэлтийг баталгаажууллаа · 5 минут');
  }
  async createManagedUser(form) {
    const input = readForm(form); form.reset();
    const result = await this.run(platform.api.post('/admin/users', { email: input.email, name: input.name, role: input.account_role, password: input.password }), 'Хэрэглэгч үүслээ');
    if (result) this.load();
  }
  async saveManagedUser(form) {
    const input = readForm(form), password = input.password; form.querySelector('[name="password"]').value = '';
    const result = password
      ? await this.run(platform.api.post(`/admin/users/${encodeURIComponent(form.dataset.userId)}/password`, { password }), 'Нууц үг шинэчлэгдлээ; хуучин нэвтрэлтүүд цуцлагдсан')
      : await this.run(platform.api.patch(`/admin/users/${encodeURIComponent(form.dataset.userId)}`, { name: input.name, role: input.account_role, disabled: form.querySelector('[name="disabled"]').checked }), 'Эрх шинэчлэгдлээ; хуучин нэвтрэлтүүд цуцлагдсан');
    if (result) this.load();
  }
  async revokeUserSessions(id) {
    if (!confirm('Энэ хэрэглэгчийн бүх нэвтрэлтийг цуцлах уу?')) return;
    if (await this.run(platform.api.post(`/admin/users/${encodeURIComponent(id)}/sessions/revoke`), 'Нэвтрэлтүүд цуцлагдлаа')) this.load();
  }
  async deleteManagedUser(id) {
    if (!confirm('Энэ хэрэглэгчийг устгах уу? Холбоотой кафе эсвэл үйл ажиллагаатай бүртгэлийг устгахгүй.')) return;
    if (await this.run(platform.api.del(`/admin/users/${encodeURIComponent(id)}`), 'Хэрэглэгч устгагдлаа')) this.load();
  }
  usersView() {
    const users = this.state.data.users || [], superAdmin = !!platform.session.user?.is_super_admin;
    const roles = superAdmin ? ['user', 'owner', 'admin'] : ['user', 'owner'];
    return html`<p class="muted">${superAdmin ? 'Super Admin · администраторын эрхийг удирдах боломжтой.' : 'Администратор болон Super Admin бүртгэлийг өөрчлөх эрхгүй.'}</p>
      <form class="form adm-form" data-form="confirmUserManagement"><label>Мэдрэмтгий үйлдлийн өмнө одоогийн нууц үгээ баталгаажуулна (5 минут).</label><input name="password" type="password" autocomplete="current-password" maxlength="200" required aria-label="Одоогийн нууц үг"><button class="btn btn-o">Нэвтрэлт баталгаажуулах</button></form>
      <details><summary>Хэрэглэгч үүсгэх</summary><form class="form adm-form" data-form="createManagedUser">
        <label>И-мэйл<input name="email" type="email" maxlength="200" required autocomplete="off"></label><label>Нэр<input name="name" maxlength="100"></label>
        <label>Үүрэг<select name="account_role">${roles.map(role => html`<option value="${role}">${role}</option>`)}</select></label>
        <label>Шинэ нууц үг<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="200" required></label><button class="btn btn-p">Үүсгэх</button></form></details>
      <label class="adm-filter">Үүрэг: <select name="role"><option value="">Бүгд</option><option value="owner">Кафе эзэмшигч</option><option value="user">Хэрэглэгч</option><option value="admin">Админ</option></select></label>
      <div class="adm-scroll"><table class="adm-t"><thead><tr><th>И-мэйл</th><th>Нэр</th><th>Үүрэг</th><th>Кафе</th><th>Бүртгүүлсэн</th><th>Удирдлага</th></tr></thead><tbody>
      ${users.map(u => html`<tr><td>${u.email}</td><td>${u.name || '—'}</td><td>${u.is_super_admin ? 'Super Admin' : u.role}${u.disabled_at ? ' · идэвхгүй' : ''}</td><td>${u.cafes || '—'}</td><td class="num">${when(u.created_at)}</td><td>
        ${!u.is_super_admin && (u.role !== 'admin' || superAdmin) ? html`<details><summary>Засах</summary><form class="form adm-form" data-form="saveManagedUser" data-user-id="${u.id}">
          <label>Нэр<input name="name" value="${u.name}" maxlength="100"></label><label>Үүрэг<select name="account_role">${roles.map(role => html`<option value="${role}" ${raw(role === u.role ? 'selected' : '')}>${role}</option>`)}</select></label>
          <label><input name="disabled" type="checkbox" ${raw(u.disabled_at ? 'checked' : '')}>Идэвхгүй болгох</label>
          <label>Нууц үг солих бол шинэ утга оруулах<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="200"></label><button class="btn btn-o">Хадгалах / нууц үг солих</button></form>
          <button type="button" class="btn btn-g" data-user-revoke-sessions="${u.id}">Бүх нэвтрэлтийг цуцлах</button>
          <button type="button" class="btn btn-g" data-user-delete="${u.id}">Устгах</button></details>` : html`<span class="muted">Хамгаалагдсан</span>`}
      </td></tr>`)}</tbody></table></div>`;
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
        <td data-admin-device-status="${d.id}"><span class="dot ${d.online ? 'on' : ''}"></span> ${sensorStatusLabel(d.status)}<br><small>${sensorSourceLabel(d.is_test ? 'simulated' : 'real')}</small></td>
        <td class="num">${when(d.last_seen_at)}</td><td>${raw(deviceDiagnosticsHTML(d))}</td>
        <td>${d.revoked_at ? '' : html`<button class="btn btn-g" data-rotate="${d.id}">Токен</button> <button class="btn btn-g" data-enable-device="${d.id}" data-enabled="${d.enabled}">${d.enabled ? 'Түр зогсоох' : 'Идэвхжүүлэх'}</button> <button class="btn btn-g" data-revoke="${d.id}">Цуцлах</button>
          <details><summary>Байршил / тохиргоо</summary><form class="form" data-form="updateDevice"><input type="hidden" name="device_id" value="${d.id}">
          <label>Location ID<input name="cafe_id" value="${d.cafe_id}" required></label><label>Нэр<input name="label" value="${d.label}"></label>
          <label>Төрөл<select name="kind">${['sensor', 'camera', 'gateway', 'simulator'].map(k => html`<option value="${k}" ${raw(d.kind === k ? 'selected' : '')}>${k}</option>`)}</select></label>
          <label><input type="checkbox" name="is_test" ${raw(d.is_test ? 'checked' : '')}> Симуляц / туршилт</label><button class="btn btn-o">Хадгалах</button></form></details>`}</td></tr>`)}</tbody></table></div>`;
  }

  devicesView() {
    const { devices = [], cafes = [] } = this.state.data;
    return html`${this.devicesTable(devices)}<section class="card" style="margin-top:16px">${this.deviceForm(cafes)}</section>`;
  }

  measurementsTable(rows) {
    if (!rows.length) return html`<p class="muted">Хэмжилт алга.</p>`;
    return html`<div class="adm-scroll"><table class="adm-t"><thead><tr><th>#</th><th>Хэмжсэн</th><th>Хүлээн авсан</th><th>Кафе / төхөөрөмж</th><th>Хүн / эх үүсвэр</th><th>Суудал (сул/хүнтэй/нийт)</th><th>Дуу чимээ</th><th>Wi-Fi</th><th>JSON</th></tr></thead><tbody>
      ${rows.map(m => html`<tr><td class="num">${m.id}</td><td class="num">${when(m.ts)}</td><td class="num">${when(m.received_at)}</td><td>${m.cafe_id}<br><small class="muted">${m.device_id}${m.is_test ? ' · туршилт' : ''}</small></td>
        <td class="num">${m.observed_people ?? '—'} · ${sensorSourceLabel(m.data_source)}</td><td class="num">${m.available_seats ?? '—'} / ${m.occupied_seats ?? '—'} / ${m.total_seats ?? '—'}</td><td class="num">${m.noise_dbfs == null ? '—' : m.noise_dbfs + ' dBFS'}${m.noise_db != null ? ` / ${m.noise_db} dB SPL` : ''}</td><td class="num">${m.wifi_quality ?? '—'}${m.wifi_down_mbps != null ? ` · ${m.wifi_down_mbps} Mbps` : ''}</td>
        <td><details><summary>харах</summary><pre class="adm-code">${JSON.stringify(m.raw, null, 2)}</pre></details></td></tr>`)}</tbody></table></div>`;
  }

  measurementsView() {
    const { measurements = [], cafes = [], devices = [] } = this.state.data, f = this.state.filter;
    return html`<div class="adm-filters">
      <label class="adm-filter">Кафе <select name="cafe_id" data-filter><option value="">Бүгд</option>${cafes.map(c => html`<option value="${c.id}" ${raw(f.cafe_id === c.id ? 'selected' : '')}>${c.name}</option>`)}</select></label>
      <label class="adm-filter">Төхөөрөмж <select name="device_id" data-filter><option value="">Бүгд</option>${devices.map(d => html`<option value="${d.id}" ${raw(f.device_id === d.id ? 'selected' : '')}>${d.id}</option>`)}</select></label>
      <label class="adm-check"><input type="checkbox" data-auto ${raw(this.state.auto ? 'checked' : '')}> 15 сек тутам шинэчлэх</label></div>
      ${this.measurementsTable(measurements)}${f.cafe_id ? html`<section class="card"><div data-admin-sensor-history data-preserve data-key="history-${f.cafe_id}"></div></section>` : ''}`;
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
            <div class="fld full adm-loc"><label>Байршил <small class="muted">— газрын зураг дээр дарж эсвэл тэмдгийг чирж байрлуулна</small></label>
              <div class="loc-map" data-loc-map data-preserve data-key="loc-${c.id}"></div>
              <p class="muted loc-read" data-loc-read data-preserve data-key="loc-read-${c.id}"></p>
              <details class="loc-manual" data-preserve data-key="loc-manual-${c.id}"><summary>Координатаа гараар засах</summary><div class="loc-fields">
              ${input('lat', 'Өргөрөг (lat)', c.lat, 'number')}${input('lng', 'Уртраг (lng)', c.lng, 'number')}${input('map_x', 'Газрын зураг X (0–1000)', c.map_x, 'number')}${input('map_y', 'Газрын зураг Y (0–680)', c.map_y, 'number')}</div></details></div>
            ${input('phone', 'Утас', c.phone)}${input('contact_name', 'Холбоо барих', c.contact_name)}${input('email', 'И-мэйл', c.email)}${input('total_seats', 'Суудлын тоо', c.total_seats, 'number')}
            ${input('tags', 'Зорилго (таслалаар)', c.tags.join(', '))}${input('sort_order', 'Эрэмбэ', c.sort_order, 'number')}
            <div class="fld"><label>Өгөгдлийн горим</label><select name="data_mode"><option value="live" ${raw(c.data_mode === 'live' ? 'selected' : '')}>Бодит (мэдрэгч)</option><option value="demo" ${raw(c.data_mode === 'demo' ? 'selected' : '')}>Демо (жишээ утга)</option></select></div>
            <div class="fld full"><label>Тайлбар</label><textarea name="description" rows="3">${c.description}</textarea></div>
            <div class="fld full"><label>Демо утга (JSON, зөвхөн демо горимд)</label><textarea name="demo" rows="3" class="adm-mono">${c.demo ? JSON.stringify(c.demo) : ''}</textarea></div>
            <div class="fld full"><button class="btn btn-p">Хадгалах</button></div></form>
        </section>

        <section class="card adm-wide adm-owner" data-key="owner"><h3>${raw(I.user)} Кафе эзэмшигч</h3>
          ${c.owner ? html`<p class="adm-owner-now"><b>${c.owner.name || c.owner.email}</b><span class="muted">${c.owner.email}</span></p>` : html`<p class="muted adm-owner-now">Эзэмшигч оноогоогүй байна.</p>`}
          <form class="form adm-form" data-form="saveOwner" novalidate data-key="owner-form-${c.owner?.id || 'none'}">
            <div class="fld full"><label for="adm-owner-email">${c.owner ? 'Шинэ эзэмшигчийн и-мэйл' : 'Эзэмшигчийн и-мэйл'}</label>
              <input id="adm-owner-email" name="owner_email" type="email" list="adm-owner-list" autocomplete="off" placeholder="owner@example.com">
              <datalist id="adm-owner-list">${(c.ownerOptions || []).map(u => html`<option value="${u.email}">${u.name || ''}${u.cafes ? ` · ${u.cafes}` : ''}</option>`)}</datalist>
              <small class="muted">Зөвхөн «Кафе эзэмшигч» эрхтэй бүртгэл. Шинэ бүртгэлийг <button type="button" class="linkb" data-tab="users">Хэрэглэгчид</button> хэсгээс үүсгэнэ. Өөрчлөлт аудитын бүртгэлд хадгалагдана.</small></div>
            <div class="fld full adm-actions"><button class="btn btn-p">${c.owner ? 'Эзэмшигч солих' : 'Эзэмшигч оноох'}</button>
              ${c.owner ? (this.state.confirmOwnerRemove
                ? html`<span class="me-ask">Эзэмшигчийг хасах уу?</span><button type="button" class="btn btn-g me-danger" data-owner-remove-yes>Тийм</button><button type="button" class="btn btn-g" data-owner-keep>Үгүй</button>`
                : html`<button type="button" class="btn btn-g" data-owner-remove>Эзэмшигчийг хасах</button>`) : ''}</div>
          </form>
        </section>

        <section class="card adm-wide adm-menu" data-key="menu"><div data-admin-menu data-preserve data-key="admin-menu-${c.id}"></div></section>
        ${platform.session.user?.is_super_admin?html`<section class="card adm-wide" data-key="public-photos"><div data-admin-photos data-preserve data-key="admin-photos-${c.id}"></div></section>`:''}

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
        <section class="card adm-wide"><div data-admin-sensor-history data-preserve data-key="history-${c.id}"></div></section>
      </div></div>`;
  }
}

