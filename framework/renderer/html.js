// Safe HTML templates.
//
//   html`<b>${user.name}</b>`        → interpolations are escaped
//   html`<ul>${items.map(i => html`<li>${i}</li>`)}</ul>`  → nested templates are kept
//   raw(trustedMarkup)               → opt out of escaping (only for markup you produced)
//
// A template returns a SafeHTML value; String(value) gives the markup.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

export class SafeHTML {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

export const escapeHTML = value => String(value).replace(/[&<>"'`]/g, ch => ESCAPES[ch]);

export const raw = value => value instanceof SafeHTML ? value : new SafeHTML(String(value ?? ''));

function serialize(value) {
  if (value == null || value === false || value === true) return '';
  if (value instanceof SafeHTML) return value.value;
  if (Array.isArray(value)) return value.map(serialize).join('');
  return escapeHTML(value);
}

// Inside a quoted attribute value (aria-pressed="${on}") a boolean means "true"/"false";
// in content, false/true render nothing so `${cond && html`…`}` works.
const inAttribute = text => /=\s*["'][^"']*$/.test(text);

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    out += (typeof value === 'boolean' && inAttribute(strings[i]) ? String(value) : serialize(value)) + strings[i + 1];
  }
  return new SafeHTML(out);
}

// Attribute helper: attrs({ disabled: true, title: 'x' }) → ' disabled title="x"'
export function attrs(map) {
  let out = '';
  for (const [key, value] of Object.entries(map)) {
    if (value == null || value === false) continue;
    out += value === true ? ` ${key}` : ` ${key}="${escapeHTML(value)}"`;
  }
  return new SafeHTML(out);
}
