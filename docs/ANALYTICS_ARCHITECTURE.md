# Venue event analytics

Collection is disabled by default. Enable it in an isolated environment with `LS_ANALYTICS_ENABLED=1`. Both runtimes accept `POST /api/v1/analytics/events` with an active cafe ID and 1–32 events in a body of at most 16 KiB.

```json
{"schemaVersion":1,"cafeId":"synthetic-cafe","events":[{"id":"example-0001","type":"product_view","timestamp":"2026-11-18T06:00:00.000Z","itemId":"product-id"}]}
```

Use a current UTC timestamp when sending. Events can be up to 24 hours old or 60 seconds ahead. The seven event types are `cafe_view`, `menu_view`, `product_view`, `favorite_add`, `directions_click`, `promotion_view`, and `out_of_stock_view`. The last three item-related types are `product_view`, `promotion_view` and `out_of_stock_view`. Those types can carry an optional `itemId` for a published, unarchived product or promotion belonging to the batch cafe. The intake rejects an entire batch on an invalid reference. Limits are 20 batches per IP per minute and 1,000 newly accepted events per cafe per UTC intake day. Rate limits are per runtime instance. Responses return `accepted` and `duplicates`. Reuse IDs on retry. Changing the type, hour or item for a retained ID yields a conflict.

## Private reports

Use `GET /api/v1/owner/cafes/:id/analytics` or `GET /api/v1/admin/cafes/:id/analytics`. The owner endpoint accepts the cafe owner or an admin. The admin endpoint requires an admin. Reads are limited to 60 requests per user per minute and use `Cache-Control: no-store`.

- `granularity=hour|day` defaults to hour. Hours use UTC. Days can use `timezone=Asia/Ulaanbaatar` or the default `UTC`.
- `since` and `until` default to the last seven days. The maximum range is 31 days. Bounds apply to stored UTC bucket starts, inclusive at the start and exclusive at the end. Align partial hours when needed.
- The JSON response preserves `schemaVersion: 1` and adds `since`, `until`, `items` and `itemsTruncated`. Item rows include `bucket`, `event_type`, `item_id`, `item_name` and `event_count`. Up to 2,000 item rows are returned. An empty array means no matching item rows and null means the item schema is unavailable.
- Add `format=csv` to download the same bounded aggregate rows. Rows with blank item fields are totals, and rows with an item ID are the item breakdown. The `X-Analytics-Items-Status` header reports `complete`, `truncated` or `unavailable`. The CSV escapes spreadsheet formulas in text.
- `uniqueVisitors` is null. Event counts are aggregate client reports, with no visitor identity or reliable measure of visits, purchases or revenue.

## Storage and availability

Node schema 10 stores receipts, intake budgets and counters in one SQLite transaction. On Cloudflare, the cafe Durable Object stores that state before accepting the batch, then flushes absolute revisions to D1. D1 migration 0014 adds per-item counters alongside the existing hourly table. Item flush retries preserve pending counters. Cloudflare reports can lag intake until a successful flush. Node reports are immediately visible after commit.

Receipts expire after two days. Counter rows in D1 and Node are retained. No IP, session ID or receipt ID appears in the reports. The collection flag disables intake and optional Cloudflare alarm work, with pending Durable Object counters retained for recovery.
