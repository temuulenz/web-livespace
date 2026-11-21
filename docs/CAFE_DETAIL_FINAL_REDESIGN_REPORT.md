# Café detail redesign

## Desktop

- The lead column contains the café illustration, name, location when supplied, description, amenities, hours, status, live metric summary, favorites, comparison and directions.
- The second column contains the interactive floor plan, its seat legend and table view, the available occupancy history and the published menu. The floor plan fits within the tested desktop viewports.
- Published menus show a compact product shelf with category filters and an inline full-menu action. The published variants, inventory labels, promotions and reviews continue to use their existing integrations.

## Mobile web

- The first screen prioritizes the hero, identity, hours and the three headline metrics. It leads into a landscape floor-plan preview.
- Tapping the preview opens a native dialog anchored as a bottom sheet. It moves the same canvas and table into the dialog, preserves seat selection and zoom controls inside it, locks background scrolling and restores scroll and focus when closed. The preview has a separate keyboard-accessible opener. The sheet supports Escape and a labeled close button.
- The inline product shelf supports horizontal scrolling. Directions, sensor detail and other café information continue down the page. The original five-item bottom navigation, logo and route highlighting behavior are preserved.
- The sheet uses the dynamic viewport with a fallback, safe-area padding and internal scrolling. The narrow layout uses regular document scrolling.

## Data and compatibility

| Surface | Existing source |
| --- | --- |
| Name, district, address, hours, description, amenities, map position and layout | Public café catalog and the existing layout renderer. Directions use valid public coordinates or the saved map position via the existing map projection. Demo or missing locations get explanatory text. |
| Occupancy, observed people, noise, Wi-Fi and freshness | Existing public sensor and café state. Seat counts require the existing measured fields. Camera counts are reported as people. Wi-Fi speed requires a supplied measurement. The sheet identifies illustrative seat states and demo counts. |
| Occupancy history | Existing public sensor history API. Chart bars use the average observed people from up to 24 returned buckets. Source labels and the original accessible data tables remain. The existing demo day profile is labeled as a demo. |
| Menu | Existing published menu, uploaded product images, variants, inventory, promotions and reviews APIs. Demo cafés retain the existing labeled sample menu. |
| Café hero | Existing asset labeled “Жишээ зураглал”. The public café catalog has no verified image gallery or verification field, so the layout omits those controls and badges. |

The public detail page removes the demo arrival and booking panel. Existing deep links, favorites and session flows, directions, map behavior, sensor processing, shared floor geometry and role-specific menus stay in use. The backend, schemas, permissions, deployment configuration and lockfile were outside this change.

## Files in this change

| File | Change |
| --- | --- |
| `app.js` | Café detail composition, status and data presentation, navigation lifecycle and existing measurement wiring. |
| `index.html`, `styles/cafe-detail.css`, `styles/platform.css` | Load the scoped responsive stylesheet and remove the superseded detail layout overrides. |
| `js/features/cafe/plan-sheet.js`, `js/simulation/floor-plan.js` | Native seating dialog and opt-in fitted initial zoom for the existing floor-plan renderer. |
| `js/features/menu/menu-view.js`, `js/features/menu/public-menu.js` | Detail-specific inline menu, filter controls and full-menu action. |
| `js/features/sensors/sensor-history.js` | Opt-in chart from existing history buckets. |
| `tests/browser.mjs`, `tests/e2e.mjs` | Responsive, touch, focus, directions, published menu and sensor-history coverage. |

## Validation

| Command | Result |
| --- | --- |
| `npm ci` | Passed. 38 packages installed and 0 reported vulnerabilities. npm reported that two dependency postinstall scripts were blocked by its existing allow list policy. |
| `node --check` on `app.js`, changed feature modules, floor plan module and both browser test files | Passed. The frontend uses native ES modules and defines no separate lint, type-check or frontend compile command. |
| `npm test` | 199 passed, 0 failed. |
| `npm run test:sensors` | 26 passed, 0 failed. These tests overlap the full test suite. |
| `BROWSER_PATH=/home/temuulen/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome BROWSER_NO_SANDBOX=1 CAPTURE_LABEL=cafe-detail-final CAPTURE_CAFE_DETAIL=1 npm run test:browser` | 27 passed, 0 failed. The external map checks skipped because the CDN or tile endpoint was unreachable in this run. The SVG fallback and local assets passed. |
| `BROWSER_PATH=/home/temuulen/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome BROWSER_NO_SANDBOX=1 npm run test:e2e` | 15 passed, 0 failed, using the real application server with disposable data. Coverage includes live seating updates, observed people, directions, owner publication, category filtering, promotions, sensor history and authentication. |
| `node /tmp/livespace-cafe-detail-firefox.mjs` | Firefox 159 WebDriver BiDi smoke checks with a disposable profile and server. Four viewport checks passed. An additional open-sheet resize check passed at 390 × 590 and 844 × 390 and after restoring 390 × 844. Verified the sheet and table, close, focus and scroll restoration. |
| `XDG_CONFIG_HOME=/tmp/livespace-detail-wrangler WRANGLER_SEND_METRICS=false npm run cf:check -- --outdir /tmp/livespace-detail-build` | Cloudflare asset and Worker dry-run passed. |
| `git diff --check` | Passed. Final review confirmed this task leaves existing unrelated working-tree changes in place. |

Chromium tested **320 × 568**, **375 × 667**, **390 × 844**, **430 × 932**, **768 × 1024**, **1280 × 800**, **1366 × 768**, **1440 × 900**, **1758 × 923** and **1920 × 1080**. Firefox tested **320 × 568**, **390 × 844**, **768 × 1024** and **1440 × 900**. Chromium dispatched a touch tap against the floor-plan preview and verified it opens the sheet, uses the same canvas, supports zoom and the table, and closes on Escape. It also checked the local cover load, document overflow, initial metric visibility, mobile tab labels and absence of public booking controls.

## Local screenshots

- [Desktop, full page](../.artifacts/cafe-detail-final/desktop-full.png)
- [Desktop, initial viewport](../.artifacts/cafe-detail-final/desktop.png)
- [Mobile, full page](../.artifacts/cafe-detail-final/mobile-full.png)
- [Mobile, initial viewport](../.artifacts/cafe-detail-final/mobile-initial.png)
- [Mobile, menu and directions area](../.artifacts/cafe-detail-final/mobile-menu.png)
- [Mobile, expanded seating sheet](../.artifacts/cafe-detail-final/mobile-seating-sheet.png)

The browser test command above regenerates the screenshots under the Git-ignored `.artifacts` directory.

## Remaining verification

Real iPhone Safari and WebKit were unavailable. Before production, check toolbar collapse and expansion, landscape safe areas, touch scrolling and VoiceOver on an iPhone. Recheck the external map CDN and tiles on a connected device. The café image gallery and verification badge depend on future public API fields.

## Verdict

**READY FOR REVIEW**
