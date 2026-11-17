# Phase 11 production readiness and staging checkpoint

2026-11-17. **Staging: GO for isolated local validation; NO-GO for hosted deployment until separate infrastructure/approval gates are met. Production: NO-GO.** No production or hosted deployment, production data change, Git mutation, teammate frontend edit, paid resource activation or Phase 12 work occurred.

This checkpoint continues, rather than replaces, the [deployment review](PHASE11_DEPLOYMENT_REVIEW.md). The original A–C transaction-time authorization fix is preserved. Read the [staging runbook](PHASE11_STAGING_RUNBOOK.md), [backup report](PHASE11_BACKUP_RECOVERY_REPORT.md), [monitoring runbook](PHASE11_MONITORING_RUNBOOK.md) and [launch inventory](PHASE11_LAUNCH_SCOPE.md) for procedures and limits. Existing Phase 11 acceptance/report/progress, API/permission/migration/security guides, Node/Cloudflare configurations and previous deployment/sensor documentation were reviewed. Historical completion/test statements are not evidence of current production state.

## Work safely completed

- Added a guarded local-only staging template and runner: distinct Worker/database identifiers, no production account/routes/external writable resources, explicit local execution and synthetic-only seed. Default-off and locally enabled analytics, private roles, feature canaries and restored HTTP state are exercised.
- Implemented offline synthetic full-directory backup/verification with no overwrite/symlink/overlap, private permissions, exact file/record/schema digests, integrity/FK/index/trigger checks and domain readback. Validated Node main DB + collectors + media, and local workerd D1/DO/blob persistence. Rehearsed actual local D1 SQL export/import, fixing a discovered restore-order hazard in the **rehearsal tooling** without changing database migrations.
- Fixed Cloudflare D1-backed menu image responses: returned BLOB arrays now become exact Uint8Array HTTP bytes; missing/truncated bytes fail 503. Versioned opaque D1 validators invalidate formerly cached empty responses. Exact private/public/restored-image bytes are now asserted, beyond the old HTTP-status-only check.
- Fixed the documented Node >=22.13 minimum: replaced unsupported StatementSync.columns() inspection with all() for statement execution and tracked wrapper-owned nested transactions where isTransaction is unavailable. Full native suites pass on both 22.13.0 and 26.13.0; minimum-version browser E2E and offline recovery pass. This does not pin the deployed runtime or recommend an old patch release.
- Separated platform and cafe resource-notification cooldown namespaces; a cafe literally named platform can no longer suppress the global admin alert. Native and actual local D1 probes cover both alerts.
- Isolated Node optional collector failures from the independent inbox/resource maintenance pass; both failure logging and continued core execution are regression tested.
- Added uncached minimal GET /api/v1/ready (200/503), server-generated X-Request-ID, fixed-schema operational HTTP/job failure logs without request/error/SQL/identity serialization, job freshness timestamps, 5xx counters and tenant-scoped notification due age. Public /health and existing APIs remain compatible; no new runtime dependency, schema migration or per-telemetry DB write.
- Restored the documented browser-only location capability by allowing geolocation=(self) in both backend response policies, retaining browser consent and camera/microphone denial. An isolated real-browser probe with injected synthetic coordinates passes an allowed-origin case and a policy-denied control; coordinates are absent from observed requests. No location ingestion/storage or frontend handler was added.
- Corrected resource-monitor analytics “today” from UTC to the same Ulaanbaatar day used by intake/evaluation, with explicit analytics/sensor timezone labels. Sensor daily counts remain explicitly UTC.
- Prepared machine-readable proposed alert rules and responder procedures; kept production observability/analytics flags unchanged. Inventory of all customer mock workflows maps real APIs and identifies unsupported phone/going/order contracts without silently changing launch scope.
- Extended the local load artifact with observed HTTP status counts, per-case counts, socket failure assertions and explicit completed-check families. Added synthetic retained-history and bounded notification-drain probes. Local evidence is distinguished from hosted/provider/account capacity throughout.

## Remote infrastructure verification

Read-only commands attempted again:

```sh
WRANGLER_SEND_METRICS=false npx wrangler deployments list --name livespace
WRANGLER_SEND_METRICS=false npx wrangler d1 migrations list livespace --remote
WRANGLER_SEND_METRICS=false npx wrangler secret list --name livespace
```

All three exited 1: Wrangler requires a noninteractive CLOUDFLARE_API_TOKEN in this execution environment. No temporary account, login mutation or new resource was created, and secret values were never requested or exposed. This does not establish what credentials a human operator may possess outside the environment. Remote schema/ledger/version/variables/bindings/secret inventory/account usage were **not** verified.

| Area | Repository expectation | Remote evidence / action |
|---|---|---|
| Target | Existing Worker livespace, pinned account/D1 identifiers in wrangler.jsonc | Current deployed version and automatic pipeline state unknown; authorized account operator must record them |
| D1 | DB binding, ordered migrations 0001–0016; Node equivalent schema 12 | Local ledger through 16 verified; remote ledger/schema unknown. Read only d1_migrations/sqlite_master/table/index metadata, not credential/customer rows, then compare exact pending files |
| DO | SENSORS/SensorGateway, BACKEND/AppBackend, BROWSER_ROOMS/BrowserRoom, ANALYTICS/AnalyticsAggregator with cumulative tags | Actual namespace bindings/deployment history unknown; never delete/rebind namespaces as a shortcut |
| Flags | Browser realtime=1; analytics/R2/KV=0; poll=10 s, expected sensor cadence=15 s, stale=30 s; request logs default off | Effective deployed values unverified. Explicitly align remaining cadence/offline/session/proxy limits with the actual runtime |
| Storage | D1 authoritative; optional private MEDIA R2 and PUBLIC_CACHE KV absent in current production config | Actual existing R2-only pointers/buckets/read dependencies unknown; flags off do not authorize dropping read bindings |
| Jobs | Node timer; AppBackend/AnalyticsAggregator/gateway/room alarms; no Queue/Cron/email provider config | Local timers/alarms exercised; hosted liveness, eviction/backlog and external channel state unverified |
| Logs/alerts | Production observability.enabled=false; new local staging observability/log flag on | No deployed independent monitor/pager/sink verified; configure only under release approval |
| Secrets | Existing DB session/device hashes; deployment token outside source; no external analytics/email secret required | Secret-name command could not authenticate. Do not dump secret values or copy bootstrap/device credentials into logs |
| Plan/limits | Conservative application controls, no billing enablement | Current account plan/shared usage/headroom unavailable; local counters cannot certify provider quota |

Authorized operators can later compare remote migration names against the 16 repository filenames and inspect schema/index metadata, deployment versions, binding/flag names and plan usage. No remote migration, seed, export, health warmup or functional mutation was performed here. In particular even a “health” request can wake the old deployed application; this checkpoint did not use production endpoints as staging.

## Blocker matrix

Closed locally is an engineering result, never a declaration that production has received a fix. No Critical compromise/data-loss condition was demonstrated; High items block the intended production rollout. Medium/Low findings require explicit disposition rather than silent acceptance.

| Blocker | Severity | Status | Evidence | Required action | Responsible role |
|---|---|---|---|---|---|
| R01 transaction-time A–C authority races | High | Closed locally, preserved | Nine regression cases plus actual D1 authority probes; all current suites include the fix | Include exact corrected artifact in hosted staging/release and repeat role/ownership canaries | Backend/release owner |
| R02 remote version/schema/config unknown | High | Blocked externally | Three read-only CLI attempts fail for missing noninteractive token; no remote ledger | Supply approved read-only access, inventory target/version/schema/flags/bindings and compare migrations | Cloudflare account operator |
| R03 recoverable production backup/artifact | High | Partially resolved locally | Node and local workerd full-state restore plus D1 export/import verified; hosted data/DO/media/recovery artifact unavailable | Approved representative private backup/restore, hosted consistency and exact compatible code recovery package; assign RTO/RPO | Database/storage/release operator |
| R04 full frontend launch / optional analytics | High | Open integration/policy gate | Customer adapter still mock; full workflow inventory maps unsupported and real APIs; production analytics remains off | Complete frontend HTTP journeys and explicit scope/privacy/activation decisions; do not silently omit visible flows | Frontend lead + product/release owner |
| R05 independent monitoring/paging | High | Backend instrumentation/config resolved locally; operations open | Ready/correlation/privacy tests, queue/job/5xx metrics and proposed alert config; no live sink or responder drill | Connect independent probes/provider metrics/private logs, approve retention, drill actual alert delivery/ack | Operations/backend on-call |
| R06 real capacity/headroom | High | Local validation extended; hosted/account gate open | 12-case harness plus retained-history/drain probes; no hosted soak/account usage | Set approved fleet/cold-report/polling/queue budgets, test hosted staging after approval, inspect shared account usage | Cloudflare/operator + backend performance owner |
| R07 notification drain/latency | Medium | Measured, policy still open | 100 events/one recipient take 200 bounded steps; Node timer-only projection 6000 s | Approve workload/latency bounds and alert disposition; optimization needs an agreed delivery target, not an invented SLA | Product + backend/operations |
| R08 retained-history report scan cost | Medium | Measured; remains material capacity gate | 10k rows: 80,051 D1 reads; 50k: 400,074, 19 statements for seven days + comparison | Budget cold reports/cache/polling on real plan; representative multi-tenant retention rehearsal; any aggregate redesign separately reviewed | Backend performance + account operator |
| R09 distributed admission/key-map bounds | Medium | Open policy/deployment limit | Runtime-local security limits remain; no globally authoritative edge limiter or strict active-key cap | Validate ingress/edge abuse protection and bounded policy preserving auth/sensor safety; no arbitrary eviction policy introduced | Security/platform operator |
| R10 indefinite audit/receipt/tombstone storage | Medium | Documented, unchanged correctness policy | Permanent stock/sensor/delivery identities retained; aggregate/inbox cleanup bounded and laggable | Approve storage runway/private retention and identity-preserving archive/reconciliation; never delete dedup identities for quota | Data/backend/operator |
| R11 map permission/GL/fallback | Medium | Backend permission policy resolved locally; GL/late fallback open | Former geolocation=() contradicted documented click-to-locate; self-only policy passes synthetic browser/control checks. Live GL branch remains skipped, late fallback limitation unchanged | Hardware/target-network pin/directions and late-provider frontend disposition; retain browser-only coordinates | Frontend/QA + backend owner |
| R12 health versus readiness | Medium | Closed locally for schema canary, operational scope explicit | New no-store /ready, 503 fault test, local Node/Cloudflare healthy probes; /health preserved | Deploy approved code to isolated hosted staging; pair with dependency/jobs/media canaries and monitor | Backend/operations |
| R13 usage day mismatch | Medium | Closed locally | Local-boundary regression and shared service correction; explicit timezone labels | Use updated contract/display labels on integration; do not equate lagged flush usage to remaining admission | Backend/frontend owner |
| R14 stale historical/machine docs | Low | Current operational contract/handoffs updated | OpenAPI now 71 operations/54 paths; Postman 72; new checkpoint supersedes historical counts | Read new checkpoint; retain old reports as historical evidence | Documentation/release owner |
| R15 supported/deployed runtime validation | Medium | Minimum/current Node verified locally; deployed runtime/hardware open | Node 22.13.0 and 26.13.0 each pass 198 native tests; minimum-version E2E 13 and recovery pass; Wrangler 4.162.0 locally tested. No complete version/platform matrix or physical Android | Pin/retest actual hosted/Node runtime and hardware TLS/outbox/calibration/thermal before related claims | Runtime/Android QA owner |
| D1 naive dump restore order | High if used in production recovery | Local rehearsal tooling corrected; generic production import not approved | Initial composite-FK mismatch; definitions/indexes before data, triggers after data passes isolated D1 restore | Rehearse exact approved production-sized dump/import limits and trigger/materialized-state integrity; avoid blind populated DB import | Database/release operator |
| Node optional collector blocked core maintenance | High | Closed locally | Failed behavior pass formerly skipped the following inbox/resource pass; injected failure now logs safely, records failure and core still runs | Include fix and verify deployed job progress; repair failed collector without disabling independent jobs | Backend/operations |
| D1-backed menu image empty HTTP 200 | High | Closed locally | Exact-byte staging check failed despite 200; byte-array conversion and size check fix it; opaque validator version refreshes old caches | Release corrected adapter and exact-byte tests; verify private/public/ETag and restored bytes in hosted staging | Backend/media QA |
| Node >=22.13 SQLite compatibility | High | Closed locally | Minimum-version run exposed 12 unsupported metadata-related failures; all()/owned transaction tracking now pass 198 tests on both versions, minimum E2E and recovery | Include corrected adapter/helper; pin supported patched runtime and repeat target-specific checks | Backend/runtime owner |
| Global/cafe resource alert cooldown collision | Medium | Closed locally | Global scope formerly collided with cafe id platform; separate namespaces pass native and actual D1 two-notice probes | Release fix and verify independently connected alert delivery | Backend/operations |
| Hosted staging infrastructure and deployment permission | High for hosted staging | Not available, not deployed | Local-only config intentionally nondeployable and runner rejects remote/external targets | Approve dedicated resources/protected origin, private config, monitoring and remote deployment explicitly | Release + Cloudflare operator |

## Validation and capacity evidence

Environment: Node **v26.13.0** plus isolated official **v22.13.0** Linux x64 binary (archive SHA256 checked against that release’s published SHASUMS256.txt; no global installation), Wrangler **4.162.0**, installed Chromium via BROWSER_PATH, BROWSER_NO_SANDBOX=1 for disposable test profiles, WRANGLER_SEND_METRICS=false. All functional/load data was disposable and local. Final outcomes:

| Command/check | Result |
|---|---|
| npm ci | Exit 0, zero vulnerabilities; dependency install scripts blocked by npm policy, installed workerd/esbuild binaries worked; package/lockfile unchanged |
| npm test | **198 passed / 0 failed / 0 cancelled / 0 skipped / 0 todo** on Node 26.13.0 (7.07 s) and Node 22.13.0 (8.32 s). Includes prior nine authority-race cases plus twelve new operational/staging/media/cooldown/transaction cases |
| npm run test:sensors | **26 passed**, zero failures/skips; also exercised within final full Node run |
| npm run test:browser | **17 checks passed**, 0 failed; unchanged conditional live-GL branch skipped, SVG fallback checks pass |
| npm run test:e2e | **13 passed**, 0 failed on current runtime; isolated Node 22.13.0 also **13 passed**, 0 failed after compatibility correction |
| npm run test:visitor-visual | **11 original pixel/lifecycle checkpoints passed**, fixtures unchanged |
| npm run test:visual | **17 checks passed**, 0 failed; same conditional live-GL skip |
| npm run test:cloudflare | Final **29 checks passed**; includes strengthened exact private/public D1 image bytes, old-validator refresh and bounded automatic pong with validated interleaved public frames |
| node scripts/phase11-d1-check.mjs | Exit 0; actual local D1/R2 authority/version races, rollback, recovery, privacy, aggregates/resources and platform/cafe cooldown-isolation probes |
| node scripts/phase11-menu-demo.mjs | Exit 0; self-cleaning simulated menu/stock/review workflow |
| node scripts/phase11-menu-budget.mjs | Exit 0; cold 30-product menu **6 statements**, warm **2**, representative indexed plans |
| node scripts/phase11-backup-rehearsal.mjs | Exit 0; complete offline Node DB/collector/file restore, exact inventories, private inbox/read/preferences and durable domain readback on both Node 26.13.0 and 22.13.0 |
| node scripts/phase11-staging.mjs rehearse | Final exit 0; **35** local workerd smoke checks, full state-copy restore and corrected local D1 export/import/schema/record/constraint validation |
| node scripts/phase11-location-check.mjs | Exit 0; consented same-origin synthetic position succeeds, geolocation-denied control rejects, coordinates absent from observed requests; real GPS/GL unverified |
| node scripts/phase11-history-budget.mjs | Exit 0; **10k/50k** retained simulated observations, real report excludes them; measured rows and times below |
| node scripts/phase11-notification-drain.mjs | Exit 0; **100 delivered**, **0 pending**, **200** bounded steps; no overcharged recipient budget |
| node scripts/phase11-load.mjs | Successful sequential rerun exit 0; **12/12** scenarios, **36** nested session variants / **19,200** v2 events, all check families passed |
| npm run cf:write-budget | Exit 0; accepted sensor frame **[7,1,2] = 10** D1 writes; duplicates/control pings no telemetry writes |
| npm run cf:check | Exit 0; production-config bundle dry-run only |
| npx wrangler deploy --dry-run --config wrangler.staging.jsonc | Exit 0; staging bundle only, no deployment or remote binding validation |
| npm audit --json | Exit 0; **0** reported vulnerabilities |
| Native syntax / contracts / whitespace | **155** native modules checked, **0** syntax failures; OpenAPI **71 operations/54 paths**, Postman **72 requests**, monitoring/staging JSON parse; git diff --check passes |
| Read-only remote deployment/migration/secret-name commands | **3 exit-1 failures**, missing noninteractive API token; remote requirements remain unverified |

The final readiness limit/config checks affect only /ready. The completed matrix covers the common backend after the monitoring additions; subsequent D1 image-path, location-policy, cooldown and Node SQLite compatibility corrections were independently retested with strengthened Cloudflare and restored-image probes. The matrix does not upload menu images and is not presented as coverage of that formerly missed body conversion.

All twelve scenario results (same-host socket clients, not 500 full browser engines):

| Cafes | Sockets | Instrumented HTTP responses | HTTP 4xx/5xx in this subset | Hot API p95 ms | Realtime p95 ms | Reconnect p95 ms | 1000-session ingest p95 ms |
|---|---|---|---|---|---|---|---|
| 1 | 50 | 1649 | 0 | 29.10 | 547.76 | 358.02 | 356.34 |
| 1 | 100 | 1649 | 0 | 17.29 | 569.47 | 381.31 | 355.82 |
| 1 | 500 | 1649 | 0 | 16.06 | 655.64 | 1575.77 | 370.48 |
| 3 | 50 | 1679 | 0 | 14.46 | 568.81 | 275.80 | 375.50 |
| 3 | 100 | 1679 | 0 | 45.11 | 570.35 | 434.94 | 355.23 |
| 3 | 500 | 1679 | 0 | 14.00 | 631.46 | 1691.54 | 342.19 |
| 5 | 50 | 1709 | 0 | 14.85 | 542.30 | 160.78 | 240.23 |
| 5 | 100 | 1709 | 0 | 11.72 | 574.64 | 223.68 | 366.43 |
| 5 | 500 | 1709 | 0 | 13.82 | 586.48 | 816.55 | 371.09 |
| 10 | 50 | 1784 | 0 | 19.96 | 549.91 | 268.35 | 189.15 |
| 10 | 100 | 1784 | 0 | 14.01 | 562.53 | 283.72 | 198.42 |
| 10 | 500 | 1784 | 0 | 10.68 | 548.22 | 243.58 | 217.86 |

Instrumented HTTP subset: **20,624** responses, all 200/201/202 (**0% observed errors**); this counter covers the API helper and analytics intake. Direct media negative-authorization/ETag probes and WS upgrades are separately asserted and excluded from that denominator. Socket errors **0**; sampled per-case D1 failure counters **0**. This is not a global/provider error rate, nor proof there are no unobserved failures. Local workerd process-tree CPU **305.45 s**, allocated D1/WAL/SHM files **1,429,272→5,701,384 bytes**; DO files/provider accounting are separate. Latency is wall time, not provider CPU. Check families: durable sensor replay, 12 matrix cases/36 session variants, R2 authorization/ETag, KV cold restart, analytics dedup/flush, reconnect snapshots and zero unexpected socket errors.

Source reports: `.artifacts/phase11-load.json`, `phase11-history-budget.json`, `phase11-notification-drain.json`, `phase11-node-recovery.json`, `phase11-staging-rehearsal.json` and `phase11-menu-d1.json`. Sanitized logs/attempt summaries are retained privately under `.artifacts/phase11-readiness-checkpoint/`. Previously checked-in measurement JSON remains historical; original fidelity fixtures were not rewritten. No lint/typecheck/frontend build scripts exist; native syntax and Worker dry-run are the available static/build checks.


The retained-history probe uses simulated/test observations only and proves real reports exclude them. Its 50k-row cold report is about 0.65 s locally but reads 400,074 rows, so acceptable same-host latency does **not** make repeated cold reports inexpensive. The result is a single tenant/device and not full 90-day/high-cardinality retention. No production plan/usage or free-tier fit is inferred. Notification drain clocks advance explicitly; 200 calls took about 169 ms of in-memory service time, but a 30-second timer would take about 100 minutes without other invocations. Hosted alarm throughput/tenant scans/contention and end-to-end delivery are separate.

The original load run in this checkpoint stopped on a local Worker-restarted 503 during concurrent staging asset rebuilds, after two cases; the assertion remained intact and no retry was added to make it pass. The successful rerun below uses source/generated assets frozen and no concurrent browser/rehearsal workload. Additional failed attempts are retained: early rehearsal tooling exposed integer/export-path/dump-order issues; a stronger image-body assertion found and drove the D1 media fix. One later Cloudflare run failed because its heartbeat test assumed pong was the very next frame while a legitimate live.snapshot arrived. The corrected test requires pong within five seconds and rejects every interleaved frame except a privacy-checked live.snapshot for the expected cafe. Exact binary/validator assertions were added; no failure was skipped. The first Node 22.13.0 run passed 184/197: twelve failures traced to unavailable StatementSync.columns(), and one inventory assertion incorrectly searched random UUID text for the quantity digits 999. That assertion now checks the actual product/quantity fields; the privacy requirement is unchanged. Compatibility fixes and nested commit/rollback regression pass on both runtimes. See the [official 22.13 SQLite API](https://nodejs.org/download/release/v22.13.0/docs/api/sqlite.html); the package minimum was retained. All failed attempts are retained in local evidence. No assertions, original simulation/style/database fixtures or production defaults were weakened/regenerated.

## Activation and remaining manual actions

Analytics needs no new vendor secret: its existing collector/binding, migrated SQL, private Node files, pseudonymous cookie, reference validation, cohort suppression and bounded retention are already implemented. It remains production-disabled pending launch/privacy/front-end/pilot/provider-budget approval. Locally enabled smoke and privacy/retention/retry tests do not authorize collection from real visitors. Use the staging runbook's pause/disable/preserve-dirty-state/re-enable recovery procedure; no production flag was changed.

Before hosted staging, the release/account owner must approve isolated resources/targets and deployment. Before production: verify remote state and exact pending additive migrations; approve/test private representative backups and hosted DO/media recovery plus compatible artifact; connect independent monitoring and actual responder drill; validate account-wide budgets/retained-data/queue/soak; complete frontend role journeys and explicit unsupported-prototype decisions. Choose RTO/RPO, workload/SLO and retention policies with accountable owners rather than inventing them in code.

**GO: isolated local staging/recovery and integration validation. NO-GO: hosted deployment without approval/infrastructure, and full production deployment until the High gates above are evidenced.** This checkpoint stops at the safely executable boundary and documents those manual actions without requesting a premature production approval or beginning Phase 12.
