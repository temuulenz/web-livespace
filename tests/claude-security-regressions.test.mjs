// Regressions for the 2026-11-18 Claude Code read-path review (docs/overnight/02_SECURITY_AND_RELIABILITY.md).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../server/lib/db.mjs';
import {liveSummary,ownerView,ownerSafeView} from '../cloudflare/views.mjs';
import {startServer} from './support/server.mjs';

function d1Fixture() {
  const db = openDatabase(':memory:');
  const d1 = {prepare: q => { const s = db.prepare(q); return {bind: (...a) => ({all: async () => ({results: s.all(...a), meta: {}}), first: async () => s.get(...a) ?? null, run: async () => s.run(...a)})}; }};
  const t = new Date().toISOString();
  db.prepare("INSERT INTO cafes(id,name,status,data_mode,created_at,updated_at,visualization) VALUES('c1','C','active','live',?,?,?)").run(t, t, JSON.stringify({status: 'in_progress', notes: 'INTERNAL ADMIN NOTE', generator: 'x', layout: {secret: 1}}));
  db.prepare("INSERT INTO devices(id,cafe_id,kind,is_test,token_hash,created_at,connection_status,last_seen_at) VALUES('real1','c1','sensor',0,'h',?,'online',?)").run(t, t);
  db.prepare("INSERT INTO devices(id,cafe_id,kind,is_test,token_hash,created_at) VALUES('sim1','c1','simulator',1,'h2',?)").run(t);
  db.prepare("INSERT INTO measurements(cafe_id,device_id,ts,received_at,is_test,raw,message_id,data_source,observed_people,occupancy_confidence) VALUES('c1','real1',?,?,0,'{\"device\":{}}','m1','real',3,0.9)").run(t, t);
  db.prepare("INSERT INTO measurements(cafe_id,device_id,ts,received_at,is_test,raw,available_seats,occupied_seats,total_seats,noise_db,wifi_quality,wifi_down_mbps) VALUES('c1','sim1',?,?,1,'{}',2,38,40,80,90,100)").run(t, t);
  return {db, d1, row: db.prepare("SELECT * FROM cafes WHERE id='c1'").get()};
}

test('Cloudflare live summary never fills a real-sensor café with simulator rows', async () => {
  const {db, d1, row} = d1Fixture();
  const live = await liveSummary(d1, row);
  assert.equal(live.mode, 'live'); assert.equal(live.sensor.observedPeople, 3);
  for (const k of ['available_seats', 'free_pct', 'noise_db', 'wifi_mbps']) assert.equal(k in live, false, `${k} must not come from simulator`);
  db.close();
});

test('Cloudflare owner projection hides admin visualization notes and unlisted columns', async () => {
  const {db, d1, row} = d1Fixture();
  const view = ownerSafeView(await ownerView(d1, row));
  assert.deepEqual(view.visualization, {status: 'in_progress', layout: null, updated_at: null});
  assert.equal(JSON.stringify(view).includes('INTERNAL ADMIN NOTE'), false);
  assert.equal('owner_id' in view || 'demo' in view || JSON.stringify(view).includes('token_hash'), false);
  db.close();
});

test('Node: photo access follows current café ownership and is never cached; catalog SSE hides non-public states; lost claim leaves no orphan owner', async () => {
  const server = await startServer({seedDemo: false}); try {
    const db = server.app.deps.db, a = server.client(), b = server.client();
    const ua = (await a.post('/api/v1/auth/register', {email: 'photo-a@example.invalid', password: 'synthetic-password-123'})).data.user;
    const ub = (await b.post('/api/v1/auth/register', {email: 'photo-b@example.invalid', password: 'synthetic-password-123'})).data.user;
    const t = new Date().toISOString(), file = await server.app.deps.uploads.save('synthetic', 'photo', {ext: 'webp', buffer: Buffer.from('RIFFxxxxWEBP')});
    db.prepare("UPDATE users SET role='owner' WHERE email LIKE 'photo-%'").run();
    db.prepare("INSERT INTO cafes(id,name,owner_id,status,data_mode,created_at,updated_at) VALUES('ph','P',?,'under_review','live',?,?)").run(ua.id, t, t);
    db.prepare("INSERT INTO applications(id,cafe_id,owner_id,form,created_at) VALUES('app1','ph',?,'{}',?)").run(ua.id, t);
    db.prepare("INSERT INTO application_photos(id,application_id,file,mime,size,position,created_at) VALUES('pho1','app1',?,'image/webp',12,0,?)").run(file, t);
    const first = await a.get('/api/v1/files/photos/pho1');
    assert.equal(first.status, 200); assert.match(first.headers.get('cache-control'), /no-store/);
    assert.equal((await b.get('/api/v1/files/photos/pho1')).status, 404);
    const uploads = server.app.deps.uploads, read = uploads.read;
    uploads.read = async path => {
      db.prepare("UPDATE cafes SET owner_id=? WHERE id='ph'").run(ub.id);
      return read(path);
    };
    try {
      assert.equal((await a.get('/api/v1/files/photos/pho1')).status, 404, 'transfer during storage read prevents response');
    } finally {
      uploads.read = read;
    }
    assert.equal((await a.get('/api/v1/files/photos/pho1')).status, 404, 'previous owner loses access immediately');
    assert.equal((await b.get('/api/v1/files/photos/pho1')).status, 200, 'new owner is authorized');

    // Catalog SSE: a non-public status change must not reach anonymous subscribers.
    const events = []; const hub = server.app.deps.hub, original = hub.broadcast;
    hub.broadcast = (type, data) => { events.push([type, data]); return original.call(hub, type, data); };
    const admin = server.client(); await admin.post('/api/v1/auth/login', {email: 'admin@livespace.test', password: 'admin-password-123'});
    assert.equal((await admin.post('/api/v1/admin/cafes/ph/status', {status: 'rejected', note: 'synthetic'})).status, 200);
    assert.equal(db.prepare("SELECT status FROM cafes WHERE id='ph'").get().status, 'rejected');
    assert.equal(events.some(([type]) => type === 'catalog'), false);
    hub.broadcast = original;

    // A registration that loses the claim keeps no owner role.
    db.prepare("INSERT INTO cafes(id,name,status,data_mode,created_at,updated_at) VALUES('cl','C','submitted','live',?,?)").run(t, t);
    const {sha256} = await import('../server/lib/auth.mjs');
    db.prepare("INSERT INTO applications(id,cafe_id,form,claim_token_hash,created_at) VALUES('app2','cl','{}',?,?)").run(sha256('lsc_synthetic-claim'), t);
    const results = await Promise.all(['race-1', 'race-2'].map(n => server.client().post('/api/v1/auth/register-owner', {claim_token: 'lsc_synthetic-claim', email: `${n}@example.invalid`, password: 'synthetic-password-123', name: n})));
    assert.equal(results.filter(x => x.status === 201).length, 1);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM users WHERE email LIKE 'race-%' AND role='owner'").get().n, 1, 'only the winner is an owner');
  } finally { await server.stop(); }
});

test('Node SSE hub caps connections per address and globally, releasing slots on close', async () => {
  const {createRealtimeHub} = await import('../server/lib/realtime.mjs');
  const {EventEmitter} = await import('node:events');
  const hub = createRealtimeHub({maxClients: 3, maxPerIp: 2});
  const conn = ip => { const req = new EventEmitter(); req.socket = {remoteAddress: ip}; const res = {writeHead() {}, write() {}, end() {}}; hub.subscribe(req, res); return req; };
  const a1 = conn('a'); conn('a');
  assert.throws(() => conn('a'), e => e.status === 503 && e.code === 'stream_capacity');
  conn('b'); assert.throws(() => conn('c'), e => e.status === 503);
  a1.emit('close'); conn('c'); assert.equal(hub.size, 3);
  hub.close();
});
