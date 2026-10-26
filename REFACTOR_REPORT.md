LiveSpace refactoring report — 21 October 2026

1. **Initial audit.** The repository contained four tracked files, no dependencies, no build configuration and no tests. The 142,172-byte `app.js` combined initialization, hash routing, state, page templates, SVG generation, Web Audio, the map and the canvas simulation. The 116,574-byte stylesheet contained successive design overrides and responsive rules whose order mattered. CafeSim is implemented by the `FloorPlan` class, with seeded randomness, A* pathfinding, an existing cached static background and one intended animation loop per instance. Those mechanisms were retained.

   The most significant defect was reproducible: navigating `#cafe-A` → `#cafe-I` → `#cafe-A` within the 380 ms loading delay could run two old/new callbacks for A. Only the latest simulation was subsequently destroyed, leaving an orphan animation loop after navigation. Other findings were an uncanceled resize frame, repeated marker DOM queries during search, three temporary people arrays and two staff copies per canvas draw, overlapping number animations, retained preview expiry timers, and a missing `icon.svg` reference.

2. **Files changed and created.** `app.js` retains page composition, routing and UI events. `index.html` loads native modules and the ordered stylesheets, preloads the map and simulation modules, and uses the existing logo for the favicon. `styles.css` now contains foundation and shared component rules. `logo.webp` is unchanged.

   | New files | Purpose |
   | --- | --- |
   | `js/dom.js`, `js/storage.js`, `js/state.js` | Utilities, unchanged storage format and shared application state |
   | `js/cafes.js`, `js/cafe-metrics.js` | Demo data access and display calculations |
   | `js/icons.js`, `js/components/atmosphere.js` | Original graphics and atmosphere markup |
   | `js/map.js`, `js/simulation/floor-plan.js` | Map and simulation engines |
   | `js/audio.js` | Audio synthesis and preview ownership |
   | `js/lifecycle.js`, `js/animations.js`, `js/components/feedback.js` | Delayed-work cleanup, numbers, modals and toasts |
   | `styles/pages.css`, `styles/responsive.css`, `styles/refinements.css` | Original CSS in its original cascade order |
   | `package.json`, `.gitignore` | Dependency-free test commands and ignored local artifacts |
   | `tests/animations.test.mjs`, `tests/audio.test.mjs`, `tests/lifecycle.test.mjs`, `tests/simulation.test.mjs`, `tests/static.test.mjs`, `tests/storage.test.mjs` | Focused Node regression tests |
   | `tests/browser.mjs`, `tests/compare-visual.mjs`, `tests/capture-baseline.mjs` | Browser checks, capture comparison and original fixture capture |
   | `tests/support/browser.mjs`, `tests/support/simulation.mjs` | Local static server, Chromium protocol client and canvas recorder |
   | `tests/fixtures/cafes.json`, `tests/fixtures/styles.json`, `tests/fixtures/simulation.json` | Original data, ordered CSS and seeded behavior fingerprints |
   | `README.md`, `REFACTOR_REPORT.md` | Run instructions and this report |

3. **Architecture.** Native modules expose small interfaces without adding dependencies, globals, a bundler or frameworks. `getCafes()`/`byId()` isolate the local source while preserving shared record identity and every existing data field. All `ls_` storage keys, JSON serialization, preference defaults and valid saved favorites retain their existing behavior. Route-owned work is cleared before a new route is rendered. Each map and simulation explicitly releases its listeners and observer; the simulation also cancels rendering and resize frames. Number updates cancel superseded animations. Audio previews preserve their synthesis parameters, 4,200 ms duration and 350 ms fade, then release timers and connected nodes after the original 450 ms cleanup delay.

4. **Performance results.** These are measured operation counts, not FPS or load-time claims:

   | Check | Original | Refactored |
   | --- | ---: | ---: |
   | Marker queries during 100 home search inputs | 200 | 0 |
   | Temporary filtered people arrays over 600 draws | 1,800 | 0 |
   | Staff object copies over 600 draws | 1,200 | 0 |
   | Pending simulation frames after the rapid revisit scenario, followed by About | 1 | 0 |
   | Local HTTP asset failures | Missing favicon, 404 | 0 |

   Reduced allocation pressure and shorter resource retention are expected benefits. Heap size, mobile battery use, frame rate, network transfer and startup speed were not benchmarked. Splitting CSS and JavaScript adds static requests; no page-load speedup is claimed. Only the second identical `.ibtn svg` rule was removed. A complete ordered CSS token fingerprint verifies that every other declaration, selector, breakpoint and keyframe remains intact.

5. **Verification.** The original baseline passed nine browser feature groups and recorded its existing favicon 404. Focused checks subsequently reproduced the original orphan loop and favicon failure. The final verification passes **19 Node tests and 14 browser groups**, with no uncaught browser exceptions or local asset HTTP failures. Coverage includes all ten open cafes' original seeded movement, order waiting, seating, departure, forecast targets and reduced-motion behavior; initial canvas drawing commands; overlapping numeric updates; pending resize cleanup; audio timing and node cleanup; data and storage compatibility; complete module and asset paths; and CSS cascade integrity.

   Browser checks cover home/map search, marker selection, map pan/zoom/wheel controls, Escape, hash routes, back/forward navigation, favorites after reload, sound/purpose/Wi-Fi/seat/open filters and reset, comparisons, closed and unknown cafes, guest controls, floor-plan zoom, table/plan views, seat selection, forecasts, all five sound previews, persisted sound/motion settings, partner form validation and demo submission, staff controls, FAQ, mobile sheet/filter controls and the mobile-to-desktop transition.

   **All 16 screenshot files are byte-identical to the original baseline**, with matching body text, DOM geometry and sampled computed styles: Home, Explore, Cafes, Cafe A, closed Cafe O, About, Partner and Staff at 1440×1000 and 390×844. CSS and canvas animations were compared at deterministic positions. The same fallback fonts were used because external font requests stall in this environment. This verifies those routes, viewports and sampled animation states; it does not establish equivalence on every browser, font, device or animation frame. Local evidence is in `.artifacts/before/`, `.artifacts/after/`, `.artifacts/baseline-regression/`, `.artifacts/visual-comparison.json` and `.artifacts/draw-operations.json`.

6. **Remaining limits.** The live Vercel deployment was not changed or exercised; static HTTP loading, strict module MIME handling and asset availability were verified locally. Real-device touch input, Safari/Firefox, loaded Google Fonts, audible listening quality, long-session heap profiling and assistive-technology testing remain unverified. Existing accessibility gaps include modal focus trapping/restoration and direct keyboard access to individual canvas seats. Existing malformed-but-valid-JSON preference/favorite values can still cause problems; schema validation was left outside this preservation-focused change. The stylesheet still contains historical overrides, and page templates remain in `app.js` to keep this refactor bounded. Candidates such as the unreferenced `openReport` function and legacy styling were retained rather than deleting possible future-facing behavior.

7. **Next phase.** Profile sustained simulation use on real mobile hardware before changing rendering cadence or pathfinding. Add accessibility regression coverage and address the remaining keyboard/focus gaps with an explicit UX review. Add stored-value schema validation with migration tests. Verify the current static deployment in Vercel preview with external fonts enabled. When backend work is authorized, add asynchronous loading behind the cafe repository and translate future occupancy events through the existing simulation callbacks; retain the local demo source for deterministic tests.
