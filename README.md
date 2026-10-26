LiveSpace is a framework-free, static cafe discovery demo. It uses HTML, CSS, native JavaScript modules, canvas, Web Audio and localStorage. There are no package dependencies or build step.

Serve the repository root over HTTP:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/`. Native modules require HTTP serving rather than opening `index.html` directly. Existing hash URLs (`#home`, `#explore`, `#cafes`, `#cafe-A`, `#about`, `#partner`, `#staff`) are unchanged.

`app.js` owns initialization, routing, page templates and delegated UI events. Supporting modules live in `js/`:

| Responsibility | Files |
| --- | --- |
| Demo records and lookup boundary | `cafes.js` |
| Cafe display calculations | `cafe-metrics.js` |
| Preferences, filters and favorites | `state.js`, `storage.js` |
| DOM utilities and seeded randomness | `dom.js` |
| Existing SVG artwork and atmosphere components | `icons.js`, `components/atmosphere.js` |
| Map rendering and interaction | `map.js` |
| CafeSim engine, implemented by `FloorPlan` | `simulation/floor-plan.js` |
| Web Audio | `audio.js` |
| Route-owned timers and number animations | `lifecycle.js`, `animations.js` |
| Modals and toasts | `components/feedback.js` |

`getCafes()` and `byId()` return the existing shared demo records. A future API belongs behind this boundary, with asynchronous loading added to initialization when needed. Simulation callbacks (`onStats`, `onEvent`, `onSeat`) remain the interface between the engine and page UI.

The stylesheets must remain in this order: `styles.css`, `styles/pages.css`, `styles/responsive.css`, `styles/refinements.css`. The last file contains historical overrides whose position affects the design. Load them through the ordered links in `index.html`; do not regroup selectors without checking the cascade.

Run regression checks without installing packages:

```powershell
npm.cmd test
npm.cmd run test:browser
npm.cmd run test:visual
node tests/compare-visual.mjs
```

The Node checks were verified with Node 26.8.1. Browser checks use a disposable headless Chromium profile and default to Microsoft Edge's Windows installation. Set `BROWSER_PATH` to use another Chromium executable. In a restricted execution environment that cannot start Chromium's renderer sandbox, the test harness also accepts `$env:BROWSER_NO_SANDBOX = '1'`; this is optional and is not used by the website.

Browser captures freeze the clock, seed randomness, drive JavaScript animation frames and pause CSS animations at a common position. Google Fonts requests are blocked for reproducible offline captures, so the comparison covers the same fallback fonts on both revisions. Captures and results go to ignored `.artifacts/` directories. `CAPTURE_LABEL` defaults to `after`; `SITE_ROOT` can point to an original checkout for baseline captures. The comparison command expects a previously captured `.artifacts/before` baseline. Simulation fixtures were captured from the original monolith at commit `f7f64a7` using `node tests/capture-baseline.mjs <original-app.js>`; do not regenerate them from the refactored implementation.

Vercel continues to receive a static site: retain the existing static deployment settings and serve the repository root, including `js/`, `styles/` and `logo.webp`. No route rewrites, backend, environment variables or package installation are required by the application. Local HTTP asset and module loading were verified; a live Vercel deployment was not performed.

The audit, measurements and verification limits are recorded in [REFACTOR_REPORT.md](REFACTOR_REPORT.md).
