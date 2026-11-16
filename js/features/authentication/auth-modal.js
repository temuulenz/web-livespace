// Login / registration window. Opened when a guest tries something that needs an
// account (e.g. saving a favourite); after success the pending action continues on
// the same page, so the visitor never loses their place.
import { Component, html, raw, readForm, validate, required, email, minLength } from '../../../framework/index.js';
import { openModal, closeModal, toast } from '../../components/feedback.js';
import { I } from '../../icons.js';
import { Snd } from '../../audio.js';
import { platform } from '../../services/platform.js';

const REASONS = {
  favorite: 'Дуртай кафегаа хадгалахын тулд нэвтэрнэ үү. Нэвтэрсний дараа таны сонгосон кафе шууд хадгалагдана.',
  account: 'Хадгалсан кафе, бүртгэлийн мэдээллээ харахын тулд нэвтэрнэ үү.',
  owner: 'Кафе эзэмшигчийн самбарт нэвтэрнэ үү.',
  admin: 'Зөвхөн LiveSpace багийн гишүүд нэвтэрнэ.'
};

export const fieldError = (errors, key) => errors[key] ? html`<span class="em">${errors[key]}</span>` : html`<span class="em"></span>`;
export const field = (errors, { name, label, type = 'text', value = '', autocomplete, placeholder = '' }) => html`
  <div class="fld${errors[name] ? ' err' : ''}"><label for="au-${name}">${label}</label>
   <input id="au-${name}" name="${name}" type="${type}" value="${value}" placeholder="${placeholder}" ${raw(autocomplete ? `autocomplete="${autocomplete}"` : '')}>${fieldError(errors, name)}</div>`;

class AuthForm extends Component {
  initialState(props) { return { mode: props.mode || 'login', errors: {}, busy: false, message: '' }; }
  events() {
    return {
      'click [data-auth-mode]': (e, b) => { Snd.ui('click'); this.setState({ mode: b.dataset.authMode, errors: {}, message: '' }); },
      'submit form': e => { e.preventDefault(); this.submit(e.target); }
    };
  }
  async submit(form) {
    const values = readForm(form);
    const rules = { email: [required('И-мэйлээ оруулна уу'), email('И-мэйл хаяг буруу байна')], password: [required('Нууц үгээ оруулна уу')] };
    if (this.state.mode === 'register') rules.password.push(minLength(8, 'Дор хаяж 8 тэмдэгт'));
    const errors = validate(values, rules);
    if (Object.keys(errors).length) { Snd.ui('err'); this.setState({ errors, message: '' }); return; }
    this.setState({ busy: true, errors: {}, message: '' });
    try {
      const user = this.state.mode === 'login' ? await platform.session.login(values) : await platform.session.register(values);
      Snd.ui('chime');
      closeModal();
      toast(`Тавтай морил${user.name ? ', ' + user.name : ''}!`, true);
    } catch (error) {
      Snd.ui('err');
      this.setState({ busy: false, errors: error.details || {}, message: error.isNetwork ? 'Сервертэй холбогдож чадсангүй. Дахин оролдоно уу.' : error.message });
    }
  }
  render() {
    const { mode, errors, busy, message } = this.state;
    const login = mode === 'login';
    return html`
    <div class="mdl-h"><div><span class="eyebrow">${raw(I.user.replace('<svg', '<svg width="14" height="14"'))} LiveSpace бүртгэл</span><h2>${login ? 'Нэвтрэх' : 'Бүртгүүлэх'}</h2>
      ${this.props.reason ? html`<small class="muted">${REASONS[this.props.reason] || this.props.reason}</small>` : ''}</div>
      <button class="pv-x" data-close aria-label="Хаах" style="margin-left:auto">${raw(I.x)}</button></div>
    <div class="chips auth-tabs" role="tablist">
      <button class="chip" role="tab" data-auth-mode="login" aria-pressed="${login}" aria-selected="${login}">Нэвтрэх</button>
      <button class="chip" role="tab" data-auth-mode="register" aria-pressed="${!login}" aria-selected="${!login}">Шинээр бүртгүүлэх</button>
    </div>
    <form class="form auth-form" novalidate data-key="${mode}">
      ${login ? '' : field(errors, { name: 'name', label: 'Нэр (заавал биш)', autocomplete: 'name' })}
      ${field(errors, { name: 'email', label: 'И-мэйл', type: 'email', autocomplete: 'email', placeholder: 'name@example.com' })}
      ${field(errors, { name: 'password', label: 'Нууц үг', type: 'password', autocomplete: login ? 'current-password' : 'new-password', placeholder: login ? '' : 'Дор хаяж 8 тэмдэгт' })}
      ${message ? html`<p class="auth-msg" role="alert">${message}</p>` : ''}
      <button class="btn btn-p" ${raw(busy ? 'disabled' : '')}>${busy ? 'Түр хүлээнэ үү…' : login ? 'Нэвтрэх' : 'Бүртгүүлэх'}</button>
      <small class="muted">Нэвтрэхгүйгээр бүх кафе, газрын зураг, сул суудлыг үзэх боломжтой. Бүртгэл зөвхөн хадгалах үйлдэлд хэрэгтэй.</small>
    </form>`;
  }
}

let current = null;
export function openAuth({ mode = 'login', reason } = {}) {
  current?.destroy();
  openModal('<div class="auth-mount"></div>');
  current = new AuthForm({ mode, reason }).mount(document.querySelector('#modal .auth-mount'));
}

// The guest closed the window without signing in: forget what they were about to do.
export function watchAuthCancel() {
  document.addEventListener('click', e => {
    if (current && (e.target.closest('#modal [data-close]') || e.target.matches?.('#modal [data-bg]'))) platform.session.cancelPending();
  }, true);
}
