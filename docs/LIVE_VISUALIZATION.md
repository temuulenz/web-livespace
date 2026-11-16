# Sensor-driven public cafe visualization

The browser retains the existing cafe records, SSE channel and `/api/v1/live` polling fallback. `js/live/sensor-state.js` projects that record for the public sensor panel, Canvas and right-side microphone panel. It validates numeric ranges, uses observation timestamps (not upload/receipt time), and expires occupancy and noise independently using `sensor_stale_after_sec` from `/config` (30 seconds by default). Offline/disabled/stale sensors show unknown current values. A route-owned one-second freshness check also expires values when updates stop; no new network polling loop is added.

`mergeLive` at the existing cafe repository boundary prevents older SSE/poll snapshots from replacing newer occupancy or microphone observations. A simulated snapshot cannot displace an existing real snapshot. Switching a cafe explicitly to demo resets that precedence. The backend still selects the current authorized source; no Android protocol, database, credentials or latest-state store changed.

## People and seats

The current visitor array matches the latest valid real count, including zero. Added visitors walk in from the existing entrance using the existing layout/pathfinding. Removed visitors briefly fade while moving toward the entrance; these 1.2-second departure effects are separate from the current count and identified as transitions in the plan note. Zero, unknown data and mode switches clear all departure effects immediately. Reduced motion skips transitions. No decorative barista/chef is drawn in REAL mode, so staff cannot inflate the displayed observation.

Seats remain unknown throughout REAL mode; people counts never create seat availability or tracked positions. Actual legacy aggregate seat measurements remain supported separately. Demo/test source modes retain autonomous visitors and manual add/remove controls. Layouts, editor and frozen original simulation fixtures are preserved.

## Microphone panel

`LiveNoise` uses the existing native Component/DOM patching lifecycle, so the meter animates without replacing the panel or Canvas. It displays current dBFS, a text category and relative meter, calibration status, microphone observation time, and a rolling five-minute SVG history. The history contains at most 60 fresh observed dBFS samples collected since this page was opened. Poll duplicates and delayed replay are excluded; old samples expire and gaps longer than the freshness threshold are not connected. It does not fabricate history before the page was opened. The existing history component below remains available for persisted history.

Relative category boundaries default to **−60, −45, −30 and −15 dBFS**. These are illustrative, device-dependent thresholds, affected by microphone gain and processing. They do not define environmental loudness or any dB SPL conversion. Expand “Харьцангуй босго тохируулах” to edit the four ascending thresholds for the current page session. Values must lie strictly between −160 and 0. Invalid values leave the previous valid configuration in use. `noise_dbfs_thresholds` in the panel props/platform config can supply alternative defaults; changing `DEFAULT_NOISE_THRESHOLDS` changes bundled defaults. No server environment variable for these UI thresholds is introduced.

Calibrated `estimatedDbSpl` is shown separately as dB SPL. Uncalibrated dBFS is never converted to SPL. Legacy HTTP `noise_db` remains a separate SPL measurement, with calibration status explicitly unavailable because that API does not supply a calibration assertion. Missing microphone readings leave the relative indicator unknown; occupancy never supplies fake noise.

The original design stylesheets are untouched. Additions are in `styles/livespace.css`, with reduced-motion support, accessible labels, text categories, and responsive SVG sizing. Native modules are copied by the existing Cloudflare asset script; no build dependency or framework rewrite is added.

## Regression coverage

- `tests/simulation.test.mjs`: frozen demo fidelity, 0 → 5 → 2 → 0, entering/leaving transitions, zero clearing, reduced motion, no extra staff, stale/offline/invalid values and mode switching.
- `tests/live-state.test.mjs`: independent occupancy/noise clocks, calibration and unit handling, real-source precedence, reconnect/replay ordering, bounded/deduplicated history, and configurable relative thresholds.
- `tests/e2e.mjs`: actual WebSocket → SQLite → SSE updates to the same public Canvas, independent microphone updates, calibrated SPL, missing microphone values, local staleness/recovery, delayed upload rejection, and mobile overflow.
- `tests/cloudflare.mjs`: local Workers/D1/Durable Objects, automatic browser polling, offline unknown values, real count transitions, dBFS updates and preserved Canvas.

Use disposable databases/profiles with `npm test`, `npm run test:browser`, `npm run test:e2e` and `npm run test:cloudflare` (`BROWSER_PATH` set to installed Chromium). Cloudflare tests run locally; they do not deploy or alter remote data. Physical Android testing is not performed by these suites.

Local verification on 2026-11-16 passed: 80 Node tests (`npm test`), 16 static browser checks, 12 end-to-end checks, and 19 Cloudflare checks including real-mode browser polling. The real microphone panel was also visually inspected from `.artifacts/e2e/cafe-real-noise.png`. No remote deployment or physical Android validation was performed.
