# Cloudflare production deployment

**Deployed and verified on 2026-11-16:** https://livespace.temuulenbayarjargal.workers.dev. The signed-in dashboard confirmed Workers Free; the existing Worker was updated with D1 and SQLite Durable Objects. Twelve production checks passed, including admin login, WSS, durable ACK/replay, 30-second heartbeat and native browser polling. Physical Android verification remains separate. Detailed resource/version IDs, private token handoff and recovery are below.

## Architecture

[Wrangler configuration](../wrangler.jsonc) retains Worker name `livespace`. Static Assets receives only the allow-listed site copied by [asset preparation](../scripts/cloudflare-assets.mjs). API and WebSocket routes run before assets. The separate [Worker backend](../cloudflare/worker.mjs) uses D1 for users, hashed sessions, cafe assignments, hashed device credentials, measurements and permanent replay receipts. A SQLite-backed application coordinator runs API work under the Durable Object CPU budget, including bounded photo processing. Per-device SQLite-backed Durable Objects coordinate hibernatable WebSockets and persist rate counters. D1 `batch()` atomically commits measurement, latest diagnostics and receipt before ACK. Latest values are derived from history, not a competing latest-state table.

Scrypt keeps the existing format and parameters (N=16384,r=8,p=1,64-byte output). Hash/verify run through internal Durable Object RPC because the Free HTTP Worker CPU limit is too small for password hashing. Credentials are never sent to an external service. Session cookies are HTTP-only, SameSite=Lax and Secure over HTTPS. Device tokens are shown once, stored as SHA-256 hashes, and rechecked per message and authorization sweep.

Public updates use same-origin polling every 10 seconds; private dashboards retain their bounded polling. The existing Node server and SQLite migrations are unchanged. Images are stored privately in D1 with an explicit **1 MiB per-photo limit**, rather than activating R2. Larger photos receive 413; resize them before resubmission. This is suitable only for a small pilot.

## Local verification

```bash
npm ci
npm run cf:migrate
npx wrangler d1 execute livespace --local --file cloudflare/seed.sql
npm run cf:check
npm run cf:dev
```

Wrangler serves locally on port 8787 by default. Use loopback for emulator verification; use the existing Node fallback for private-LAN plaintext rehearsal. The Cloudflare adapter rejects insecure WebSockets on non-loopback hosts. This is a development emulator; production does not depend on it.

Create the first local admin without storing a plaintext password in SQL or source:

```bash
read -rsp 'Admin password: ' LS_ADMIN_PASSWORD; echo
export LS_ADMIN_PASSWORD
node scripts/cloudflare-admin.mjs admin@example.mn /tmp/livespace-admin.sql
unset LS_ADMIN_PASSWORD
npx wrangler d1 execute livespace --local --file /tmp/livespace-admin.sql
rm /tmp/livespace-admin.sql
```

For remote bootstrap after authorization, the exact apply command is `npx wrangler d1 execute livespace --remote --file /tmp/livespace-admin.sql`.

For production, prefer the guarded [bootstrap apply helper](../scripts/cloudflare-apply-bootstrap.mjs), which suppresses SQL/hash output and removes the SQL file after success. The private file contains a password hash and is mode 0600. Use a private temporary directory on a shared machine. The command intentionally resets the matching account password and promotes it to admin; use it only for the intended admin.

## Manual remote actions after review and explicit authorization


### Verified production resources — 2026-11-16

The signed-in dashboard confirmed **Free / $0 / Current plan** in account `9e5256db4932b2064ca5982039f4e121`. GitHub Builds is enabled for `temuulenz/web-livespace`, production branch `main`, no build command, deploy command `npx wrangler deploy`, root `/`. These settings were inspected and left unchanged. **A later push to main can replace this manual deployment; include the reviewed migration files before using that pipeline.** No Git operation was performed by the agent.

The existing Worker `livespace` is deployed as version **`d7bb9048-7a60-4fca-8ef6-f8ed48287041`** at **https://livespace.temuulenbayarjargal.workers.dev**. D1 `livespace` was created only after verifying the empty resource list; UUID **`40e181a5-4058-4f82-bdf2-e26c79392056`**, region WEUR. This UUID and account ID are pinned in [configuration](../wrangler.jsonc). All four remote migrations, INSERT OR IGNORE demo seed and private INSERT-only admin bootstrap succeeded. Both SQLite DO classes/bindings deployed successfully. No paid service was enabled.

The old public frontend was downloaded into `.artifacts/production-before/2026-11-15T19-23-41.351Z/assets` (47 known public assets). The former version was `7f8beb8f-ecc3-4288-980a-ad4e0cc09fba`. Retain this backup for the prepared frontend recovery below. It contains public files only, not D1 data.

The available Wrangler OAuth token still cannot query billing/GitHub Builds APIs (403), but the authenticated dashboard inspection resolved that access blocker. Do not mistake those CLI limitations for a failed account verification.

The resources above **already exist**. Do not rerun `d1 create livespace` or recreate the Worker. The commands below document setup/update procedures, not outstanding actions for this release.

Check the account is on **Workers Free** and keep it there. In Workers & Pages → `livespace` → Settings → Builds, inspect the production branch, build command and deploy command. GitHub integration can deploy pushes automatically; disable automatic production builds while staging this migration. This session does not push anything. There is no repository GitHub workflow to prove the dashboard settings.

```bash
npx wrangler login
npx wrangler whoami
npx wrangler deployments list --name livespace
npx wrangler versions list --name livespace
npx wrangler d1 list
```

Record the existing deployment/version and retain the old frontend artifact before deployment. Reuse an existing suitable D1 database if present. Otherwise the user may create one Free-plan D1 database:

```bash
npx wrangler d1 create livespace
```

For a fresh installation only, set `database_id` to the returned UUID. This release already has the verified production UUID in [wrangler.jsonc](../wrangler.jsonc). Do not change the Worker name or enable paid services. The SQLite Durable Object namespaces (`SensorGateway` and `AppBackend`) are created by the configured `new_sqlite_classes` migration on the authorized deployment; do not create a second production Worker.

```bash
npx wrangler d1 migrations apply livespace --remote
npx wrangler d1 execute livespace --remote --file cloudflare/seed.sql
```

Generate the admin SQL using the local command above, apply it with `--remote` instead of `--local`, and delete it. No application-wide signing secret is needed: sessions and device tokens use random 256-bit credentials and store hashes. Cloudflare CLI credentials belong in the local Wrangler credential store or protected Cloudflare/GitHub secrets, never in source. If a future integration genuinely requires a Worker secret, set it interactively with `npx wrangler secret put SECRET_NAME --name livespace`; do not add dummy secrets.

Only after tests, rollout gates, resource IDs and explicit deployment authorization:

```bash
npm run cf:check
npx wrangler deploy
curl --fail https://livespace.temuulenbayarjargal.workers.dev/api/v1/health
```

Do not switch the account to Paid to bypass an error. A successful local test does not validate deployed CPU budgets or Note 4 TLS compatibility.

### Secure production bootstrap and one-time device token

After the account plan, exact D1 UUID and migrations are verified, prepare a fresh admin locally without putting its password in arguments or chat:

```bash
node scripts/cloudflare-bootstrap.mjs temuulenbayarjargal@icloud.com .artifacts/production-secrets
node scripts/cloudflare-apply-bootstrap.mjs .artifacts/production-secrets
```

The directory is mode 0700; credential files are mode 0600 and git-ignored. The SQL is INSERT-only and refuses an existing email rather than resetting someone else's password. Use the existing admin login if that account already exists. `admin.json` holds the generated password for the user to retrieve **locally in a private editor or password manager**; never paste it into chat or attach it as an artifact.

After authorized deployment, the prepared production smoke test reads that file privately, registers `LS-NOTE4-001` at cafe `I` as a real `sensor`, and registers a separate simulated demo device. It never prints either bearer token:

```bash
BROWSER_PATH=/path/to/chromium BROWSER_NO_SANDBOX=1 node scripts/cloudflare-production-verify.mjs .artifacts/production-secrets
```

If newly issued, the physical token is stored in `.artifacts/production-secrets/LS-NOTE4-001.token`, mode 0600. Transfer it directly into the Android app's private settings using a secure local method; do not email it, commit it or paste it into chat. Alternatively, sign in to `#admin` and register the device there to view the token once. If the device already exists and its token is unavailable, use the admin's explicit credential-rotation action; the smoke test does not rotate an existing physical sensor automatically. A simulator token is saved separately as `LS-SIM-DEMO-001.token` and must never be used by the real phone.

The production test was executed successfully: **12 checks passed** on 2026-11-16, recorded in `.artifacts/production-verification.json`. It reused the newly registered physical device without rotating its credential on the second run. It checks HTTPS, admin auth, registration, WSS, durable ACK/readback/duplicates, an actual 30-second control ping, reconnect replay, history and optional browser polling. Never collect real-source test readings from a virtual device. Simulated verification readings remain explicitly simulated in history.

## Physical Android and simulator

1. Open `https://livespace.temuulenbayarjargal.workers.dev/#admin`, sign in as the seeded admin, select the target cafe, set live data mode and actual opening hours. Keep the real cafe assignment ID.
2. Register device `LS-NOTE4-001`, kind `sensor`, test **off**, enabled **on**, assigned to that cafe. Copy its token once. A simulator must use a separate `simulator` registration and token.
3. Android URL: **`wss://livespace.temuulenbayarjargal.workers.dev/ws/sensors`**. Header: **`Authorization: Bearer <physical-device-token>`**. `schemaVersion` is numeric **1**; `deviceId` is `LS-NOTE4-001`; `locationId` is the exact assigned cafe ID.
4. Follow the unchanged [v1 JSON/ACK/outbox contract](SENSOR_PROTOCOL.md). Use normal Android/OkHttp certificate verification, UTC timestamps, a persistent UUID per reading and SQLite outbox replay. No USB, ADB, tunnel, localhost or custom domain is needed.
5. **Approved heartbeat:** configure Android OkHttp `pingInterval(30, TimeUnit.SECONDS)`. Cloudflare automatically replies to protocol control pings without waking the hibernating object. Missing pong fails the client socket; reconnect in `onFailure` with backoff/jitter and replay unchanged outbox messages. Node continues server-originated pings and also answers client pings. Ping/pong never refreshes telemetry. Initial single-device telemetry interval is **15 seconds**; the observation stale threshold remains **30 seconds**.

For the separately registered virtual sensor:

```bash
read -rsp 'Simulator token: ' LS_SENSOR_TOKEN; echo
export LS_SENSOR_TOKEN
npm run sensor:simulate -- --url wss://livespace.temuulenbayarjargal.workers.dev/ws/sensors --device LS-SIM-001 --location ACTUAL_CAFE_ID --interval 15000 --people 8 --noise=-37.1
unset LS_SENSOR_TOKEN
```

## Browser demonstration

Open the production cafe page after health succeeds. Verify the simulated label for the CLI, people count, dBFS unit, timestamp and status. Change the CLI count; polling updates the existing UI within about 10 seconds. Confirm the Canvas stays a visualization and unknown seats stay unknown. Sign in to owner/admin dashboards for battery and temperature; guest responses must omit them. Open history and switch source/5/15/60-minute buckets. Stop the simulator and verify offline status. Repeat with the phone's separate real registration using the approved heartbeat settings after production deployment and registration.

## Free-plan budget and limitations

Official limits checked 2026-11-16: [Workers](https://developers.cloudflare.com/workers/platform/limits/) 100,000 requests/day and 10 ms HTTP CPU; [D1](https://developers.cloudflare.com/d1/platform/pricing/) 5 million rows read/day, 100,000 rows written/day, 5 GB total; [Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/) 100,000 requests/day, 13,000 GB-s/day and SQLite-only availability on Free. D1 Free databases are limited to 500 MB each and 50 queries per invocation; inspect current [database limits](https://developers.cloudflare.com/d1/platform/limits/). Free limits fail requests when exceeded; this configuration does not authorize an upgrade.

### Measured D1 budget

`npm run cf:write-budget` runs the **same atomic ingestion helper** in disposable local workerd/D1, reading `meta.rows_written`. Three successive accepted frames each measured **[7, 1, 2] = 10 row writes**:

| Operation | Writes per accepted frame | Included maintenance |
| --- | ---: | --- |
| Measurement insert | 7 | Data row + five indexes + AUTOINCREMENT sequence |
| Device last-seen/diagnostics update | 1 | Existing row; no indexed field changes |
| Permanent replay receipt insert | 2 | Receipt row + composite primary-key index |

A duplicate performs **zero D1 writes**. Protocol ping/pong performs **zero D1 writes**. Authorization alarms read D1; they update a device only when an invalidated connection changes status. Normal connect/disconnect has at most one D1 row write per actual status change. No-op status writes and the extra post-commit receipt read were removed. These are local engine measurements; confirm actual production D1 metrics before sustained operation. Measurements exclude admin/session/bootstrap and intermittent connection/status writes.

| Telemetry interval | 1 device: writes/day | 3 devices: writes/day | 5 devices: writes/day |
| --- | ---: | ---: | ---: |
| 5 seconds — short demo | 172,800 | 518,400 | 864,000 |
| 15 seconds | 57,600 | 172,800 | 288,000 |
| 30 seconds | 28,800 | 86,400 | 144,000 |
| 45 seconds | 19,200 | 57,600 | 96,000 |
| 60 seconds | 14,400 | 43,200 | 72,000 |

Initial production recommendation: **one device at 15 seconds** (57,600/day), **three at 45 seconds** (57,600/day), **five at 60 seconds** (72,000/day). Real and simulated devices count together. These estimates leave headroom under 100,000 D1 writes/day; retries, admin traffic and any other databases share account quotas. Five-second operation remains supported for a short demo: two devices for one hour consume about **14,400 writes**, before overhead. Stop demo simulators after use.

The committed configuration uses `LS_SENSOR_EXPECTED_INTERVAL_SEC=15` and `LS_SENSOR_STALE_AFTER_SEC=30`. For three continuously reporting devices set expected cadence **45** and stale threshold **105**; for five set **60** and **135**. These are explicit freshness thresholds based on observation time, never on pongs. History coverage uses the configured expected cadence; do not change it silently while comparing historical coverage. The Node fallback keeps its existing defaults.

Durable Object writes have a separate Free allowance: one rate-counter write/message, roughly one alarm write plus one admission-lease update per 30-second sweep, and connection initialization/cleanup. At the recommended 15/45/60-second fleet cadences, approximate steady DO row writes/day for 1/3/5 devices are **11,520 / 23,040 / 36,000**, excluding retries/schema initialization. DO requests include alarms, admission RPC and application API requests. WebSocket control pings do not invoke the JavaScript message handler or write counters. Hibernation avoids idle duration; active time is accounted at 128 MB per object. Actual production metrics remain authoritative.

One visible public tab polling every 10 seconds makes about 8,640 API requests/day, each invoking the application coordinator; private dashboards add requests. D1 reads and DO duration can become limiting before connection admission. A 500-connection cap is not a Free-plan capacity promise. Never enable paid billing to bypass a quota error.

History queries, latest-state window views and many live cafes can amplify row reads and subrequests. Device admission is bounded to 500 using a shared SQLite Durable Object lease registry; it is not a Free-plan capacity promise. IP/login HTTP limits remain isolate-local and can reset on eviction. Server-ping direction differs by the approved transport adaptation; quota/load validation and physical Android verification are not complete. There is no automatic retention or migration of a development laptop's private database/photos. The seed contains only labelled demo cafes, no users or credentials. Optional ML remains absent.

## Rollback

Before deploying, record the current Worker version and export any existing D1 database using `npx wrangler d1 export livespace --remote --output /private/path/livespace-before.sql`. Keep that export private. Code rollback does not roll back D1 or Durable Object migrations.

Use the dashboard deployment rollback or `npx wrangler rollback RECORDED_VERSION_ID --name livespace` after checking compatibility. Cloudflare restricts rollbacks across Durable Object migrations; the first introduction of this class can prevent rollback directly to the former static-only version. Retain a frontend-only forward-recovery build that preserves the new DO binding/migration history, rather than deleting the namespace or production data. Stop devices during recovery. Existing D1 schema changes are additive; do not run destructive down-migrations.

The untouched local fallback remains `HOST=0.0.0.0 PORT=8080 npm start` with its own local SQLite data; it is a rehearsal fallback, not a production dependency. D1 data does not automatically appear in that local database.


## Current device token handoff

`LS-NOTE4-001` is registered at **I**, kind **sensor**, enabled, test mode off. Its one-time token is at:

```text
/home/temuulen/Documents/web/web-livespace/.artifacts/production-secrets/LS-NOTE4-001.token
```

The directory is mode 0700 and the file mode 0600. Open it locally in a private editor to transfer the value into Android settings; do not paste it into chat or source. The admin login is likewise stored privately in `admin.json` in that directory. No token/password/hash was printed. The intermediate admin SQL was removed after successful bootstrap. These files are git-ignored and are not registered as downloadable artifacts.

The separate `LS-SIM-DEMO-001` at I is explicitly simulated. Only explicitly simulated verification readings were persisted during smoke testing; no real physical readings were manufactured. The phone has not yet connected. The demo simulator is stopped, so its status can be offline while history remains available.

## Prepared frontend recovery command

After stopping sensor clients, use the dry-run-verified [recovery configuration](../wrangler.recovery.jsonc):

```bash
npx wrangler deploy --config wrangler.recovery.jsonc
```

This is a forward recovery to the same Worker with the backed-up public assets. It preserves D1, DO bindings/classes and migration history, while returning 503 for new backend requests so the frontend uses its static fallback. It does **not** delete production data. Existing sensor connections should be stopped before recovery. The backup directory must still exist locally. To restore the full backend afterward, run `npx wrangler deploy` with the normal configuration. Direct rollback to the pre-DO version can be restricted by Cloudflare's migration compatibility checks; do not delete namespaces to bypass them.


### Observed resource snapshot

After the first two verification runs, Wrangler reported D1 size **168 kB**, **1,294 rows read** and **166 rows written** over the preceding 24 hours. These counters can lag and include setup/admin traffic; they are not a steady-state per-device rate or complete Workers/DO account usage. The same accepted-frame SQL measured 10 writes/message locally, which remains the cadence planning basis. No paid service, R2 or custom domain was activated. Keep the 15-second initial physical sensor cadence and stop unused simulators.

## Phase 7.2 deployment preparation (not deployed)

Review [the current architecture and rollout gates](CLOUDFLARE_ARCHITECTURE.md), [regression report](PHASE7_2_REPORT.md), and [capacity assumptions](FREE_TIER_CAPACITY.md) before using earlier deployment commands. New D1 migrations 0006–0008 are additive; never reseed or replace existing data. BrowserRoom and AnalyticsAggregator add SQLite DO class migrations that must remain in cumulative deployment/recovery history. R2 and KV bindings are intentionally absent, and their flags plus analytics remain off. Creating optional resources, applying remote migrations and deploying each require explicit authorization. The historical recovery config is not a compatible Phase 7.2 rollback package. wrangler.phase72-recovery.jsonc provides a locally dry-run feature shutdown using current code and cumulative DO migrations; it is not a code rollback. Preserve any later-approved R2 read binding, and prepare a reviewed code rollback package before rollout. This documentation is not deployment approval.
