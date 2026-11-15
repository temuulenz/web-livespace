# University demonstration runbook

All four web phases are implemented. The Android wire contract is [SENSOR_PROTOCOL.md](SENSOR_PROTOCOL.md); the website uses SSE, not another sensor WebSocket. Physical Note 4 validation must still be performed with the Android developer.

## 1. Start a separate persistent demonstration database

From the repository root, on Node 22.13+:

```bash
npm ci
LS_DATA_DIR="$PWD/data/demo" npm run create-admin -- admin@example.mn 'YOUR_CHOSEN_PASSWORD'
LS_DATA_DIR="$PWD/data/demo" HOST=0.0.0.0 PORT=8080 npm start
```

Replace the example admin password before running. Use the same data directory for both commands. This preserves the normal application database and keeps demo observations separate. No reset, commit, push or merge is required.

This computer's LAN IPv4 address was **192.168.1.240** when checked on 2026-11-16. Open `http://127.0.0.1:8080/` locally. On the phone, connected to the same private Wi-Fi, first open:

```text
http://192.168.1.240:8080/api/v1/health
```

Expect `ok: true`. DHCP can change the address; check `hostname -I` before presenting. Allow TCP 8080 from the private LAN in the host firewall, and avoid guest-network client isolation. Do not port-forward this development service. No USB/ADB is needed.

## 2. Prepare separate virtual and physical devices

Sign in, open `#admin`, then **Кафенууд**. In the seeded demo database:

1. Open Cafe A (ID `A`), set its data mode to **Бодит (мэдрэгч)** / `live`, and save. Its seeded status is already active. For a demonstration outside normal opening hours, set `00:00–23:59`.
2. Do the same for Cafe I (ID `I`) for the real phone. Keeping the virtual and physical devices in different cafes makes REAL/SIMULATED differences clear. Real observations take precedence over simulated ones when both exist at the same cafe.
3. In **Төхөөрөмж**, register `LS-SIM-001`, cafe `A`, kind **simulator**. Copy its token once to the simulator terminal. Simulator kind is always test.
4. Register `LS-NOTE4-001`, cafe `I`, kind **sensor**, with test mode unchecked for real physical observations. Give that separate one-time token to the Android developer through your normal private channel.

The token panel displays the exact Device ID, Location ID, WebSocket URL, header and sample JSON. Rotate a lost token through its **Токен** button. **Түр зогсоох / Идэвхжүүлэх** disables/enables a device; **Байршил / тохиргоо** edits cafe assignment and test mode. Reassignment requires reconnecting. **Цуцлах** permanently revokes the credential.

If demo seeding is disabled or using an owner-created cafe, substitute its actual cafe ID everywhere below. A cafe's name is not its `locationId`.

## 3. Start the virtual sensor

In another terminal, enter the simulator's token without recording it in shell history:

```bash
read -rsp 'Simulator token: ' LS_SENSOR_TOKEN; export LS_SENSOR_TOKEN
npm run sensor:simulate -- --url ws://127.0.0.1:8080/ws/sensors \
  --device LS-SIM-001 --location A --people 8 --noise=-37.1 --battery 85
```

Default reporting interval is five seconds. The CLI prints connected/ack events without tokens. For live audience-controlled values:

```bash
npm run sensor:simulate -- --device LS-SIM-001 --location A --mode manual
```

Type `people 12`, `noise -45`, `battery 70`, then `send`. Change values and `send` again; `quit` disconnects. Do not run two simulator instances with the same device at once.

For a finite resilience check:

```bash
npm run sensor:simulate -- --device LS-SIM-001 --location A \
  --count 6 --duplicate-every 2 --disconnect-every 2 --invalid-every 3
```

There should be six logical accepted readings, with duplicate retries adding no extra stored measurements. All simulator data is tagged SIMULATED and never eligible for real forecasting.

## 4. Exact Android / OkHttp configuration

| Setting | Demonstration value |
| --- | --- |
| URL | `ws://192.168.1.240:8080/ws/sensors` |
| Upgrade header | `Authorization: Bearer <token issued for LS-NOTE4-001>` |
| `deviceId` | `LS-NOTE4-001` |
| `locationId` | `I` (or the exact assigned cafe ID) |
| Version and type | Numeric `schemaVersion: 1`, `type: sensor.telemetry` |
| Interval | Suggested 5000 ms |
| Payload | UTF-8 JSON text, max 16384 bytes by default; use the complete envelope in the protocol |
| Time and IDs | Current UTC timestamp with timezone; persistent UUID per logical reading |
| Noise | Normalized RMS / dBFS; `estimatedDbSpl: null`, `calibrated: false` until hardware calibration |
| Heartbeat | OkHttp automatically answers server pings; default every 30 seconds |
| Retry | Backoff/jitter; persist the unchanged envelope/ID until matching accepted/duplicate ack |

Wait for `sensor.ready` and verify both IDs and `dataSource: real`. A token does not authorize any other cafe. Production uses WSS with a valid certificate; never bypass TLS verification.

## 5. Browser presentation sequence

1. Open `http://127.0.0.1:8080/#cafe-A`. Show SIMULATED, people count, dBFS, online status, observation timestamp and confidence. If the cafe is open, its existing Canvas remains visible and is labelled as a visualization; an individual occupied seat position cannot be inferred from a people count.
2. In manual mode, change people/noise and `send`. The page and cafe cards update through the existing SSE channel without reloading. Missing seat measurements remain `—`, never a fabricated free-seat percentage.
3. Show **Мэдрэгчийн түүх / History**, select SIMULATED, and change between 5/15/60 minutes. Recent readings appear immediately; aggregates use only fresh-at-arrival valid observations. Low initial coverage is expected until more real time has elapsed. Do not fabricate old readings to fill the chart.
4. Stop the simulator. The public status becomes offline while retaining the last observation and its timestamp. Restart to show recovery. Leave manual mode connected without sending for over 30 seconds to demonstrate stale status (up to the heartbeat sweep delay).
5. Open `#admin?tab=devices`: show online/offline/stale state, battery percentage/temperature, charging and inference diagnostics. Show registration, credential rotation, enable/disable and reassignment. Tokens and diagnostics are absent from public SSE/history.
6. Open **Хэмжилт** and filter by cafe A to show source-tagged raw/history readings and aggregation. Invalid messages do not become stored readings; duplicates do not add rows.
7. Once the phone is ready, open `#cafe-I` to show REAL observations arriving directly over Wi-Fi. Hardware success is verified only after that physical connection succeeds.
8. For the owner dashboard, sign in as the cafe's existing owner and open `#owner`. It displays assigned devices, live readings, battery/temperature and scoped history. If an owner is not yet linked, use the existing partnership flow (including three photos), create the owner account, and approve/activate that cafe through admin; use its generated ID for the device assignment.

## Limits to explain during the demo

- People counts are observations, not exact occupied/available seats. Canvas seat positions remain a labelled simulation.
- Uncalibrated dBFS is not SPL and does not determine a quiet/loud cafe category. Calibrated SPL averages are arithmetic dB averages, not acoustic Leq.
- Multiple camera counts are never summed. Live fields use latest per-source observations; history defaults to one latest people-reporting device. Different camera coverage needs an explicit future fusion policy.
- Real history is the default analytics source. Simulated data can be previewed explicitly but is never marked forecasting-eligible. Stale uploads remain in raw history and are excluded from aggregates.
- Coverage is an estimate from occupied expected-cadence slots, not proof of continuous observation. No forecasting model is trained or used.
- SQLite/gateway/rate limits are single-process; SSE has no durable replay. Polling recovers the latest public state; history can be refreshed. The virtual CLI's pending queue is in memory; Android must implement its own durable outbox.
