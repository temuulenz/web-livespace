// Form helpers: read values and validate them with small declarative rules.
//
//   const errors = validate(values, {
//     email: [required('Required'), email('Invalid e-mail')],
//     password: [required(), minLength(8, 'Too short')]
//   });
//   // → { email: 'Invalid e-mail' }   (first failing rule per field; {} when valid)

export function readForm(form) {
  const values = {};
  for (const element of form.elements) {
    if (!element.name || element.disabled) continue;
    if (element.type === 'checkbox') values[element.name] = element.checked;
    else if (element.type === 'radio') { if (element.checked) values[element.name] = element.value; }
    else if (element.type === 'file') values[element.name] = [...element.files];
    else values[element.name] = element.value.trim();
  }
  return values;
}

export function validate(values, rules) {
  const errors = {};
  for (const [field, checks] of Object.entries(rules)) {
    for (const check of checks) {
      const message = check(values[field], values);
      if (message) { errors[field] = message; break; }
    }
  }
  return errors;
}

const empty = value => value == null || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && !value.length);
export const required = (message = 'Required') => value => empty(value) ? message : null;
export const email = (message = 'Invalid e-mail') => value => empty(value) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : message;
export const minLength = (n, message) => value => empty(value) || String(value).length >= n ? null : message || `At least ${n} characters`;
export const maxLength = (n, message) => value => empty(value) || String(value).length <= n ? null : message || `At most ${n} characters`;
export const pattern = (regex, message) => value => empty(value) || regex.test(value) ? null : message;
export const range = (min, max, message) => value => empty(value) || (+value >= min && +value <= max) ? null : message;
export const count = (min, max, message) => value => { const n = Array.isArray(value) ? value.length : 0; return n >= min && n <= max ? null : message; };
