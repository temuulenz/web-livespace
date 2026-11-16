// Shared browser projection over the cafe record, not a separate latest-state store.
export const isRealMode = cafe => !!cafe.live && !['demo', 'test'].includes(cafe.live.mode) && cafe.live.sensor?.dataSource !== 'simulated';
const timestamp = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : -Infinity;
export const validDbfs = value => Number.isFinite(value) && value >= -160 && value <= 0;

export function sensorState(cafe, { now = Date.now(), staleAfterSec = 30 } = {}) {
  const sensor = cafe.live?.sensor;
  if (!sensor) return null;
  const fresh = (at, stale) => !stale && sensor.status === 'online' && timestamp(at) <= now + 60000 && now - timestamp(at) <= staleAfterSec * 1000;
  const peopleAt = Object.hasOwn(sensor, 'peopleTimestamp') ? sensor.peopleTimestamp : sensor.timestamp;
  const noiseAt = Object.hasOwn(sensor, 'noiseTimestamp') ? sensor.noiseTimestamp : sensor.timestamp;
  const peopleValid = fresh(peopleAt, sensor.peopleStale) && Number.isInteger(sensor.observedPeople) && sensor.observedPeople >= 0 && sensor.observedPeople <= 10000;
  const noise = sensor.noise || {};
  const noiseValid = fresh(noiseAt, sensor.noiseStale);
  const dbfs = noiseValid && validDbfs(noise.dbfs) ? noise.dbfs : null;
  const spl = noiseValid && noise.calibrated && Number.isFinite(noise.estimatedDbSpl) && noise.estimatedDbSpl >= 0 && noise.estimatedDbSpl <= 140 ? noise.estimatedDbSpl : null;
  const expired = now - timestamp(sensor.timestamp) > staleAfterSec * 1000;
  return { ...sensor, status: sensor.status === 'online' && expired ? 'stale' : sensor.status,
    observedPeople: peopleValid ? sensor.observedPeople : null, peopleStale: !peopleValid,
    peopleTimestamp: peopleAt, noiseTimestamp: noiseAt,
    noise: { ...noise, dbfs, estimatedDbSpl: spl, calibrated: !!noise.calibrated },
    noiseStale: !noiseValid, noiseAvailable: dbfs != null || spl != null };
}

// SSE and polling may race. Compare observation time per metric, never receipt time.
export function mergeLive(previous, incoming, { reset = false } = {}) {
  if (reset || !previous?.sensor || !incoming?.sensor) return incoming;
  const old = previous.sensor, next = incoming.sensor;
  if (old.dataSource === 'real' && next.dataSource !== 'real') return previous;
  if (old.dataSource !== next.dataSource) return incoming;
  const sensor = { ...next };
  const keep = key => { if (Object.hasOwn(old, key)) sensor[key] = old[key]; else delete sensor[key]; };
  for (const [metric, fields] of [['people', ['observedPeople', 'confidence']], ['noise', ['noise']]]) {
    const key = metric + 'Timestamp';
    if (timestamp(next[key] ?? next.timestamp) < timestamp(old[key] ?? old.timestamp)) {
      for (const field of [...fields, key, metric + 'Stale']) keep(field);
    }
  }
  if (timestamp(next.timestamp) < timestamp(old.timestamp)) {
    // A replay snapshot cannot resurrect an old status or regress the common clock.
    for (const key of ['timestamp', 'receivedAt', 'status']) keep(key);
    return { ...previous, sensor };
  }
  return { ...incoming, sensor };
}

export const DEFAULT_NOISE_THRESHOLDS = Object.freeze([-60, -45, -30, -15]);
export function noiseThresholds(value) {
  return Array.isArray(value) && value.length === 4 && value.every((n, i) => validDbfs(n) && n > -160 && n < 0 && (!i || n > value[i - 1])) ? [...value] : [...DEFAULT_NOISE_THRESHOLDS];
}
export function relativeNoise(dbfs, thresholds) {
  if (!validDbfs(dbfs)) return null;
  const bounds = noiseThresholds(thresholds);
  const level = bounds.filter(n => dbfs >= n).length;
  return { level: level + 1, label: ['Маш бага', 'Бага', 'Дунд', 'Өндөр', 'Маш өндөр'][level], percent: Math.max(0, Math.min(100, (dbfs + 160) / 160 * 100)) };
}

// A bounded chart buffer of actual fresh readings, deduplicated by observation time.
export function rollingNoise(points, sensor, { now = Date.now(), windowMs = 300000, limit = 60 } = {}) {
  let result = points.filter(p => p.at >= now - windowMs && p.at <= now + 60000);
  const at = timestamp(sensor?.noiseTimestamp);
  if (sensor?.noiseAvailable && !sensor.noiseStale && validDbfs(sensor.noise.dbfs) && at >= now - windowMs && at <= now + 60000 && !result.some(p => p.at === at) && (!result.length || at > result.at(-1).at)) {
    result = [...result, { at, dbfs: sensor.noise.dbfs }];
  }
  return result.slice(-limit);
}
