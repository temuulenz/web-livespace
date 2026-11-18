// Mount a framework component inside the shared #modal window. The component is
// destroyed (timers, listeners) as soon as the window closes or another one opens.
import { openModal } from './feedback.js';

let current = null;
export function openModalComponent(ComponentClass, props = {}, wide = false) {
  current?.destroy();
  openModal('<div class="cu-mount"></div>', wide);
  const modal = document.querySelector('#modal'), el = modal.querySelector('.cu-mount');
  const instance = new ComponentClass(props).mount(el);
  current = instance;
  const observer = new MutationObserver(() => {
    if (el.isConnected) return;
    observer.disconnect(); instance.destroy();
    if (current === instance) current = null;
  });
  observer.observe(modal, { childList: true, subtree: true });
  return instance;
}
