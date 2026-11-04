// How old and how trustworthy a café's numbers are, in words the visitor understands.
// Demo, real, test and missing data are never mixed or shown without a label.
import { clockTime, ageSeconds } from '../../framework/index.js';

// Without a backend every value is the bundled demo data.
export const dataMode = c => c.live?.mode || 'demo';
export const hasMeasurements = c => ['live', 'test'].includes(dataMode(c));

export function ageText(iso) {
  const s = ageSeconds(iso);
  if (s < 60) return 'дөнгөж сая';
  if (s < 3600) return `${Math.round(s / 60)} мин өмнө`;
  if (s < 86400) return `${Math.round(s / 3600)} цагийн өмнө`;
  return `${Math.round(s / 86400)} өдрийн өмнө`;
}

export function modeBadge(c) {
  const mode = dataMode(c);
  if (mode === 'demo') return '<span class="badge b-demo">ДЕМО</span>';
  if (mode === 'none') return '<span class="badge b-stale">МЭДЭЭЛЭЛГҮЙ</span>';
  if (c.live.stale) return '<span class="badge b-stale">ХУУЧИРСАН</span>';
  return mode === 'test' ? '<span class="badge b-typ">ТУРШИЛТ</span>' : '<span class="badge b-live">ШУУД</span>';
}

export function freshnessHTML(c) {
  const mode = dataMode(c);
  if (mode === 'demo') return `${modeBadge(c)}<span>Жишээ өгөгдөл</span><small>Энэ кафед мэдрэгч хараахан суугаагүй. Тоонууд нь бодит хэмжилт биш.</small>`;
  if (mode === 'none') return `${modeBadge(c)}<span>Бодит хэмжилт хараахан ирээгүй</span>`;
  const at = c.live.updated_at;
  const source = mode === 'test' ? 'Туршилтын төхөөрөмж' : 'Мэдрэгч';
  if (c.live.stale) return `${modeBadge(c)}<span>Сүүлийн хэмжилт ${clockTime(at)}</span><small>${source} · ${ageText(at)}. Одоогийн байдал өөр байж болно.</small>`;
  return `${modeBadge(c)}<span>${clockTime(at)}-д шинэчлэгдсэн</span><small>${source} · ${ageText(at)}</small>`;
}

// Seat statistics in the shape FloorPlan.stats() uses, from a real measurement.
export function measuredSeats(c) {
  if (!hasMeasurements(c) || c.live.free_pct == null) return null;
  const total = c.live.total_seats ?? ((c.live.available_seats ?? 0) + (c.live.occupied_seats ?? 0));
  const free = c.live.available_seats ?? Math.round(total * c.live.free_pct / 100);
  return { free, total, unknown: 0, list: Array.from({ length: Math.min(total, 40) }, (_, i) => i < Math.round(Math.min(total, 40) * (1 - free / Math.max(1, total))) ? 'occ' : 'free') };
}
