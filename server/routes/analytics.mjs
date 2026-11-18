// Phase 11E Node parity for optional analytics. SQLite is authoritative here (no Durable Object), so one
// IMMEDIATE transaction stores the receipt, intake budget and absolute hourly/item counters before 202.
import {validateAnalyticsBatch} from '../../js/services/analytics-schema.js';
import {analyticsCsv,analyticsCsvHeaders,analyticsItemChecks,checkAnalyticsItems,readAnalyticsSummary,ANALYTICS_DAILY_BUDGET,ANALYTICS_RECEIPT_MS} from '../../shared/business/analytics.mjs';
import {requireRole, SESSION_COOKIE} from '../lib/auth.mjs';
import {transaction} from '../lib/db.mjs';
import {HttpError,readJson,sendJson,notFound} from '../lib/http.mjs';

const fail = (...a) => { throw new HttpError(...a); };

export function createAnalyticsStore(db) {
  const all = (q, ...a) => db.prepare(q).all(...a);
  async function accept(input, clock = Date.now()) {
    let batch; try { batch = validateAnalyticsBatch(input, clock); } catch { fail(422, 'invalid_analytics', 'Invalid analytics batch'); }
    const at = new Date(clock).toISOString(), day = at.slice(0, 10), expires = new Date(clock + ANALYTICS_RECEIPT_MS).toISOString();
    return transaction(db, () => {
      if (!db.prepare("SELECT 1 FROM cafes WHERE id=? AND status='active'").get(batch.cafeId)) fail(404, 'not_found', 'Cafe not found');
      for (const {sql, params, count} of analyticsItemChecks(batch.cafeId, batch.events)) {
        checkAnalyticsItems(all(sql, ...params), count, fail);
      }
      let accepted = 0, duplicates = 0, used = db.prepare('SELECT n FROM analytics_intake WHERE cafe_id=? AND day=?').get(batch.cafeId, day)?.n || 0;
      for (const e of batch.events) {
        const old = db.prepare('SELECT event_type,hour,item_id FROM analytics_receipts WHERE cafe_id=? AND id=?').get(batch.cafeId, e.id);
        if (old) { if (old.event_type !== e.type || old.hour !== e.hour || old.item_id !== e.itemId) fail(409, 'analytics_rejected', 'Analytics ID conflict'); duplicates++; continue; }
        if (used >= ANALYTICS_DAILY_BUDGET) fail(429, 'analytics_rejected', 'Analytics daily budget reached');
        db.prepare('INSERT INTO analytics_receipts(cafe_id,id,event_type,hour,item_id,expires_at) VALUES(?,?,?,?,?,?)').run(batch.cafeId, e.id, e.type, e.hour, e.itemId, expires);
        db.prepare(`INSERT INTO analytics_hourly(cafe_id,hour,event_type,event_count,revision,updated_at) VALUES(?,?,?,1,1,?)
          ON CONFLICT(cafe_id,hour,event_type) DO UPDATE SET event_count=event_count+1,revision=revision+1,updated_at=excluded.updated_at`).run(batch.cafeId, e.hour, e.type, at);
        if (e.itemId) db.prepare(`INSERT INTO analytics_item_hourly(cafe_id,hour,event_type,item_id,event_count,revision,updated_at) VALUES(?,?,?,?,1,1,?)
          ON CONFLICT(cafe_id,hour,event_type,item_id) DO UPDATE SET event_count=event_count+1,revision=revision+1,updated_at=excluded.updated_at`).run(batch.cafeId, e.hour, e.type, e.itemId, at);
        accepted++; used++;
      }
      db.prepare('INSERT INTO analytics_intake(cafe_id,day,n) VALUES(?,?,?) ON CONFLICT(cafe_id,day) DO UPDATE SET n=excluded.n').run(batch.cafeId, day, used);
      return {accepted, duplicates};
    });
  }
  // Bounded retention of short-lived dedup state only; aggregates are retained.
  function purge(clock = Date.now()) {
    const at = new Date(clock).toISOString();
    db.prepare('DELETE FROM analytics_receipts WHERE rowid IN (SELECT rowid FROM analytics_receipts WHERE expires_at<? LIMIT 5000)').run(at);
    db.prepare('DELETE FROM analytics_intake WHERE day<?').run(new Date(clock - ANALYTICS_RECEIPT_MS).toISOString().slice(0, 10));
  }
  const read = (cafeId, query, clock) => readAnalyticsSummary(async (q, ...a) => all(q, ...a), cafeId, query, fail, clock);
  return {accept, purge, read};
}

export function register(router, deps) {
  const {db, config, cafes, limit, sessions} = deps;
  const store = deps.analytics = createAnalyticsStore(db);
  router.post('/api/v1/analytics/events', async ctx => {
    if (!config.analyticsEnabled) throw notFound('Analytics collection disabled');
    limit(`analytics:${ctx.ip}`, 20, 60000);
    sendJson(ctx.res, 202, await store.accept(await readJson(ctx, 16384)));
  });
  for (const role of ['admin', 'owner']) router.get(`/api/v1/${role}/cafes/:id/analytics`, async ctx => {
    const authorize = () => {
      requireRole(...(role === 'admin' ? ['admin'] : ['owner', 'admin']))(ctx);
      const cafe = cafes.get(ctx.params.id);
      if (!cafe || (ctx.user.role !== 'admin' && cafe.owner_id !== ctx.user.id)) throw notFound('Кафе олдсонгүй');
    };
    authorize();
    limit(`analytics-read:${ctx.user.id}`, 60, 60000);
    const summary = await store.read(ctx.params.id, ctx.query);
    ctx.user = sessions.user(ctx.cookies[SESSION_COOKIE]);
    authorize();
    if (ctx.query.format === 'csv') {
      ctx.res.writeHead(200, analyticsCsvHeaders(summary));
      return ctx.res.end(analyticsCsv(summary));
    }
    sendJson(ctx.res, 200, summary);
  });
}
