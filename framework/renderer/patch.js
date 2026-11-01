// Minimal DOM patching.
//
// patch(container, markup) updates the container's children to match `markup`
// while keeping unchanged nodes in place, so focus, scroll positions, running CSS
// animations and canvases survive a re-render. Matching rules:
//   • elements with the same `data-key` are matched, even if they moved;
//   • otherwise nodes are matched by position when tag (or node type) is equal;
//   • an element with `data-preserve` is never touched once it exists (use it for
//     containers owned by something else, e.g. a canvas simulation).
// Form fields keep the user's current value unless the new markup changes it.

const keyOf = node => node.nodeType === 1 ? node.getAttribute('data-key') : null;
const same = (a, b) => a.nodeType === b.nodeType && (a.nodeType !== 1 || (a.tagName === b.tagName && keyOf(a) === keyOf(b)));

function syncAttributes(from, to) {
  const oldValue = from.getAttribute('value'), oldChecked = from.hasAttribute('checked');
  for (const { name } of [...from.attributes]) if (!to.hasAttribute(name)) from.removeAttribute(name);
  for (const { name, value } of [...to.attributes]) if (from.getAttribute(name) !== value) from.setAttribute(name, value);
  // What the user typed or ticked wins, unless the template itself changed the value.
  if (from.tagName === 'INPUT') {
    if (to.getAttribute('value') !== oldValue) from.value = to.getAttribute('value') ?? '';
    if ((from.type === 'checkbox' || from.type === 'radio') && to.hasAttribute('checked') !== oldChecked) from.checked = to.hasAttribute('checked');
  }
}

function morph(from, to) {
  if (from.nodeType === 3 || from.nodeType === 8) { if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue; return; }
  if (from.hasAttribute('data-preserve')) return;
  const oldText = from.tagName === 'TEXTAREA' ? from.defaultValue : null;
  syncAttributes(from, to);
  if (from.tagName === 'TEXTAREA') { if (to.defaultValue !== oldText) { from.defaultValue = to.defaultValue; from.value = to.defaultValue; } return; }
  if (from.tagName === 'SELECT') {
    const before = from.querySelector('option[selected]')?.value ?? null, chosen = to.querySelector('option[selected]')?.value ?? null;
    morphChildren(from, to);
    if (chosen !== before && chosen != null) from.value = chosen;
    return;
  }
  morphChildren(from, to);
}

export function morphChildren(parent, next) {
  const keyed = new Map();
  for (const child of parent.childNodes) { const key = keyOf(child); if (key) keyed.set(key, child); }
  let current = parent.firstChild;
  for (const wanted of [...next.childNodes]) {
    const key = keyOf(wanted);
    let match = null;
    if (key && keyed.has(key)) { match = keyed.get(key); keyed.delete(key); }
    else if (!key && current && !keyOf(current) && same(current, wanted)) match = current;
    if (match) {
      if (match !== current) parent.insertBefore(match, current);
      else current = current.nextSibling;
      morph(match, wanted);
    } else {
      parent.insertBefore(wanted, current);
    }
  }
  while (current) { const next = current.nextSibling; current.remove(); current = next; }
  for (const stale of keyed.values()) if (stale.parentNode === parent) stale.remove();
}

const template = typeof document !== 'undefined' ? document.createElement('template') : null;

export function patch(container, markup) {
  template.innerHTML = String(markup);
  morphChildren(container, template.content);
}
