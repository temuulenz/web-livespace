# Phase 11 engineering checkpoint — 11A through 11C

11A menu hardening, 11B inventory and 11C ratings/reviews are implemented for local Node SQLite and Cloudflare D1 integration. Phase 11 overall is incomplete: 11D promotions, 11E analytics extensions, 11F statistical datasets, 11G notifications and 11H resource monitoring/controls remain unimplemented. No other phases were started. No deployment, remote resource creation/migration, paid service, Git branch/index/commit operation, Android change or production/frontend implementation was performed by this work. Existing uncommitted teammate and Phase 7.1/7.2 work was preserved.

## Architecture and migrations

Shared native JavaScript services use thin Node and Cloudflare adapters, existing sessions/RBAC/cafe assignments, prepared SQL, atomic SQLite transactions or D1 batches and existing media/realtime abstractions. Sole runtime dependency remains ws; no frontend build step. D1 is authoritative; KV/R2 remain optional. No alternate sensor credentials/latest-state store, order/reservation, trained model or physical Android validation was introduced.

| Node / D1 migration | Change |
|---|---|
| 5 / 0009 (existing checkpoint) | Categories/products/variants/media and immutable business audit |
| 6 / 0010 | Atomic tenant/global media quotas, identity/reference fences and bounded cleanup journal |
| 7 / 0011 | Inventory, immutable movements, permanent retry receipts, cafe revisions/source constraints |
| 8 / 0012 | Reviews/replies/reports/moderation audit, incremental rating summary/distributions |

Migrations are additive and ordered. Only disposable local databases were migrated. The frozen v1 fixture was preserved; its migration regression assertion now expects version 8. Existing production schema/data was never inspected or modified.

11A now reserves menu/media capacity inside the transaction rather than racing preflight counts. Physical storage paths are durably journaled before uploads. Trusted, cafe-scoped, dry-run-by-default reconciliation processes old unreferenced uploads with reference fences and retained late-writer tombstones. No ambiguous failed write deletes a possibly referenced object. Operational bounds and legacy pending-upload handling are documented in MENU_MANAGEMENT.md. A 100-product/2000-variant snapshot uses bounded parameters and was exercised at maximum tenant entity counts.

11B stock, version, movement, audit, revision and request receipt commit atomically. Quantity never becomes negative; zero is sold out. Product and variant sources cannot conflict; ordered bulk source switching preserves IDs/history. Retry keys bind canonical request plus current actor/cafe and survive restart. Public exact quantities are owner-controlled; private histories never enter events. After COMMIT, small cafe-scoped inventory deltas use Node SSE/Cloudflare browser rooms; snapshots recover missed events without full menu reloads. Inventory is never cached as authority. Existing sensor frame/ACK/persistence architecture is unchanged.

11C five integer ratings generate one consistent review mean. Triggers update counts, criterion sums and six sets of five-star distribution bins atomically on create/edit/delete/hide/restore. Author-only editing/soft deletion, owner replies/reporting and admin moderation/reasons/audit are enforced independently. Public summaries are indexed, cached per cafe and never recompute history per request. Reconciliation is an explicit admin/operator maintenance scan and does not alter reviews. Display names are not verified visits; public account IDs/emails/report identities are omitted.

## API/team handoff

45 implemented operations across 30 paths are documented in PHASE11_API_CONTRACT.md and docs/openapi.yaml (JSON syntax valid YAML 1.2). The Postman-compatible collection includes 46 requests including existing cookie login. Full HTTP method/path/auth/ownership/body/response/errors/filter/pagination/cache/realtime contracts are in MENU_MANAGEMENT.md, INVENTORY_MANAGEMENT.md and RATINGS_AND_REVIEWS.md. FRONTEND_INTEGRATION_GUIDE.md and PHASE11_PERMISSION_MATRIX.md cover independent integration; no frontend handlers/UI were implemented.

`node scripts/phase11-menu-demo.mjs` runs a self-cleaning local API workflow with an isolated cafe marked demo, fictional menu/stock and a clearly simulated review/rating. It creates an ephemeral server/database/files and does not insert production data or expose credentials. Research export/statistical APIs await 11F; operational rating counts are not customer research, sales, revenue or verified visits.

## Security and testing

Tests cover unauthorized/foreign cafe denial; strict body/type/price/rating/quantity validation; same-origin cookie writes; current session revocation; immutable Super Admin restrictions; safe media visibility/ETags; atomic concurrent quotas; maximum snapshots; failure/reconstructed-service media recovery; conflicting stock sources; durable retry receipts; negative rejection; concurrent decrements; movement/audit rollback; post-commit cafe-scoped deltas; author uniqueness; author/owner separation; reply editing/deletion; review reporting; admin-only moderation/audit; aggregate race/rollback; public privacy; null/no-review semantics; and deliberate aggregate repair in disposable data.

Local validation at this checkpoint: npm ci passed, 0 audit vulnerabilities; npm test 133 passed; focused sensors 26 passed; focused quota/inventory/review suite 15 passed; local Cloudflare 26 passed; Wrangler dry-run passed (no deployment). Static Chromium 16 passed. Node browser E2E passed 13/13; original visitor visual/lifecycle checks passed all 11 checkpoints. Final Cloudflare rerun passed 26/26 after public fan-out authorization query deduplication. No original style/simulation fixtures were regenerated. The initial C Cloudflare test attempted to create an existing reply with version 0; corrected it to an actual versioned edit. D1 reconciliation initially exceeded compound SELECT limits; replaced it with bounded json_each input and reran successfully. These were fixed before the checkpoint.

## Measured resource consumption

`scripts/phase11-d1-check.mjs` runs actual shared services against disposable local workerd D1 and optional local R2, records meta.rows_read/rows_written (including exposed index/trigger maintenance), verifies menu/inventory version races, inventory movement rollback, review edit-versus-moderation races, injected post-write rollback, ambiguous R2 recovery, tenant isolation and rating reconciliation. Exact results/plans: PHASE11_BUSINESS_D1_MEASUREMENTS.json. Fixture: 30 published products; business operations shown below. Authorization through HTTP sessions and browser-room fan-out add costs outside this direct-service probe. No production CPU/duration/billing or internet-latency claim.

| Direct-service operation | SQL statements | D1 rows read | D1 rows written |
|---|---:|---:|---:|
| product create | 5 | 4 | 9 |
| cold menu 30 products | 5 | 95 | 0 |
| warm menu 30 products | 1 | 1 | 0 |
| product update | 6 | 5 | 4 |
| r2 image upload and attach | 10 | 10 | 15 |
| inventory create | 11 | 10 | 17 |
| inventory duplicate | 2 | 2 | 0 |
| inventory decrement | 11 | 15 | 13 |
| inventory public snapshot | 4 | 7 | 0 |
| review create | 4 | 8 | 24 |
| review edit | 4 | 22 | 20 |
| rating summary cold | 3 | 9 | 0 |
| rating summary warm | 1 | 1 | 0 |
| review hide | 5 | 10 | 17 |
| rating reconciliation | 4 | 99 | 57 |

Cold menu and rating snapshots versus warm snapshots show the benefit of targeted five-second caches; inventory uses current indexed reads with revision-stability checks. Representative public join and image lookups select tenant indexes. No comparable inventory/review endpoints existed before these changes, so no invented before/after latency measurement is reported. Maintenance reconciliation is intentionally costlier and never runs per public request. Normal mutation bounds: menu bulk ten, CSV twenty, stock bulk five. DO fan-out/session/revision operations and alarm/storage writes must be budgeted separately. Menu/review caches are bounded to 128 entries; all external JSON stays no-store.

## Free-tier capacity and limitations

Official sources rechecked: [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/). D1 Free: 5 million row reads/day, 100000 writes/day, 500 MB per database within 5 GB account storage; 50 queries/invocation. Workers Free: 100000 requests/day, 10 ms HTTP CPU. Account usage and current provider limits remain authoritative. Application caps cannot guarantee zero provider charges.

Existing sensor cost remains approximately ten D1 writes per accepted frame; no sensor ingestion architecture changed. Sensor-only projections (one sensor/cafe) are 57600/172800/288000/576000 writes/day for 1/3/5/10 cafes at 15 seconds, or 14400/43200/72000/144000 at 60 seconds. Business/index/audit/connection/session/retry overhead is additional. Ten sensors at 60 seconds already exceed the listed D1 write allowance; do not silently change cadence or freshness thresholds.

The requested full matrix of 1/3/5/10 cafes, 50/100/500 concurrent clients and 100/500/1000 daily users across ALL Phase 11 workloads has NOT been run because 11D–11H are not implemented. Prior Phase 7.2 workloads remain historical evidence, not a complete Phase 11 capacity test. No claim of sufficient headroom for all scenarios, distributed abuse resistance or production CPU guarantees is made. Measuring/protecting the complete workload is still required before a release.

## Remaining work and exact continuation

Continue with 11D promotion engine, then 11E existing analytics extension, 11F aggregate statistical APIs, 11G in-app notifications and 11H measured/estimated resource monitoring and optional-work controls. Do not duplicate the implemented A–C services, existing analytics DO or history abstractions. Update contracts and measure/test each phase before proceeding. Add the full realistic mixed workload matrix only once those operations exist. Physical Android transport/calibration/thermal validation remains outside this local checkpoint. No later unrelated phases, checkout changes or production operations are authorized.

## Migration, rollback and future production checklist

Local Node startup applies additive migrations to its configured local database. Cloudflare integration tests create a temporary persistence directory and apply all twelve D1 migrations locally. Never point demonstrations/tests at default production data. Run npm ci, npm test, focused sensors and sequential browser/E2E/Cloudflare suites; BROWSER_PATH is recorded in progress. WRANGLER_SEND_METRICS=false keeps local tooling telemetry off; no remote-binding mode is used by the D1 probe.

Rollback means compatible code/feature shutdown while retaining additive tables, immutable audits, media read bindings and cumulative DO migration history. Do not drop tables, reset user_version, reseed real data or apply destructive down-migrations. 0010 performs a one-time counter backfill and rejects inconsistent over-quota preexisting data rather than deleting it; inspect and prepare an authorized recovery plan before any later production migration. Tombstone pruning requires reviewed quiescent maintenance. Do not remove R2 read bindings while R2-only objects exist.

Before any future authorized release: complete 11D–11H and their documentation; validate complete OpenAPI/collection and statistical/research handoff; run mixed load/row/index/DO accounting with sensor traffic; verify account-wide free quotas and flags; rehearse backups/migrations/compatible recovery locally; confirm RBAC/session revocation and media visibility; preserve Android protocol and original frontend fidelity; obtain explicit deployment authorization. This report does not authorize a deployment.
