// Phase 11E shared analytics helpers: item-reference validation, Node/D1 schemas and bounded owner reads.
// Aggregates only: no receipt IDs, IPs, sessions or visitor identities ever leave the store.
import {ANALYTICS_ITEM_KINDS} from '../../js/services/analytics-schema.js';

const ITEM_TABLE = `CREATE TABLE IF NOT EXISTS analytics_item_hourly(
 cafe_id TEXT NOT NULL REFERENCES cafes(id),hour TEXT NOT NULL,
 event_type TEXT NOT NULL CHECK(event_type IN('product_view','out_of_stock_view','promotion_view')),
 item_id TEXT NOT NULL,event_count INTEGER NOT NULL CHECK(event_count>=0),revision INTEGER NOT NULL,updated_at TEXT NOT NULL,
 PRIMARY KEY(cafe_id,hour,event_type,item_id));`;
// D1 migration 0014 creates only the item table (analytics_hourly exists since 0008).
export const ANALYTICS_ITEM_SCHEMA = ITEM_TABLE;
// Node has no Durable Object: SQLite is authoritative, so receipts and intake budgets live beside the counters.
export const ANALYTICS_NODE_SCHEMA = `
CREATE TABLE IF NOT EXISTS analytics_hourly(cafe_id TEXT NOT NULL REFERENCES cafes(id),hour TEXT NOT NULL,event_type TEXT NOT NULL,
 event_count INTEGER NOT NULL CHECK(event_count>=0),revision INTEGER NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(cafe_id,hour,event_type));
${ITEM_TABLE}
CREATE TABLE IF NOT EXISTS analytics_receipts(cafe_id TEXT NOT NULL,id TEXT NOT NULL,event_type TEXT NOT NULL,hour TEXT NOT NULL,item_id TEXT,
 expires_at TEXT NOT NULL,PRIMARY KEY(cafe_id,id));
CREATE INDEX IF NOT EXISTS analytics_receipts_expiry ON analytics_receipts(expires_at);
CREATE TABLE IF NOT EXISTS analytics_intake(cafe_id TEXT NOT NULL,day TEXT NOT NULL,n INTEGER NOT NULL CHECK(n>=0),PRIMARY KEY(cafe_id,day));
`;
export const ANALYTICS_DAILY_BUDGET = 1000;
export const ANALYTICS_RECEIPT_MS = 172800000;

// Every referenced item must be a currently published, unarchived product/promotion of the batch cafe.
// One bounded query per kind (≤32 IDs); unknown or foreign references reject the whole batch.
export function* analyticsItemChecks(cafeId, events) {
  const wanted = {product: new Set(), promotion: new Set()};
  for (const e of events) if (e.itemId) wanted[ANALYTICS_ITEM_KINDS[e.type]].add(e.itemId);
  const tables = {product: 'menu_items', promotion: 'promotions'};
  for (const [kind, ids] of Object.entries(wanted)) {
    if (!ids.size) continue;
    yield {
      sql: `SELECT id FROM ${tables[kind]} WHERE cafe_id=? AND published=1 AND archived=0 AND id IN (SELECT value FROM json_each(?))`,
      params: [cafeId, JSON.stringify([...ids])],
      count: ids.size
    };
  }
}

export function checkAnalyticsItems(rows, count, fail) {
  if (rows.length !== count) fail(422, 'unknown_analytics_item', 'Analytics item is not a published item of this cafe');
}

// Mongolia has observed a fixed UTC+08:00 offset without DST since 2017; local-day buckets use that offset.
const ZONES = {UTC: '+0 hours', 'Asia/Ulaanbaatar': '+8 hours'};
export function analyticsReadOptions(query = {}, fail, clock = Date.now()) {
  if (query.format !== undefined && !['json', 'csv'].includes(query.format)) fail(422, 'invalid_format', 'Use format json or csv');
  const granularity = query.granularity || 'hour', timezone = query.timezone || 'UTC';
  const since = query.since || new Date(clock - 7 * 86400000).toISOString(), until = query.until || new Date(clock).toISOString();
  const a = Date.parse(since), b = Date.parse(until);
  if (!['hour', 'day'].includes(granularity) || !Object.hasOwn(ZONES, timezone) || !Number.isFinite(a) || !Number.isFinite(b) || b <= a || b - a > 31 * 86400000)
    fail(422, 'invalid_range', 'Use granularity hour|day, timezone UTC|Asia/Ulaanbaatar and an increasing range of at most 31 days');
  if (granularity === 'hour' && timezone !== 'UTC') fail(422, 'invalid_range', 'Hourly buckets are reported in UTC');
  return {granularity, timezone, since: new Date(a).toISOString(), until: new Date(b).toISOString()};
}

const ITEM_LIMIT = 2000;
export async function readAnalyticsSummary(all, cafeId, query, fail, clock) {
  const o = analyticsReadOptions(query, fail, clock);
  const bucket = o.granularity === 'day' ? `substr(datetime(hour,'${ZONES[o.timezone]}'),1,10)` : 'hour';
  const rows = await all(`SELECT ${bucket} bucket,event_type,SUM(event_count) event_count FROM analytics_hourly WHERE cafe_id=? AND hour>=? AND hour<? GROUP BY bucket,event_type ORDER BY bucket,event_type LIMIT 5208`, cafeId, o.since, o.until);
  let items = [];
  try {
    items = await all(`SELECT ${bucket} bucket,a.event_type,a.item_id,COALESCE(m.name,p.title) item_name,SUM(a.event_count) event_count
      FROM analytics_item_hourly a LEFT JOIN menu_items m ON a.event_type<>'promotion_view' AND m.id=a.item_id AND m.cafe_id=a.cafe_id
      LEFT JOIN promotions p ON a.event_type='promotion_view' AND p.id=a.item_id AND p.cafe_id=a.cafe_id
      WHERE a.cafe_id=? AND a.hour>=? AND a.hour<? GROUP BY bucket,a.event_type,a.item_id ORDER BY bucket,event_count DESC,a.item_id LIMIT ${ITEM_LIMIT + 1}`, cafeId, o.since, o.until);
  } catch (error) {
    if (!/no such table/i.test(String(error?.message))) throw error; // remote D1 not yet migrated to 0014
    items = null;
  }
  const truncated = !!items && items.length > ITEM_LIMIT;
  return {schemaVersion: 1, cafeId, timezone: o.timezone, granularity: o.granularity, since: o.since, until: o.until, metric: 'event_count', uniqueVisitors: null,
    rows, items: items && items.slice(0, ITEM_LIMIT), itemsTruncated: truncated};
}

// Quote every field and neutralize spreadsheet formulas in text fields.
export function analyticsCsv(summary) {
  const cell = value => {
    const raw = String(value ?? '');
    const safe = typeof value === 'string' && /^(?:\s*[=+\-@]|[\t\r\n])/u.test(raw) ? "'" + raw : raw;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  const records = [
    ['bucket', 'timezone', 'granularity', 'event_type', 'item_id', 'item_name', 'event_count'],
    ...summary.rows.map(row => [row.bucket, summary.timezone, summary.granularity, row.event_type, '', '', row.event_count]),
    ...(summary.items ?? []).map(row => [row.bucket, summary.timezone, summary.granularity, row.event_type, row.item_id, row.item_name, row.event_count])
  ];
  return records.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function analyticsCsvHeaders(summary) {
  return {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="analytics.csv"',
    'X-Analytics-Items-Status': summary.items === null ? 'unavailable' : summary.itemsTruncated ? 'truncated' : 'complete',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  };
}
