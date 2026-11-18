import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {businessFixture} from './support/business.mjs';
import {analyticsCsv} from '../shared/business/analytics.mjs';
import {createAnalyticsStore} from '../server/routes/analytics.mjs';
import {initializeAnalytics,acceptAnalytics,flushAnalytics} from '../cloudflare/analytics-store.mjs';
import {validateAnalyticsBatch} from '../js/services/analytics-schema.js';

const ts = () => new Date().toISOString();
const ev = (id, type, itemId) => ({id, type, timestamp: ts(), ...(itemId ? {itemId} : {})});
function seedItems(db) {
  const t = '2026-01-01';
  for (const [cafe, cat] of [['a', 'cat-a'], ['b', 'cat-b']]) db.prepare('INSERT INTO menu_categories(id,cafe_id,name,published,created_at,updated_at) VALUES(?,?,?,1,?,?)').run(cat, cafe, cat, t, t);
  const product = db.prepare('INSERT INTO menu_items(id,cafe_id,category_id,name,base_price,published,archived,created_at,updated_at) VALUES(?,?,?,?,1000,?,?,?,?)');
  product.run('latte', 'a', 'cat-a', 'Latte', 1, 0, t, t); product.run('draft', 'a', 'cat-a', 'Draft', 0, 0, t, t); product.run('foreign', 'b', 'cat-b', 'Foreign', 1, 0, t, t);
  db.prepare("INSERT INTO promotions(id,cafe_id,title,type,starts_at,ends_at,published,created_at,updated_at) VALUES('promo','a','Student','student_discount','2026-01-01T00:00:00Z','2027-01-01T00:00:00Z',1,?,?)").run(t, t);
}

test('11E validator accepts item references only on item event types', () => {
  assert.equal(validateAnalyticsBatch({schemaVersion: 1, cafeId: 'a', events: [ev('event-0001', 'product_view', 'latte')]}).events[0].itemId, 'latte');
  assert.equal(validateAnalyticsBatch({schemaVersion: 1, cafeId: 'a', events: [ev('event-0001', 'cafe_view')]}).events[0].itemId, null);
  assert.throws(() => validateAnalyticsBatch({schemaVersion: 1, cafeId: 'a', events: [ev('event-0001', 'cafe_view', 'latte')]}));
  assert.throws(() => validateAnalyticsBatch({schemaVersion: 1, cafeId: 'a', events: [{...ev('event-0001', 'product_view'), itemId: 5}]}));
  assert.throws(() => validateAnalyticsBatch({schemaVersion: 1, cafeId: 'a', events: [ev('event-0001', 'product_view', 'bad id/../x')]}));
});

test('11E Node store: tenant-checked item references, dedup, budget-free reads and Ulaanbaatar day buckets', async () => {
  const {db} = businessFixture(); seedItems(db); const store = createAnalyticsStore(db);
  const batch = events => ({schemaVersion: 1, cafeId: 'a', events});
  assert.deepEqual(await store.accept(batch([ev('event-0001', 'product_view', 'latte'), ev('event-0002', 'promotion_view', 'promo'), ev('event-0003', 'cafe_view')])), {accepted: 3, duplicates: 0});
  // Foreign-cafe, unpublished and cross-kind references are rejected atomically.
  for (const bad of [['product_view', 'foreign'], ['product_view', 'draft'], ['promotion_view', 'latte'], ['out_of_stock_view', 'promo']])
    await assert.rejects(store.accept(batch([ev('event-0009', 'cafe_view'), ev('event-0010', ...bad)])), e => e.status === 422 && e.code === 'unknown_analytics_item');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM analytics_receipts WHERE id='event-0009'").get().n, 0);
  // Exact retry is a duplicate; changing the item for an existing ID conflicts and rolls back.
  const retry = batch([ev('event-0001', 'product_view', 'latte')]);
  assert.deepEqual(await store.accept(retry), {accepted: 0, duplicates: 1});
  await assert.rejects(store.accept(batch([ev('event-0004', 'cafe_view'), {...ev('event-0002', 'promotion_view')}])), e => e.status === 409);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM analytics_receipts WHERE id='event-0004'").get().n, 0);
  await assert.rejects(store.accept({schemaVersion: 1, cafeId: 'missing', events: [ev('event-0005', 'cafe_view')]}), e => e.status === 404);
  const summary = await store.read('a', {granularity: 'day', timezone: 'Asia/Ulaanbaatar'});
  const csv = analyticsCsv({...summary, items: [{...summary.items[0], item_name: '=1,"fixture"'}]});
  assert.ok(csv.includes(`"'=1,""fixture"""`), 'spreadsheet formulas are escaped within quoted fields');
  assert.equal(summary.uniqueVisitors, null); assert.equal(summary.timezone, 'Asia/Ulaanbaatar');
  assert.equal(summary.rows.reduce((n, r) => n + r.event_count, 0), 3);
  assert.deepEqual(summary.items.map(i => [i.event_type, i.item_id, i.item_name, i.event_count]).sort(), [['product_view', 'latte', 'Latte', 1], ['promotion_view', 'promo', 'Student', 1]]);
  assert.equal(summary.items[0].bucket, new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10));
  assert.equal(JSON.stringify(summary).includes('event-0001'), false, 'no receipt IDs in owner reads');
  await assert.rejects(store.read('a', {granularity: 'hour', timezone: 'Asia/Ulaanbaatar'}), e => e.status === 422);
  await assert.rejects(store.read('a', {since: '2026-01-01T00:00:00Z', until: '2026-03-01T00:00:00Z'}), e => e.status === 422);
  assert.equal((await store.read('b', {})).rows.length, 0, 'other tenant sees nothing');
  store.purge(Date.now() + 3 * 86400000);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM analytics_receipts').get().n, 0);
  assert.equal(db.prepare('SELECT SUM(event_count) n FROM analytics_hourly').get().n, 3, 'aggregates survive receipt expiry');
  db.close();
});

test('11E Node store enforces the per-cafe daily intake budget transactionally', async () => {
  const {db} = businessFixture(); const store = createAnalyticsStore(db);
  db.prepare("INSERT INTO analytics_intake(cafe_id,day,n) VALUES('a',?,999)").run(ts().slice(0, 10));
  await assert.rejects(store.accept({schemaVersion: 1, cafeId: 'a', events: [ev('event-0001', 'cafe_view'), ev('event-0002', 'cafe_view')]}), e => e.status === 429);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM analytics_hourly').get().n, 0);
  db.close();
});

function doFixture() {
  const db = new DatabaseSync(':memory:'); const sql = {exec(q, ...a) { const s = db.prepare(q); return s.columns().length ? s.all(...a) : (s.run(...a), []); }};
  const ctx = {storage: {sql, transactionSync(fn) { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } }}};
  return {db, ctx, sql};
}
test('11E Durable Object store upgrades old receipts, counts items and flushes items independently', async () => {
  const {db, ctx, sql} = doFixture();
  // Simulate a pre-11E DO: receipts table without the item column.
  sql.exec('CREATE TABLE event_receipts(id TEXT PRIMARY KEY,type TEXT NOT NULL,hour TEXT NOT NULL,expires INTEGER NOT NULL)');
  initializeAnalytics(sql); initializeAnalytics(sql);
  const batch = validateAnalyticsBatch({schemaVersion: 1, cafeId: 'a', events: [ev('event-0001', 'product_view', 'latte'), ev('event-0002', 'cafe_view')]});
  assert.deepEqual(acceptAnalytics(ctx, batch), {accepted: 2, duplicates: 0});
  assert.deepEqual(acceptAnalytics(ctx, batch), {accepted: 0, duplicates: 2});
  const changed = validateAnalyticsBatch({schemaVersion: 1, cafeId: 'a', events: [ev('event-0001', 'product_view', 'other')]});
  assert.throws(() => acceptAnalytics(ctx, changed), /conflict/);
  const calls = []; let failItems = true;
  const d1 = {prepare(q) { return {bind(...args) { return {q, args}; }}; }, async batch(rows) { calls.push(rows); if (rows[0].q.includes('analytics_item_hourly') && failItems) throw Error('no such table: analytics_item_hourly'); return rows.map(() => ({meta: {rows_written: 1, rows_read: 0}})); }};
  await assert.rejects(flushAnalytics(ctx, d1));
  assert.equal(db.prepare('SELECT dirty FROM counters').get().dirty, 0, 'hourly totals flushed before item failure');
  assert.equal(db.prepare('SELECT dirty FROM item_counters').get().dirty, 1, 'item counters remain pending');
  failItems = false; const r = await flushAnalytics(ctx, d1);
  assert.equal(r.itemSummaries, 1); assert.equal(r.pending, false);
  assert.deepEqual(calls.at(-1)[0].args.slice(0, 5), ['a', batch.events[0].hour, 'product_view', 'latte', 1]);
  db.close();
});

test('11E HTTP: intake disabled by default; owner/admin reads are tenant-scoped', async () => {
  const {startServer} = await import('./support/server.mjs');
  for (const enabled of [false, true]) {
    const server = await startServer({seedDemo: false, analyticsEnabled: enabled}); try {
      const owner = server.client(), stranger = server.client(), guest = server.client(), db = server.app.deps.db;
      const u = (await owner.post('/api/v1/auth/register', {email: 'analytics-owner@example.invalid', password: 'synthetic-password-123'})).data.user;
      await stranger.post('/api/v1/auth/register', {email: 'analytics-other@example.invalid', password: 'synthetic-password-123'});
      db.prepare("UPDATE users SET role='owner' WHERE email LIKE 'analytics-%'").run();
      db.prepare("INSERT INTO cafes(id,name,owner_id,status,data_mode,created_at,updated_at) VALUES('an-http','Synthetic',?,'active','demo','2026-01-01','2026-01-01')").run(u.id);
      const post = await guest.post('/api/v1/analytics/events', {schemaVersion: 1, cafeId: 'an-http', events: [ev('event-0001', 'cafe_view')]});
      assert.equal(post.status, enabled ? 202 : 404);
      const read = await owner.get('/api/v1/owner/cafes/an-http/analytics');
      const exported = await owner.get('/api/v1/owner/cafes/an-http/analytics?format=csv');
      assert.equal(exported.status, 200);
      assert.match(exported.headers.get('content-type'), /^text\/csv/);
      assert.equal(exported.headers.get('x-analytics-items-status'), 'complete');
      assert.equal((await stranger.get('/api/v1/owner/cafes/an-http/analytics?format=csv')).status, 404);
      assert.equal((await owner.get('/api/v1/owner/cafes/an-http/analytics?format=other')).status, 422);
      assert.equal(read.status, 200); assert.equal(read.data.rows.length, enabled ? 1 : 0);
      assert.match(read.headers?.get?.('cache-control') ?? 'no-store', /no-store/);
      assert.equal((await stranger.get('/api/v1/owner/cafes/an-http/analytics')).status, 404);
      assert.equal((await guest.get('/api/v1/owner/cafes/an-http/analytics')).status, 401);
      assert.equal((await stranger.get('/api/v1/admin/cafes/an-http/analytics')).status, 403);
    } finally { await server.stop(); }
  }
});
