# Sensor test results: Phases A and B

Verified on 2026-11-15 using Node 22.23.1, Linux, file-backed SQLite, `ws` 8.23.0 and headless Chromium 159. All integration databases and browser profiles were disposable; no production database was used.

| Suite | Result |
| --- | --- |
| `npm test` | 65 passed, 0 failed |
| `npm run test:browser` | 16 passed, 0 failed |
| `npm run test:e2e` | 10 passed, 0 failed |
| Physical Samsung Note 4 / Android 6 | Not tested; hardware unavailable |

## Reproduce

```bash
npm ci
npm test
npm run test:sensors

# Set an installed Chromium, Chrome or Edge executable for your platform:
BROWSER_PATH=/absolute/path/to/chrome npm run test:browser
BROWSER_PATH=/absolute/path/to/chrome npm run test:e2e
```

The browser harness defaults to Windows Edge when `BROWSER_PATH` is absent. `BROWSER_NO_SANDBOX=1` was used for the isolated test environment; use normal Chromium sandboxing on ordinary desktop runs. The existing browser installed during the earlier attempt was reused as test tooling; no browser automation dependency was added to the project.

## Sensor coverage

[sensors.test.mjs](../tests/sensors.test.mjs) contains 19 tests covering:

- Valid/invalid device authentication, hashed tokens, server-assigned IDs, bad URLs, duplicate connections and total connection limits.
- Valid telemetry, an independent SQLite connection reading the committed row after ack, complete diagnostic persistence, and sanitized SSE through the existing hub.
- Unauthorized device/cafe, invalid JSON, binary input, invalid numeric ranges, null values, calendar/timezones, version/type/identifier validation and forbidden extra fields.
- Duplicate messages, conflicting ID reuse, delayed queue uploads, latest-state ordering, persistence/replay after restart, and replay after optional history retention.
- A forced SQLite failure while inserting the receipt: no ack, partial measurement, receipt, last-seen update or SSE; retry succeeds after the failure is removed.
- Simulated source enforcement in both WebSocket and legacy HTTP ingestion, plus refusal to run the simulator against a real registration.
- Credential rotation, revocation and cafe reassignment invalidating existing sockets.
- Rate/payload limits, normal pong, missing pong, stale/offline/recovery, device disconnect and graceful server shutdown with WebSockets/SSE still open.
- Production WSS policy and explicit trusted-proxy handling. This tests policy enforcement, not a deployed certificate or Android trust-store compatibility.
- A genuine v1 SQLite database built from [the pre-Android schema fixture](../tests/fixtures/database-v1.sql), upgraded with cafe/device/measurement content preserved and simulations correctly tagged.
- Retention disabled by default; enabled retention preserving latest readings, legacy HTTP rows and durable receipts.
- More than 30 people-only Android frames preserving existing HTTP seats/Wi-Fi summaries.
- A standalone simulator subprocess with automatic intervals, forced disconnects, duplicates and invalid messages; SQLite and SSE assertions; manual input commands.

## Full flow into a real browser

[e2e.mjs](../tests/e2e.mjs) registers a simulator through the existing admin API, opens the custom framework's `createLiveChannel` against `/api/v1/stream`, runs the virtual sensor with the registered bearer token, checks people/source columns in SQLite, and asserts that Chromium receives the same simulated reading using native EventSource:

```text
Virtual Sensor → WebSocket → Authentication → Validation → SQLite → SSE → Browser
```

The browser does not open a sensor WebSocket. Existing end-to-end cases still cover guest browsing, favorites/accounts, partner onboarding, owner/admin dashboards, legacy HTTP sensor updates and absence of uncaught browser errors. Static browser regressions cover search, map, navigation, filters, comparison, sound, canvas simulation and responsive behavior.

## Manual development scenario

1. Use a development database and sign in as admin.
2. Register `LS-SIM-001` as a simulator, assigned to an existing cafe. Put its one-time token in `LS_SENSOR_TOKEN` without committing it.
3. For public SSE, use an active cafe in live data mode.
4. Run `npm run sensor:simulate -- --device LS-SIM-001 --location ACTUAL-CAFE-ID --count 6 --duplicate-every 2 --disconnect-every 2 --invalid-every 3`.
5. With an admin session, inspect `GET /api/v1/admin/measurements?device_id=LS-SIM-001`: six logical accepted readings, all simulated/test; retries create no extra rows. Inspect the browser EventSource stream for `sensor.telemetry`, `sensor.status` and compatible `measurement` events.
6. Stop the simulator and verify stored offline connection status. A connected but silent device should become stale. Do not infer seat positions or calibrated SPL from the generated people/dBFS values.

Before deployment, separately test the physical Note 4 Camera2/TFLite/AudioRecord pipeline, microphone calibration and camera coverage, battery/thermal endurance, Android outbox across restarts, real Wi-Fi interruptions, production proxy/TLS and Android 6 certificate compatibility. Phase C UI and Phase D aggregation/forecasting need their own implementation and validation.
