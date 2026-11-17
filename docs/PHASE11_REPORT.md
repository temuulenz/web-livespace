# Phase 11 engineering report — A–H

Status: local backend implementation and validation complete against PHASE11_ACCEPTANCE.md. Final evidence is in PHASE11_PROGRESS.md. This report supersedes the historical A–D checkpoint and its resolved missing-policy blocker. Existing frontend work, original styles/fixtures and Android v1 wire behavior were preserved. No deployment, production database/resource change, paid service, Git branch/index/commit/push/merge operation or frontend redesign was performed.

## Completion matrix

| Phase | Implemented backend | Compatibility / acceptance evidence |
|---|---|---|
| 11A | Menu/categories/variants, publication/archive, CSV preview/confirmation, images, atomic tenant/global quotas, staged storage and bounded reference-safe reconciliation | Existing Node/D1 media, quota, maximum-menu, rollback and tenant tests remain passing |
| 11B | Stock/status, immutable movements, permanent retries, source conflicts, cafe-scoped deltas and recovery snapshots | Atomic races/negative-stock/tenant tests, existing SSE/browser room checks |
| 11C | Reviews/criteria, author editing, owner replies, reports, admin moderation, incremental rating aggregates/distributions | Author/owner/admin separation, aggregate race/rollback/reconciliation and privacy tests |
| 11D | Fixed/percentage/product/category promotions, scheduled publication, local recurrence, preview and nonstacking integer prices | Node/D1 parity, price/cache transitions, quotas, concurrent versions, ownership fence and audits |
| 11E | Validated v2 events, anonymous/authenticated pseudonymous sessions, server time, deduplication, session/tenant budgets, dimensional/cohort summaries and retention | Shared existing durable collector/monotonic flush, Node restart recovery, bounded intake, invalid metadata/reference rejection and legacy compatibility |
| 11F | Owner/admin day/week/month reports, equal-period comparisons, cohort suppression, source-separated sensor history, favorites/reviews/current stock, safe aggregate CSV | Current authorization before cache hits, bounded indexed queries/pages, real/simulated/stale/invalid tests, explicit unavailable metrics |
| 11G | Persistent outbox/inbox/read/preferences; all nine approved trigger families, recipient resolution, opt-in marketing, incidents/cooldowns/budgets and expiration reminders | Transactional domain triggers, concurrent delivery/dedup/admission, ownership-change fence, recipient isolation, restart and sensor-storm tests |
| 11H | API/DB/runtime measurements, scoped usage, provider-unavailable labels, admission/configuration, atomic media/CSV protection, optional pause and threshold incidents | Tenant/platform namespace separation, independent tenant alerts, original caps/error compatibility, runtime bounds and Cloudflare integration |

All phases are implemented for local Node/SQLite and Cloudflare/D1 where applicable. Required in-app notifications exist; optional external email/realtime notification delivery was not added because there is no configured provider and private polling satisfies the approved channel requirement. Existing public realtime remains unchanged except its configured connection admission.

## Architecture and files

Native JavaScript, built-in Node HTTP/SQLite and the custom browser framework remain. `ws` is still the sole runtime dependency; no frontend build step or new dependency was added. Shared services contain business logic; thin adapters supply prepared SQL, atomic batches, existing authentication and bounded HTTP handling.

New E–H core files:

- `shared/business/behavior.mjs`, `behavior-schema.mjs`, `insights.mjs` — v2 schema/authorization, aggregate storage and reports/CSV.
- `cloudflare/behavior-store.mjs` — extension of existing per-cafe analytics durable storage; `server/services/behavior.mjs` — same collector algorithm over durable Node SQLite files with bounded handles/recovery.
- `shared/business/notifications.mjs`, `notifications-schema.mjs` — transactional outbox, persistent recipient state and bounded delivery.
- `shared/business/resources.mjs`, `resources-schema.mjs`, `phase11-config.mjs`, `phase11.mjs` — monitoring, controls, resource incidents/cursor and shared orchestration.
- `server/routes/behavior.mjs`, `server/routes/phase11.mjs`, `cloudflare/phase11.mjs` — HTTP adapters.
- `cloudflare/migrations/0014_behavior.sql`, `0015_notifications.sql`, `0016_resources.sql` — ordered additive D1 migrations.
- `tests/phase11-analytics.test.mjs`, `phase11-notifications.test.mjs`, `phase11-resources.test.mjs`; `scripts/phase11-load.mjs`; E–H contracts/configuration/acceptance and measurement documents.

Integration edits: existing analytics store/DO, Workers API/backend alarms, Cloudflare D1 measurement helper and room/sensor admission; Node assembly/config/database/realtime helpers; shared menu CSV limits/SQL error mapping; existing analytics/Cloudflare/migration tests; D1 probe. The static browser test now waits for the asynchronous map's twelve markers after resize before retaining its existing exact count assertion. No frontend component or baseline fixture changed.

Previously completed A–D files/behavior remain in the checkout, including promotion migration 0013 and its shared service/adapters/tests. They were not restarted or replaced. See the feature guides for their complete file/API inventories.

## Database changes and persistence

| Node version / D1 migration | Change |
|---|---|
| 5 / 0009 | Menu entities/media and immutable business audit |
| 6 / 0010 | Atomic quotas, durable media staging and cleanup fences |
| 7 / 0011 | Inventory/movements/receipts/revisions |
| 8 / 0012 | Reviews/replies/reports/moderation and incremental ratings |
| 9 / 0013 | Tenant promotions, schedule/target relationships and capacity |
| 10 / 0014 | Analytics dimension, session-day and cohort summaries/time indexes |
| 11 / 0015 | Notification outbox/inbox/preferences/delivery receipts/cooldowns/budgets/incidents and domain triggers |
| 12 / 0016 | Resource incidents/cursor, scoped optional controls and configurable lower media/CSV fences |

Only disposable local databases were migrated during validation. Shared SQL/D1 parity and v1-fixture upgrade are tested; the frozen pre-Android fixture is unchanged. Existing AnalyticsAggregator initializes additive local collector tables on resume; no new Cloudflare namespace/bucket/service was created. Node collectors store durable pending counters under LS_DATA_DIR/analytics; accepted data survives normal process restarts and handle eviction. D1 receives bounded aggregate/member summary batches, not raw per-click event rows. Receipt/session summaries never enter owner/public responses.

## API handoff

Machine contracts contain 70 operations across 53 paths; the Postman collection has 71 requests including existing login. Full field/error/role/time/source/cache/retention semantics:

- MENU_MANAGEMENT.md, INVENTORY_MANAGEMENT.md, RATINGS_AND_REVIEWS.md, PROMOTIONS.md.
- BEHAVIOR_ANALYTICS.md: POST analytics/session and analytics/events; GET owner/admin cafe analytics and CSV; GET admin platform analytics/CSV.
- NOTIFICATIONS.md: GET own inbox/unread count; POST individual/all read; GET/PATCH category preferences.
- RESOURCE_CONTROLS.md: GET cafe usage/admin monitor; PATCH administrator optional-work controls; POST one bounded admin maintenance step.

Existing legacy Cloudflare hourly/ISO analytics requests remain supported separately. Date-only E/F requests use Asia/Ulaanbaatar calendar days, Monday weeks and calendar months; UTC stays the persistence boundary. All private APIs reuse current sessions and tenant/recipient checks. No researcher role, unrestricted research export, order/payment/revenue/conversion API or external sharing workflow exists. Teammate customer mock adapters/UI remain unchanged; FRONTEND_INTEGRATION_GUIDE.md explains integration.

## Security and correctness

Strict field whitelists reject arbitrary analytics metadata/location/client timestamps; references are tenant/publication checked. Server-derived per-cafe session pseudonyms are unlinked across cafes; no raw IP/fingerprint/account identifier is persisted in analytics. Security IP windows are ephemeral. Small behavior cohorts are omitted entirely, including their product/promotion keys, and cannot appear in CSV. Unique platform visitors are explicitly unavailable rather than summing unlinkable cafe sessions as people.

Domain changes and notification intents commit together. Inbox insertion atomically rechecks enabled users, ownership/admin eligibility, preferences, budget, cooldown and deduplication. Marketing requires explicit opt-in plus a current favorite; clients cannot name recipients. Scope keys distinguish platform from cafe IDs, including a cafe literally named platform. Resource alert cooldowns include tenant and severity, so one tenant cannot suppress another's warning or a warning hide a critical escalation. Sensor alerts use real enabled devices, durable incident identities and existing offline thresholds; heartbeat pongs never create telemetry or freshness.

New media fences run before reservation and include the incoming bytes; unchanged default limits still use original constraints/error behavior. CSV lower bounds are enforced in addition to existing parser/confirmation/tenant rules; exports quote/neutralize formulas. Oversized Node JSON returns documented 413 before connection closure. Legacy and v2 intake share the same local tenant-day quota, closing a boundary bypass without altering legacy event-time/replay semantics. Rate, page, connection, query-range, queue/batch and retention bounds remain server-side; pause affects only optional analytics. Authoritative sensor failures still produce no successful ACK.

## Validation

All commands use disposable data. Browser environment:

```sh
export BROWSER_PATH=/home/temuulen/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome
export BROWSER_NO_SANDBOX=1
export WRANGLER_SEND_METRICS=false
```

| Command | Result |
|---|---|
| `npm ci` | Passed; zero audit vulnerabilities. npm blocked dependency postinstall scripts; available Wrangler binaries worked. |
| `npm test` | 177 passed; zero failures or skips |
| `npm run test:sensors` | 26 passed |
| `npm run test:browser` | 17 checks passed |
| `npm run test:e2e` | 13 passed |
| `npm run test:visitor-visual` | 11 original pixel/lifecycle checkpoints passed |
| `npm run test:visual` | 17 checks passed |
| `npm run test:cloudflare` | 29 checks passed |
| `node scripts/phase11-d1-check.mjs` | Local D1/R2 concurrency, rollback, recovery, cohort, notification and monitoring probe passed |
| `node scripts/phase11-menu-demo.mjs` | Ephemeral simulated menu/stock/review workflow passed |
| `node scripts/phase11-menu-budget.mjs` | Cold menu six SQL statements, warm two; not D1 billing |
| `node scripts/phase11-load.mjs` | All 12 cafe/browser cases and 36 nested synthetic session workload variants passed; R2/KV/analytics/replay/cold restart checks passed |
| `npm run cf:check` | Worker bundle/dry-run passed; no deployment |
| `node --check` on changed/new native modules; JSON contract parsing; `git diff --check` | 42 native modules passed; JSON parsed; whitespace passed |

There are no configured lint, static typecheck or production frontend build scripts. Native syntax/module tests and Wrangler dry-run are the available checks; no tool/dependency was invented to claim additional validation. Browser suites execute their existing conditional real-map skip because external MapLibre/OpenFreeMap assets were unreachable; SVG fallback checks passed. No assertion or fixture was weakened/regenerated.

Failures investigated during development: a full-cap media insert originally produced the new configured-cap error before the legacy CHECK; the new fence now applies only lower configured caps and original tests pass unchanged. Visual resize readiness was synchronized without changing the twelve-marker assertion. An initial burst load correctly hit report rate admission; isolated load overrides are explicit. Another trial was interrupted by dev-worker reload during concurrent edits, so the successful matrix was rerun with sources frozen. Legacy intake's hard-coded daily cap was found in the follow-up, made configurable and regression tested. A final shared-day boundary test covers both protocol versions.

## Measured resource results and limits

Exact disposable-workerd metadata: PHASE11_EH_D1_MEASUREMENTS.json. Example fixture results (statements / rows read / rows written, including exposed index/trigger work): dimensional flush for three sessions 7/0/21; cold owner report 10/22/0; cached report authorization 1/1/0; one notification maintenance step 14/27/13; owner resource monitor 8/14/0; one tenant threshold evaluation 8/5/6. These are direct-service measurements; HTTP session checks, DO storage/alarms/fan-out and provider accounting are separate. Steady sensor persistence remains the original path; incident transitions add explicit notification work, never per-frame browsing writes or altered ACK rules.

Exact workload artifact: PHASE11_LOAD_MEASUREMENTS.json. Twelve cases combine 1/3/5/10 cafes with 50/100/500 connected browsers; each also executes 100/500/1000 synthetic session workloads (19,200 session events total), catalog/inventory/rating reads and private analytics/resources/inbox reads. Domain mutation/fault/recipient cases are tested separately, not falsely presented as all possible concurrent business mixes. Isolated load overrides: 100000 tenant events/day, 1000 batches/minute, 10000 report requests/minute and 10000 authenticated API requests/minute. Checked-in defaults were not raised.

At 10 cafes/500 browsers: hot API p95 9.62 ms, sensor-to-browser p95 627.62 ms, reconnect p95 732.00 ms; 1000-session ingest p95 205.85 ms. Hot reads/fan-out precede each synthetic ingestion segment; these are not a measured before/after causal latency comparison. Local workerd process-tree CPU totaled 284.51 seconds; allocated D1 SQLite/WAL/SHM grew from 1,429,272 to 5,701,384 bytes. This is a short same-host correctness/load trial, not 24-hour usage, provider per-request CPU/billing, Internet latency, account-wide quota headroom or a guarantee every scenario fits a free plan. Harness daily projections remain assumptions, not measured provider usage. No paid plan or provider metrics API was used.

## Operational limitations and deployment prerequisites

- Reports are eventually consistent with bounded collector flushes and a 30-second report cache. Cohort suppression and explicit unavailable metrics are intentional; no exact cross-cafe unique-person count exists. Browser events are not fraud-proof visits.
- Current favorites, visible review cohort and current inventory are clearly labeled snapshots/defined cohorts. Historical stock availability/connection uptime, sales/revenue/conversion and absent sensor channels are null/unavailable. Sparse real sensor coverage is insufficient, and simulated observations never become real statistics.
- Default retention is incremental and can temporarily leave older auxiliary rows during backlog. Business audits, inventory retry receipts and notification delivery receipts retain correctness references; no automatic customer-content deletion occurs. Existing media tombstone/legacy pending-object maintenance remains operator-reviewed.
- In-app polling is implemented; no external delivery provider/UI integration was added. Runtime metrics reset on restart, tenant/global attribution is null where unavailable, and provider billing remains unavailable.
- External live-map reachability and physical Android/calibration/thermal behavior were not established by this backend work. No trained forecasting model or hardware validation claim.

A separate deployment review must inspect the complete preserved working-tree diff, approved backups/current remote schema, ordered additive migration/recovery rehearsal, existing cumulative DO bindings/migrations, coherent environment bounds and account-wide budgets. Apply no remote migration or deployment based solely on this report. Keep analytics disabled until an explicitly configured pilot is approved, retain media read bindings/data during rollback, and validate production monitoring/tenant policies with measured account usage. Recommended next work is separately scoped frontend adapter integration and deployment/staging review; unrelated phases were not implemented.
