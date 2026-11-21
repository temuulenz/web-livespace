import { $ } from '../dom.js';
import { I } from '../icons.js';

let focusTimer, restoreFocus;

export function openModal(html, wide, { trigger = document.activeElement, label } = {}) {
  closeModal(false);
  restoreFocus = trigger;
  const modal = $('#modal');
  modal.innerHTML = `<div class="mdl-bg" data-bg><div class="mdl${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
  const background = $('[data-bg]', modal);
  const dialog = $('[role="dialog"]', background);
  if (label) dialog.setAttribute('aria-labelledby', label);
  else if (!dialog.querySelector('h2')) dialog.setAttribute('aria-label', 'LiveSpace');
  dialog.tabIndex = -1;
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const stops = [...dialog.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')]
      .filter(el => el.getClientRects().length > 0 && el.tabIndex >= 0);
    const first = stops[0], last = stops.at(-1);
    if (!first || (event.shiftKey && (document.activeElement === first || document.activeElement === dialog))
      || (!event.shiftKey && document.activeElement === last)) {
      event.preventDefault();
      (event.shiftKey ? last || dialog : first || dialog).focus();
    }
  });
  background.addEventListener('click', event => {
    if (event.target === background || event.target.closest('[data-close]')) closeModal();
  });
  focusTimer = setTimeout(() => {
    if (!background.isConnected) return;
    const heading = $('h2', dialog);
    if (!label && heading) {
      heading.id ||= 'livespace-dialog-title';
      dialog.setAttribute('aria-labelledby', heading.id);
      dialog.removeAttribute('aria-label');
    }
    ($('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled)', dialog) || dialog).focus();
  }, 50);
}

export function closeModal(restore = true) {
  clearTimeout(focusTimer);
  $('#modal').innerHTML = '';
  if (restore && restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true });
  restoreFocus = null;
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
