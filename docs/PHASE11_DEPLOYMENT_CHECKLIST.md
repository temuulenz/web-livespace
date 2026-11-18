# Phase 11 staging and production checklist

2026-11-17 review recommendation: **NO-GO for production**. These are future operator procedures, not instructions executed by this review or authorization to deploy/create resources/change production. Every unchecked gate needs evidence and an accountable operator. Read PHASE11_DEPLOYMENT_REVIEW.md and PHASE11_ROLLBACK_PLAN.md first.

## Release gates

- [ ] Record release artifact checksum/source identity, Node/Wrangler versions, configuration, migration files and test evidence. Include the authority-race correction and tests/phase11-deployment.test.mjs. Preserve frontend and original fidelity fixtures.
- [ ] Decide scope: backend-only pilot with disabled analytics/demo UI, or full A–H integration. For full launch, replace the customer mock through a separately reviewed frontend task and complete authenticated end-to-end journeys; do not enable fake OTP/visits as real services.
- [ ] Use authorized read-only account access to record deployed Worker version, D1 migration ledger/schema, effective variables/bindings, secret names (never values), cumulative DO migrations, R2-only references and plan/account usage. Do not rely on historical IDs/version claims.
- [ ] Close all High findings R02–R06 and assign/accept Medium limitations with concrete pilot limits and response owners. No production approval is implied by a green local suite.
- [ ] Coordinate existing main-branch automatic deployment settings with the release owner. This review makes no Git or pipeline changes; an unrelated push must not replace a reviewed release mid-migration.

## Isolated staging procedure

1. Choose an approved staging destination. Default rehearsal is local workerd with disposable persistence; a hosted staging deployment/resource creation requires separate authorization. Do not run remote commands from the production wrangler.jsonc.
2. Prepare a separate complete staging configuration, based on the current cumulative configuration: different Worker name, D1 name/ID, all four DO bindings/classes/migration tags, independent private R2/KV only if already approved for the rehearsal, asset binding and compatibility settings. Confirm no production IDs/resources remain. There is no checked-in [env.staging] block; --env alone is insufficient evidence of isolation. Never reuse production cookies/tokens/admin accounts.
3. Pin the actual Node runtime and lockfile; run npm ci. Set WRANGLER_SEND_METRICS=false for local checks. Browser checks use an installed Chromium via BROWSER_PATH and a disposable profile; BROWSER_NO_SANDBOX=1 was required in the review environment, not a recommended production browser setting.
4. Make a private representative, sanitized database copy or a synthetic fixture covering active/hidden cafes, tenants, users/disabled roles, menu limits/media/pending objects, inventory receipts, review aggregates, schedules, analytics summaries and pending notifications. No production dump may enter public assets or source control. Preserve stable correctness IDs in any authorized recovery copy.
5. Back up the pre-upgrade fixture using the procedure below. Apply ordered additive migrations to the isolated copy. Node startup migrates automatically to version 12; D1 requires 0001–0016 according to its existing migration ledger. Never reseed an existing deployment. Inspect legacy media/menu counts first: 0010 can abort on over-cap data rather than delete it.
6. Run integrity_check and foreign_key_check; compare tenant/entity counts, ownership, immutable identity, quota counters and rating summaries before/after. Verify rollback on an intentionally failed transaction, not just fresh-empty creation. Measure migration elapsed time/space and verify the pre-upgrade backup can actually be restored into another isolated database.
7. Configure one coherent small-pilot policy: explicit sensor cadence/stale/offline values, local timezone semantics, analytics flag/session/day/cohort/retention/range caps, notification cooldown/day limit/reminder horizon, background/page/connection/media/CSV limits. Keep baseline production flags off until the separate pilot choice is approved; enabling analytics is not required to prove disabled behavior. Ensure warning < critical. Run an isolated second profile with analytics on to verify E/F.
8. Node: set LS_DATA_DIR and LS_DB_FILE to private persistent staging paths, LS_SEED_DEMO=0 for a copied dataset, NODE_ENV=production behind controlled HTTPS, secure cookies, and LS_TRUST_PROXY=1 only when the backend is unreachable directly and the proxy replaces forwarded headers. Bind loopback/private network; forward WS and unbuffered SSE. Bootstrap only isolated users with existing admin tooling; do not retain a bootstrap password in the service environment.
9. Cloudflare local commands must explicitly use the reviewed isolated config and persistence path, for example `npx wrangler d1 migrations apply STAGING_DB --local --config /private/staging/wrangler.jsonc --persist-to /private/staging/state`, then `npx wrangler dev --local --config /private/staging/wrangler.jsonc --persist-to /private/staging/state`. Dry-run bundle with that config. Hosted commands require staging approval and a second check of target IDs; never silently change --local to --remote.
10. Warm the API to initialize AppBackend maintenance; confirm the alarm executes and continues while clients are idle. Confirm AnalyticsAggregator pending counters flush/retry/recover, including disabled→enabled handling. No Cloudflare Cron/Queue/email provider is configured; do not assume an external scheduler exists.
11. Run all smoke tests below on both Node and local/authorized hosted Cloudflare. Stop/restart processes and simulate ambiguous writes, lost delivery, quota rejection and backend/storage errors. Check durable state and lack of successful ACK/receipt on failed persistence.
12. Measure representative retained-data reports, comparisons, platform scans, CSV pages, queue age/drain, media failures, concurrent tenants and normal sensor latency under approved production limits. The existing load harness raises intake/report limits only in its disposable fixture. Do not copy those overrides into production. Record actual runtime/provider/account headroom separately from local timings.
13. Rehearse recovery with the exact candidate recovery artifact and cumulative bindings. Restore backup into an isolated database and run the same integrity/security/canary tests. Record observed RTO and data loss window; choose approved RTO/RPO with the release owner rather than inventing them.

## Backup procedure

All backups contain private data/credentials and must be encrypted/access-controlled, excluded from asset directories/Git and retained under an approved policy. Record UTC time, source identity, schema/migration ledger, release/config checksums, byte counts and SHA-256 checksums. Test restore, not just export exit status.

**Node SQLite and files**

- Quiesce ingestion/domain writes and stop the service gracefully for a consistent multi-store backup. Suspend simulators/clients without deleting outboxes; retain stable message IDs for replay.
- With the service stopped and no other DB writer, use SQLite's backup API or `VACUUM INTO` to a new private destination. Do not copy a live main DB without its WAL and assume it is complete. An offline copy of the entire data directory is also acceptable when all DB handles are closed.
- Include LS_DB_FILE even if outside LS_DATA_DIR, every `LS_DATA_DIR/analytics/*.sqlite` collector and any associated WAL/SHM when not cleanly closed, uploads/menu files, deployment/config manifests and private key material under separate access policy. Main SQLite alone loses pending analytics/files.
- Open a copy of the backup; require integrity_check=ok and zero foreign_key_check rows. Compare critical counts/receipt identities, media checksums/paths, quota counters and rating aggregates. Start the candidate on a restored isolated directory, never on the backup itself. Verify sensor duplicate replay and unflushed analytics recovery. Resume writers only once backup consistency is established.

**Cloudflare D1, DO and media**

- A future authorized operator first records current deployment/Time Travel bookmark and migration ledger and exports D1 to a fresh private file: `npx wrangler d1 export livespace --remote --config wrangler.jsonc --output /private/backups/livespace-PRE_RELEASE.sql`. This command is a future production read/export procedure and was not run by this review.
- D1 export is not a complete application backup. D1 Time Travel does not snapshot the separate SensorGateway/AppBackend/BrowserRoom/AnalyticsAggregator namespaces, R2 bytes, KV or assets. Quiesce domain/telemetry/analytics writes for a consistent recovery point; drain or account for all pending collectors/outbox work and preserve their namespace identities. Do not delete DO namespaces or claim a D1 SQL export contains pending counters.
- Record recovery options/retention for the actual account and namespaces. If a recoverable snapshot/export path for correctness-bearing DO state is unavailable, explicitly bound the outage/data-loss risk and prefer compatible code recovery that preserves existing namespaces. This is an unresolved production gate, not permission to discard their data.
- Inventory D1-backed and R2-only media pointers, retain private bucket read access and independent byte backups/manifests under approved storage policy. Preserve D1 blobs for migrated legacy photos. KV public cache is rebuildable; clear/rebuild only under an approved cache procedure.
- Import/export restoration must first be tested into an isolated resource with no production binding. Confirm schema, triggers, tenant references, receipt identities, media readability and queue consistency. Never feed a full dump into a populated production DB as an automatic rollback. No remote production export/restore was executed here.

## Smoke tests and expected outcomes

Use isolated accounts A/B with different cafe owners, a customer, enabled admin, disabled account and separate simulated device. For any later authorized production smoke, use preapproved test entities only; do not use scripts/cloudflare-production-verify.mjs blindly: it can register devices/write readings. Never manufacture real-source hardware readings.

| Check | Expected result |
|---|---|
| HTTPS, assets, config, health | Correct origin, CSP/no secrets; health plus actual feature canaries succeed; direct backend inaccessible behind proxy; secure cookies |
| Login/logout/disable/role/ownership transfer | Existing session APIs work; revoked credentials fail; cross-origin writes 403; foreign owner data 404; in-flight lost authority rolls back (409), no audit/receipt/outbox partial write |
| Menu CRUD/publish/archive/version | Draft hidden, publication requires category+product, archived hidden, stale edit conflicts, foreign references denied |
| CSV | Preview creates nothing; explicit identical confirm imports drafts once; altered preview, foreign category, malformed/oversized/too-many rows rejected; failed import atomic |
| Media | Valid raster roundtrip and ETag; private/hidden/foreign bytes unavailable even with If-None-Match; SVG/MIME spoof/body/quota rejection; failed pending upload recoverable without deleting referenced bytes |
| Stock | Configure quantity/availability, zero→sold_out, negative/conflicting source rejected; retry same key has no second movement; version race one winner; hidden quantity never public |
| Realtime | Node scoped inventory SSE; Cloudflare room snapshot/delta; reconnect/revision-gap refresh; no cross-cafe/private notification leakage; polling still recovers |
| Reviews | Customer create/edit/remove; owner reply/report cannot hide; admin hide/restore updates exact sums/bins; no-review null; private IDs/reasons absent publicly |
| Promotions | Fixed/percentage/target/local recurrence/overnight/start/end; effective price integer and nonstacking; boundaries take effect across warm menu cache |
| Analytics off/on/paused | Off returns disabled 404; on session cookie + 202 durable intake, same-ID retry duplicate, changed ID payload conflict, invalid metadata/reference 422, caps 429; pause 503 affects optional collection only |
| Reports/CSV | Current authorized owner/admin only; foreign access denied even with warm cache; local exclusive ranges/comparison; small cohort keys and hashes absent; real versus simulated/stale/invalid exclusion; unavailable metrics remain null; export safe page only |
| Notifications | All nine trigger families reach only eligible current recipients; marketing opt-in+favorite; unread/read/read-all isolation; prefs/cooldown/day budget/dedup survive restart; sensor repeated offline no storm, no first-connect recovery |
| Resources | Admin platform versus owner own scope; provider-unavailable explicit; threshold warning→critical independent per tenant/severity; lower media/CSV caps atomic; quota failure preserves durable sensor ACK rules |
| Persistence/restart | Same device/message retry after restart/retention duplicate; dirty collector survives restart and monotonic flush retry; stock receipt survives; inbox/read state persists; failed storage never produces successful domain receipt |
| Map | CDN/SRI/tile/glyph checks and real WebGL browser on target network; blocked startup uses SVG/markers; note late-load provider failure limitation; attribution retained, browser location not uploaded |
| Idle/jobs/monitoring | Alarm/timer runs without foreground traffic, oldest due event age drains within approved pilot bound, retention lag visible, injected job/dependency failure detected by independent monitor |
| Recovery | Candidate compatible recovery preserves schema, namespaces, receipts/media and identity; restored isolated backup passes all critical canaries |

## Production checklist — do not execute without separate release authorization

- [ ] All High gates closed, smoke evidence reviewed, launch scope/customer UI truthful, remaining risks accepted by release owner.
- [ ] Exact source/config/recovery artifacts and private tested backup available; restore owner, incident commander, RTO/RPO and stop criteria assigned.
- [ ] Account plan/bindings/secret names/remaining usage inspected; no paid service enabled; sensor fleet and browsing/report/queue budgets fit measured headroom.
- [ ] Observability and independent alert routes active, retention/privacy policy approved, no secrets in logs, dashboards show unavailable/reset metrics honestly.
- [ ] Separate approval names target Worker/database and authorized maintenance window. Coordinate writers and automatic deployment pipeline; never run a reset/reseed/down-migration.
- [ ] Quiesce/drain where needed, capture final consistent backup/bookmark, apply only reviewed pending additive D1 migrations and verify them before new code accepts traffic. For Node, expect startup migration and retain backup on failure.
- [ ] Deploy only approved compatible artifact retaining cumulative DO classes, media read bindings and private storage. Warm API/jobs and execute authorized minimal canaries; enable optional analytics/R2/KV only as explicitly approved.
- [ ] Observe normal APIs, sensors, queue age/background failures, dependency health and account usage through the approved soak window. Stop rollout on auth/tenant leak, durable ACK inconsistency, failed migration, growing undrainable queue, integrity error, media loss or quota burn exceeding the agreed budget.
- [ ] Close the release only after deployed-version/config evidence, canaries, monitoring and recovery availability are recorded. Otherwise invoke the reviewed recovery procedure; do not erase data to make health green.
