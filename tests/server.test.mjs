import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ADMIN, startServer, tinyJpeg } from './support/server.mjs';
import { getCafes } from '../js/cafes.js';
import { validateMeasurement } from '../server/lib/sensor-schema.mjs';
import { noiseLevel, wifiLevel, openState } from '../js/live/levels.js';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server?.stop(); });

const application = (overrides = {}) => ({
  cafe_name: 'Туршилтын кафе', contact_name: 'Бат Болд', phone: '8800 1234', email: 'owner@cafe.mn',
  district: 'Сүхбаатар', category: 'Кафе', address: 'Сөүлийн гудамж 12', hours: '08:00–22:00',
  description: 'Номын тавиуртай, чимээгүй кафе', extra: 'Wi-Fi 100 Mbps', purposes: ['Сурах', 'Ажиллах'], seats: 24,
  lat: 47.9180, lng: 106.9200, photos: [tinyJpeg(1), tinyJpeg(2), tinyJpeg(3)], ...overrides
});

test('public API serves the demo cafés with the same values as the bundled data', async () => {
  const guest = server.client();
  assert.equal((await guest.get('/api/v1/health')).data.ok, true);
  const { data } = await guest.get('/api/v1/cafes');
  assert.equal(data.cafes.length, 12);
  for (const original of getCafes()) {
    const cafe = data.cafes.find(c => c.id === original.id);
    for (const key of ['name', 'x', 'y', 'dist', 'walk', 'hours', 'open', 'occ', 'sound', 'wifi', 'mbps', 'note']) assert.deepEqual(cafe[key], original[key], `${original.id}.${key}`);
    assert.equal(cafe.live.mode, 'demo', 'demo values are labelled as demo');
    assert.equal(cafe.visualization.status, 'ready');
  }
  const config = (await guest.get('/api/v1/config')).data;
  assert.equal(config.poll_interval_sec, 60);
});

test('guests browse freely; favourites need an account and persist across logins', async () => {
  const guest = server.client();
  assert.equal((await guest.get('/api/v1/me/favorites')).status, 401);
  assert.equal((await guest.put('/api/v1/me/favorites/A')).status, 401);

  const weak = await guest.post('/api/v1/auth/register', { email: 'bad', password: '123' });
  assert.equal(weak.status, 422);
  assert.ok(weak.data.error.details.email && weak.data.error.details.password);

  const user = server.client();
  const registered = await user.post('/api/v1/auth/register', { email: 'Saraa@Example.mn', password: 'correct horse', name: 'Сараа' });
  assert.equal(registered.status, 201);
  assert.equal(registered.data.user.role, 'user');
  assert.match(registered.headers.get('set-cookie'), /HttpOnly; *|HttpOnly$/);
  assert.equal((await user.put('/api/v1/me/favorites/A')).data.favorites.join(), 'A');
  assert.equal((await user.put('/api/v1/me/favorites/K')).data.favorites.join(), 'A,K');
  assert.equal((await user.del('/api/v1/me/favorites/A')).data.favorites.join(), 'K');
  assert.equal((await user.put('/api/v1/me/favorites/nope')).status, 404);
  assert.equal((await user.post('/api/v1/auth/register', { email: 'saraa@example.mn', password: 'another pass' })).status, 409);
  await user.post('/api/v1/auth/logout');
  assert.equal((await user.get('/api/v1/auth/me')).status, 401);

  const again = server.client();
  assert.equal((await again.post('/api/v1/auth/login', { email: 'saraa@example.mn', password: 'wrong password' })).status, 401);
  assert.equal((await again.post('/api/v1/auth/login', { email: 'SARAA@example.mn', password: 'correct horse' })).status, 200);
  assert.deepEqual((await again.get('/api/v1/me/favorites')).data.favorites, ['K']);
  assert.deepEqual((await again.post('/api/v1/me/favorites/merge', { cafe_ids: ['B', 'zzz'] })).data.favorites, ['K', 'B']);
});

test('café owner: application → owner account → dashboard; admin workflow → public café → live sensor data', async () => {
  const guest = server.client();
  const missing = await guest.post('/api/v1/applications', application({ photos: [tinyJpeg()], hours: '8am' }));
  assert.equal(missing.status, 422);
  assert.ok(missing.data.error.details.photos && missing.data.error.details.hours);
  const fake = await guest.post('/api/v1/applications', application({ photos: [tinyJpeg(), tinyJpeg(), 'data:image/png;base64,' + Buffer.from('not a png').toString('base64')] }));
  assert.equal(fake.status, 422, 'declared type must match the file bytes');

  const submitted = await guest.post('/api/v1/applications', application());
  assert.equal(submitted.status, 201);
  const { cafe_id: cafeId, claim_token: claim } = submitted.data;
  assert.match(claim, /^lsc_/);

  // Not public yet.
  assert.equal((await guest.get(`/api/v1/cafes/${cafeId}`)).status, 404);

  const owner = server.client();
  const account = await owner.post('/api/v1/auth/register-owner', { claim_token: claim, email: 'owner@cafe.mn', password: 'owner password' });
  assert.equal(account.status, 201);
  assert.equal(account.data.user.role, 'owner');
  assert.equal((await server.client().post('/api/v1/auth/register-owner', { claim_token: claim, email: 'x@y.mn', password: 'another one' })).status, 400, 'claim token is single-use');

  let dash = (await owner.get('/api/v1/owner/cafes')).data.cafes;
  assert.equal(dash.length, 1);
  assert.equal(dash[0].status, 'submitted');
  assert.equal(dash[0].visualization.status, 'not_started');
  assert.equal(dash[0].live.mode, 'none', 'no fake measurements before sensors exist');
  assert.equal(dash[0].application.photos.length, 3);
  const photo = await fetch(server.origin + dash[0].application.photos[0].url, { headers: { Cookie: owner.cookie } });
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get('content-type'), 'image/jpeg');
  const stranger = server.client();
  await stranger.post('/api/v1/auth/register', { email: 'stranger@x.mn', password: 'stranger pass' });
  assert.equal((await fetch(server.origin + dash[0].application.photos[0].url, { headers: { Cookie: stranger.cookie } })).status, 404);
  assert.equal((await stranger.get('/api/v1/admin/cafes')).status, 403);
  assert.equal((await owner.get('/api/v1/admin/cafes')).status, 403);

  // Owner edits their own details.
  assert.equal((await owner.patch(`/api/v1/owner/cafes/${cafeId}`, { hours: '07:30–21:00' })).data.cafe.hours, '07:30–21:00');
  assert.equal((await owner.patch(`/api/v1/owner/cafes/${cafeId}`, { hours: 'all day' })).status, 422);

  // Admin works through the setup workflow.
  const admin = server.client();
  assert.equal((await admin.post('/api/v1/auth/login', ADMIN)).status, 200);
  const apps = (await admin.get('/api/v1/admin/applications')).data.applications;
  assert.equal(apps[0].cafe_id, cafeId);
  assert.equal(apps[0].photo_count, 3);
  assert.equal(apps[0].owner_email, 'owner@cafe.mn');
  for (const status of ['under_review', 'contacting', 'visualization']) assert.equal((await admin.post(`/api/v1/admin/cafes/${cafeId}/status`, { status, note: status })).status, 200);
  assert.equal((await admin.post(`/api/v1/admin/cafes/${cafeId}/status`, { status: 'party' })).status, 400);

  const suggestion = (await admin.post(`/api/v1/admin/cafes/${cafeId}/visualization/suggest`)).data.suggestion;
  assert.equal(suggestion.layout.preset, 'library', 'description mentions books and quiet');
  assert.equal(suggestion.provider, 'rules');
  const vis = await admin.put(`/api/v1/admin/cafes/${cafeId}/visualization`, { status: 'ready', layout: { ...suggestion.layout, overrides: { plants: [[100, 100, 12], [9999, 1, 1]] } } });
  assert.deepEqual(vis.data.visualization.layout.overrides.plants, [[100, 100, 12]], 'out-of-floor items are dropped');

  dash = (await owner.get('/api/v1/owner/cafes')).data.cafes;
  assert.equal(dash[0].status, 'visualization');
  assert.equal(dash[0].visualization.status, 'ready');
  assert.equal(dash[0].history.length, 4);

  // Devices and live data.
  const created = await admin.post('/api/v1/admin/devices', { id: 'sensor_001', cafe_id: cafeId, label: 'Танхимын мэдрэгч', kind: 'sensor' });
  assert.equal(created.status, 201);
  const token = created.data.token;
  assert.match(token, /^lsd_/);
  for (const status of ['sensors', 'testing', 'active']) assert.equal((await admin.post(`/api/v1/admin/cafes/${cafeId}/status`, { status })).status, 200);

  let live = (await guest.get(`/api/v1/cafes/${cafeId}`)).data.cafe;
  assert.equal(live.live.mode, 'none');
  assert.equal(live.open, false);
  assert.equal(live.status_text, 'Бодит хэмжилт хараахан ирээгүй');

  // Listen to the live stream while the device reports.
  const stream = await fetch(server.origin + '/api/v1/stream');
  const reader = stream.body.getReader();
  const ingest = (body, auth = token) => fetch(server.origin + '/api/v1/ingest/measurements', { method: 'POST', headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const reading = { schema_version: '1.0', cafe_id: cafeId, device_id: 'sensor_001', timestamp: new Date().toISOString(), measurements: { available_seats: 12, occupied_seats: 18, total_seats: 30, noise_level: 42, wifi_quality: 85, wifi_download_mbps: 64.4 }, device_status: { state: 'online', battery_pct: 90 } };
  assert.equal((await ingest(reading, 'lsd_wrong')).status, 401);
  assert.equal((await ingest({ ...reading, cafe_id: 'A' })).status, 422, 'device cannot report for another café');
  assert.equal((await ingest({ ...reading, measurements: { noise_level: 'loud' } })).status, 422);
  const ok = await ingest(reading);
  assert.equal(ok.status, 202);

  let text = '';
  const decoder = new TextDecoder();
  while (!text.includes('event: measurement')) text += decoder.decode((await reader.read()).value);
  await reader.cancel();
  const pushed = JSON.parse(text.split('event: measurement\ndata: ')[1].split('\n')[0]);
  assert.equal(pushed.id, cafeId);
  assert.equal(pushed.occ, 60);
  assert.equal(pushed.live.mode, 'live');

  live = (await guest.get(`/api/v1/cafes/${cafeId}`)).data.cafe;
  assert.equal(live.live.mode, 'live');
  assert.equal(live.live.available_seats, 12);
  assert.equal(live.live.stale, false);
  assert.equal(live.sound, 1, '42 dB → library quiet');
  assert.equal(live.wifi, 4, 'quality 85 → very good');
  assert.equal(live.mbps, 64);
  assert.equal((await guest.get('/api/v1/live')).data.updates.find(u => u.id === cafeId).occ, 60);

  // Old readings are labelled outdated, never presented as current.
  await ingest({ ...reading, timestamp: new Date(Date.now() - 20 * 60 * 1000).toISOString() });
  const history = (await admin.get(`/api/v1/admin/measurements?cafe_id=${cafeId}`)).data.measurements;
  assert.equal(history.length, 2);
  assert.equal(history[0].raw.device_id, 'sensor_001');
  const devices = (await admin.get('/api/v1/admin/devices')).data.devices;
  assert.equal(devices[0].online, true);
  assert.equal(devices[0].token_hash, undefined, 'token hashes never leave the server');

  dash = (await owner.get('/api/v1/owner/cafes')).data.cafes;
  assert.equal(dash[0].live.mode, 'live');
  assert.equal(dash[0].devices[0].online, true);

  // Revoked devices can no longer report.
  await admin.del('/api/v1/admin/devices/sensor_001');
  assert.equal((await ingest(reading)).status, 401);
});

test('outdated data is flagged and test devices are labelled as test data', async () => {
  const short = await startServer({ staleAfterSec: 60 });
  try {
    const admin = short.client();
    await admin.post('/api/v1/auth/login', ADMIN);
    const guest = short.client();
    const { cafe_id: id } = (await guest.post('/api/v1/applications', application())).data;
    await admin.patch(`/api/v1/admin/cafes/${id}`, { map_x: 500, map_y: 300 });
    await admin.post(`/api/v1/admin/cafes/${id}/status`, { status: 'active' });
    const { token } = (await admin.post('/api/v1/admin/devices', { id: 'bench', cafe_id: id, is_test: true, kind: 'simulator' })).data;
    const old = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await fetch(short.origin + '/api/v1/ingest/measurements', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ cafe_id: id, device_id: 'bench', timestamp: old, measurements: { occupied_seats: 5, available_seats: 5 } }) });
    const cafe = (await guest.get(`/api/v1/cafes/${id}`)).data.cafe;
    assert.equal(cafe.live.mode, 'test');
    assert.equal(cafe.live.stale, true);
  } finally { await short.stop(); }
});

test('security: origin check, JSON-only writes, private files and source code are not served', async () => {
  const guest = server.client();
  assert.equal((await guest.post('/api/v1/auth/login', { email: 'a@b.mn', password: 'x' }, { Origin: 'https://evil.example' })).status, 403);
  const form = await fetch(server.origin + '/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=a&password=b' });
  assert.equal(form.status, 415);
  for (const path of ['/server/app.mjs', '/data/livespace.db', '/package.json', '/tests/server.test.mjs', '/.git/config', '/js/../server/config.mjs']) assert.equal((await fetch(server.origin + path)).status, 404, path);
  const page = await fetch(server.origin + '/');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal((await fetch(server.origin + '/framework/index.js')).status, 200);
});

test('sensor schema: example payload, aliases, ranges and helpful errors', () => {
  const example = { cafe_id: 'cafe_001', device_id: 'sensor_001', timestamp: '2026-11-01T10:30:00Z', measurements: { available_seats: 12, occupied_seats: 18, noise_level: 42, wifi_quality: 85 } };
  const { value, errors } = validateMeasurement(example, Date.parse('2026-11-01T10:31:00Z'));
  assert.deepEqual(errors, []);
  assert.equal(value.measurements.noise_level_db, 42);
  const bad = validateMeasurement({ cafe_id: '', timestamp: 'yesterday', measurements: { wifi_quality: 140, available_seats: 1.5 }, device_status: { state: 'sleeping' } }, Date.parse('2026-11-01T10:31:00Z'));
  const paths = bad.errors.map(e => e.path).sort();
  assert.deepEqual(paths, ['cafe_id', 'device_id', 'device_status.state', 'measurements.available_seats', 'measurements.wifi_quality', 'timestamp']);
  assert.ok(validateMeasurement({ ...example, timestamp: '2027-01-01T00:00:00Z' }, Date.parse('2026-11-01T10:31:00Z')).errors.some(e => e.message.includes('future')));
});

test('levels: noise, Wi-Fi and opening hours', () => {
  assert.deepEqual([30, 45, 54, 60, 70, 90, null].map(noiseLevel), [1, 2, 2, 3, 4, 5, 0]);
  assert.deepEqual([10, 30, 60, 90, null].map(wifiLevel), [1, 2, 3, 4, 0]);
  assert.deepEqual(openState('08:00–22:00', 7 * 60), { open: false, opens: 'Өнөөдөр 08:00' });
  assert.deepEqual(openState('08:00–22:00', 23 * 60), { open: false, opens: 'Маргааш 08:00' });
  assert.equal(openState('10:00–00:00', 23 * 60 + 30).open, true);
  assert.equal(openState('18:00-02:00', 60).open, true, 'after midnight');
});
