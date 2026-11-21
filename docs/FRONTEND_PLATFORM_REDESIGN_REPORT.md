# LiveSpace frontend platform redesign

## Scope and baseline

The baseline was `cdeb370`, with a clean working tree. The browser entry point is `index.html` and the route assembly is `app.js`. Both public and protected pages run in the same native JavaScript application. The existing framework handles template escaping, DOM patches, lifecycle cleanup, routing, HTTP, and sessions. The browser has no bundling step or new runtime dependency. Node serves the frontend through the existing static allow-list. The Wrangler build copies the public asset tree for the Cloudflare Worker.

This pass uses shared design tokens and surface styles for the entire frontend and preserves the original brand asset and existing four original stylesheets. Data changes are confined to browser consumption and presentation. The working changes are local.

## Route inventory

| Route | Access and existing functionality | Work in this pass |
| --- | --- | --- |
| `/`, `#home`, unknown-hash fallback | Public landing, search, cross-links, demo sound previews, mobile orientation tour | Rebuilt desktop and mobile discovery, same carousel controller and category evidence, cartoon illustration, location and filter dialogs, compact map link, related cafés, accessible tour. Existing sound previews remain below discovery. |
| `#explore` | Public MapLibre/OpenFreeMap map with SVG fallback, search, pins, zoom/drag, browser location, marker/list previews, comparison, directions, mobile map/list sheet | Applied shared surface styles, reused filter sheet, added catalogue-based district selection, expanded catalogue search fields, retained provider and marker lifecycle. |
| `#cafes` | Public searchable/filterable café catalogue, status/sensor cards, favourites, compare | Aligned the catalogue heading, cards, and filters, added sorting and 12-item pagination, kept search and live card updates. |
| `#cafe-:id` | Public details, hours, goals, summary, directions, availability, Wi-Fi, noise, simulation/table, forecasts, sensor history, feedback, menu, demo visit and pre-order flow | Restyled heading and details, exposed available public description/address, retained map/sensor/simulation actions, connected published products and variants, product media, available inventory statuses, active promotions and public reviews. Preserved the existing labelled demo menu, phone and visit flows for demo cafés. Missing IDs retain the empty state. |
| `#about` | Public service description, demo atmosphere explainers, data freshness information, FAQ and partnership link | Shared typography, cards, callouts, FAQ and hero surface; original text and disclosure behavior. |
| `#partner` and in-page `#pform` action | Public or signed-in application, purpose, photos and validation, sample guidance, claim and owner creation | Shared forms, accessible control surfaces and layout; existing submission, photo processing and claim lifecycle preserved. |
| `#staff` | Existing labelled simulation with occupancy, temporary status, sound advice, demo incoming orders and demo menu editor | Shared dashboard surfaces and responsive occupancy block; fixture selection is confined to demo cafés. If no demo café exists, link to the owner dashboard. |
| `#account` | Existing signed-in profile, favourites, role links and sign-out; sign-in gate and offline state | Shared cards, buttons, popover and sign-in accessibility. Account and favourite persistence unchanged. |
| `#owner` | Session/owner gate. Café selector, Today, Orders, Menu and Report, profile edit, setup steps, photos, visualization, live sensors, historical reports and expandable diagnostics | Shared dashboard/form surfaces, keyboard tab navigation, backend-connected category/product/variant and promotion editing for real cafés, versioned edits and archive confirmations, product media upload/removal. Labelled demo orders/editor remain on demo cafés; no live arrival API exists. |
| `#admin` | Admin gate. Overview, Applications, Cafés, Users, Devices, Measurements; café details, owner assignment, map placement, plan editor, snapshots, diagnostics, protected account actions and token display | Shared dashboard tabs, cards, forms and scrollable tables, in-scope public menu preview or owner-authorized editing. Existing permissions and confirmations remain server-controlled. |

There are no separate contact, legal, password recovery, public promotion, inventory, review, moderation, or privacy **frontend routes** in this checkout. The FAQ is on `#about`. Public registration is already available in the checked-in email authentication flow. The redesign retains the existing availability and server checks. Backend-only endpoints were inventoried separately from the browser workflows.

## Component inventory and implementation

| Component group | Existing surfaces | Changes |
| --- | --- | --- |
| Shell and navigation | Original wordmark/cup, desktop links, location text, five mobile tabs, footer, hash router, sound and motion settings | Warm palette, surface and focus styles, safe-area spacing, 320 px header sizing. Mobile tabs retain their original links, labels, icons, order and active states. |
| Discovery | Old desktop map preview and recommendation deck; old mobile search, carousel and tour | Replaced duplicate decks with `discovery.js` and pure evidence/classification in `recommendations.js`. Ported the existing tour to `tour.js`. A separate miniature map strip links to discovery on desktop; the small homepage map icon opens district settings. |
| Shared discovery/list controls | Form field structures, query and filter state, category tags, list cards, map markers, map preview, compare tray | One catalogue query matcher, reusable district options and advanced filter dialog. Map behaviour, selection and sensor fields reuse existing components. |
| Detail/atmosphere | Headings, summary, status badges, directions, live noise, history and canvas plan/table, legends, sound previews, operating hours, compare and feedback | Shared typography and spacing. Optional location and profile copy rendered from public catalogue. Simulation engine, seat visuals, audio, protocol and measurement semantics retained. |
| Accounts and feedback | Email login/register, account and saved lists, favourite popover, route guards, phone demo auth, toasts and shared dialogs | Shared surface styling, field-error association, modal labelling, keyboard focus containment and return focus. No password, session, CSRF or registration rules changed. |
| Menu/business | Labelled demo menu/editor, demo phone/cart/orders, existing Phase 11 public and owner APIs | Added `PublicMenu` and `OwnerMenu` using existing API authorization and optimistic versions. Covers categories, product lists, publishing, archive/disable confirmations, variant pricing, product media, promotions, inventory visibility and public reviews. Admin cross-tenant edit attempts are not exposed as permitted actions. |
| Role-specific | Staff controls, owner status tiles and reports, admin lists and forms, layout editor, location picker, delegated actions and sessions | Reused screen layouts and permission gates, themed shared components and reduced narrow-width overflow. Internal token, raw diagnostic and destructive-action workflows retain their existing behavior. |

Both home layouts use the same catalogue records and controller. Mobile opens with the search row and retains a screen-reader heading. Eligible slides rotate about every seven seconds. Manual actions, focus, pointer interactions, visibility, motion settings, and a pause control govern autoplay. A slide and its up-to-four related cafés update together. The former decorative map and lamp composition is intentionally replaced by the approved feature layout. The mobile orientation tour and sound previews remain available.

The cartoon WebPs are in `js/features/home/cafe-cartoon.webp` and `js/features/home/cafe-cartoon-small.webp`. The built-in image tool converted the anonymous reference interior with this brief: “Polished 2D cartoon café illustration with warm coffee-brown and caramel shapes, buttery afternoon sunlight, muted olive accents, dark copy space at left and a round table, cup and tall window at right.” The asset is captioned **Кафены зураглал**. It does not represent a specific café or its menu. On desktop, the hero and cards use labelled editorial photos. The built-in image tool produced a wide caramel-lit café scene featuring tiramisu and a latte. Desktop assets are `cafe-dessert.webp`, `cafe-dessert-card.webp`, and `cafe-interior-desktop.webp` in the same directory. The mobile hero picks a responsive cartoon source and compact card images lazy-load.

## API and data compatibility

- District filtering uses the existing public `district` field. Search matches public names, districts, addresses, category, description, and purpose tags. “Танд” falls back to an available catalogue listing within the district rather than implying a measured distance. The current public map coordinates and sample walk data are insufficient to calculate trustworthy visitor distances. The home omits distances.
- Work recommendations use the published work tag. Coffee and dessert require a named published menu group with published products. Coffee presence does not establish a venue specialty. Promotion recommendations require the public endpoint to return an active item with valid bounds. Seating requires an open café and a fresh real seat percentage; people counts, stale values and test/demo observations are excluded. The legacy aggregate timestamp is insufficient to verify legacy seats when combined with newer Android snapshots, so those records are excluded from the seating recommendation.
- The home uses an initial sample of up to four non-demo cafés for menu and promotion discovery. Explicit requests check up to twelve matching records in batches of three. The catalogue has no bulk discovery endpoint, so these categories are a bounded sample. Selection reports failed or incomplete lookups and falls back to the catalogue. Promotion eligibility expires conservatively at the next schedule minute and can be checked again by selecting the category.
- Ratings appear on the feature only if the public aggregate has reviews and a valid average. Detail products, photos, variants, reviews, discounts and public inventory statuses come from the existing Phase 11 endpoints. Unconfigured stock is left unspecified. No private application photos enter the public view.
- Static health 404 preserves the labelled browser demo. API and network errors clear the initial demo catalogue and expose an error state. Successful empty responses stay empty. Real café order status and public phone sign-in remain unavailable without a live orders/auth integration.
- No backend, database schema, Worker configuration, credentials, shared business service, Android wire contract or production environment changed. See [Post-frontend backend recommendations](POST_FRONTEND_BACKEND_RECOMMENDATIONS.md).

## Accessibility and responsive behaviour

- Focus rings, named search/location/filter controls, an explicitly named carousel, keyboard-operated arrows and buttons, motion opt-out, dialog focus containment and focus restoration, labelled form errors and keyboard owner tabs are implemented.
- Mobile browser layout uses the existing viewport definition, safe-area padding and content clearance for the fixed five-item navigation. The hero has no viewport-height dependency. Native overflow remains inside the card strip and administrative table containers. Narrow café direction controls can wrap and staff occupancy summaries fit the viewport.
- Chromium public-route coverage includes the home, map, list, open and closed detail, About/FAQ, partner, demo staff, and the three protected entry states. Authenticated checks cover the owner, menu, and admin café detail shells. The matrix targets 320, 375, 390, 430, 768, 1024, 1280, 1440 and 1920 px. Keyboard focus and responsive results are regression checks, not an exhaustive assistive-technology audit.

## Validation and readiness

| Command | Result |
| --- | --- |
| `npm ci` | Passed. Installed from the existing lockfile. npm reported its existing allow-scripts policy for Wrangler's optional package hooks. No dependencies or lockfile changes. |
| `node --check app.js`; `rg --files framework js -g '*.js' -0 \| xargs -0 -n1 node --check`; `node --check tests/browser.mjs`; `node --check tests/e2e.mjs` | Passed. This repository has no standalone type-checker, linter, frontend build or component-test script. Framework unit and DOM lifecycle checks ran in the regular suites. |
| `npm test` | 199 passed, 0 failed, 0 skipped. Includes the four discovery evidence tests, backend/contract integration and original stylesheet/simulation fidelity checks. |
| `npm run test:sensors` | 26 passed, 0 failed, 0 skipped. |
| `npm run test:browser` | 22 passed, 0 failed. External MapLibre/OpenFreeMap checks skipped when their resources could not load. Interactive SVG fallback passed. |
| `CAPTURE_LABEL=platform-redesign npm run test:visual` | Sixteen captures at 1440 px and 390 px, plus 22 browser checks passed, 0 failed. Same external map skip as the standalone browser suite. Captures in `.artifacts/platform-redesign`. |
| `npm run test:e2e` | 15 passed, 0 failed. Disposable SQLite and Chromium. Covered search, menu and promotion create/edit/publish/archive, location and filter application, keyboard interaction, registration/login, favourite persistence, owner and admin flows, actual motion timers, and live sensor projection. |
| `npm run test:visitor-visual` | 11 checkpoints passed against the existing Git simulation baseline. |
| `npm run test:cloudflare` | 28 reported checks passed with local workerd, disposable D1 and local Durable Objects. Local migrations also applied successfully. |
| `XDG_CONFIG_HOME=/tmp/livespace-platform-config WRANGLER_SEND_METRICS=false npm run cf:check -- --outdir /tmp/livespace-platform-dry-run` | Passed. Dry-run bundle and asset staging included both WebPs and local modules. No deployment. |
| `node --disable-warning=ExperimentalWarning /tmp/livespace-firefox.mjs` | Firefox 159 headless WebDriver BiDi smoke passed at 320, 390, 768 and 1440 px. Verified image decoding, overflow, five existing navigation entries, location control and the featured-café detail link on a disposable Node server. |
| `git diff --check` and scoped `git diff --exit-code` | Passed. No edits in backend, Worker, shared business services, dependency manifests, or the four original stylesheets. |

Chromium runs used the installed `chromium-1255` executable through `BROWSER_PATH` with `BROWSER_NO_SANDBOX=1` in headless test profiles. Network-capable test commands used local ephemeral servers and disposable databases. The mobile width matrix used heights of 660–900 px; screenshots were taken at 390×844 and 1440×1000. The narrow-width staff and directions overflows found in the first matrix were corrected and rechecked.

## Remaining limitations and risk

- WebKit, real iOS Safari, physical devices and mobile browser toolbar transitions were unavailable. The resize and safe-area behavior was checked through Chromium emulation. Firefox coverage is focused on home and featured detail navigation, with the full suites running in Chromium.
- The conditional external map-provider tests could not reach MapLibre/OpenFreeMap resources in this environment. Local fallback, route, markers, previews and filters were exercised. Production tile delivery and real-device geolocation were outside this verification.
- Catalogue search can match district, public address, categories, tags and descriptions. It does not search arbitrary product names across all café menus. Nearby distance, public café cover images, exhaustive menu and promotion discovery and independently timestamped seats require catalogue support. Owner promotion creation currently supports percentage promotions; other existing promotion types retain their server rules and can be edited for metadata and publication. Advanced inventory management and review moderation have backend contracts but no previously shipped browser workflow in this checkout.
- Menu image rendering uses the existing private/public access boundary. Owner upload/removal is wired to the existing endpoints and backend integration tests exercised the underlying media scope. Native device camera handling and every protected sub-form were outside the manual browser coverage.
- This review did not exercise production credentials, schema, hosting, TLS, or remote data. No critical frontend regression remains in the validated flows.

## Final Git review

The working diff contains the shell/style changes, replaced home components, new business-menu views, bounded public evidence lookups, related account/accessibility updates, and the browser/unit/report additions. No deployment, infrastructure, database, API implementation, sensor pipeline, dependency or original style fixture changed. Generated screenshots and local build outputs are ignored. The tracked history still points to `cdeb370` and no commit was created.

**READY FOR REVIEW**

