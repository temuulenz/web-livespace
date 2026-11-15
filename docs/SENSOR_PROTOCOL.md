# Android edge telemetry protocol v1

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

The server pings every 30 seconds. OkHttp automatically answers control pings; missing pong on the next sweep terminates the socket. Pongs do not refresh telemetry. A reading older than 30 seconds is stale; after 600 seconds without an accepted reading, even a connected device is offline. Disconnect is offline immediately. Sweeps run at heartbeat resolution. Shutdown sends 1001 and waits up to one second before terminating sockets; retry unacknowledged entries after reconnect.

## Existing browser SSE

Active cafes in live mode publish through `/api/v1/stream`:

- `sensor.telemetry`: `locationId`, observation `timestamp`, `receivedAt`, `dataSource`, `stale`, `occupancy`, and `noise`. No device IDs, credentials or diagnostics. Delayed queue uploads remain historical events; consumers must compare observation timestamps.
- `sensor.status`: `locationId`, `status`, `dataSource`, `updatedAt`. Aggregated across non-revoked devices at that cafe/source: any online device wins, otherwise any stale device, otherwise offline. This describes sensor health, not cafe occupancy.
- `measurement`: the existing compatible cafe summary. Calibrated SPL can update existing noise values; people/dBFS widgets and polling projection are deferred to Phase C.

SSE is best-effort without persistent replay. The existing `/api/v1/live` polling fallback and browser framework remain unchanged. Duplicates do not republish telemetry. No browser WebSocket is needed.
