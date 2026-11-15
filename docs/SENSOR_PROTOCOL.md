# Android edge telemetry protocol v1

**Android JSON/authentication/ACK contract: v1 remains finalized.** The owner approved client-originated protocol heartbeat pings for Cloudflare on 2026-11-16; this transport compatibility update does not change schemaVersion 1 or any telemetry/ready/ACK/replay fields. Phases C/D add browser views and history APIs; they do not change the device envelope, bearer-header handshake or acknowledgement rules below.

## Direct Wi-Fi quick start (no USB or ADB)

1. On the server computer, install dependencies with `npm ci`, create an admin with `npm run create-admin -- EMAIL PASSWORD`, then start `HOST=0.0.0.0 PORT=8080 npm start`.
2. Put the computer and phone on the same private Wi-Fi, allow TCP 8080 from that LAN in the computer's firewall, and use the computer's LAN IPv4 address (for example `192.168.1.240`; this was the host address checked on 2026-11-16). Guest-network client isolation must be disabled or use a Wi-Fi network that permits clients to communicate.
3. Open `http://192.168.1.240:8080/api/v1/health` in the phone browser. An `ok: true` response verifies Wi-Fi reachability before configuring the Android app. Replace the example IP with the computer's actual IP; localhost on the phone is the phone itself.
4. In the website admin Devices tab, register `LS-NOTE4-001`, assign the intended cafe, choose kind `sensor`, and leave test mode off for physical observations. Copy the one-time token. Register the virtual sensor separately as kind `simulator`; never share its token with the real phone.
5. Configure Android/OkHttp with `ws://192.168.1.240:8080/ws/sensors`, upgrade header `Authorization: Bearer <one-time-token>`, and the exact registered device ID and assigned cafe ID. `locationId` is the database cafe ID, not the cafe's display name. Wait for `sensor.ready` and verify both IDs, then send the JSON schema below every 15 seconds for initial single-device production testing (5 seconds is supported for short demonstrations).
6. Use UTC timestamps, a new persistent UUID per logical reading, and a durable Android SQLite outbox. Delete an entry only after a matching accepted/duplicate acknowledgement. Automatically answer ping (OkHttp does this); reconnect with exponential delay/jitter (suggested 1–30 seconds), retaining the same envelope/ID for unacknowledged retries.

These `ws://` settings are for the private local demonstration. Production requires `wss://` and normal certificate verification. No USB, ADB, tunnel, TLS bypass or public port forwarding is required.

The Android app processes camera/microphone data locally. This protocol accepts JSON measurements only. Recordings, facial recognition, identity metadata and unknown fields are rejected.

## Endpoint and authentication

Connect to `/ws/sensors` on the existing HTTP server. Supply the registered device token as an HTTP upgrade header:

```http
Authorization: Bearer lsd_<device-token>
```

Local simulator URL: `ws://127.0.0.1:8080/ws/sensors`. Android development URL: `ws://<computer-private-LAN-IP>:8080/ws/sensors`. Production URL: `wss://<your-host>/ws/sensors`, with a valid certificate and normal TLS verification. Tokens in query strings are rejected.

Register devices through the existing admin dashboard or `POST /api/v1/admin/devices` using an admin session. Example body: `{ "id": "LS-001", "cafe_id": "<existing-cafe-id>", "kind": "sensor", "is_test": false }`. The response returns the token once; only its SHA-256 hash is stored. Reassignment uses `PATCH /api/v1/admin/devices/:id`; rotation uses `POST /api/v1/admin/devices/:id/token`; revocation uses `DELETE /api/v1/admin/devices/:id`. Existing authentication, RBAC and same-origin write rules remain in force.

The server binds the authenticated device to its stored cafe assignment. Browser cookies do not authenticate sensors. Wait for this response before draining the Android offline queue:

```json
{
  "type": "sensor.ready",
  "schemaVersion": 1,
  "deviceId": "LS-001",
  "locationId": "CAFE-001",
  "dataSource": "real",
  "maxPayloadBytes": 16384
}
```

The IDs above are examples; use the actual registration values. Only one concurrent connection is allowed per device. Every message and heartbeat rechecks authorization. Rotation, revocation, reassignment or a real/simulated source change invalidates existing sockets on their next message/sweep.

## JSON schema

Send one UTF-8 JSON **text** message per reading. Numeric `schemaVersion: 1` is distinct from the original HTTP ingestion format's `schema_version: "1.0"`.

```json
{
  "schemaVersion": 1,
  "type": "sensor.telemetry",
  "messageId": "92e00580-79d6-4208-899f-cba34284ecdf",
  "deviceId": "LS-001",
  "locationId": "CAFE-001",
  "timestamp": "2026-11-15T12:00:00.000Z",
  "occupancy": { "observedPeople": 8, "confidence": 0.87 },
  "noise": { "rms": 0.014, "dbfs": -37.1, "estimatedDbSpl": null, "calibrated": false },
  "device": {
    "batteryPercent": 85,
    "batteryTemperatureC": 36.5,
    "charging": true,
    "inferenceMs": 1200,
    "uptimeSeconds": 3600
  }
}
```

The root identifiers and timestamp are required. `occupancy`, `noise` and `device` must be objects. Their numeric measurements and `charging` may be null or omitted; normalization stores null for unavailable measurements. `noise.calibrated` is a required boolean, even when audio measurements are unavailable. Numeric strings, NaN and Infinity are invalid.

| Field | Range / meaning |
| --- | --- |
| `messageId`, `deviceId`, `locationId` | 1–64 letters/digits or `_ . : -`; UUID message IDs recommended |
| `timestamp` | Valid ISO 8601 date/time with `Z` or numeric timezone, up to 3 fractional digits; no more than 7 days old or 60 seconds ahead |
| `occupancy.observedPeople` | Integer 0–10,000 or null; observed people, not occupied seats |
| `occupancy.confidence` | 0–1 or null; edge-reported confidence |
| `noise.rms` | Normalized RMS, 0–1 or null |
| `noise.dbfs` | −160 to 0 dBFS or null; use null for unavailable/infinite-negative silence |
| `noise.estimatedDbSpl` | 0–140 dB SPL or null; must be null unless calibrated is true |
| `device.batteryPercent` | 0–100 or null |
| `device.batteryTemperatureC` | −40 to 100 °C or null |
| `device.charging` | Boolean or null |
| `device.inferenceMs` | 0–600,000 ms or null |
| `device.uptimeSeconds` | Nonnegative safe integer or null |
| Optional `dataSource` | `real` (default) or `simulated`; the registration determines stored source |

Test devices and devices of kind `simulator` always store simulated readings (`is_test: 1`), even if the sender claims real data. A real registration cannot submit `dataSource: simulated`. The development simulator also checks `sensor.ready` and refuses a real registration before sending. Source is snapshotted in history; changing the registration cannot relabel old readings.

Uncalibrated dBFS is never mapped into the cafe's existing SPL/noise-level fields. Only calibrated `estimatedDbSpl` can populate `noise_db`. Calibration remains an edge-device assertion and requires independent hardware validation. People counts never produce available seats, occupied seats or individual seat positions.

## Durable acknowledgement and offline replay

The server validates and authorizes, then atomically commits the measurement, durable message receipt, and device last-seen/diagnostics update. Latest state is derived from the same history. File databases use SQLite WAL with `synchronous=FULL`. Only after COMMIT does the server send:

```json
{
  "type": "sensor.ack",
  "messageId": "92e00580-79d6-4208-899f-cba34284ecdf",
  "status": "accepted",
  "serverTimestamp": "2026-11-15T12:00:01.000Z"
}
```

Android should persist an outbox in its own SQLite database and remove an entry only after a matching ack with status `accepted` or `duplicate`. On a lost connection or ack, reconnect with backoff/jitter and resend the **same envelope and message ID**. Never change a queued envelope after transmission.

IDs are unique per device for its lifetime. A matching normalized replay returns `status: "duplicate"` with the original commit timestamp, without another measurement or telemetry SSE event. This survives restart and optional history retention. Already committed messages may be acknowledged after the 7-day window. A reused ID with changed content returns `message_id_conflict`; a new, uncommitted message outside the age window is rejected. Use new IDs after reassigning or changing the device's source mode.

## Errors, limits and heartbeat

```json
{
  "type": "sensor.error",
  "messageId": "92e00580-79d6-4208-899f-cba34284ecdf",
  "error": {
    "code": "validation_failed",
    "message": "Invalid telemetry",
    "details": [{ "path": "occupancy.observedPeople", "message": "must be an integer between 0 and 10000, or null" }]
  }
}
```

Correlation IDs appear only when valid. Errors never echo arbitrary input or credentials. Correct/quarantine entries rejected with `invalid_json`, `json_only` or `validation_failed`. Fix provisioning for `invalid_device_token`, `unauthorized_location`, `simulation_not_allowed` or `device_assignment_changed`. Investigate `message_id_conflict`. Back off on `rate_limited`; retain and retry the unchanged entry on `storage_failed`.

Failed upgrades return JSON HTTP 401/403/404/409/429/503. Defaults: 16 KiB/message, compression disabled, 120 messages/minute/device including invalid/duplicate messages, 60 upgrades/minute/IP, 500 connected devices. Binary messages are rejected. Oversized/framing violations close at transport level (1009 for oversized messages), so a JSON error is not guaranteed. Five invalid application messages close with 1008; authorization/rate violations close immediately.

**Heartbeat transport compatibility update (approved 2026-11-16):**

- **Cloudflare:** the Android/client originates an RFC 6455 **control ping every 30 seconds**. Cloudflare automatically replies with the matching control pong without invoking `webSocketMessage` or interrupting hibernation. Do not send JSON `ping` messages: they are outside this telemetry schema. Configure OkHttp `pingInterval(30, TimeUnit.SECONDS)`. If its previous ping has no pong by the next interval, OkHttp fails the WebSocket; `onFailure` must schedule a new connection with exponential backoff/jitter and replay the unchanged SQLite outbox. OkHttp does not automatically recreate a failed WebSocket for the application.
- **Node fallback:** existing server-originated 30-second pings and missing-pong termination remain unchanged. Node also automatically answers client-originated control pings, so the same Android client works against both transports. Existing clients that only answer Node server pings keep working on Node; Cloudflare clients must originate their own pings.
- **Freshness is separate:** neither ping nor pong changes measurement timestamps, replay receipts or `last_seen_at`. Cloudflare authorization sweeps run every 30 seconds. Staleness derives from observation timestamps (default 30 seconds); offline derives from 600 seconds without accepted telemetry, even on an otherwise live transport. A clean disconnect is offline immediately. Longer fleet telemetry cadences require the documented explicit stale-threshold configuration; a pong never makes an old reading fresh.
- Node shutdown sends 1001 and waits up to one second before terminating sockets. Cloudflare controls runtime deployment/shutdown; clients must reconnect and replay when the transport closes or fails.

Android-compatible configuration (normal TLS verification remains enabled):

```java
import java.util.concurrent.TimeUnit;

OkHttpClient client = new OkHttpClient.Builder()
    .pingInterval(30, TimeUnit.SECONDS)
    .build();
Request request = new Request.Builder()
    .url("wss://livespace.temuulenbayarjargal.workers.dev/ws/sensors")
    .header("Authorization", "Bearer " + storedDeviceToken)
    .build();
// In WebSocketListener.onFailure/onClosed: schedule reconnect with jitter,
// wait for sensor.ready, then replay the same durable outbox envelopes/IDs.
```

The initial single physical sensor uses **15-second telemetry**, independently of the 30-second heartbeat. Use **5 seconds only for short demos**. See [measured Free-plan fleet budgets](CLOUDFLARE_DEPLOYMENT.md#free-plan-budget-and-limitations) before running three or five devices continuously.

References: [Cloudflare automatic ping/pong and hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/#automatic-pingpong-handling), [OkHttp pingInterval behavior](https://square.github.io/okhttp/3.x/okhttp/okhttp3/OkHttpClient.Builder.html#pingInterval-long-java.util.concurrent.TimeUnit-).

## Existing browser SSE

Active cafes in live mode publish through `/api/v1/stream`:

- `sensor.telemetry`: `locationId`, observation `timestamp`, `receivedAt`, `dataSource`, `stale`, `occupancy`, and `noise`. No device IDs, credentials or diagnostics. Delayed queue uploads remain historical events; consumers must compare observation timestamps.
- `sensor.status`: `locationId`, `status`, `dataSource`, `updatedAt`. Aggregated across non-revoked devices at that cafe/source: any online device wins, otherwise any stale device, otherwise offline. This describes sensor health, not cafe occupancy.
- `measurement`: the existing compatible cafe summary. Calibrated SPL can update existing noise values; people/dBFS widgets and polling projection are implemented through the same `live.sensor` object.

SSE is best-effort without persistent replay. The `/api/v1/live` polling fallback now includes the same sanitized `live.sensor` projection as SSE. The browser still uses its original native framework. Duplicates do not republish telemetry. No browser WebSocket is needed.

## Website management and history (device protocol unchanged)

Admins can temporarily disable/enable credentials with `PATCH /api/v1/admin/devices/:id` and a boolean `enabled`; disabled credentials fail authentication until enabled again. `DELETE` remains permanent revocation. The gateway rechecks the registration, and the existing owner/admin dashboards display private diagnostics through their authenticated HTTP APIs.

Public `GET /api/v1/cafes/:id/sensor-history` is available for active live-mode cafes. Owner/admin equivalents are `/api/v1/owner/cafes/:id/sensor-history` and `/api/v1/admin/cafes/:id/sensor-history`; owner access is cafe-scoped. Query `source=real|simulated|manual` (default real), `interval=5|15|60`, ISO `since`/`until` (up to 31 days), optional `device_id`, and `limit=1..500`. These return historical readings and source-separated aggregates, not predictions. Public history excludes diagnostics and device IDs. Full response semantics and the rehearsal sequence are in [SENSOR_BACKEND.md](SENSOR_BACKEND.md) and [SENSOR_DEMO.md](SENSOR_DEMO.md).

## Cloudflare production target

The deployed and verified production endpoint is `wss://livespace.temuulenbayarjargal.workers.dev/ws/sensors`. Use device `LS-NOTE4-001`, location `I`, kind `sensor`, test mode off, and its separate one-time bearer token. The heartbeat adaptation above is approved; deployment/account verification status is tracked in [Phase E progress](PHASE_E_PROGRESS.md). See [deployment and secure token retrieval](CLOUDFLARE_DEPLOYMENT.md) before connecting the physical device. No schema version change, USB, ADB, tunnel or certificate bypass is required.
