// "Хамтран ажиллах" application form and the café-owner account step that follows it.
//
// The original form fields (f1–f7) keep their ids and look; the additions are the
// address, opening hours, seats, purposes, a description and 3–4 photographs that
// our team uses to build the café's own animated interior.
import { Component, html, raw, readForm, escapeHTML } from '../../../framework/index.js';
import { $, $$ } from '../../dom.js';
import { I } from '../../icons.js';
import { Snd } from '../../audio.js';
import { store } from '../../storage.js';
import { openModal, closeModal, toast } from '../../components/feedback.js';
import { platform } from '../../services/platform.js';
import { resizePhoto } from './photos.js';
import { field } from '../authentication/auth-modal.js';

const PURPOSES = [['Сурах', I.book], ['Ажиллах', I.laptop], ['Найзуудтай', I.people], ['Тухтай', I.sofa]];
const MAX_PHOTOS = 4, MIN_PHOTOS = 3;

export function partnerFormHTML() {
  const text = ([id, label, placeholder, type, req]) => `<div class="fld"><label for="${id}">${label}</label><input id="${id}" type="${type}" placeholder="${placeholder}" ${req ? 'required' : ''}><span class="em"></span></div>`;
  return `<form class="form" id="pf" novalidate>
  ${[['f1', 'Кафены нэр', 'Жишээ: Кафе A', 'text', 1], ['f2', 'Холбоо барих хүн', 'Овог, нэр', 'text', 1], ['f3', 'Утасны дугаар', '8800 0000', 'tel', 1], ['f4', 'И-мэйл', 'name@example.com', 'email', 1]].map(text).join('')}
  <div class="fld"><label for="f5">Дүүрэг</label><select id="f5"><option>Сүхбаатар</option><option>Чингэлтэй</option><option>Баянгол</option><option>Хан-Уул</option><option>Баянзүрх</option><option>Сонгинохайрхан</option></select></div>
  <div class="fld"><label for="f6">Байгууллагын төрөл</label><select id="f6"><option>Кафе</option><option>Коворкинг</option><option>Номын сан</option></select></div>
  <div class="fld full"><label for="f8">Хаяг</label><input id="f8" type="text" placeholder="Гудамж, байр, давхар — газрын зураг дээр байршуулахад хэрэгтэй" required data-kind="text"><span class="em"></span></div>
  <div class="fld"><label for="f9">Ажлын цаг</label><div class="pf-hours"><input id="f9" type="time" value="08:00" required aria-label="Нээх цаг"><span>–</span><input id="f10" type="time" value="22:00" required aria-label="Хаах цаг"></div><span class="em"></span></div>
  <div class="fld"><label for="f11">Суудлын тоо <small class="muted">(заавал биш)</small></label><input id="f11" type="number" min="1" max="2000" inputmode="numeric" placeholder="Жишээ: 30"><span class="em"></span></div>
  <div class="fld full"><label>Юунд тохиромжтой вэ?</label><div class="chips pf-purp">${PURPOSES.map(([p, ic]) => `<label class="chip"><input type="checkbox" name="purposes" value="${p}">${ic}${p}</label>`).join('')}</div></div>
  <div class="fld full"><label for="f12">Кафены тухай</label><textarea id="f12" rows="3" placeholder="Орчин, онцлог, хэн ихэвчлэн ирдэг вэ" required data-kind="text"></textarea><span class="em"></span></div>
  <div class="fld full"><label for="f7">Нэмэлт мэдээлэл</label><textarea id="f7" rows="3" placeholder="Кафенийхаа тухай товч бичнэ үү"></textarea></div>
  <div class="fld full pf-photos"><label for="fPhotos">Кафены зураг <small class="muted">(3–4 ширхэг)</small></label>
   <p class="muted pf-hint">Орц, танхим, суудал, лангууны зургийг оруулаарай. Манай баг эдгээрээр танай кафены өөрийн хөдөлгөөнт зураглалыг бүтээнэ.</p>
   <div class="ph-grid" id="phGrid"></div>
   <label class="ph-add" for="fPhotos">${I.photo}<span>Зураг нэмэх</span><input id="fPhotos" type="file" accept="image/jpeg,image/png,image/webp" multiple></label>
   <span class="em"></span></div>
  <div class="fld full" style="flex-direction:row;align-items:center;gap:14px;flex-wrap:wrap"><button class="btn btn-p">Хүсэлт илгээх</button><span class="muted" style="font-size:13px">Эсвэл: [И-мэйл хаяг] · [Утасны дугаар]</span></div>
 </form>`;
}

const doneHTML = (title, body, extra = '') => `<div class="done"><svg viewBox="0 0 84 84"><circle cx="42" cy="42" r="38" fill="#F6EBDA"/><path class="ck" d="M26 43l11 11 22-24" fill="none" stroke="#7B542F" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg><h2 style="margin:12px 0 6px">${title}</h2><p class="muted">${body}</p>${extra}</div>`;

// Bind the form. Returns a cleanup function (object URLs for previews).
export function bindPartnerForm(form) {
  let photos = [];
  const grid = $('#phGrid', form), fileInput = $('#fPhotos', form);
  const renderPhotos = () => {
    grid.querySelectorAll('img').forEach(img => URL.revokeObjectURL(img.src));
    grid.innerHTML = photos.map((file, i) => `<figure class="ph"><img src="${URL.createObjectURL(file)}" alt="Зураг ${i + 1}"><button type="button" class="pv-x" data-ph-rm="${i}" aria-label="Зураг хасах">${I.x}</button></figure>`).join('');
    $('.ph-add', form).hidden = photos.length >= MAX_PHOTOS;
  };
  fileInput.addEventListener('change', () => {
    const added = [...fileInput.files].filter(f => /^image\/(jpeg|png|webp)$/.test(f.type));
    if (added.length < fileInput.files.length) toast('Зөвхөн JPEG, PNG, WebP зураг');
    photos = [...photos, ...added].slice(0, MAX_PHOTOS);
    fileInput.value = '';
    Snd.ui('pop'); renderPhotos();
  });
  grid.addEventListener('click', e => { const b = e.target.closest('[data-ph-rm]'); if (b) { photos.splice(+b.dataset.phRm, 1); Snd.ui('click'); renderPhotos(); } });
  $$('.pf-purp input', form).forEach(input => input.addEventListener('change', () => { input.parentElement.setAttribute('aria-pressed', input.checked); Snd.ui('click'); }));

  const setError = (el, message) => { const f = el.closest('.fld'); f.classList.toggle('err', !!message); $('.em', f).textContent = message || ''; return !message; };

  form.onsubmit = async e => {
    e.preventDefault();
    let ok = true;
    // Original rules for the original fields, unchanged.
    $$('#pf [required]').forEach(i => {
      if (i.type === 'time') return;
      const bad = !i.value.trim() || (i.type === 'email' && !/^\S+@\S+\.\S+$/.test(i.value)) || (i.type === 'tel' && i.value.replace(/\D/g, '').length < 8);
      if (!setError(i, bad ? (i.value.trim() ? (i.type === 'email' ? 'И-мэйл хаяг буруу байна' : '8 оронтой дугаар оруулна уу') : 'Энэ талбарыг бөглөнө үү') : '')) ok = false;
    });
    const open = $('#f9', form).value, close = $('#f10', form).value;
    if (!setError($('#f9', form), open && close && open !== close ? '' : 'Нээх, хаах цагаа оруулна уу')) ok = false;
    const seats = $('#f11', form).value;
    if (!setError($('#f11', form), !seats || (+seats >= 1 && +seats <= 2000 && Number.isInteger(+seats)) ? '' : '1–2000 хооронд тоо')) ok = false;
    if (!setError(fileInput, photos.length >= MIN_PHOTOS ? '' : `Кафены ${MIN_PHOTOS}–${MAX_PHOTOS} зураг оруулна уу (одоо ${photos.length})`)) ok = false;
    if (!ok) { Snd.ui('err'); $('.fld.err', form)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }

    const values = readForm(form);
    const body = {
      cafe_name: $('#f1', form).value.trim(), contact_name: $('#f2', form).value.trim(), phone: $('#f3', form).value.trim(), email: $('#f4', form).value.trim(),
      district: $('#f5', form).value, category: $('#f6', form).value, address: $('#f8', form).value.trim(), hours: `${open}–${close}`,
      seats: seats ? +seats : null, purposes: [].concat(values.purposes || []).filter(Boolean),
      description: $('#f12', form).value.trim(), extra: $('#f7', form).value.trim()
    };

    // Static demo without a backend: behave like the original prototype.
    if (!platform.online) { Snd.ui('chime'); form.innerHTML = doneHTML('Хүсэлт хүлээж авлаа', 'Бид 2 ажлын өдөрт тантай холбогдоно. (Прототип — хүсэлт хаашаа ч илгээгдээгүй.)'); return; }

    const button = $('button.btn-p', form);
    button.disabled = true; button.textContent = 'Зураг бэлтгэж байна…';
    try {
      body.photos = await Promise.all(photos.map(file => resizePhoto(file)));
      button.textContent = 'Илгээж байна…';
      const result = await platform.api.post('/applications', body, { timeout: 60000 });
      Snd.ui('chime');
      if (result.claim_token) {
        store.set('claim', { token: result.claim_token, email: body.email, cafe: body.cafe_name });
        form.innerHTML = doneHTML('Хүсэлт хүлээж авлаа', 'Манай баг тантай удахгүй холбогдоно. Одоо кафе эзэмшигчийн бүртгэлээ үүсгээд хүсэлтийнхээ явцыг хянаарай.', `<button type="button" class="btn btn-p" data-owner-signup>${I.user} Эзэмшигчийн бүртгэл үүсгэх</button>`);
        openOwnerSignup();
      } else {
        form.innerHTML = doneHTML('Хүсэлт хүлээж авлаа', 'Хүсэлт таны бүртгэлтэй холбогдлоо. Манай баг тантай удахгүй холбогдоно.', '<a class="btn btn-p" href="#owner">Миний кафе →</a>');
        await platform.session.load();
      }
    } catch (error) {
      Snd.ui('err');
      button.disabled = false; button.textContent = 'Хүсэлт илгээх';
      if (error.details) for (const [key, message] of Object.entries(error.details)) {
        const id = { cafe_name: 'f1', contact_name: 'f2', phone: 'f3', email: 'f4', address: 'f8', hours: 'f9', seats: 'f11', description: 'f12', photos: 'fPhotos' }[key];
        if (id) setError($('#' + id, form), message);
      }
      toast(error.isNetwork ? 'Сервертэй холбогдож чадсангүй. Дахин оролдоно уу.' : error.message || 'Хүсэлт илгээхэд алдаа гарлаа');
    }
  };
  return () => grid.querySelectorAll('img').forEach(img => URL.revokeObjectURL(img.src));
}

// A visitor who submitted earlier but closed the account window can finish it later.
export function pendingClaimHTML() {
  const claim = store.get('claim', null);
  if (!platform.online || !claim?.token || platform.session.user) return '';
  return `<div class="pf-claim card"><div><b>«${escapeHTML(claim.cafe)}» хүсэлтээ хянах</b><small class="muted">Эзэмшигчийн бүртгэлээ үүсгээд хүсэлтийнхээ явцыг харна уу.</small></div><button type="button" class="btn btn-p" data-owner-signup>Бүртгэл үүсгэх</button></div>`;
}

/* ---------- café-owner account (step 4–5) ---------- */
class OwnerSignup extends Component {
  initialState() { return { errors: {}, busy: false, message: '' }; }
  events() {
    return {
      'submit form': e => { e.preventDefault(); this.submit(e.target); },
      'click [data-owner-login]': () => {
        const claim = this.props.claim;
        closeModal();
        platform.session.requireLogin(async () => {
          await platform.api.post('/applications/claim', { claim_token: claim.token });
          await platform.session.load();
          store.set('claim', null);
          location.hash = 'owner';
        }, 'owner');
      }
    };
  }
  async submit(form) {
    const values = readForm(form);
    const errors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email = 'И-мэйл хаяг буруу байна';
    if ((values.password || '').length < 8) errors.password = 'Дор хаяж 8 тэмдэгт';
    if (Object.keys(errors).length) { Snd.ui('err'); this.setState({ errors }); return; }
    this.setState({ busy: true, errors: {}, message: '' });
    try {
      await platform.session.register({ ...values, claim_token: this.props.claim.token }, '/auth/register-owner');
      store.set('claim', null);
      Snd.ui('chime'); closeModal();
      toast('Кафе эзэмшигчийн бүртгэл үүслээ', true);
      location.hash = 'owner';
    } catch (error) {
      Snd.ui('err');
      this.setState({ busy: false, errors: error.details || {}, message: error.message });
    }
  }
  render() {
    const { errors, busy, message } = this.state, claim = this.props.claim;
    return html`
    <div class="mdl-h"><div><span class="eyebrow">${raw(I.hand.replace('<svg', '<svg width="14" height="14"'))} Хамтын ажиллагаа · алхам 2/2</span><h2>Кафе эзэмшигчийн бүртгэл</h2>
      <small class="muted">«${claim.cafe}» кафены хүсэлтийн явц, тохиргоо, хэмжилтээ энэ бүртгэлээр хянана.</small></div>
      <button class="pv-x" data-close aria-label="Хаах" style="margin-left:auto">${raw(I.x)}</button></div>
    <form class="form auth-form" novalidate>
      ${field(errors, { name: 'name', label: 'Таны нэр', autocomplete: 'name' })}
      ${field(errors, { name: 'email', label: 'И-мэйл', type: 'email', value: claim.email || '', autocomplete: 'email' })}
      ${field(errors, { name: 'password', label: 'Нууц үг', type: 'password', autocomplete: 'new-password', placeholder: 'Дор хаяж 8 тэмдэгт' })}
      ${message ? html`<p class="auth-msg" role="alert">${message}</p>` : ''}
      <button class="btn btn-p" ${raw(busy ? 'disabled' : '')}>${busy ? 'Түр хүлээнэ үү…' : 'Бүртгэл үүсгэх'}</button>
      <button type="button" class="btn btn-g" data-owner-login>Бүртгэлтэй юу? Нэвтрээд холбох</button>
    </form>`;
  }
}

let signup = null;
export function openOwnerSignup() {
  const claim = store.get('claim', null);
  if (!claim?.token) return;
  signup?.destroy();
  openModal('<div class="auth-mount"></div>');
  signup = new OwnerSignup({ claim }).mount(document.querySelector('#modal .auth-mount'));
}
