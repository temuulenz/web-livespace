// Validation for sensor payloads (schema version 1).
// The same rules are published as JSON Schema in docs/sensor-measurement.schema.json.

export const SCHEMA_VERSION = '1.0';

const NUMERIC = {
  available_seats: [0, 10000, true],
  occupied_seats: [0, 10000, true],
  total_seats: [0, 10000, true],
  noise_level_db: [0, 140],
  wifi_quality: [0, 100],
  wifi_download_mbps: [0, 100000],
  wifi_upload_mbps: [0, 100000],
  wifi_latency_ms: [0, 60000],
  temperature_c: [-40, 80],
  humidity_pct: [0, 100],
  co2_ppm: [0, 10000]
};
const DEVICE_STATES = ['online', 'degraded', 'error', 'maintenance'];
const ID = /^[A-Za-z0-9_.:-]{1,64}$/;
const MAX_FUTURE_MS = 5 * 60 * 1000, MAX_AGE_MS = 7 * 24 * 3600 * 1000;

// Returns { value, errors }. `value` is a normalized copy; extra fields are dropped.
export function validateMeasurement(input, now = Date.now()) {
  const errors = [];
  const fail = (path, message) => errors.push({ path, message });
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { errors: [{ path: '', message: 'must be a JSON object' }] };

  const version = input.schema_version ?? SCHEMA_VERSION;
  if (String(version).split('.')[0] !== '1') fail('schema_version', 'unsupported major version');
  if (typeof input.cafe_id !== 'string' || !ID.test(input.cafe_id)) fail('cafe_id', 'required, 1–64 characters [A-Za-z0-9_.:-]');
  if (typeof input.device_id !== 'string' || !ID.test(input.device_id)) fail('device_id', 'required, 1–64 characters [A-Za-z0-9_.:-]');

  const time = typeof input.timestamp === 'string' && /\d{4}-\d{2}-\d{2}T/.test(input.timestamp) ? Date.parse(input.timestamp) : NaN;
  if (!Number.isFinite(time)) fail('timestamp', 'required ISO 8601 date-time with time zone, e.g. 2026-11-01T10:30:00Z');
  else if (time > now + MAX_FUTURE_MS) fail('timestamp', 'is in the future');
  else if (time < now - MAX_AGE_MS) fail('timestamp', 'is older than 7 days');

  const m = input.measurements;
  const measurements = {};
  if (!m || typeof m !== 'object' || Array.isArray(m)) fail('measurements', 'required object');
  else {
    // Accept the short name used in early device prototypes.
    const source = { ...m };
    if (source.noise_level_db == null && source.noise_level != null) source.noise_level_db = source.noise_level;
    for (const [key, [min, max, integer]] of Object.entries(NUMERIC)) {
      const value = source[key];
      if (value == null) continue;
      if (typeof value !== 'number' || !Number.isFinite(value)) fail(`measurements.${key}`, 'must be a number');
      else if (integer && !Number.isInteger(value)) fail(`measurements.${key}`, 'must be an integer');
      else if (value < min || value > max) fail(`measurements.${key}`, `must be between ${min} and ${max}`);
      else measurements[key] = value;
    }
    if (measurements.total_seats != null && measurements.available_seats != null && measurements.occupied_seats != null && measurements.available_seats + measurements.occupied_seats > measurements.total_seats)
      fail('measurements', 'available_seats + occupied_seats exceeds total_seats');
    if (Array.isArray(source.zones)) {
      measurements.zones = source.zones.slice(0, 50).map((zone, i) => {
        if (!zone || typeof zone.zone_id !== 'string' || !ID.test(zone.zone_id)) fail(`measurements.zones[${i}].zone_id`, 'required identifier');
        const out = { zone_id: zone?.zone_id };
        for (const key of ['available_seats', 'occupied_seats']) if (zone?.[key] != null) {
          if (!Number.isInteger(zone[key]) || zone[key] < 0) fail(`measurements.zones[${i}].${key}`, 'must be a non-negative integer');
          else out[key] = zone[key];
        }
        return out;
      });
    }
    if (!Object.keys(measurements).some(key => key !== 'zones') && !errors.some(e => e.path.startsWith('measurements.'))) fail('measurements', 'contains no known measurement');
  }

  let device_status = null;
  if (input.device_status != null) {
    const d = input.device_status;
    if (typeof d !== 'object' || Array.isArray(d)) fail('device_status', 'must be an object');
    else {
      device_status = {};
      if (d.state != null) { if (DEVICE_STATES.includes(d.state)) device_status.state = d.state; else fail('device_status.state', `one of ${DEVICE_STATES.join(', ')}`); }
      if (d.battery_pct != null) { if (typeof d.battery_pct === 'number' && d.battery_pct >= 0 && d.battery_pct <= 100) device_status.battery_pct = d.battery_pct; else fail('device_status.battery_pct', '0–100'); }
      if (d.firmware != null) device_status.firmware = String(d.firmware).slice(0, 40);
      if (d.uptime_s != null && Number.isFinite(d.uptime_s)) device_status.uptime_s = Math.max(0, Math.round(d.uptime_s));
      if (d.message != null) device_status.message = String(d.message).slice(0, 200);
    }
  }

  if (errors.length) return { errors };
  return { errors: [], value: { schema_version: String(version), cafe_id: input.cafe_id, device_id: input.device_id, timestamp: new Date(time).toISOString(), measurements, device_status } };
}
