import { $ } from '../dom.js';
import { I } from '../icons.js';

let focusTimer;

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
  const element = document.createElement('div');
  element.className = 'toast';
  element.innerHTML = (ok ? `<span class="tk">${I.check}</span>` : '') + message;
  $('#toasts').appendChild(element);
  // Toasts intentionally finish their existing animation across navigation.
  setTimeout(() => {
    element.classList.add('out');
    setTimeout(() => element.remove(), 320);
  }, 2400);
}
