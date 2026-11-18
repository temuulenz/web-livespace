import { APIError as HttpError, first, all } from './core.mjs';
import { SENSOR_ID } from '../server/lib/telemetry-schema.mjs';

const localFeatures = seconds => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ulaanbaatar', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(seconds * 1000));
  return { localHour: Number(parts.find(p => p.type === 'hour').value), dayOfWeek: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.find(p => p.type === 'weekday').value) };
};
export function createSensorHistory(db, config) {
  function options(query) {
    const source = query.source || 'real', interval = Number(query.interval || 5), limit = Number(query.limit || 100);
    if (!['real', 'simulated', 'manual'].includes(source)) throw new HttpError(422, 'invalid_source', 'source must be real, simulated or manual');
    if (![5, 15, 60].includes(interval)) throw new HttpError(422, 'invalid_interval', 'interval must be 5, 15 or 60 minutes');
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new HttpError(422, 'invalid_limit', 'limit must be an integer from 1 to 500');
    const date = (value, fallback) => {
      if (value == null || value === '') return fallback;
      if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new HttpError(422, 'invalid_time_range', 'Use ISO timestamps with timezone');
      return Date.parse(value);
    };
    const to = date(query.until, Date.now() + 60000), from = date(query.since, to - 86400000);
    if (from >= to || to - from > 31 * 86400000) throw new HttpError(422, 'invalid_time_range', 'Select an increasing range of at most 31 days');
    if (query.device_id && !SENSOR_ID.test(query.device_id)) throw new HttpError(422, 'invalid_device', 'Invalid device ID');
    return { source, interval, limit, from: new Date(from).toISOString(), to: new Date(to).toISOString(), deviceId: query.device_id || null };
  }
  async function read(cafeId, query = {}, { privateView = false } = {}) {
    const o = options(query);
    // A count from overlapping cameras cannot be summed or treated as one series.
    // Default to a single latest reporting device for this cafe/source/range.
    const devices = o.deviceId ? [] : await all(db, "SELECT id FROM devices WHERE cafe_id=?", cafeId);
    const candidates = o.deviceId ? [] : (await Promise.all(devices.map(async d => {
      const args=[d.id,cafeId,o.source,o.from,o.to];
      // Two bounded seeks preserve preference for a device with people samples.
      return await first(db, `SELECT device_id,ts,id,observed_people FROM measurements
        WHERE device_id=? AND cafe_id=? AND data_source=? AND message_id IS NOT NULL AND ts>=? AND ts<?
        AND observed_people IS NOT NULL ORDER BY ts DESC,id DESC LIMIT 1`,...args)
        || await first(db, `SELECT device_id,ts,id,observed_people FROM measurements
        WHERE device_id=? AND cafe_id=? AND data_source=? AND message_id IS NOT NULL AND ts>=? AND ts<?
        ORDER BY ts DESC,id DESC LIMIT 1`,...args);
    }))).filter(Boolean).sort((a,b)=>Number(b.observed_people!=null)-Number(a.observed_people!=null) || b.ts.localeCompare(a.ts) || b.id-a.id);
    const deviceId=o.deviceId || candidates[0]?.device_id;
    const where = 'cafe_id = ? AND data_source = ? AND device_id = ? AND message_id IS NOT NULL AND ts >= ? AND ts < ?';
    const args = [cafeId, o.source, deviceId || '', o.from, o.to];
    const readings = await all(db, `SELECT * FROM measurements WHERE ${where} ORDER BY ts DESC, id DESC LIMIT ?`, ...args, o.limit);
    const seconds = o.interval * 60, cadence = config.sensorExpectedIntervalSec;
    const rows = await all(db, `SELECT CAST(unixepoch(ts) / ? AS INTEGER) * ? AS bucket,
      COUNT(*) AS totalSamples, COUNT(observed_people) AS sampleCount,
      AVG(observed_people) AS averageObservedPeople, MIN(observed_people) AS minimumObservedPeople, MAX(observed_people) AS maximumObservedPeople,
      AVG(CASE WHEN noise_calibrated = 1 THEN noise_db END) AS averageCalibratedDbSpl,
      COUNT(CASE WHEN noise_calibrated = 1 THEN noise_db END) AS calibratedNoiseSamples,
      COUNT(DISTINCT CASE WHEN observed_people IS NOT NULL THEN CAST((unixepoch(ts) % ?) / ? AS INTEGER) END) AS coveredSlots
      FROM measurements WHERE ${where} AND is_test = ?
      AND unixepoch(ts) IS NOT NULL AND unixepoch(received_at, 'subsec') - unixepoch(ts, 'subsec') BETWEEN -60 AND ?
      AND (observed_people IS NULL OR (typeof(observed_people) = 'integer' AND observed_people BETWEEN 0 AND 10000))
      AND (occupancy_confidence IS NULL OR occupancy_confidence BETWEEN 0 AND 1)
      AND (noise_dbfs IS NULL OR noise_dbfs BETWEEN -160 AND 0)
      AND (noise_rms IS NULL OR noise_rms BETWEEN 0 AND 1)
      AND (noise_db IS NULL OR (noise_calibrated = 1 AND noise_db BETWEEN 0 AND 140))
      GROUP BY bucket ORDER BY bucket`, seconds, seconds, seconds, cadence, ...args, o.source === 'simulated' ? 1 : 0, config.sensorStaleAfterSec);
    return {
      source: o.source, intervalMinutes: o.interval, since: o.from, until: o.to, timezone: 'Asia/Ulaanbaatar',
      selection: 'single_latest_reporting_device', ...(privateView ? { deviceId: deviceId || null } : {}),
      expectedIntervalSeconds: cadence, coverageMethod: 'distinct_expected_cadence_slots',
      readings: readings.map(r => ({ ...(privateView ? { id: r.id, deviceId: r.device_id, batteryPercent: r.battery_pct, batteryTemperatureC: r.battery_temperature_c, charging: r.charging == null ? null : !!r.charging } : {}),
        timestamp: r.ts, receivedAt: r.received_at, dataSource: r.data_source, observedPeople: r.observed_people, confidence: r.occupancy_confidence,
        noise: { dbfs: r.noise_dbfs, rms: r.noise_rms, estimatedDbSpl: r.noise_calibrated ? r.noise_db : null, calibrated: !!r.noise_calibrated },
        staleAtArrival: Date.parse(r.received_at) - Date.parse(r.ts) > config.sensorStaleAfterSec * 1000 })),
      aggregates: rows.map(r => {
        const coverage = Math.min(1, r.coveredSlots * cadence / seconds);
        const { bucket, coveredSlots, ...metrics } = r;
        return { ...metrics, timestamp: new Date(bucket * 1000).toISOString(), ...localFeatures(bucket), coverage,
          coveredSeconds: Math.min(seconds, coveredSlots * cadence), dataSource: o.source,
          eligibleForForecast: o.source === 'real' && r.sampleCount > 0 && coverage >= 0.5 };
      })
    };
  }
  return { read };
}
