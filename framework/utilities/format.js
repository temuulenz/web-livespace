// Formatting helpers that do not depend on the application language.

const pad = n => String(n).padStart(2, '0');

export const clockTime = date => { const d = new Date(date); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const dateTime = date => { const d = new Date(date); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${clockTime(d)}`; };

// Age in whole seconds (never negative; clocks may differ slightly).
export const ageSeconds = (date, now = Date.now()) => Math.max(0, Math.round((now - new Date(date).getTime()) / 1000));

export function bytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
