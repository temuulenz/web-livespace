LiveSpace helps people in Ulaanbaatar find a café by seeing its free seats, noise and Wi-Fi before they go. The front end uses HTML, CSS, native JavaScript modules, canvas and Web Audio, plus our own small framework (`framework/`, see [docs/FRAMEWORK.md](docs/FRAMEWORK.md)). The optional backend is plain Node.js with the built-in SQLite. There are no package dependencies and no build step.

## Run

**Full platform** (accounts, favourites, partner applications, owner and admin dashboards, live sensor data). Requires Node 22.13+.

```powershell
npm.cmd run create-admin -- you@example.com "a long password"
npm.cmd start
```

Open `http://127.0.0.1:8080/`. The 12 demo cafés are seeded on first start and labelled as demo data. Configuration and deployment are covered in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); the sensor JSON format and real-time updates in [docs/SENSOR_API.md](docs/SENSOR_API.md).

**Static demo** (as before; no backend features):

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

The site detects that no server is present and behaves like the original prototype. Native modules require HTTP serving rather than opening `index.html` directly. The original hash URLs (`#home`, `#explore`, `#cafes`, `#cafe-A`, `#about`, `#partner`, `#staff`) are unchanged. New routes are `#account`, `#owner` and `#admin`.

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
| Map rendering and interaction | `js/map.js` |
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
npm.cmd run test:browser  # browser regression checks of the original site (static mode)
npm.cmd run test:e2e      # real server + browser: guest, user, owner, admin, live sensor data
npm.cmd run test:visual   # screenshots into .artifacts/
```

- **Browser.** Browser checks use a disposable headless Chromium profile and default to Microsoft Edge's Windows installation. Set `BROWSER_PATH` to use another Chromium executable, and `$env:BROWSER_NO_SANDBOX = '1'` in restricted environments.
- **Simulation fixtures.** These were captured from the original monolith at commit `f7f64a7`. They are still checked against the original interior (`legacy` layout, with the kitchen), proving the engine's behaviour is unchanged. Don't regenerate them from the current implementation.
- **Visual baseline.** `.artifacts/before` holds screenshots of the original for comparison. The homepage, map colour and café page differ on purpose.

The 2026-10 refactor audit is in [REFACTOR_REPORT.md](REFACTOR_REPORT.md).
