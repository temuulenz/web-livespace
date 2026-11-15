# LiveSpace sensor backend: Phases A and B

## Architecture findings

The repository has a native JavaScript frontend, custom framework, built-in Node HTTP server, built-in SQLite, cookie sessions/RBAC, owner/admin dashboards, a canvas floor-plan simulation, demo/test freshness labels, an HTTP device measurement endpoint and one SSE hub. The admin API already registers/reassigns devices, issues hashed tokens, rotates credentials and revokes devices. Owner routes scope private information to owned cafes.

This implementation reuses those tables, credentials and SSE infrastructure. The sole new runtime dependency is `ws` 8.x for WebSocket framing, payload limits and ping/pong; no frontend dependency or build step was added.

```text
Android / virtual sensor
  → /ws/sensors on the existing HTTP server
  → registered bearer token and server cafe assignment
  → versioned JSON validation
  → SQLite transaction: measurements + receipt + last seen/diagnostics
  → sensor.ack
  → existing SSE hub /api/v1/stream
  → existing browser live channel
```

## Run and provision

```bash
npm ci
npm run create-admin -- admin@example.mn 'a long local password'
npm start
```

Log in to `#admin` and register a device assigned to an existing cafe. Choose kind **simulator** or mark a test device for development. Simulator kind is always test, including through API registration/update. The one-time token is never recoverable from storage; rotate it if lost. See [SENSOR_PROTOCOL.md](SENSOR_PROTOCOL.md) for exact admin API calls, headers, schema and acknowledgements.

```bash
read -rsp 'Device token: ' LS_SENSOR_TOKEN; export LS_SENSOR_TOKEN
npm run sensor:simulate -- --device LS-SIM-001 --location ACTUAL-CAFE-ID \
  --url ws://127.0.0.1:8080/ws/sensors --people 8 --noise=-37.1 --battery 85

# Automatic finite run; flags inject failures every N logical messages:
npm run sensor:simulate -- --device LS-SIM-001 --location ACTUAL-CAFE-ID \
  --count 6 --interval 5000 --disconnect-every 2 --duplicate-every 2 --invalid-every 3

# Commands: people 12 / noise -45 / battery 70 / send / quit
npm run sensor:simulate -- --device LS-SIM-001 --location ACTUAL-CAFE-ID --mode manual
```

The default interval is 5000 ms; `--noise` is dBFS. `--reconnect-ms` defaults to 1000; `--help` lists all options. The CLI uses the same bearer-header upgrade/protocol as Android, refuses real registrations and retains a pending envelope in memory across reconnects. It does not implement Android's persistent SQLite outbox. SIGINT/SIGTERM close the socket. Tokens supplied through `LS_SENSOR_TOKEN` avoid process-argument exposure and are never logged.

For public SSE checks, use a development cafe with status `active` and `data_mode: live`. Demo-mode cafe metrics remain demo data. Use a development database rather than changing production records for simulator testing.

## Additive migration 2

[Database migrations](../server/lib/db.mjs) run transactionally through `PRAGMA user_version` (now 2). Migration 1 remains unchanged. Existing records are preserved; no reset or destructive startup cleanup occurs. Follow normal SQLite backup procedures before production deployment.

| Resource | Change |
| --- | --- |
| Existing `devices` | Add connection status and token lookup index; reuse assignment, hash, revocation, last seen and diagnostic JSON |
| Existing `measurements` | Add message/source tags, people/confidence, RMS/dBFS/calibration, battery/temperature/charging, inference and uptime |
| `sensor_receipts` | Small durable device/message key, normalized payload hash and original commit timestamp for replay protection |
| `sensor_latest_readings` | View over the same history, newest observation timestamp/ID per device + cafe + source; no competing latest-state table |
| Indexes | Unique device/message, device/cafe/source/time, and source/time; existing cafe/time and device/history indexes remain |

Existing test/simulator readings are tagged simulated. Other legacy readings keep their prior real-data semantics. Source is snapshotted at ingestion, so later device edits do not relabel history. `manual` is a reserved source for future explicit manual ingestion; WebSocket clients cannot select it. The legacy HTTP endpoint also tags test/simulator observations consistently.

Both observation and receipt timestamps use UTC. Older queue uploads cannot overwrite newer latest state. Uncalibrated dBFS never populates the existing SPL field. People-only frames cannot displace legacy seat/Wi-Fi readings from the summary's bounded lookback. No people-to-seats estimation was introduced.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `LS_SENSOR_MAX_PAYLOAD_BYTES` | 16384 | Message limit, 1024–65536 bytes |
| `LS_SENSOR_RATE_PER_MINUTE` | 120 | Messages per device, including retries/invalid payloads |
| `LS_SENSOR_HEARTBEAT_MS` | 30000 | Heartbeat/status sweep, 1000–120000 ms |
| `LS_SENSOR_STALE_AFTER_SEC` | 30 | Observation freshness threshold |
| `LS_DEVICE_OFFLINE_SEC` | 600 | Silence after last accepted reading |
| `LS_SENSOR_MAX_CONNECTIONS` | 500 | Authenticated concurrent sensor connections |
| `LS_SENSOR_RETENTION_DAYS` | 0 | Opt-in new WebSocket history retention; 0 disables deletion |
| `NODE_ENV` | development | Production enforces secure upgrade |
| `LS_TRUST_PROXY` | 0 | Accept forwarded HTTPS/IP only behind a controlled proxy |

Optional retention runs hourly, using receipt age, and deletes only expired new WebSocket history. It preserves the latest row for every device/cafe/source and never deletes legacy HTTP rows. Receipts remain indefinitely so deleting old history cannot permit duplicate ingestion; plan receipt archival separately beyond a pilot. Default retention is disabled.

## Exact Android settings

| Setting | Value |
| --- | --- |
| Development URL | `ws://<development-computer-private-LAN-IP>:8080/ws/sensors` |
| Production URL | `wss://<your-host>/ws/sensors` |
| Authentication | Upgrade header `Authorization: Bearer <registered-token>` |
| IDs | Registered device ID and assigned cafe ID, verified against `sensor.ready` |
| Schema/type | Numeric `schemaVersion: 1`, `type: sensor.telemetry` |
| Reporting interval | Suggested 5 seconds |
| Wire format | UTF-8 JSON text, ≤16384 bytes by default |
| Ping/pong | OkHttp automatic pong; server ping every 30 seconds |
| Offline queue | Android SQLite; stable envelope/ID until accepted or duplicate ack |
| Time | UTC/explicit timezone, synchronized device clock, 7-day offline upload window |
| Units | People; confidence 0–1; normalized RMS; dBFS; SPL only after calibration |

For the phone on private Wi-Fi:

```bash
HOST=0.0.0.0 PORT=8080 npm start
```

Use the development computer's private LAN address, keep the phone on the same trusted Wi-Fi and restrict port 8080 to that LAN in the host firewall. `127.0.0.1` on Android addresses the phone itself. Do not port-forward or expose development services to the public internet.

Production should terminate TLS at a controlled proxy that forwards WebSocket upgrades and unbuffered SSE. Set `NODE_ENV=production`; enable `LS_TRUST_PROXY=1` only when direct backend access is blocked and the proxy replaces forwarded headers. Keep Node on loopback/private networking. Never disable certificate verification. Validate the chosen certificate chain against the Android 6 trust store on the physical phone.

## Files delivered

| Files | Purpose |
| --- | --- |
| New [sensor-gateway.mjs](../server/lib/sensor-gateway.mjs), [telemetry-schema.mjs](../server/lib/telemetry-schema.mjs), [sensors.mjs](../server/services/sensors.mjs) | Upgrade/auth/limits/heartbeat, validation, durable persistence and SSE |
| Modified [app.mjs](../server/app.mjs), [config.mjs](../server/config.mjs), [db.mjs](../server/lib/db.mjs) | Assembly, graceful shutdown, settings, migration 2 |
| Modified [admin.mjs](../server/routes/admin.mjs), [ingest.mjs](../server/routes/ingest.mjs), [cafes.mjs](../server/services/cafes.mjs) | Simulator source enforcement and HTTP/summary compatibility |
| New [sensor-simulator.mjs](../scripts/sensor-simulator.mjs) | Automatic/manual virtual sensor CLI |
| Modified [package.json](../package.json), [package-lock.json](../package-lock.json) | `ws` dependency and simulator/focused test scripts |
| New [sensors.test.mjs](../tests/sensors.test.mjs), [database-v1.sql](../tests/fixtures/database-v1.sql); modified [e2e.mjs](../tests/e2e.mjs), [static.test.mjs](../tests/static.test.mjs) | Sensor integration, actual migration fixture, browser flow, native module regression |
| New [SENSOR_PROTOCOL.md](SENSOR_PROTOCOL.md), [SENSOR_BACKEND.md](SENSOR_BACKEND.md), [SENSOR_TESTING.md](SENSOR_TESTING.md), [AGENTS.md](../AGENTS.md); modified [README.md](../README.md), [ARCHITECTURE.md](ARCHITECTURE.md), [SENSOR_API.md](SENSOR_API.md) | Protocol, setup, results, repository guidance and architecture |

## Limits and next phases

This is a single Node process with SQLite and in-memory admission/rate limits. Multi-worker deployment requires shared device routing, limits and SSE fan-out. Individual diagnostics and connection state are stored and available through existing private admin data; existing dashboard online badges still use their original last-seen logic until Phase C. Public SSE is best-effort; existing polling exposes its original fields. The simulator's pending queue is in memory, not restart-persistent.

Phase C adds sensor widgets, people/dBFS public projections and polling, reliability/source/status indicators, owner diagnostics, and honest floor-plan labels. A single count cannot establish occupied seat positions or exact available seats. Multiple-camera overlap requires a deliberate aggregation policy.

Phase D adds 5-minute/15-minute/hourly aggregation and forecasting preparation. Use only real observations, exclude invalid/stale/backfilled-at-arrival samples, define coverage and camera field of view, and avoid overlapping-camera double counting. Track average/min/max people, sample count, coverage and calibrated SPL averages; store buckets in UTC and derive local hour/day using `Asia/Ulaanbaatar`. Do not use simulated readings or demo forecast profiles as training observations. No model was trained in this work.

Hardware, Camera2/TFLite/AudioRecord behavior, thermal endurance, Android durable outbox and production TLS certificate compatibility remain untested. See [test evidence](SENSOR_TESTING.md).
