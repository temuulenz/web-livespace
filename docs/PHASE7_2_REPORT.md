# Phase 7.2 local architecture work

The BrewFlow PDF and docs/TESTING.md are absent from this checkout. This review uses the supplied requirements and existing Cloudflare/sensor testing guides; tutorial-specific conformance cannot be verified. No production changes, remote resource creation, Git operations, or Phase 11 business features are authorized.

## A — baseline audit

The entry Worker sends `/api/*` to the singleton SQLite AppBackend DO, `/ws/sensors` to credential-scoped SensorGateway DOs, and static paths to the existing Static Assets binding. Wrangler already routes assets first except `/api/*` and `/ws/*`; the asset packager publishes an allowlist and security `_headers`. Keep that configuration. API and upgrade routes remain Worker-first.

Phase 7.1 is present as uncommitted work and must remain intact: bounded latest seeks, partial legacy index 0006, five-second public response caching, ten-minute shared history results, authorization outside private cache hits, generation invalidation, and quota backoff. Its measured fixture summary costs four reads; public empty legacy queries cost zero. Ingestion costs ten D1 row writes for an uncalibrated observation. Existing schema is authoritative for sessions, cafe ownership, device credentials, measurements and replay receipts.

Browser delivery currently polls every ten seconds on Cloudflare, with SSE on Node. Healthy 50/100/500 browsers would produce 432,000/864,000/4,320,000 live polls per day if visible continuously. Hidden polling is paused. History refresh is ten minutes; dashboard device/detail refresh is 30 seconds. Measurements have a separate opt-in 15-second timer. Avoid replacing these safeguards.

Partner uploads send 3–4 base64 images in JSON, capped to 1 MiB per image on Cloudflare. D1 stores photo blobs; Node stores files. Byte validation checks signatures only and currently accepts truncated signature fixtures, which needs stronger validation. D1 photo reads are authorization scoped but materialize the entire blob and lack conditional responses. Photos are private application material, never automatically public cafe media.

The SensorGateway already calls acceptWebSocket and serializes connection metadata, but 30-second credential alarms and the admission coordinator add DO requests/storage. All HTTP API processing currently shares one AppBackend DO; it is a coordination/throughput bottleneck rather than a private-data broadcast room. Browser rooms must be cafe scoped and use separate public/private projections. Persisted telemetry ACK must stay independent of notification success.

Known remaining expensive queries: cold 24-hour history aggregation, expression-sorted selector for null-people devices within a bounded range, admin received-time count, and filtered admin measurement lists. Admin/owner payloads include many records; do not add new automatic full-dashboard reloads per realtime event. No existing real-data forecasting service, R2, KV, browser rooms, or business analytics aggregation exists.

## G — regression and deployment preparation

The user requested starting at G. Existing uncommitted A–F implementations were inspected and preserved; they are not attributed to this regression pass. Existing architecture/security decisions are described in the linked service documents. No production data, remote resources, branches, commits, deployments or paid plans were changed. No Phase 11 feature was started.

This pass adds real concurrent-intake analytics flush coverage, full-batch conflict rollback coverage, browser reconnect/missed snapshot recovery with duplicate and obsolete-socket suppression, and explicit unauthorized/cross-cafe browser subscription checks. Existing tests exercise R2 journaling and reconciliation, unsafe images, ETags/private authorization, optional binding failure, KV outage/invalidation/stampede/budget behavior, durable analytics receipts, ambiguous flush retry, D1 quota handling and Node fallback. Workerd integration exercises native hibernation API use, attachments, runtime restart recovery and revocation; it does not prove remote idle eviction or duration billing.

The load harness now measures allocated local D1 SQLite/WAL/SHM file bytes, because D1 rejects PRAGMA page_count and Wrangler CLI omits size_after for this probe. Test setup remains local and disposable. Original simulation/style fixtures and the v1 database fixture were not regenerated.

| Regression suite | Result |
| --- | --- |
| npm ci | Passed; audit found zero vulnerabilities |
| npm test | 110 passed, zero failed |
| npm run test:sensors | 26 passed (overlap with npm test) |
| Static Chromium | 16 passed |
| Node + Chromium E2E | 13 passed |
| Cloudflare + Chromium | See final validation entry below |
| D1 read benchmark | Passed; four-read summary, zero-read empty legacy lookup retained |
| D1 write benchmark | Passed; ten writes/accepted uncalibrated reading retained |
| Wrangler dry-run | Passed; no deployment |

The original reported 142 checks consisted of 91 Node, 16 static browser, 13 E2E and 22 Cloudflare checks. The expanded suites preserve their coverage; test-count changes alone do not prove hardware behavior. Focused sensor tests overlap the main Node suite and are not added again to the total.

## Remaining rollout gates

- Review all pre-existing and new uncommitted code together. The singleton API DO, cold history aggregation and per-private-subscriber authorization reads remain scalability limits.
- Fleet cadence and usage budgets require an operator decision: at 15 seconds one sensor already exceeds the 50% D1 write target; ten sensors at 60 seconds exceed the Free daily hard limit. See FREE_TIER_CAPACITY.md.
- Obtain explicit approval for backup/export, additive remote migrations, new DO namespaces via deployment, and any optional private R2/KV resources. No such actions were taken here. Keep R2/KV/analytics off until deliberately approved.
- Existing wrangler.recovery.jsonc packages a historical production snapshot with only the original DO classes. It is not a Phase 7.2 rollback artifact. The new wrangler.phase72-recovery.jsonc disables the new feature flags while preserving cumulative class migrations. It uses current code and is a feature shutdown configuration, not a code rollback. Preserve any subsequently approved R2 read binding for R2-only photos. A separate reviewed code rollback package is still needed before rollout. Do not remove namespaces or reverse additive schemas.
- After an approved pilot, verify account CPU, DO duration/SQL rows, D1 usage, retention/storage growth, and actual private-session revocation timing. Local CPU/process timing is not Cloudflare billing evidence.
- Physical Android TLS/reconnect/outbox replay, long-duration soak, distributed abuse protection and real sensor calibration remain unverified. No trained model or production capacity guarantee is claimed.

## Suggested Phase 11 sequencing

11A: agree on tenant-scoped business schemas and permission policies, review additive migrations, and define which explicitly public catalog projections may be cached. Do not use KV for inventory/orders/credentials. 11B: approve a minimal privacy-preserving analytics pilot, validate counters and resource budgets against real usage, then design owner hourly/daily views with explicit event-count semantics. Neither phase is implemented by this regression pass.

## Files touched by the G pass

- tests/analytics.test.mjs: concurrent flush/intake and conflict rollback regressions.
- tests/browser-rooms-client.test.mjs: duplicate versions, reconnect snapshot recovery and obsolete socket isolation.
- tests/cloudflare.mjs: anonymous, role and cross-cafe browser subscription denial.
- scripts/phase72-load.mjs: local allocated D1 file-size measurement.
- wrangler.phase72-recovery.jsonc: feature shutdown configuration retaining new DO classes and migration history.
- docs/FREE_TIER_CAPACITY.md: official allowances, internal targets, measured costs, daily projections and limits.
- docs/PHASE7_2_REPORT.md, docs/CLOUDFLARE_TESTING.md, docs/CLOUDFLARE_DEPLOYMENT.md: current verification evidence and approval/rollback gates.

Other working-tree changes predate this pass and were preserved. Required architecture, media, cache, realtime and analytics documents already existed and remain the service-level references.

## Final local validation

All 162 regression checks passed (110 Node + 16 static Chromium + 13 Node E2E + 23 local Cloudflare). The additional focused 26 sensor tests passed and overlap Node coverage. Both current Worker and feature-shutdown Wrangler dry-runs passed without deployment. Whitespace checks passed.

All 12 local concurrency scenarios passed: 1/3/5/10 cafes with the same number of simulated sensors, each with 50/100/500 browsers. Reconnect waves, duplicate offline replay, optional local R2/KV, analytics flush and cold restart recovery passed. At 10 cafes/500 browsers, the first completed run measured API p50/p95/p99 5.0/6.8/37.1 ms, sensor-to-browser 539/589/590 ms, and reconnect snapshot 173/226/227 ms. These are short local wall-clock measurements, not production latency or Free CPU billing. The load report is regenerated when rerun; use its current values for detailed comparisons.

The 100-request public-profile trial yielded 99 cache hits, one miss, one KV read and one KV write. Cold restart recovered the profile from KV with no authoritative profile miss or redundant KV write. A 32-event analytics batch plus duplicate retry used 134 observed DO SQL row writes and one alarm write, then two D1 row writes for one summary; repeated flush wrote zero D1 rows. These are measured instrumented counters, including SQLite index work where exposed, not account totals. The R2 trial stored three pointers, zero legacy blobs and zero pending objects; private authorization and conditional ETags passed. Its 632-byte image is a correctness fixture, not a representative 100–300 KiB bandwidth load test.

The row-budget fixture retained four reads per optimized summary, zero for empty legacy lookup, and ten writes per telemetry acceptance. Cold historical aggregation still cost 11,617 reads. The baseline comparisons and daily workload assumptions are in D1_OPTIMIZATION_REPORT.md and FREE_TIER_CAPACITY.md. No before/after internet latency benchmark or 24-hour load was run. Deployment is locally validated but remains gated on approval, cadence/capacity selection, a reviewed code rollback artifact and physical-device checks.

The optional `test:visual` screenshot run also passed the same 16 static-browser checks; it is overlapping coverage and is not included again in the 162 total.
The separate visitor visual-fidelity suite passed all five original pixel/lifecycle scenarios. These comparisons preserve the frozen reference behavior; no baseline was regenerated.

The corrected storage-report rerun also passed all 12 scenarios and optional-service checks. Allocated local D1 files (including WAL/SHM) grew from 761,832 to 4,484,776 bytes across the mixed fixture. Local workerd process CPU totaled 31.96 seconds; neither figure represents production billing. Final 10-cafe/500-browser p95 API/realtime/reconnect timings were 6.3/554.3/707.8 ms.
