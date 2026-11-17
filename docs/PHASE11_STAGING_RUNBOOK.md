# Phase 11 isolated staging runbook

2026-11-17 checkpoint. **GO for isolated local staging validation. Hosted staging is NOT validated or approved for deployment; production remains NO-GO.** This file contains preparation and future commands, not permission to create resources or deploy remotely. No production/front-end/Git mutation is part of this checkpoint.

## Isolation and configuration

[wrangler.staging.jsonc](../wrangler.staging.jsonc) is a separate **local-only** template: Worker `livespace-phase11-staging-local`, no account ID, no routes, workers_dev:false, nonproduction/non-UUID D1 ID `local-only-phase11-staging`, remote:false, and the same cumulative four internal DO classes/migration tags. No service bindings, external DO script names, R2/KV/Queue/Cron or environment blocks are allowed by the runner. Analytics/R2/KV start off; browser rooms on, explicit 15 s sensor cadence/30 s stale/600 s offline; request logs and staging observability configured on. Production wrangler.jsonc and its flags/bindings are unchanged.

scripts/lib/phase11-staging.mjs validates this template and rejects known unsafe configuration fields before initialization. scripts/phase11-staging.mjs accepts only prepare, smoke or rehearse with a local directory; **no URL, --remote or deploy mode** exists. It passes local:true/--local and remoteBindings:false. It never uses the production config as its staging source. The nondeployable ID/no route settings are accidental-target protections, not a substitute for checking every manually issued CLI command or for a malicious-edit security boundary.

All staging accounts/data are synthetic and cafes data_mode=demo. Each preparation uses a random private fixture password stored in credentials.json (0600 inside a 0700 directory); values never printed. Actual existing cookie-session auth/RBAC is used, not a new credential mechanism. Existing device simulators always remain simulated. Do not copy production cookies, tokens, account dumps or data paths into this environment.

## Reproducible local commands

From the repository root, using the locked dependencies:

```sh
npm ci
export WRANGLER_SEND_METRICS=false
export BROWSER_PATH=/home/temuulen/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome
export BROWSER_NO_SANDBOX=1  # only for the disposable test browser when required here
node scripts/phase11-staging.mjs rehearse
node scripts/phase11-backup-rehearsal.mjs
node scripts/phase11-location-check.mjs
```

The complete staging rehearsal creates its own mkdtemp tree, migrates a local D1 ledger through 0016, seeds four synthetic roles/two separate-owned cafes, runs default-off and enabled analytics smoke, stops workerd, copies/verifies/restores all local state, rechecks restored HTTP state and tests a separate D1 SQL export/import. It deletes its own temporary data and writes only sanitized summary evidence to `.artifacts/phase11-staging-rehearsal.json`. The Node recovery report is `.artifacts/phase11-node-recovery.json`. No persistent reusable login is printed.

For a persistent manual local workspace, choose a **new** directory (prepare refuses an existing one):

```sh
node scripts/phase11-staging.mjs prepare .artifacts/phase11-staging
node scripts/phase11-staging.mjs smoke .artifacts/phase11-staging
npx wrangler dev --local --ip 127.0.0.1 --config .artifacts/phase11-staging/config.json --persist-to .artifacts/phase11-staging/.wrangler/state
```

Prepare applies migrations and only the synthetic tenant/user seed. Smoke creates the initial published sample menu, D1-backed image and stock if missing; later runs verify existing state without creating a second initial-stock request. The fixture is intentionally small; shared suites cover all review/promotion/notification/sensor mutations independently. Persistent manual staging has no Super Admin binding; ordinary admin oversight works but reserved identity management requires the existing separately reviewed bootstrap policy. Do not assume that ordinary admin is Super Admin.

Stop the local worker before any offline snapshot. Do not run two local servers against the same persistence directory. The source marker authorizes only synthetic snapshots; it cannot detect an active writer. Keep private credentials/SQL exports outside public assets and source control. Never delete/reset a shared or production data directory for a fresh test.

Bundle checks, with no deployment:

```sh
npm run cf:check
npx wrangler deploy --dry-run --config wrangler.staging.jsonc
```

These check packaging; neither validates a real hosted binding/account/plan. The staging template intentionally has no usable remote D1 resource ID. Do not run a non-dry-run deploy with it.

## Smoke acceptance

The automated runner verifies readiness minimal body/status and request ID, unauthenticated monitoring denial, actual owner A versus B menu denial, published menu/stock/media operations, stable stock duplicate retry, private resource metrics, maintenance, owner/admin analytics and enabled/off analytics session/intake/dedup with preserved synthetic cookie. Restored domain/media state and collector dedup are exercised after a fresh worker start. Source/backup/restored file and complete-record digests must match before resumed traffic mutates them.

Also run the feature/security tests in PHASE11_DEPLOYMENT_CHECKLIST.md: all nine notification families/preferences/storm/budget behavior, mutation rollback and current authority races, hidden media/304 denial, negative stock/source conflicts, review moderation/distributions, promotion/time boundaries, suppressed analytics keys/CSV and frozen sensor ACK/replay/freshness. These are covered in the native/workerd suites and D1 probe; the small smoke script does not replace those suites or an integrated frontend journey.

For readiness failure, use isolated fault injection only, restore the trigger/schema afterward and expect minimal 503 with no diagnostic leakage. For monitoring use PHASE11_MONITORING_RUNBOOK.md, including independent pager/acknowledgement drill. Provider reachability/billing, hardware GL/Android, actual hosted alarms/eviction, production data volume and full customer frontend integration remain unverified.

## Full validation and load commands

The native suite was also run with an isolated official Node 22.13.0 binary, followed by its browser E2E and offline Node recovery; all passed after the documented minimum-version SQLite compatibility fix. Use a supported patched runtime for an eventual release and verify that actual target separately.

Run browser/load suites sequentially to avoid timing contention. All use disposable profiles/storage:

```sh
npm test
npm run test:sensors
npm run test:browser
npm run test:e2e
npm run test:visitor-visual
npm run test:visual
npm run test:cloudflare
node scripts/phase11-d1-check.mjs
node scripts/phase11-menu-demo.mjs
node scripts/phase11-menu-budget.mjs
npm run cf:write-budget
node scripts/phase11-history-budget.mjs
node scripts/phase11-notification-drain.mjs
node scripts/phase11-load.mjs
npm audit --json
```

phase11-load.mjs has **no remote URL input**. It always creates temporary local workerd/D1/R2/KV/DO persistence, uses local:true and local migrations, and constructs only loopback origins returned by the local runtime. It reads configuration from the production template only to reproduce runtime/binding shape, but uses --local/local:true and never contacts those remote IDs. The separate staging runner uses only its guarded staging template. Do not edit either harness into a production URL load test.

The load matrix is 1/3/5/10 cafes × 50/100/500 connected browser sockets; each executes 100/500/1000 synthetic sessions (36 nested variants, 19,200 events). It measures connects, realtime, reconnects, hot API, ingestion latency, local D1 rows/failures, process CPU/file allocation and observed HTTP status counts. The status counter covers the instrumented API helper and analytics intake; direct media/negative authorization probes and WS upgrades are separately asserted and excluded. Per-case counts separate success/error outcomes for the instrumented subset. Socket failures are counted and asserted zero. Assertions exercise retries/rollbacks separately, and report all completed check families explicitly.

Fixture-only raised limits: 100000 tenant analytics events/day, 1000 ingestion batches/minute, 10000 insights requests/minute and 10000 authenticated requests/minute. These are not proposed production defaults. Tests are short same-host segments; fan-out precedes ingestion, so no causal “analytics has zero latency impact” inference is valid. Concurrent browsers are not daily active users. Ten sensors at sustained cadence can exceed account write budgets even when short local cases pass. There is no authorized remote load runner or completed hosted staging load result; remote load requires reviewed allowlisted staging targets, separate resources, limits, stop conditions and explicit approval.

## Analytics activation and rollback rehearsal

Analytics is off because it is an explicitly optional, privacy/quota-sensitive workload pending frontend/pilot/operations approval—not because a new provider/secret is missing. Dependencies: migrated analytics tables, existing ANALYTICS DO binding on Cloudflare or writable private Node collector directory, stable HttpOnly session initialization, strict reference/event validation, cohort threshold, retention/receipt limits, DB headroom and monitored flushing. No external analytics vendor is required. E/F privacy tests prove local behavior, not legal/policy approval for real visitors.

The rehearsal overrides only its generated local runtime config to LS_ANALYTICS_ENABLED=1 and verifies 202/duplicate handling, role isolation and reports. Default-off smoke expects 404 and no client retry storm. Before any later authorized activation: agree consent/policy, verify no IP/location/identity/search text in events/logs, bound frontend retry queue and dedup horizon, check 70/90% thresholds and real provider budgets, and measure flush/queue/report lag. Keep small-cohort omission, source separation and default-off marketing. New resource monitor usage day matches Ulaanbaatar admission; sensor daily counts explicitly remain UTC.

Rollback/containment: existing admin analytics_paused=true blocks optional intake while allowing recovery/flush; reverting the enable flag stops intake and optional flush alarms but preserves dirty state. Do not delete DO/files or receipts. After re-enable, new intake schedules alarms; otherwise invoke bounded authorized owner report flushes/recovery and confirm dirty data drains—idle re-enable alone is not a proven collector wakeup. Never present stale/suppressed/null metrics as zero. Production activation was not performed.

## Hosted staging preparation — manual, approval required

The local staging GO does not mean hosted staging GO. A Cloudflare operator must supply approved access, a distinct Worker/account target policy, dedicated D1 and DO namespaces, private R2/KV only if approved, a protected test origin and an external monitoring/log destination. Verify environment-specific bindings are not accidentally inherited; --env alone does not establish isolation. Preserve cumulative classes/tags, normal TLS and existing auth/RBAC; do not create alternate application credentials.

Prepare a **new private reviewed hosted-staging config**, replacing only its own placeholder resource IDs after resources are approved. Compare every Worker/account/database/bucket/namespace/service/route against production inventory and reject any shared writable resource. Capture a private pre-change baseline and explicit written deployment/resource authorization. Future commands then have this shape, and were **not executed**:

```sh
# Only after separate hosted-staging authorization and target/resource review:
npx wrangler d1 migrations list STAGING_DB --remote --config /private/approved-staging/wrangler.jsonc
npx wrangler d1 migrations apply STAGING_DB --remote --config /private/approved-staging/wrangler.jsonc
npx wrangler deploy --config /private/approved-staging/wrangler.jsonc
```

Use synthetic seed/provisioning adapted through reviewed parameterized tooling; never production bootstrap dumps or real-source virtual telemetry. Warm ordinary APIs/jobs, verify deployed version/flags/bindings, isolate tenant sessions/media, rehearse compatible code recovery and approved backups, connect independent alerts and run the approved soak/load. Record actual provider CPU/usage/eviction/network results separately from local workerd. Until credentials, infrastructure, deployment approval and those checks exist, hosted staging and production stay unverified.
