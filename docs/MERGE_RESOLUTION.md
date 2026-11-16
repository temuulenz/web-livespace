# Uncommitted merge review

Source: `origin/oyundari` (`50e6f2f`, mobile and desktop home/cafe presentation).
Target: `main` (`7c300aa`, live telemetry, original visitor lifecycle and Super Admin controls).
Merge base: `fd3c12b`.

The checkout initially had no merge in progress. After fetching, `origin/oyundari` was the only fetched branch with unmerged commits, so the review merge was prepared with `git merge --no-commit --no-ff origin/oyundari`. No commit or branch-tip change is part of this resolution.

## Semantic resolution

- `app.js`: combines mobile/desktop recommendation lifecycle cleanup with live microphone cleanup; preserves the shared cafe live state, history, noise panel, sensor-controlled population, manual-control restrictions and freshness settings. Phone detail views use the portrait option. The cafe back action is scoped to `data-cafe-back` so it cannot also trigger on admin dashboard back buttons.
- `js/simulation/floor-plan.js`: keeps the original visitor lifecycle and sensor population controller while incorporating portrait sizing, coordinate hit testing and upright labels. REAL-mode seat drawing and callbacks remain unknown even when illustrative guests sit. Editor behavior and autonomous simulation remain intact.
- `styles/livespace.css`: retains the incoming responsive/home/carousel styles and the existing sensor/noise styles, with one copy of each sensor block. The original four stylesheets are untouched.
- `js/cafes.js`: retains timestamp-aware `mergeLive` and real-source precedence together with incoming display text changes.
- `js/components/atmosphere.js`: retains incoming tag attributes and escapes their labels/attribute values.
- `js/features/home/mobile-home.js`: retains incoming artwork, search, recommendations, sorting and tour. Recommendations refresh through the existing cafe update event, preserve carousel scroll position, and show valid sensor people/noise/source/status without inferring seat availability. Tour frames/timeouts use route cleanup and cannot enqueue work after the tour ends.
- `index.html`: retains incoming asset cache-version changes and the existing stylesheet/module loading order.

Cloudflare Workers/D1 services, WebSocket ingestion, database migrations, credentials, authentication, the floor plan editor and Super Admin backend are unchanged from `main`. Audit checks found no duplicate Node routes, D1 table creations, imported bindings or named function declarations. D1 migrations remain 0001–0005, and the pre-Android database fixture and original simulation/style fixtures were not regenerated.

Wrangler binding/configuration values are unchanged. Neither compared branch contains a tracked custom-domain route; none was fabricated or removed. No Cloudflare/DNS configuration or production data was changed. A formatting-only working-tree change to `wrangler.jsonc`, observed separately during the task, is preserved and left unstaged rather than included in the conflict resolution.

## Validation

- `npm ci`: completed successfully.
- `npm test`: 90 passed, including auth/Super Admin, migrations, original simulation fidelity, sensor data, and a new portrait/REAL-mode seating and hit-testing case.
- `npm run test:sensors`: 26 passed.
- `npm run test:browser`: 16 passed.
- `npm run test:visual`: 16 desktop/mobile screenshots captured; all 16 browser checks passed again. Mobile home and portrait cafe screenshots were visually inspected.
- `npm run test:e2e`: 14 passed, including a new merged-mobile telemetry/recommendation refresh case and admin back-navigation check.
- `npm run test:visitor-visual`: 11 original-engine visitor state/pixel checkpoints passed.
- `npm run test:cloudflare`: 20 passed (local Workers/D1, source precedence, WSS/sensor compatibility, Super Admin restrictions and browser polling).

All tests use disposable local databases/profiles. No commit, push, force push, deployment or production database operation is performed.
