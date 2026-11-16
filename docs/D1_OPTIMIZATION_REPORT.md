# D1 Free tier optimization

Local development report, 2026-11-16. No commits, pushes, deployments, database resets, database replacements, or production SQL were performed. Production was accessed only through read-only query analytics. Existing D1 data and the Android v1 envelope/ACK contract are preserved.

## Confirmed production root causes

`wrangler d1 insights livespace --sort-by reads --time-period 1d --limit 15 --json` returned these totals. This is a rolling analytics window, not a UTC-day billing reconciliation; totals can exceed the daily limit because of window boundaries, other periods, and analytics accounting. Query parameters and credentials were not retrieved.

| Query family | Executions | Average rows read | Total rows read |
| --- | ---: | ---: | ---: |
| Public sensor snapshot through `sensor_latest_readings` | 3,066 | 1,144 | 3,509,945 |
| History default-device selection with expression sorting | 797 | 1,103 | 879,336 |
| Simulated legacy metric lookup | 1,882 | 427 | 803,981 |
| Real legacy metric lookup | 1,838 | 387 | 712,448 |
| Historical aggregation | 564 | 561 | 316,738 |
| Device `MAX(ts)` | 442 | 221 | 98,001 |
| Admin café-filtered measurement list | 78 | 505 | 39,414 |
| Active café catalogue | 1,828 | 16 | 29,581 |
| History readings | 603 | 32 | 19,627 |
| Device-filtered admin measurements | 77 | 164 | 12,684 |
| Telemetry diagnostics update through latest view | 867 | 9 | 7,803 |
| Admin 24-hour measurement count | 18 | 324 | 5,836 |
| Owner café list | 282 | 14 | 3,948 |
| Measurement insert | 858 | 4 | 3,432 |
| Session lookup (older query shape in analytics window) | 1,767 | 1 | 2,736 |

The leading four families alone consumed 5,905,710 reads in that rolling window. Authentication was not the leading cost. Health performs three `LIMIT 1` probes, not full counts. Ingestion's view was a smaller cost than initially suspected: local SQLite pushes the device constraint into that view. The public snapshot did not get equivalent bounded behavior.

`/live` and `/cafes` previously rebuilt each active café with several queries. The window view ranked historical rows before selecting each device's newest row. The legacy lookup walked every Android row when there was no seat, Wi-Fi, or calibrated SPL metric to return. A `LIMIT 30` did not bound rows scanned. Device views added one historical `MAX` query per device. History selected a device with an expression sort, then aggregated a full day every ten seconds per mounted panel.

## Measured local D1 results

`node scripts/d1-read-budget.mjs` creates a temporary, nonpersistent local workerd D1 database, explicitly disables remote bindings, applies migrations, and generates 10,000 synthetic SQL fixture readings at 15-second spacing. These are disposable benchmark fixtures, not production observations. Costs below are D1 `meta.rows_read` / `rows_written`, including index work, rather than returned row counts.

| Operation | Before | After |
| --- | ---: | ---: |
| Old latest view query, 10,000 readings | 40,002 reads | Removed from serving path |
| Direct latest observation lookup | 1 read | 1 read; existing index reused |
| Empty legacy metric lookup | 10,001 reads | 0 reads |
| Complete optimized live summary, before/after partial index | 20,006 reads | 4 reads |
| Old default-device selector over fixture range | 20,002 reads | Replaced with device enumeration + indexed seeks |
| New selector, one reporting device | — | 2 reads |
| Full-day history cold miss, default 100 readings | — | Approximately 11,617 reads |
| Identical shared history cache hit | Full aggregation again | No measurement queries; café/session authorization still executes |
| Telemetry atomic batch | 13 reads, 10 writes | 8 reads, 10 writes |
| Admin unindexed `received_at` count over fixture | 10,000 reads | Still scales with history; deliberately not indexed yet |

The script's `before`/`after` sections mean before/after migration 0006. Both sections execute the current optimized projection implementation. Its `view` and `selector` entries intentionally measure the old SQL for comparison. The original telemetry batch was measured before editing it; its statement costs were `(3 reads,7 writes)`, `(9 reads,1 write)`, `(1 read,2 writes)`. Current costs are `(3,7)`, `(4,1)`, `(1,2)`. Fixture growth and current clock can shift history counts by a few rows. Do not claim that the whole old endpoint was measured as four rows; four rows is the new summary only, excluding the café catalogue query.

EXPLAIN findings:

- Old view: co-routines, historical source-index walk, temporary ORDER BY B-tree, and ranked-subquery scans.
- Latest seek: `SEARCH measurements USING INDEX measurements_sensor_latest (device_id=? AND cafe_id=? AND data_source=?)`; no new index required.
- Legacy query before: `measurements_cafe_ts` plus temporary ordering, scanning missing metrics.
- Legacy query after: `SEARCH measurements USING INDEX measurements_legacy_latest (cafe_id=? AND is_test=?)`; empty partial index needs zero row reads.
- Admin received-time count: `SCAN measurements`. Its production contribution was only 5,836 reads, so an additional write on every telemetry message is not justified by this evidence. Reassess if overview traffic grows.

Migration 0006 adds only a partial legacy-metric index. People/dBFS-only Android rows do not enter it. Calibrated SPL and legacy metric rows do; allow at least one extra row write for those observations. Existing data is neither deleted nor rewritten, but building the index consumes a one-time scan and writes for matching rows. A large existing table may require its own fresh daily budget for index creation.

## Implementation and security

- Snapshot queries enumerate assigned devices and seek one latest observation per device using the existing composite index. They retain source checks, current assignment joins, connection state, and observation-time ordering. Disabled/stale/offline data is not relabelled fresh.
- Device freshness queries include source and use ordered `LIMIT 1`; no historical `MAX` scan.
- Ingestion diagnostics use the same ordered seek inside the existing atomic D1 batch. Observation ordering still wins over arrival ordering, including delayed replay. Receipt insertion and conditional credential/assignment guards are unchanged. ACK remains after durable batch success.
- The existing `AppBackend` Durable Object owns a bounded disposable current-public-state response cache: five-second TTL, shared in-flight refreshes, and at most 256 entries. Thus repeated live requests reuse current sensor projections in the DO; cache misses recover from D1 with bounded latest seeks. This is a derived cache, not another durable latest-state table or credential authority. It is lost on eviction/restart. No additional DO class, database, or paid service is introduced.
- Public projections are built before session lookup and contain no private diagnostics. Public cache keys ignore cookies; only explicitly allowlisted GET paths enter it. Responses retain `Cache-Control: no-store`, so browser/proxy caches do not store private responses. Successful management mutations invalidate public cache state; generation tracking prevents an older in-flight refresh from repopulating that cache.
- Health probes run at most once per 60 seconds while the DO is resident. Health remains a genuine D1/schema check, not a permanent unconditional success.
- History results share ten-minute bounded caches, keyed by café, public/private projection, and sorted query parameters. Authorization, active/public eligibility and ownership are rechecked before every hit. Public and private results never share entries. Failures are evicted. History queries retain the maximum 31-day range, source separation, invalid/stale-at-arrival exclusions, and single-device series semantics. A custom query or cache eviction can still cause a cold aggregation.
- The default selector uses per-device indexed seeks and preserves preference for people samples. If a device has only null people samples, its people lookup may scan that device's selected time range. This is bounded by the requested range, not total lifetime history. No new write-heavy covering index was added without evidence.
- Browser live polling remains ten seconds by default. It already paused on hidden tabs and had idempotent `start()`; added protection prevents overlapping polls, hidden initial/explicit polls, and duplicate channel instances. Route-owned cleanup remains intact.
- History background refresh moves from ten seconds to ten minutes, coalesces requests, and suppresses per-telemetry reloads. Manual interval/source changes remain available; cached results can be ten minutes old.
- Owner/device/detail background dashboard polling moves to 30 seconds. Admin measurements now honor the existing auto-refresh checkbox and its 15-second timer; the competing unconditional five-second measurements timer was removed. Owner/admin loads coalesce in-flight work and back off on 503.
- There is no D1 forecasting endpoint, trained model, or real-data forecasting query in this implementation. The existing frontend day forecast is demonstration behavior. It does not read D1 and was preserved. Historical aggregates remain explicitly historical; no forecast service was invented merely to cache it.

## Daily D1 budget

Free daily ceilings are 5,000,000 rows read and 100,000 rows written; the operating targets are below 2,500,000 and 50,000. Index writes count. Estimates assume 24-hour telemetry, no replay duplication, people/dBFS-only frames, one or three sensors, and the measured ten writes / eight batch reads per accepted message. Each new socket message adds approximately one device read and one receipt lookup; authorization sweeps add about 2,880 device reads/day/sensor. Cold starts and reconnect handshakes are extra.

| Sensors | Cadence | Messages/day | D1 writes/day | Assessment |
| --- | ---: | ---: | ---: | --- |
| 1 | 15 s | 5,760 | 57,600 | Below hard limit, exceeds 50% target |
| 1 | 30 s | 2,880 | 28,800 | Recommended single-sensor budget |
| 3 | 15 s | 17,280 | 172,800 | Exceeds Free hard limit |
| 3 | 30 s | 8,640 | 86,400 | Exceeds 50% target |
| 3 | 60 s | 4,320 | 43,200 | Recommended fleet budget |

With calibrated SPL in every frame, conservatively use eleven writes: 31,680/day for one at 30 seconds, 47,520/day for three at 60 seconds. That last case has little margin for management writes, backlog, or additional index maintenance; 90-second telemetry is safer when backlog is common. Telemetry cadence is configured on the sensor; this work does not silently discard/coalesce accepted history to meet a budget. The current 15-second default remains unchanged pending a deliberate operator cadence choice.

For visitor estimates, assume 16 café catalogue rows (production analytics average), one or three live cafés, and all other cafés in demo mode. Each live cache miss costs approximately `16 + 4 × live_cafes` reads for the catalogue plus live summaries. Ten-second polling makes 8,640 requests/visitor/day. Five-second shared caching caps each public path around 17,280 refreshes/day under staggered demand; synchronized visitors usually cause fewer. `/cafes` and individual detail paths have separate caches and should be counted separately for unusual navigation traffic.

| Sensors/cadence | Continuous visitors | Live HTTP polls/day | Conservative live D1 reads/day | Shared daily history estimates | Approximate total D1 reads/day |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 / 30 s | 10 | 86,400 | 345,600 | 0.84 million | 1.22 million |
| 1 / 30 s | 50 | 432,000 | 345,600 | 0.84 million | 1.23 million |
| 3 / 60 s | 10 | 86,400 | 483,840 | 1.27 million | 1.81 million |
| 3 / 60 s | 50 | 432,000 | 483,840 | 1.27 million | 1.82 million |

History assumes one common public query per live café every ten minutes, limit 50, a day of observations, approximately two scanned rows per observation plus the returned reading rows, and all three cafés opened in the fleet case. That extrapolation comes from the measured 15-second fixture cold cost; it is an estimate, not a measured production load test. Totals include roughly ten ingestion-related reads/message, sweep reads, and public history eligibility checks. They exclude continuous admin measurement browsing, many distinct historical ranges, private history cache variants, startup catalogue/detail traffic, cache eviction, and other applications sharing the account. Fifty distinct ranges or ten-minute DO restarts invalidate the shared-history assumption. Monitor account-wide totals rather than treating these estimates as a guarantee.

**Other Free limits matter.** Fifty visitors polling every ten seconds continuously make 432,000 Worker requests/day, beyond the Workers Free 100,000 request ceiling even though the D1 budget above fits. Ten visitors already leave little room for assets and management requests. For fifty continuous visitors, explicitly set `LS_POLL_INTERVAL_SEC=60` (72,000 live polls/day), budget remaining traffic, and accept up to a minute of recovery latency; visualization animation remains local. At an average two visible hours/day, fifty visitors at ten seconds make 36,000 live polls/day. This change preserves the responsive default instead of claiming fifty visitors can poll every ten seconds for 24 hours on Workers Free. Sub-minute updates for fifty continuous visitors require an additional stream/fan-out design and its own DO duration budget; this report does not claim that work is complete.

When changing sensor cadence, also set `LS_SENSOR_EXPECTED_INTERVAL_SEC` to the actual cadence and choose `LS_SENSOR_STALE_AFTER_SEC` with headroom for sampling plus browser polling, e.g. 90 seconds for 30-second telemetry / 10-second polling, or 150 seconds for 60-second telemetry / 60-second polling. Otherwise slower sensors will correctly look stale. Never extend freshness merely to hide an offline device.

## Quota exhaustion and recovery

D1 quota messages / error 7500 map to HTTP 503 with code `d1_quota_exhausted`, a generic temporary-interruption message, and `Retry-After: 900`. No raw database diagnostics reach the browser. The backend DO suppresses D1 retries for 15 minutes after a detected quota error. Frontend live/history/dashboard pollers also pause for 15 minutes on 503. The API client already avoids retrying HTTP errors; only network failures get its existing one retry.

On sensor storage quota errors, the sensor receives existing v1 `storage_failed`, never an ACK, then close 1013 with a 900-second retry hint. That device DO suppresses further D1 work during its cooldown; alarm failures reschedule instead of looping. The HTTP upgrade receives 503/Retry-After when unavailable. Clients must retain their unchanged durable outbox entries. The Android source is not in this repository: actual client behavior on 1013 / Retry-After remains unverified. Existing client exponential backoff is not automatically changed by a server hint. Gateway admission before the device DO still performs its indexed credential lookup, so clients ignoring backoff can incur rejected handshake attempts. Verify the phone's reconnect policy before unattended quota recovery.

Previously loaded readings remain subject to observation freshness. An initial backend 503 shows a clear bilingual interruption banner and removes bundled demo café records from online display. Existing online outages keep last-known real readings with freshness labels. No simulated readings are substituted for missing real data. Static hosts returning 404 retain their original labelled demo behavior.

## Local validation and deployment procedure

Run local checks with disposable storage/profiles:

```sh
npm ci
npm test
node scripts/d1-read-budget.mjs
npm run cf:write-budget
BROWSER_PATH=/path/to/chromium BROWSER_NO_SANDBOX=1 npm run test:browser
BROWSER_PATH=/path/to/chromium BROWSER_NO_SANDBOX=1 npm run test:e2e
BROWSER_PATH=/path/to/chromium BROWSER_NO_SANDBOX=1 WRANGLER_SEND_METRICS=false npm run test:cloudflare
```

The benchmark asserts the complete optimized live summary stays below 20 reads on its 10,000-row fixture. Unit tests cover hidden/in-flight polling and quota 503 mapping. Local Cloudflare tests cover authentication/authorization, durable ACK, duplicate replay, restart, failure rollback, source privacy, shared public caching, and injected quota storage failure. Final results: `npm ci` succeeded; 91 Node tests, 16 static-browser checks, 13 end-to-end checks, and 22 local Cloudflare checks passed. Both local row-budget scripts completed; the telemetry benchmark confirmed ten writes per uncalibrated message. `git diff --check` passed. The end-to-end history assertion now explicitly uses manual refresh, consistent with the longer background history interval. Production behavior has not been revalidated or deployed.

After quota reset, an operator should:

1. Review the diff and choose the sensor/poll/staleness configuration and expected account traffic. Confirm existing database ID `40e181a5-4058-4f82-bdf2-e26c79392056` and Worker `livespace`; do not create replacement resources. GitHub automatic deployment remains a separate existing integration: keep this work unpushed until rollout is authorized.
2. Obtain an approved backup/export using the existing backup procedure. Do not reset tables, regenerate the v1 fixture, or replay a seed script in production.
3. Estimate migration scan/index-build cost from existing dashboard size/row information. A Free daily quota also applies to index creation. If it cannot fit, stage the additive migration on a later fresh budget; do not circumvent limits with another database or a paid plan.
4. Apply only the additive migration to the existing database with `npx wrangler d1 migrations apply livespace --remote`, then deploy the reviewed Worker with `npx wrangler deploy`. These are instructions only; neither command was run here. If index creation is too large, deploy the bounded latest-query improvements first and defer the partial index, recognizing that legacy lookups remain expensive until it exists.
5. Verify one health call, one catalogue/live request, an authenticated owner/admin path, and one actual sensor accepted/duplicate ACK. Confirm no ACK when storage is deliberately unavailable in a local rehearsal. Verify offline queue replay on the physical device; no hardware validation is claimed here.
6. Use `npx wrangler d1 insights livespace --sort-by reads --time-period 1d --limit 15 --json` and the D1 dashboard after rollout. Compare actual sums and query shapes; cache hits will not show measurement SQL. Check both rows read and written and the Workers/DO budgets. Aim below 2.5 million reads / 50,000 writes across the account with headroom for queued backlog.
7. If a regression appears, stop test traffic and issue a reviewed forward fix. Do not revert Git history, delete existing data, recreate the database, or automatically deploy a recovery Worker.

References: [D1 metrics and row accounting](https://developers.cloudflare.com/d1/observability/metrics-analytics/), [finding expensive queries](https://developers.cloudflare.com/d1/observability/find-expensive-queries/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [Free daily-limit enforcement](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
