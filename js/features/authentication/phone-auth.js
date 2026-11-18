// Phone sign-in / registration: phone number → 6-digit code. One window does both;
// a new number simply becomes an account. Talks only to the customer adapter; the mock
// sends no SMS, accepts 123456 and says so with a ДЕМО notice.
import { Component, html, raw } from '../../../framework/index.js';
import { closeModal, toast } from '../../components/feedback.js';
import { openModalComponent } from '../../components/modal-component.js';
import { I } from '../../icons.js';
import { Snd } from '../../audio.js';
import { customer } from '../../services/customer-adapter.js';
import { phoneError, formatPhone, otpCodeError, secondsUntil, mmss, OTP_LENGTH, OTP_MAX_ATTEMPTS } from '../../services/customer-rules.js';

const REASONS = {
  going: '«Очих» болон урьдчилсан захиалга хийхийн тулд утасны дугаараараа нэвтэрнэ үү.',
  account: 'Утасны дугаараараа нэвтэрнэ үү.'
};

class PhoneAuth extends Component {
  initialState() { return { step: 'phone', phone: '', phoneErr: '', error: '', busy: false, resendAt: 0, expiresAt: 0, attemptsLeft: OTP_MAX_ATTEMPTS, locked: false, now: Date.now() }; }
  events() {
    return {
      'submit [data-phone-form]': e => { e.preventDefault(); this.sendCode(e.target.elements.phone.value); },
      'input [name="phone"]': () => { if (this.state.phoneErr) this.setState({ phoneErr: '' }); },
      'submit [data-code-form]': e => { e.preventDefault(); this.verify(e.target.elements.code.value); },
      'input [data-otp]': (e, input) => {
        const digits = input.value.replace(/\D/g, '').slice(0, OTP_LENGTH);
        if (digits !== input.value) input.value = digits;
        if (this.state.error && !this.state.locked) this.setState({ error: '' });
        if (digits.length === OTP_LENGTH && this.canVerify()) this.verify(digits);
      },
      'click [data-resend]': () => this.sendCode(this.state.phone),
      'click [data-change-phone]': () => { Snd.ui('click'); this.setState({ step: 'phone', error: '', phoneErr: '' }); }
    };
  }
  onMount() {
    this.interval(() => { if (this.state.step === 'code') this.setState({ now: Date.now() }); }, 1000);
  }
  onUpdate() {
    if (this.state.step === 'code' && this.focusCode) { this.focusCode = false; this.$('[data-otp]')?.focus(); }
  }
  expired() { return this.state.step === 'code' && this.state.now >= this.state.expiresAt; }
  canVerify() { return !this.state.busy && !this.state.locked && !this.expired(); }

  async sendCode(input) {
    const problem = phoneError(input);
    if (problem) { Snd.ui('err'); this.setState({ phoneErr: problem }); return; }
    this.setState({ busy: true, phoneErr: '', error: '' });
    try {
      const sent = await customer.auth.requestCode(input);
      Snd.ui('pop'); this.focusCode = true;
      const otp = this.$('[data-otp]'); if (otp) otp.value = '';
      this.setState({ step: 'code', phone: sent.phone, resendAt: sent.resendAt, expiresAt: sent.expiresAt, attemptsLeft: sent.attemptsLeft, locked: false, busy: false, now: Date.now() });
    } catch (error) {
      Snd.ui('err');
      if (error.code === 'invalid_phone') this.setState({ busy: false, phoneErr: error.message, step: 'phone' });
      else this.setState({ busy: false, error: error.message, ...(error.details?.resendAt ? { resendAt: error.details.resendAt } : {}) });
    }
  }
  async verify(code) {
    const problem = otpCodeError(code);
    if (problem) { Snd.ui('err'); this.setState({ error: problem }); return; }
    if (!this.canVerify()) return;
    this.setState({ busy: true, error: '' });
    try {
      const user = await customer.auth.verifyCode(this.state.phone, code);
      Snd.ui('chime'); closeModal();
      toast(`Нэвтэрлээ · ${formatPhone(user.phone)}`, true);
      this.props.onSuccess?.(user);
    } catch (error) {
      Snd.ui('err');
      const otp = this.$('[data-otp]'); if (otp) { otp.value = ''; otp.focus(); }
      this.setState({ busy: false, error: error.message, attemptsLeft: error.details?.attemptsLeft ?? this.state.attemptsLeft, locked: error.code === 'locked', ...(error.code === 'expired' ? { expiresAt: 0 } : {}) });
    }
  }

  render() {
    const { step, busy, error, phone, phoneErr, now, resendAt, expiresAt, locked } = this.state;
    const reason = REASONS[this.props.reason] || '';
    const demo = customer.mode === 'mock' ? html`<p class="otp-demo"><span class="badge b-demo">ДЕМО</span><span>SMS илгээгдэхгүй. Баталгаажуулах код: <b class="num">123456</b></span></p>` : '';
    const head = html`<div class="mdl-h"><div><span class="eyebrow">${raw(I.user.replace('<svg', '<svg width="14" height="14"'))} LiveSpace бүртгэл</span>
      <h2>${step === 'phone' ? 'Утсаар нэвтрэх' : 'Код оруулах'}</h2>${reason && step === 'phone' ? html`<small class="muted">${reason}</small>` : ''}</div>
      <button class="pv-x" data-close aria-label="Хаах" style="margin-left:auto">${raw(I.x)}</button></div>`;
    if (step === 'phone') return html`${head}${demo}
      <form class="form auth-form" data-phone-form novalidate data-key="phone">
        <div class="fld${phoneErr ? ' err' : ''}"><label for="otp-phone">Утасны дугаар</label>
          <div class="otp-phone"><span aria-hidden="true">+976</span><input id="otp-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="9911 2233" maxlength="20" value="${phone ? `${phone.slice(0, 4)} ${phone.slice(4)}` : ''}" aria-describedby="otp-phone-err"></div>
          <span class="em" id="otp-phone-err" role="alert">${phoneErr}</span></div>
        ${error ? html`<p class="auth-msg" role="alert">${error}</p>` : ''}
        <button class="btn btn-p" ${raw(busy ? 'disabled' : '')}>${busy ? 'Түр хүлээнэ үү…' : 'Код авах'}</button>
        <small class="muted">Шинэ дугаар бол автоматаар бүртгэл үүснэ. Таны дугаарыг бусад хэрэглэгчид харахгүй; кафе зөвхөн сүүлийн 4 оронг харна.</small>
      </form>`;
    const resendIn = secondsUntil(resendAt, now), expired = now >= expiresAt;
    const status = locked ? '' : expired ? html`<p class="auth-msg" role="alert">Кодын хугацаа дууссан. Шинэ код авна уу.</p>`
      : html`<small class="muted num">Код ${mmss(secondsUntil(expiresAt, now))} хүртэл хүчинтэй</small>`;
    return html`${head}${demo}
      <form class="form auth-form" data-code-form novalidate data-key="code">
        <p class="otp-sent"><span><b class="num">${formatPhone(phone)}</b> дугаарт ${OTP_LENGTH} оронтой код илгээлээ.</span> <button type="button" class="linkb" data-change-phone>Дугаар солих</button></p>
        <div class="fld${error ? ' err' : ''}"><label for="otp-code">Баталгаажуулах код</label>
          <input id="otp-code" class="otp-input num" name="code" data-otp type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="${OTP_LENGTH}" placeholder="••••••" aria-describedby="otp-code-err" ${raw(locked || expired ? 'disabled' : '')}>
          <span class="em" id="otp-code-err" role="alert">${error}</span></div>
        ${status}
        <button class="btn btn-p" ${raw(busy || locked || expired ? 'disabled' : '')}>${busy ? 'Шалгаж байна…' : 'Баталгаажуулах'}</button>
        <button type="button" class="btn btn-g" data-resend ${raw(resendIn > 0 || busy ? 'disabled' : '')}>${resendIn > 0 ? html`Код дахин илгээх <span class="num">(${mmss(resendIn)})</span>` : 'Код дахин илгээх'}</button>
      </form>`;
  }
}

export function openPhoneAuth({ reason, onSuccess } = {}) {
  Snd.ui('whoosh');
  return openModalComponent(PhoneAuth, { reason, onSuccess });
}
