// Strict JSON-only edge protocol. No recordings or arbitrary metadata are accepted.
export const SENSOR_ID = /^[A-Za-z0-9_.:-]{1,64}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validateTelemetry(input, clock = Date.now(), { checkAge = true } = {}) {
  const errors = [];
  const fail = (path, message) => errors.push({ path, message });
  if (!object(input)) return { errors: [{ path: '', message: 'must be a JSON object' }] };
  const keys = (value, allowed, path) => {
    if (!object(value)) { fail(path, 'must be an object'); return {}; }
    if (Object.keys(value).some(key => !allowed.includes(key))) fail(path, 'contains unsupported fields');
    return value;
  };
  keys(input, ['schemaVersion', 'type', 'messageId', 'deviceId', 'locationId', 'timestamp', 'dataSource', 'occupancy', 'noise', 'device'], '');
  if (input.schemaVersion !== 1) fail('schemaVersion', 'must be the number 1');
  if (input.type !== 'sensor.telemetry') fail('type', 'must be sensor.telemetry');
  for (const key of ['messageId', 'deviceId', 'locationId']) {
    if (typeof input[key] !== 'string' || !SENSOR_ID.test(input[key])) fail(key, 'required identifier: 1–64 letters, digits, _, ., :, or -');
  }
  const match = typeof input.timestamp === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(input.timestamp);
  const time = match ? Date.parse(input.timestamp) : NaN;
  const valid = match && +match[2] >= 1 && +match[2] <= 12 && +match[3] >= 1 &&
    +match[3] <= new Date(Date.UTC(+match[1], +match[2], 0)).getUTCDate() && +match[4] < 24 && +match[5] < 60 && +match[6] < 60 &&
    (match[7] === 'Z' || (+match[7].slice(1, 3) < 24 && +match[7].slice(4) < 60));
  if (!valid || !Number.isFinite(time)) fail('timestamp', 'must be a valid ISO 8601 timestamp with timezone');
  else if (checkAge && (time > clock + 60000 || time < clock - 7 * 86400000)) fail('timestamp', 'must be within the last 7 days and no more than 60 seconds ahead');
  if (input.dataSource !== undefined && !['real', 'simulated'].includes(input.dataSource)) fail('dataSource', 'must be real or simulated');
  const number = (group, key, min, max, integer = false) => {
    const value = group.value[key];
    if (value == null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
      fail(`${group.path}.${key}`, `must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}, or null`); return null;
    }
    return value;
  };
  const occupancy = { value: keys(input.occupancy, ['observedPeople', 'confidence'], 'occupancy'), path: 'occupancy' };
  const noise = { value: keys(input.noise, ['rms', 'dbfs', 'estimatedDbSpl', 'calibrated'], 'noise'), path: 'noise' };
  const device = { value: keys(input.device, ['batteryPercent', 'batteryTemperatureC', 'charging', 'inferenceMs', 'uptimeSeconds'], 'device'), path: 'device' };
  if (typeof noise.value.calibrated !== 'boolean') fail('noise.calibrated', 'must be a boolean');
  if (device.value.charging != null && typeof device.value.charging !== 'boolean') fail('device.charging', 'must be a boolean or null');
  const spl = number(noise, 'estimatedDbSpl', 0, 140);
  if (!noise.value.calibrated && spl != null) fail('noise.estimatedDbSpl', 'must be null unless calibrated is true');
  const value = {
    schemaVersion: 1, type: 'sensor.telemetry', messageId: input.messageId, deviceId: input.deviceId, locationId: input.locationId,
    timestamp: Number.isFinite(time) ? new Date(time).toISOString() : null, dataSource: input.dataSource ?? 'real',
    occupancy: { observedPeople: number(occupancy, 'observedPeople', 0, 10000, true), confidence: number(occupancy, 'confidence', 0, 1) },
    noise: { rms: number(noise, 'rms', 0, 1), dbfs: number(noise, 'dbfs', -160, 0), estimatedDbSpl: spl, calibrated: noise.value.calibrated },
    device: { batteryPercent: number(device, 'batteryPercent', 0, 100), batteryTemperatureC: number(device, 'batteryTemperatureC', -40, 100),
      charging: device.value.charging ?? null, inferenceMs: number(device, 'inferenceMs', 0, 600000), uptimeSeconds: number(device, 'uptimeSeconds', 0, Number.MAX_SAFE_INTEGER, true) }
  };
  return errors.length ? { errors } : { errors, value };
}
