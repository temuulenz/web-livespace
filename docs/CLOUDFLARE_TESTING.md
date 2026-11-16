# Phase E local verification

Tests use temporary databases and browser profiles. The local suites do not modify a remote database or public Worker. The separately authorized production smoke test is documented below. Run sequentially to avoid Chromium/CPU contention:

```bash
npm ci
npm test
npm run test:sensors
export BROWSER_PATH=/path/to/installed/chromium
export BROWSER_NO_SANDBOX=1 # only when required by your restricted test environment
npm run test:browser
npm run test:e2e
npm run test:cloudflare
npm run cf:check
```

For this Linux environment the installed browser is `/home/temuulen/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome`. `BROWSER_NO_SANDBOX` affects only the disposable test browser; it does not disable TLS verification. The Cloudflare suite runs its browser check only when `BROWSER_PATH` is set, so set it to claim browser coverage.

[Cloudflare tests](../tests/cloudflare.mjs) launch the actual local Wrangler/workerd runtime with D1 and SQLite-backed Durable Objects. They apply all four migrations into `mkdtemp` storage, seed the original cafes, install a disposable scrypt-hashed admin and remove storage afterward. The suite checks:

- Static asset allow-list, health and original cafe seed.
- Anonymous/role denial, same-origin rejection, unchanged scrypt login, sessions, registration and favorites.
- Cafe management, simulator registration and one-time device credentials.
- Sensor readiness, strict validation, ACK after D1 batch commit, public people/noise projection with no inferred seats or private diagnostics.
- Duplicate IDs and original commit timestamp, conflicting payload rejection, reconnect and full runtime restart replay.
- Newest-observation precedence, private diagnostics, source-separated historical aggregation and disabled-device rejection.
- Real-device source protection, rotation/revocation, legacy HTTP ingestion source tags.
- Forced D1 trigger failure: storage error rather than ACK, no partial measurement, then successful same-ID retry after removing the fault.
- Partner application photos, owner registration/claim, owner scoping, private photo authorization.
- Existing simulator duplicate/replay behavior against the Worker, then native browser rendering and automatic same-origin polling without rebuilding Canvas.

## Observed results

Final local results on 2026-11-16:

| Check | Result |
| --- | --- |
| Node regression | 72 passed |
| Focused Node sensors | 26 passed |
| Static Chromium frontend | 16 passed |
| Node backend + Chromium end-to-end | 11 passed |
| Cloudflare workerd/D1/DO + Chromium | 19 passed |
| Four local D1 migrations and cafe seed | Passed |
| Wrangler deploy dry run | Passed, no deployment |
| Git diff whitespace check | Passed |

See [Phase E progress](PHASE_E_PROGRESS.md) for remaining production gates and the full file inventory.

The merged three-step partner form required browser tests to advance through its steps; product form behavior was preserved. Static document navigation now waits for a new load event before querying the page. Earlier concurrent browser attempts hit CDP timing failures; rerun sequentially and report failures honestly rather than regenerating fidelity fixtures.

## Rollout gates

Local tests cannot enforce the deployed account's Free-plan CPU/request/storage quotas. Inspect [official limits and the usage estimate](CLOUDFLARE_DEPLOYMENT.md#free-plan-budget-and-limitations), measure D1 rows read/written in the Cloudflare dashboard, and stop continuous 5-second collection if approaching the daily allowance. Do not enable paid billing to get a green test.

The owner approved the Cloudflare transport adaptation on 2026-11-16: clients send control pings every 30 seconds, Cloudflare auto-pongs without waking the object, and missing pongs fail the client connection. The simulator now implements this behavior, reconnects, and replays its unchanged envelope. The Node server continues its original pings and answers client pings. No telemetry/ready/ACK/authentication field changed. Both runtime suites verify that a control pong does not refresh last-seen or insert a reading.

The dedicated heartbeat test deliberately suppresses pong and ACK, then verifies reconnection and identical message-ID/payload replay. `npm run cf:write-budget` measures the shared actual commit helper, including index and AUTOINCREMENT writes: **7 + 1 + 2 = 10 D1 writes per acceptance**, with zero D1 writes for pings and duplicates. The local Node suite now has **72 tests** and the Cloudflare suite **19 checks**. The preceding checkpoint had 69 Node tests and 18 Cloudflare checks; the table now reflects the finalization run.

Hardware validation on Android 6.0.1 remains outstanding: TLS trust chain, OkHttp ping/reconnection, durable Android outbox, camera count accuracy, microphone calibration and thermal/battery behavior. The existing Node sensor suite remains the reference for exact frozen heartbeat and transport behavior. Those production properties cannot be verified by local workerd; they were checked separately during the authorized deployment below.

Stress coverage for 500 devices, full distributed HTTP abuse limits and long-term D1 retention is not complete. The 500 lease cap is a safety bound, not a claim that the Free plan sustains that workload.


## Authorized production verification — 2026-11-16

Account verification succeeded in the signed-in dashboard: Workers **Free** is the current plan. GitHub production builds remain enabled on `main` for `temuulenz/web-livespace`, using `npx wrangler deploy`; settings were not changed. No Git operation was performed.

The existing Worker deployed as version `d7bb9048-7a60-4fca-8ef6-f8ed48287041`, bound to verified D1 `40e181a5-4058-4f82-bdf2-e26c79392056` and both SQLite DO classes. All four remote migrations, original cafe seed and private INSERT-only admin bootstrap succeeded.

The production verification script recorded **12 passing checks**:

1. Public HTTPS website and D1-backed health.
2. Production login/session and admin authorization.
3. Anonymous admin, cross-origin write and invalid WSS token rejection.
4. Physical registration `LS-NOTE4-001` at `I`, real sensor, enabled.
5. Valid bearer-authenticated WSS connection for the separate simulator.
6. Accepted ACK followed by independent D1 measurement readback.
7. Duplicate ACK with the original commit timestamp.
8. An actual 30-second control ping/pong, with no last-seen refresh.
9. Reconnect and unchanged-message duplicate replay.
10. Source-separated public history.
11. Sanitized public summary with dBFS correctly distinguished from SPL.
12. Actual public browser count update through polling.

A first browser attempt hit the known CDP document-readiness race. The harness now waits for the new page load and blocks external font requests for deterministic testing; product behavior was not changed. A rejected WebSocket probe also needed explicit client cleanup; the verification helper now terminates it. Tokens/passwords were neither printed nor included in test reports. The report is `.artifacts/production-verification.json`; private credential files are separate and mode 0600.

The physical sensor has not connected during these tests; all generated observations are simulated. Both the real and simulated registrations were independently checked directly in D1 without selecting token hashes or credentials. The current production health reports `deployment: cloudflare`, D1 schema 4 and polling transport. Recovery packaging dry run also passed; see the deployment guide for the forward-recovery command that preserves DO migration history and D1 data.

## Phase 7.2 regression preparation

The earlier observed-results and production sections above are historical. Current local results, additional test coverage, missing reference documents, and deployment gates are recorded in [PHASE7_2_REPORT.md](PHASE7_2_REPORT.md). All eight current additive migrations are exercised with disposable local storage. Optional R2/KV/analytics are exercised by `WRANGLER_SEND_METRICS=false node scripts/phase72-load.mjs`, which enables bindings only in its temporary local configuration. Its report is `.artifacts/phase72-load.json`; do not interpret short local concurrency tests as guaranteed daily Free-tier capacity. Run browser suites sequentially. See [capacity and assumptions](FREE_TIER_CAPACITY.md).
