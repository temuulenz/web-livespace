// Café records for the public site, built from static info + the latest measurements.
import { json } from '../lib/db.mjs';
import { noiseLevel, wifiLevel, occupancyPercent, openState, ulaanbaatarMinutes, walkFrom } from '../../js/live/levels.js';

export function createCafeService(db, config) {
  const recent = db.prepare('SELECT * FROM measurements WHERE cafe_id = ? AND is_test = ? ORDER BY ts DESC, id DESC LIMIT 30');
  const activeRows = db.prepare("SELECT * FROM cafes WHERE status = 'active' ORDER BY sort_order, created_at");
  const byId = db.prepare('SELECT * FROM cafes WHERE id = ?');

  // Each field takes its most recent reported value (devices may report different things).
  function liveFromRows(rows, mode) {
    const first = pick => rows.find(pick);
    const seats = first(r => r.available_seats != null || r.occupied_seats != null);
    const noise = first(r => r.noise_db != null);
    const wifi = first(r => r.wifi_quality != null || r.wifi_down_mbps != null);
    const used = [seats, noise, wifi].filter(Boolean);
    if (!used.length) return null;
    const updated = used.map(r => r.ts).sort().at(-1);
    const out = { mode, updated_at: updated, stale: Date.now() - Date.parse(updated) > config.staleAfterSec * 1000 };
    if (seats) {
      out.available_seats = seats.available_seats; out.occupied_seats = seats.occupied_seats; out.total_seats = seats.total_seats;
      const occ = occupancyPercent(seats);
      out.free_pct = occ == null ? null : 100 - occ;
    }
    if (noise) { out.noise_db = noise.noise_db; out.noise_level = noiseLevel(noise.noise_db); }
    if (wifi) { out.wifi_quality = wifi.wifi_quality; out.wifi_level = wifiLevel(wifi.wifi_quality); out.wifi_mbps = wifi.wifi_down_mbps; }
    return out;
  }

  // mode: 'demo' (labelled example values) | 'live' (real sensors) | 'test' (test devices only) | 'none' (no data yet)
  function liveSummary(row) {
    if (row.data_mode === 'demo') return { mode: 'demo', updated_at: null, stale: false };
    return liveFromRows(recent.all(row.id, 0), 'live') || liveFromRows(recent.all(row.id, 1), 'test') || { mode: 'none', updated_at: null, stale: false };
  }

  function publicCafe(row, minutes = ulaanbaatarMinutes()) {
    const demo = json(row.demo);
    const visualization = json(row.visualization, {});
    const base = {
      id: row.id, name: row.name, x: row.map_x, y: row.map_y, hours: row.hours, tags: json(row.tags, []),
      category: row.category, district: row.district, address: row.address, description: row.description,
      visualization: { status: visualization.status || 'not_started', layout: visualization.status === 'ready' ? visualization.layout || null : null }
    };
    const live = liveSummary(row);
    if (row.data_mode === 'demo' && demo) return { ...base, ...demo, live };

    const { open, opens } = openState(row.hours, minutes);
    const { dist, walk } = walkFrom(row.map_x ?? 500, row.map_y ?? 340);
    const has = live.mode === 'live' || live.mode === 'test';
    return {
      ...base, dist, walk, open: open && has, opens: has ? opens : null, note: row.description.slice(0, 120),
      // No measurement yet: say so instead of showing invented numbers.
      status_text: has ? null : 'Бодит хэмжилт хараахан ирээгүй',
      occ: has && live.free_pct != null ? 100 - live.free_pct : 0,
      sound: has ? live.noise_level || 0 : 0,
      wifi: has ? live.wifi_level || 0 : 0,
      mbps: has && live.wifi_mbps != null ? Math.round(live.wifi_mbps) : null,
      plugs: null,
      live
    };
  }

  return {
    listPublic() { const minutes = ulaanbaatarMinutes(); return activeRows.all().map(row => publicCafe(row, minutes)); },
    getPublic(id) { const row = byId.get(id); return row && row.status === 'active' ? publicCafe(row) : null; },
    get: id => byId.get(id),
    publicCafe,
    liveSummary
  };
}
