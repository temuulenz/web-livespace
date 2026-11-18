import { $ } from '../dom.js';
import { I } from '../icons.js';

let focusTimer;
const toastTimers = new WeakMap();
const MAX_TOASTS = 3;

export function openModal(html, wide) {
  closeModal();
  const modal = $('#modal');
  modal.innerHTML = `<div class="mdl-bg" data-bg><div class="mdl${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
  const background = $('[data-bg]', modal);
  background.addEventListener('click', event => {
    if (event.target === background || event.target.closest('[data-close]')) closeModal();
  });
  focusTimer = setTimeout(() => {
    if (background.isConnected) $('button,a,input', background)?.focus();
  }, 50);
}

export function closeModal() {
  clearTimeout(focusTimer);
  $('#modal').innerHTML = '';
}

export function toast(message, ok) {
  const host = $('#toasts');
  const duplicate = [...host.children].find(item => item.dataset.message === String(message));
  if (duplicate) {
    clearTimeout(toastTimers.get(duplicate));
    host.appendChild(duplicate);
    toastTimers.set(duplicate, setTimeout(() => dismissToast(duplicate, ok ? 2400 : 5000), ok ? 2400 : 5000));
    return;
  }
  const element = document.createElement('div');
  element.className = 'toast';
  element.dataset.message = String(message);
  element.setAttribute('role', ok ? 'status' : 'alert');
  const text = document.createElement('span');
  text.textContent = String(message);
  element.appendChild(text);
  if (ok) element.insertAdjacentHTML('afterbegin', `<span class="tk">${I.check}</span>`);
  const close = document.createElement('button');
  close.type = 'button'; close.className = 'toast-close'; close.setAttribute('aria-label', 'Мэдэгдэл хаах'); close.textContent = '×';
  close.addEventListener('click', () => dismissToast(element, 0)); element.appendChild(close);
  host.appendChild(element);
  while (host.children.length > MAX_TOASTS) dismissToast(host.firstElementChild, 0);
  const delay = ok ? 2400 : 5000;
  toastTimers.set(element, setTimeout(() => dismissToast(element, 320), delay));
}

function dismissToast(element, delay) {
  if (!element?.isConnected) return;
  clearTimeout(toastTimers.get(element));
  if (delay) { element.classList.add('out'); toastTimers.set(element, setTimeout(() => element.remove(), delay)); }
  else element.remove();
}
