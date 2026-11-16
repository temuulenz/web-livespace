# Sensor-driven public cafe visualization

The browser retains the existing cafe records, SSE channel and `/api/v1/live` polling fallback. `js/live/sensor-state.js` projects that record for the public sensor panel, Canvas and right-side microphone panel. It validates numeric ranges, uses observation timestamps (not upload/receipt time), and expires occupancy and noise independently using `sensor_stale_after_sec` from `/config` (30 seconds by default). Offline/disabled/stale sensors show unknown current values. A route-owned one-second freshness check also expires values when updates stop; no new network polling loop is added.

`mergeLive` at the existing cafe repository boundary prevents older SSE/poll snapshots from replacing newer occupancy or microphone observations. A simulated snapshot cannot displace an existing real snapshot. Switching a cafe explicitly to demo resets that precedence. The backend still selects the current authorized source; no Android protocol, database, credentials or latest-state store changed.

## People and seats

Git history identifies the original visitor lifecycle in `f7f64a7:app.js`, preserved in the extracted engine before sensor integration (`fd3c12b:js/simulation/floor-plan.js`). REAL mode reuses its `newPerson`, `arrive`, `path`, movement update, `sit`, `depart`, `person` and `item` functions. The separate illustrative wandering, accelerated exits and fading silhouettes have been removed.

Only the population controller changes: 0 → 1 starts one original entrance/order/chair journey; 1 → 5 starts four more. An unchanged count retains the same visitor objects, chairs, paths and positions. On 5 → 2, three visitors follow the original departure path, speed and exit fade. On 2 → 0, the remaining visitors walk out rather than disappearing. The entrance/exit remains `[90, 518]` (the original door `[90, 514]` plus its existing 4px offset). Original reduced-motion behavior is preserved.

`population()` tracks entering, seated, standing and departing visitors. Entering visitors already count toward the target; departing/gone visitors do not. Count changes during entry release illustrative reservations and reuse `depart`, preventing duplicate arrivals or stranded seats. The total number of visible figures may temporarily exceed the new observation while departures walk out. Equal-count telemetry does not restart or reposition visitors. Unknown/offline/stale data hides visitors and releases illustrative reservations; this is distinct from a valid zero, which animates departures.

Chair choice and reservation use the original simulation state internally. REAL-mode drawing, seat callbacks and `stats()` expose unknown actual seat availability regardless of that illustrative allocation. The plan explicitly labels seated and moving visitors as illustrative, not camera-tracked positions. Actual legacy aggregate seat measurements remain supported separately. No decorative barista/chef is drawn in REAL mode, so staff cannot inflate the observed population. Demo/test source modes retain autonomous visitors and manual add/remove controls.

If illustrative chairs are exhausted, overflow visitors enter through the same door and use the original `toSeat` movement loop to walk to reachable standing destinations selected from the existing walkable grid/pathfinder. They remain standing until the controller sends them to the original exit; no arbitrary placement or separate animation system is added. Layouts, editor and frozen original simulation fixtures are preserved.

## Microphone panel

`LiveNoise` uses the existing native Component/DOM patching lifecycle, so the meter animates without replacing the panel or Canvas. It displays current dBFS, a text category and relative meter, calibration status, microphone observation time, and a rolling five-minute SVG history. The history contains at most 60 fresh observed dBFS samples collected since this page was opened. Poll duplicates and delayed replay are excluded; old samples expire and gaps longer than the freshness threshold are not connected. It does not fabricate history before the page was opened. The existing history component below remains available for persisted history.

Relative category boundaries default to **−60, −45, −30 and −15 dBFS**. These are illustrative, device-dependent thresholds, affected by microphone gain and processing. They do not define environmental loudness or any dB SPL conversion. Expand “Харьцангуй босго тохируулах” to edit the four ascending thresholds for the current page session. Values must lie strictly between −160 and 0. Invalid values leave the previous valid configuration in use. `noise_dbfs_thresholds` in the panel props/platform config can supply alternative defaults; changing `DEFAULT_NOISE_THRESHOLDS` changes bundled defaults. No server environment variable for these UI thresholds is introduced.

Calibrated `estimatedDbSpl` is shown separately as dB SPL. Uncalibrated dBFS is never converted to SPL. Legacy HTTP `noise_db` remains a separate SPL measurement, with calibration status explicitly unavailable because that API does not supply a calibration assertion. Missing microphone readings leave the relative indicator unknown; occupancy never supplies fake noise.

The original design stylesheets are untouched. Additions are in `styles/livespace.css`, with reduced-motion support, accessible labels, text categories, and responsive SVG sizing. Native modules are copied by the existing Cloudflare asset script; no build dependency or framework rewrite is added.

## Regression coverage

- `tests/simulation.test.mjs`: frozen demo fidelity, 0 → 1 → 5 → 2 → 0, stable seated visitors, interrupted entry/rebounding counts, original exit completion at zero, standing overflow, no extra staff, stale/offline/invalid values, all layouts and mode switching.
- `tests/visitor-visual.mjs`: loads the unmodified `fd3c12b` engine from Git into a disposable Chromium harness (only import locations are adjusted). Eleven entrance, walking, ordering/seating, seated idle and exit checkpoints compare visitor state and Canvas visitor-layer PNGs byte-for-byte. Full comparison screenshots are saved to `.artifacts/visitor-restoration/`; chair status overlays and decorative staff deliberately differ. Frozen fidelity fixtures are never regenerated.
- `tests/live-state.test.mjs`: independent occupancy/noise clocks, calibration and unit handling, real-source precedence, reconnect/replay ordering, bounded/deduplicated history, and configurable relative thresholds.
- `tests/e2e.mjs`: actual WebSocket → SQLite → SSE updates to the same public Canvas, independent microphone updates, calibrated SPL, missing microphone values, local staleness/recovery, delayed upload rejection, and mobile overflow.
- `tests/cloudflare.mjs`: local Workers/D1/Durable Objects, automatic browser polling, offline unknown values, real count transitions, dBFS updates and preserved Canvas.

Use disposable databases/profiles with `npm test`, `npm run test:browser`, `npm run test:e2e`, `npm run test:visitor-visual` and `npm run test:cloudflare` (`BROWSER_PATH` set to installed Chromium). Cloudflare tests run locally; they do not deploy or alter remote data. Physical Android testing is not performed by these suites.

Visitor-restoration verification on 2026-11-16 passed: 84 Node tests, 16 browser checks, 12 end-to-end checks, 19 local Cloudflare checks and 11 original-engine visual comparison checkpoints. Seated and exiting comparison screenshots were visually inspected. No remote deployment or physical Android validation was performed.
