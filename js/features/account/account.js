// Header account button + popover, and the #account page (saved cafés, sign out).
// Guests, users, owners and admins see the same site; this adds only what each role needs.
import { Component, html, raw, escapeHTML } from '../../../framework/index.js';
import { $ } from '../../dom.js';
import { I } from '../../icons.js';
import { Snd } from '../../audio.js';
import { platform } from '../../services/platform.js';
import { openAuth } from '../authentication/auth-modal.js';
import { toast } from '../../components/feedback.js';

const ROLE = { user: 'Хэрэглэгч', owner: 'Кафе эзэмшигч', admin: 'LiveSpace баг' };

export function renderAccountButton() {
  const button = $('#accBtn'); if (!button) return;
  const user = platform.session.user;
  button.innerHTML = I.user + (user ? '<span class="acc-dot" aria-hidden="true"></span>' : '');
  button.setAttribute('aria-label', user ? `Бүртгэл: ${user.email}` : 'Нэвтрэх');
  button.hidden = !platform.online;
}

export function accountPopoverHTML() {
  const user = platform.session.user;
  if (!user) return `<h3>Бүртгэл</h3><p class="muted" style="margin:0 0 12px">Кафе үзэхэд бүртгэл хэрэггүй. Дуртай кафегаа хадгалахын тулд нэвтэрнэ үү.</p>
    <div class="acc-actions"><button class="btn btn-p" data-auth="login">Нэвтрэх</button><button class="btn btn-o" data-auth="register">Бүртгүүлэх</button></div>`;
  const links = [['#account', I.heart, 'Хадгалсан кафе']];
  if (user.role === 'owner' || user.role === 'admin') links.push(['#owner', I.house, 'Миний кафе']);
  if (user.role === 'admin') links.push(['#admin', I.shield, 'Админ самбар']);
  return `<h3>${escapeHTML(user.name || user.email)}</h3><p class="muted" style="margin:-6px 0 10px;font-size:13px">${escapeHTML(user.email)} · ${ROLE[user.role]}</p>
    ${links.map(([href, icon, label]) => `<a class="acc-link" href="${href}">${icon}<span>${label}</span></a>`).join('')}
    <button class="acc-link" data-logout>${I.logout}<span>Гарах</span></button>`;
}

export function bindAccountPopover() {
  const button = $('#accBtn'), pop = $('#accPop');
  if (!button || !pop) return;
  button.onclick = e => {
    e.stopPropagation();
    $('#sndPop').hidden = true; $('#favPop').hidden = true;
    pop.hidden = !pop.hidden;
    if (!pop.hidden) pop.innerHTML = accountPopoverHTML();
  };
  pop.addEventListener('click', async e => {
    const auth = e.target.closest('[data-auth]');
    if (auth) { pop.hidden = true; Snd.ui('whoosh'); openAuth({ mode: auth.dataset.auth }); return; }
    if (e.target.closest('[data-logout]')) { pop.hidden = true; await platform.session.logout(); Snd.ui('click'); toast('Системээс гарлаа'); return; }
    if (e.target.closest('a')) pop.hidden = true;
  });
  document.addEventListener('click', e => { if (!e.target.closest('#accPop,#accBtn')) pop.hidden = true; });
}

// A page that needs a signed-in role shows this instead of its content.
export const signInPrompt = (reason, text) => html`<div class="wrap page"><div class="card gate">
  <span class="gate-ic">${raw(I.user)}</span><h1>Нэвтэрнэ үү</h1><p class="muted">${text}</p>
  <button class="btn btn-p" data-gate-login="${reason}">Нэвтрэх</button> <a class="btn btn-o" href="#home">Нүүр хуудас</a></div></div>`;

export class AccountPage extends Component {
  events() { return { 'click [data-gate-login]': (e, b) => openAuth({ reason: b.dataset.gateLogin }) }; }
  onMount() { this.watch(platform.session.store, s => s.user, () => this.invalidate()); }
  render() {
    const user = platform.session.user;
    if (!platform.online) return html`<div class="wrap page"><div class="card gate"><h1>Бүртгэл</h1><p class="muted">Энэ хувилбар сервергүй ажиллаж байгаа тул нэвтрэх боломжгүй.</p><a class="btn btn-o" href="#home">Нүүр хуудас</a></div></div>`;
    if (!user) return signInPrompt('account', 'Хадгалсан кафе, бүртгэлийн мэдээллээ харахын тулд нэвтэрнэ үү.');
    const { favorites, cafeCard } = this.props;
    const saved = favorites();
    return html`<div class="page"><div class="wrap acc-page">
      <section class="ab-hero" style="grid-template-columns:1fr"><div><span class="tagp">${ROLE[user.role]}</span><h1>${user.name || 'Миний бүртгэл'}</h1><p>${user.email}</p></div></section>
      <section class="sec"><div class="sec-h"><h2>Хадгалсан кафе</h2><p>${saved.length ? `${saved.length} кафе` : 'Картын ♡ товчийг дарж кафе хадгална.'}</p></div>
        ${saved.length ? html`<div class="cgrid">${raw(saved.map(cafeCard).join(''))}</div>` : html`<p style="text-align:center"><a class="btn btn-o" href="#cafes">Кафенууд үзэх →</a></p>`}</section>
    </div></div>`;
  }
}
