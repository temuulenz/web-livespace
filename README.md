LiveSpace helps people in Ulaanbaatar find a café by seeing its free seats, noise and Wi-Fi before they go. The front end uses HTML, CSS, native JavaScript modules, canvas and Web Audio, plus our own small framework (`framework/`, see [docs/FRAMEWORK.md](docs/FRAMEWORK.md)). The optional backend uses plain Node.js, built-in SQLite and the lightweight `ws` package for edge sensors. The frontend has no package dependencies or build step.

## Run

**Full platform** (accounts, favourites, partner applications, owner and admin dashboards, live sensor data). Requires Node 22.13+.

```powershell
npm.cmd ci
npm.cmd run create-admin -- you@example.com "a long password"
npm.cmd start
```

Open `http://127.0.0.1:8080/`. The 12 demo cafés are seeded on first start and labelled as demo data. Configuration and deployment are covered in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); the sensor JSON format and real-time updates in [docs/SENSOR_API.md](docs/SENSOR_API.md).

**Android sensors (Phases A–D):** `/ws/sensors` reuses registered device bearer tokens and cafe assignments, durably stores telemetry, and publishes through the existing SSE hub. Read the [protocol](docs/SENSOR_PROTOCOL.md), [backend/Android settings and file inventory](docs/SENSOR_BACKEND.md), and [test results](docs/SENSOR_TESTING.md). People counts do not create seat positions or available seats; uncalibrated dBFS is not treated as SPL. Cafe cards/details and owner/admin dashboards show live people/noise/source/status/time, authorized diagnostics, and 5/15/60-minute history. Follow the [university demonstration runbook](docs/SENSOR_DEMO.md), including direct Wi-Fi setup. Advanced forecasting remains out of scope.

Register a simulator device in `#admin`, set its one-time token in `LS_SENSOR_TOKEN`, and use the actual assigned cafe ID:

```bash
npm run sensor:simulate -- --device LS-SIM-001 --location ACTUAL-CAFE-ID --people 8 --noise=-37.1
npm run sensor:simulate -- --device LS-SIM-001 --location ACTUAL-CAFE-ID --mode manual
```

Default simulator interval: 15 seconds; use `--interval 5000` for short demonstrations. Client protocol heartbeat: 30 seconds. Simulator data is explicitly tagged simulated, and the tool refuses real registrations. See the backend guide for duplicates/invalid messages/network failures and private-LAN phone access.

**Static demo** (as before; no backend features):

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

The site detects that no server is present and behaves like the original prototype. Native modules require HTTP serving rather than opening `index.html` directly. The original hash URLs (`#home`, `#explore`, `#cafes`, `#cafe-A`, `#about`, `#partner`, `#staff`) are unchanged. New routes are `#account`, `#owner` and `#admin`.

## Map source

The `#explore` map is a real map of Ulaanbaatar. It uses [MapLibre GL JS](https://maplibre.org/) 4.7.1 (pinned with an integrity hash, loaded from unpkg only on that page; ~210 KB gzipped) and free vector tiles from [OpenFreeMap](https://openfreemap.org/), which are built from OpenStreetMap data. No API key is needed.

- **Look:** `js/map-style.js` copies the drawn map's palette.
- **Markers, preview card, filters and mobile sheet:** unchanged.
- **«Та энд»:** appears only after the visitor taps «Миний байршил». The location stays in the browser and is never sent to the server.
- **Directions:** «Чиглэл авах» opens Google Maps. It is disabled for demo cafés, whose points are fictional and labelled ДЕМО.
- **Fallback:** if the library, the tiles or WebGL fail, the site automatically shows the original drawn SVG map. The home-page preview always uses the drawing.

To switch tile providers, change `tiles` and `glyphs` in `js/map-config.js` to another OpenMapTiles-schema source. Then add its host to the Content-Security-Policy in `server/lib/http.mjs` and `cloudflare/security.mjs`. OpenFreeMap has no published usage limits but is a donation-funded public service, so use your own tile server or a paid provider for heavy traffic. The «© OpenStreetMap contributors» attribution must stay visible.

## Code map

| Responsibility | Files |
| --- | --- |
| App start-up, routing, original page templates, delegated UI events | `app.js` |
| Framework: components, rendering, store, router, API, live channel, session | `framework/` |
| Café records and the data boundary (server records merge into the same objects) | `js/cafes.js`, `js/services/platform.js` |
| Measurement → levels, opening hours, map projection, setup workflow (shared with the server) | `js/live/levels.js` |
| Demo / live / test / outdated labels | `js/live/freshness.js` |
| Café display calculations | `js/cafe-metrics.js` |
| Preferences, filters and favourites | `js/state.js`, `js/storage.js` |
| SVG artwork and atmosphere components | `js/icons.js`, `js/components/atmosphere.js` |
| Map rendering and interaction | `js/map.js` (drawn SVG + fallback), `js/map-gl.js` (real map), `js/map-style.js`, `js/map-config.js` |
| Café simulation (`FloorPlan`) and per-café interior layouts | `js/simulation/floor-plan.js`, `js/simulation/layouts.js` |
| Web Audio | `js/audio.js` |
| Route-owned timers, number animations, modals, toasts | `js/lifecycle.js`, `js/animations.js`, `js/components/feedback.js` |
| Login window, account, partner form, owner and admin dashboards | `js/features/*` |
| Backend: HTTP, SQLite, auth, SSE, routes, services | `server/` |
| Reference device client for the ingestion API | `tools/device-client.mjs` |

The stylesheets must stay in this order: `styles.css`, `styles/pages.css`, `styles/responsive.css`, `styles/refinements.css`, then `styles/livespace.css`. The first four are the original design and are byte-identical (a test checks this). The last file holds every addition in this version.

## Tests

```powershell
npm.cmd test              # Node: engine fidelity, layouts, framework, server API, schema, storage, CSS
npm.cmd run test:sensors  # WebSocket auth, SQLite, SSE, simulator, replay and failures
npm.cmd run test:browser  # browser regression checks of the original site (static mode)
npm.cmd run test:e2e      # real server + browser: guest, user, owner, admin, live sensor data
npm.cmd run test:visual   # screenshots into .artifacts/
```

- **Browser.** Browser checks use a disposable headless Chromium profile and default to Microsoft Edge's Windows installation. Set `BROWSER_PATH` to use another Chromium executable, and `$env:BROWSER_NO_SANDBOX = '1'` in restricted environments.
- **Simulation fixtures.** These were captured from the original monolith at commit `f7f64a7`. They are still checked against the original interior (`legacy` layout, with the kitchen), proving the engine's behaviour is unchanged. Don't regenerate them from the current implementation.
- **Visual baseline.** `.artifacts/before` holds screenshots of the original for comparison. The homepage, map colour and café page differ on purpose.

The 2026-10 refactor audit is in [REFACTOR_REPORT.md](REFACTOR_REPORT.md).

## Cloudflare production backend

The backend is deployed at **https://livespace.temuulenbayarjargal.workers.dev** on Workers Free, with D1 and SQLite Durable Objects. The separate implementation preserves the local Node fallback. See [deployment commands and rollout gates](docs/CLOUDFLARE_DEPLOYMENT.md), [local verification](docs/CLOUDFLARE_TESTING.md), and [Phase E checkpoint](docs/PHASE_E_PROGRESS.md). The existing production Worker is named `livespace`. Production verification passed, including authenticated WSS and browser polling. The approved client-originated heartbeat, measured Free-plan budgets, secure device-token path and recovery command are documented there. GitHub main-branch automatic builds remain enabled; no Git operations were performed.
