# Sensor data: format, ingestion and real-time updates

This is the contract between the devices installed in partner cafés (cameras, noise sensors, Wi-Fi probes, or a gateway that combines them) and the LiveSpace backend.

## 1. Register a device

In the admin dashboard, open **Төхөөрөмж** (Devices) or open a café and use **Төхөөрөмж бүртгэх** (Register device). You choose:

- **ID**, e.g. `sensor_001`. This is the `device_id` the device must send.
- **Café**: the device may only report for this café.
- **Kind**: sensor, camera, gateway or simulator.
- **Test device**: tick this while testing. Data from test devices is labelled «ТУРШИЛТ» (test) everywhere and is never shown as a real measurement.

The dashboard shows a token (`lsd_…`) **once**. Only its SHA-256 hash is stored. You can rotate the token (the old one stops working immediately) or revoke the device.

## 2. Send measurements

```http
POST /api/v1/ingest/measurements
Authorization: Bearer lsd_…
Content-Type: application/json

{
  "schema_version": "1.0",
  "cafe_id": "cafe_9f1c…",
  "device_id": "sensor_001",
  "timestamp": "2026-11-01T10:30:00Z",
  "measurements": {
    "available_seats": 12,
    "occupied_seats": 18,
    "total_seats": 30,
    "noise_level_db": 42,
    "wifi_quality": 85,
    "wifi_download_mbps": 64
  },
  "device_status": { "state": "online", "battery_pct": 90, "firmware": "1.2.0" }
}
```

- The full schema is in [`sensor-measurement.schema.json`](sensor-measurement.schema.json). The validator is [`server/lib/sensor-schema.mjs`](../server/lib/sensor-schema.mjs).
- Every field in `measurements` is optional, but at least one known value is required. A device sends only what it measures, and the server combines the latest value of each field across all of the café's devices.
- `noise_level` is accepted as an alias for `noise_level_db`, because the first prototype example used that name.
- To send a batch, use `{ "measurements_batch": [ …up to 100 readings… ] }`. This is useful after a device has been offline.
- Rate limit: 120 requests per minute per device.

**Responses**

| Status | Meaning |
|---|---|
| `202` | All readings stored |
| `207` | Some stored, some rejected (see `results`) |
| `422` | Nothing stored; `results[i].errors` lists `{ path, message }` |
| `401` | Unknown or revoked token |
| `413` / `415` | Body too large / not JSON |

A token speaks only for its own device and the café it is registered to. A mismatched `device_id` or `cafe_id` is rejected.

### Reference client

`tools/device-client.mjs` sends exactly the values you give it, with no randomness. Use it to test the pipeline before hardware exists, and register it as a **test** device:

```powershell
npm run device -- --url http://127.0.0.1:8080 --token lsd_… --cafe cafe_… --device bench_01 --seats 30 --occupied 18 --noise 48 --wifi 82 --every 60
```

## 3. From raw values to what visitors see

The shared rules are in [`js/live/levels.js`](../js/live/levels.js) and are used by both the server and the browser.

| Measurement | Shown as |
|---|---|
| seats | free % = available ÷ total (`occ` = 100 − free %) |
| `noise_level_db` | the existing 5 levels: < 45 dB library · < 55 tea kettle · < 65 living room · < 75 lunch hall · ≥ 75 school break |
| `wifi_quality` | the existing 4 levels: < 25 weak · < 50 average · < 75 good · ≥ 75 very good |
| `wifi_download_mbps` | the "64 Mbps" text, shown only when measured |

## 4. Real-time updates

```
device ──POST JSON──▶ /ingest ──validate──▶ SQLite (measurements)
                                   │
                                   └─▶ SSE  /api/v1/stream  "measurement" event ──▶ open browsers
browser (stream down) ──every N s──▶ GET /api/v1/live   (polling fallback)
```

- **Event-driven first.** Browsers keep one `EventSource` connection. When a reading changes a public café, the server pushes the café's new values straight away.
- **Polling as a fallback.** If the stream drops, the browser polls `/api/v1/live` every `LS_POLL_INTERVAL_SEC` seconds (default 60, allowed 15–3600). It keeps trying to reconnect with backoff, and polling pauses while the tab is hidden.
- **Minimal page updates.** Only the affected café's views change: its map marker, its list or grid card, and on the café page the seat %, chairs, noise, Wi-Fi, mood line and freshness label. The animated visualization is not rebuilt. It receives a new occupancy target, and people walk in or out until the scene matches.

## 5. Labelling: demo, real, test, outdated, missing

| Label | When |
|---|---|
| **ДЕМО** | Café in demo mode (the 12 original example cafés, or any café an admin sets to demo). The numbers are examples and say so. |
| **ШУУД** (live) | Real sensor values, newer than `LS_STALE_AFTER_SEC` (default 900 s). Shows the measurement time and its age. |
| **ТУРШИЛТ** (test) | Values come only from devices marked as test. |
| **ХУУЧИРСАН** (outdated) | The last value is older than the threshold. It is still shown, with its time, and a note that the current state may differ. |
| **МЭДЭЭЛЭЛГҮЙ** (no data) | A live café that has received no data. No numbers are shown. |

Random numbers are never presented as measurements. The café simulation's people are a visualization: for live cafés the seat numbers come from the sensor, and the animation follows them. The day forecast is marked «ЖИШЭЭ» (example) until historical data exists.

## 6. Switching a café from demo to real data

1. Register its devices and send test readings (test device).
2. Check the readings in **Хэмжилт** (Measurements) in the admin dashboard; every raw JSON is kept.
3. Un-tick "test" on the device (or register the production device) and set the café's data mode to **Бодит** (real).
4. Move the setup status to **Идэвхтэй** (active).

No frontend change is needed. The same café record and views switch from demo to measured values.
