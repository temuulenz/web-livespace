import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceWord, noiseWord, deviceWords, reportRange, hourlyPeople, busiestText } from '../js/features/owner-dashboard/owner-words.js';

test('plain source and noise words; raw dBFS is never shown', () => {
  assert.equal(sourceWord('simulated'), 'Туршилтын өгөгдөл');
  assert.equal(sourceWord('real'), 'Бодит хэмжилт');
  assert.equal(noiseWord({ dbfs: -37.1, calibrated: false }), 'Дуу чимээ: тохируулаагүй байна');
  assert.doesNotMatch(noiseWord({ dbfs: -37.1 }), /dB/);
  assert.match(noiseWord({ calibrated: true, estimatedDbSpl: 62 }), /^Дуу чимээ: \S/);
});

test('device line in plain words', () => {
  assert.equal(deviceWords({ online: true, last_status: { batteryPercent: 85, charging: true } }), 'Утас холбогдсон ✓ · Батарей 85% · Цэнэглэж байна');
  assert.equal(deviceWords({ online: false, last_seen_at: '2026-11-19T06:20:00Z' }), 'Утас салсан · сүүлд 14:20');
  assert.equal(deviceWords({ online: false }), 'Утас холбогдоогүй');
});

test('report ranges start at Ulaanbaatar midnight', () => {
  const now = Date.parse('2026-11-19T06:00:00Z');           // 14:00 in Ulaanbaatar
  assert.equal(reportRange('today', now).since, '2026-11-18T16:00:00.000Z');
  assert.deepEqual([reportRange('yesterday', now).since, reportRange('yesterday', now).until], ['2026-11-17T16:00:00.000Z', '2026-11-18T16:00:00.000Z']);
  assert.equal(reportRange('week', now).since, '2026-11-12T16:00:00.000Z');
});

test('hourly bars average by local hour; hours without data stay empty, never 0', () => {
  const bars = hourlyPeople([
    { localHour: 13, averageObservedPeople: 8, sampleCount: 10 },
    { localHour: 13, averageObservedPeople: 4, sampleCount: 10 },
    { localHour: 9, averageObservedPeople: 2, sampleCount: 5 },
    { localHour: 10, averageObservedPeople: null, sampleCount: 0 }
  ]);
  assert.equal(bars.length, 24);
  assert.equal(bars[13].value, 6);
  assert.equal(bars[10].value, null);
  assert.equal(busiestText(bars), 'Хамгийн ачаалалтай: 13:00–14:00');
  assert.equal(busiestText(hourlyPeople([])), '');
});
